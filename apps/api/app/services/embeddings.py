from __future__ import annotations

import hashlib
import logging
import math
import re
from collections.abc import Iterable

import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 384
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def tokenize_for_search(text: str) -> list[str]:
    """Extract lowercase unicode tokens (supports English, Tamil, numbers)."""
    return [tok.lower() for tok in _TOKEN_RE.findall(text) if len(tok) >= 2]


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec))
    if norm <= 1e-12:
        return vec
    return [v / norm for v in vec]


def _resize_or_project(vec: list[float], target_dim: int = EMBEDDING_DIM) -> list[float]:
    if len(vec) == target_dim:
        return _l2_normalize(vec)
    if len(vec) > target_dim:
        return _l2_normalize(vec[:target_dim])
    padded = list(vec) + [0.0] * (target_dim - len(vec))
    return _l2_normalize(padded)


def local_semantic_embed(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """
    Deterministic 384-dim L2-normalized semantic hash embedding combining:
    - word unigrams (weight 1.0)
    - word bigrams (weight 0.85)
    - character 4-grams (weight 0.45) for morphological & typo resilience
    """
    vec = [0.0] * dim
    tokens = tokenize_for_search(text)
    if not tokens:
        return vec

    features: dict[str, float] = {}
    for tok in tokens:
        features[f"w:{tok}"] = features.get(f"w:{tok}", 0.0) + 1.0
        if len(tok) >= 4:
            for i in range(len(tok) - 3):
                ng = f"c:{tok[i : i + 4]}"
                features[ng] = features.get(ng, 0.0) + 0.45
    for idx in range(len(tokens) - 1):
        bg = f"b:{tokens[idx]}_{tokens[idx + 1]}"
        features[bg] = features.get(bg, 0.0) + 0.85

    for feat, raw_tf in features.items():
        weight = 1.0 + math.log1p(raw_tf)
        digest = hashlib.blake2b(feat.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if (digest[4] & 1) == 0 else -1.0
        vec[bucket] += sign * weight

    return _l2_normalize(vec)


def cosine_similarity(a: Iterable[float], b: Iterable[float]) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=False):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 1e-12 or nb <= 1e-12:
        return 0.0
    return max(-1.0, min(1.0, dot / (math.sqrt(na) * math.sqrt(nb))))


async def generate_embeddings(texts: list[str]) -> tuple[list[list[float]], str]:
    """
    Generate 384-dim embeddings using the configured provider (OpenAI-compatible / Ollama)
    or fall back seamlessly to the local deterministic semantic-hash embedder.
    """
    if not texts:
        return [], "local-semantic-hash-384"

    settings = get_settings()
    dim = settings.rag_embedding_dim or EMBEDDING_DIM

    if settings.ai_provider == "openai_compatible" and settings.ai_api_key.strip():
        url = f"{settings.ai_base_url.rstrip('/')}/embeddings"
        headers = {
            "Authorization": f"Bearer {settings.ai_api_key.strip()}",
            "Content-Type": "application/json",
        }
        payload: dict[str, object] = {
            "model": settings.ai_embedding_model,
            "input": texts,
        }
        if "text-embedding-3" in settings.ai_embedding_model:
            payload["dimensions"] = dim
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json().get("data", [])
                if len(data) == len(texts):
                    vectors = [_resize_or_project(item["embedding"], dim) for item in data]
                    return vectors, settings.ai_embedding_model
        except Exception as exc:
            logger.warning("Remote embedding failed, falling back to local embedder: %s", exc)

    elif settings.ai_provider == "ollama" and settings.ollama_base_url.strip():
        url = f"{settings.ollama_base_url.rstrip('/')}/api/embed"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    url,
                    json={"model": settings.ai_embedding_model, "input": texts},
                )
                resp.raise_for_status()
                raw_vecs = resp.json().get("embeddings", [])
                if len(raw_vecs) == len(texts):
                    vectors = [_resize_or_project(v, dim) for v in raw_vecs]
                    return vectors, f"ollama:{settings.ai_embedding_model}"
        except Exception as exc:
            logger.warning("Ollama embedding failed, falling back to local embedder: %s", exc)

    return [local_semantic_embed(t, dim=dim) for t in texts], f"local-semantic-hash-{dim}"
