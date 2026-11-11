from __future__ import annotations

import logging
import re
from typing import Any

import httpx
from app.core.config import get_settings
from app.services.embeddings import tokenize_for_search

logger = logging.getLogger(__name__)


async def call_chat_completion(
    system_prompt: str,
    user_prompt: str,
    *,
    temperature: float = 0.2,
    max_tokens: int = 900,
) -> tuple[str | None, str]:
    """
    Call configured LLM provider (OpenAI-compatible, Ollama, or Anthropic).
    Returns (response_text_or_None, model_identifier).
    """
    settings = get_settings()

    if settings.ai_provider == "openai_compatible" and settings.ai_api_key.strip():
        url = f"{settings.ai_base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.ai_api_key.strip()}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.ai_chat_model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                choices = resp.json().get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content")
                    if isinstance(content, str) and content.strip():
                        return content.strip(), settings.ai_chat_model
        except Exception as exc:
            logger.warning("OpenAI-compatible chat failed, using local synthesizer: %s", exc)

    elif settings.anthropic_api_key.strip() or settings.ai_provider == "anthropic":
        if settings.anthropic_api_key.strip():
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": settings.anthropic_api_key.strip(),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            payload = {
                "model": settings.ai_chat_model or "claude-3-5-haiku-latest",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            }
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(url, headers=headers, json=payload)
                    resp.raise_for_status()
                    parts = resp.json().get("content", [])
                    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
                    if text.strip():
                        return text.strip(), f"anthropic:{settings.ai_chat_model}"
            except Exception as exc:
                logger.warning("Anthropic chat failed, using local synthesizer: %s", exc)

    elif settings.ai_provider == "ollama" and settings.ollama_base_url.strip():
        url = f"{settings.ollama_base_url.rstrip('/')}/api/chat"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    json={
                        "model": settings.ai_chat_model,
                        "stream": False,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                    },
                )
                resp.raise_for_status()
                content = resp.json().get("message", {}).get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip(), f"ollama:{settings.ai_chat_model}"
        except Exception as exc:
            logger.warning("Ollama chat failed, using local synthesizer: %s", exc)

    return None, "documind-extractive-rag-v1"


def _split_sentences(text: str) -> list[str]:
    raw = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    return [s.strip() for s in raw if len(s.strip()) >= 12]


def synthesize_grounded_answer(
    question: str,
    citations: list[dict[str, Any]],
    *,
    response_style: str = "balanced",
) -> str:
    """
    Zero-hallucination local extractive answer builder.
    Scores sentences from retrieved chunks against the question and formats inline [n] citations.
    """
    if not citations:
        return (
            "I could not find relevant passages in your selected document(s) to answer that "
            "question. Try indexing the document or rephrasing with key terms from the text."
        )

    max_sentences = {"concise": 2, "balanced": 4, "detailed": 6, "academic": 5}.get(
        response_style, 4
    )

    q_tokens = set(tokenize_for_search(question))
    scored_sentences: list[tuple[float, int, str, dict[str, Any]]] = []

    for cit in citations:
        idx = int(cit["index"])
        chunk_text = str(cit.get("full_text") or cit.get("snippet") or "")
        sentences = _split_sentences(chunk_text) or [chunk_text[:280]]
        for sent in sentences:
            s_tokens = set(tokenize_for_search(sent))
            overlap = len(q_tokens & s_tokens) / max(1, len(q_tokens))
            # Combine sentence overlap with parent chunk retrieval score
            score = (0.65 * overlap) + (0.35 * float(cit.get("score", 0.0)))
            scored_sentences.append((score, idx, sent, cit))

    scored_sentences.sort(key=lambda item: item[0], reverse=True)

    selected: list[tuple[int, str, dict[str, Any]]] = []
    seen_texts: set[str] = set()
    for _, idx, sent, cit in scored_sentences:
        norm = sent.lower()[:120]
        if norm in seen_texts:
            continue
        seen_texts.add(norm)
        selected.append((idx, sent, cit))
        if len(selected) >= max_sentences:
            break

    if not selected:
        top = citations[0]
        return f"From **{top['document_name']}** [{top['index']}]: {top['snippet']}"

    if response_style == "concise":
        lines: list[str] = ["Key takeaway from your documents:\n"]
    elif response_style == "academic":
        lines = ["Grounded synthesis from the cited source passages:\n"]
    else:
        lines = ["Based on the retrieved document passages:\n"]

    for idx, sent, cit in selected:
        page_label = f"p. {cit['page_no']}" if cit.get("page_no") else "section"
        lines.append(f"- {sent} **[{idx}]** *({cit['document_name']}, {page_label})*")

    return "\n".join(lines)


def synthesize_local_summary(
    doc_name: str,
    chunks: list[dict[str, Any]],
) -> tuple[str, list[str], list[dict[str, Any]]]:
    """Generate a structured extractive summary with page citations."""
    if not chunks:
        return (
            f"No extractable text was found in '{doc_name}'.",
            [],
            [],
        )

    # Pick representative chunks spread across the document (start, middle, end)
    total = len(chunks)
    if total <= 5:
        picked = chunks
    else:
        indices = sorted({0, 1, total // 3, (2 * total) // 3, total - 1})
        picked = [chunks[i] for i in indices]

    citations: list[dict[str, Any]] = []
    key_points: list[str] = []
    for c_idx, ch in enumerate(picked, start=1):
        sentences = _split_sentences(ch["content"])
        best = sentences[0] if sentences else ch["content"][:220]
        key_points.append(f"{best} [{c_idx}]")
        citations.append(
            {
                "index": c_idx,
                "chunk_id": ch["id"],
                "document_id": ch["document_id"],
                "document_name": doc_name,
                "version_no": ch["version_no"],
                "page_no": ch.get("page_no"),
                "section_title": ch.get("section_title"),
                "snippet": ch["content"][:260],
                "score": 1.0,
            }
        )

    summary = (
        f"**{doc_name}** contains {total} indexed text chunk(s). "
        + " ".join(kp for kp in key_points[:3])
    )
    return summary, key_points, citations
