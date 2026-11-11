from __future__ import annotations

import json
import re
import uuid
from typing import Any

from app.services.llm import call_chat_completion
from worker import converter, pdf_engine

ALLOWED_AGENT_TOOLS: dict[str, dict[str, Any]] = {
    "compress_pdf": {"kind": "job", "job_type": "compress", "requires_approval": True},
    "rotate_pdf": {"kind": "job", "job_type": "rotate", "requires_approval": True},
    "delete_pages": {"kind": "job", "job_type": "delete_pages", "requires_approval": True},
    "extract_pages": {"kind": "job", "job_type": "extract_pages", "requires_approval": True},
    "page_numbers": {"kind": "job", "job_type": "page_numbers", "requires_approval": True},
    "watermark": {"kind": "job", "job_type": "watermark", "requires_approval": True},
    "protect_pdf": {"kind": "job", "job_type": "protect", "requires_approval": True},
    "unlock_pdf": {"kind": "job", "job_type": "unlock", "requires_approval": True},
    "merge_pdf": {"kind": "job", "job_type": "merge", "requires_approval": True},
    "split_pdf": {"kind": "job", "job_type": "split", "requires_approval": True},
    "convert_document": {"kind": "job", "job_type": "convert", "requires_approval": True},
    "ocr_document": {"kind": "job", "job_type": "ocr", "requires_approval": True},
    "extract_tables": {"kind": "job", "job_type": "extract_tables", "requires_approval": True},
    "semantic_search": {"kind": "ai", "job_type": None, "requires_approval": False},
    "rag_qa": {"kind": "ai", "job_type": None, "requires_approval": False},
    "qa_summarize": {"kind": "ai", "job_type": None, "requires_approval": False},
}


def _make_step(
    *,
    step_no: int,
    tool_name: str,
    description: str,
    params: dict[str, Any],
    requires_approval: bool = True,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "step_no": step_no,
        "tool_name": tool_name,
        "description": description,
        "params": params,
        "requires_approval": requires_approval,
        "approval_status": "pending",
        "execution_status": "pending",
        "job_id": None,
        "output_document_id": None,
        "output_version_id": None,
        "output_preview": None,
        "error": None,
        "started_at": None,
        "completed_at": None,
    }


def _split_compound_clauses(command: str) -> list[str]:
    """Split a compound instruction into clauses without breaking page specs like '1-3, 5'."""
    parts = re.split(
        r"\s*(?:;\s*|\s*->\s*|\s+and\s+then\s+|\s+then\s+|,\s*(?:and\s+)?(?=[a-zA-Z])"
        r"|\s+and\s+(?=(?:compress|shrink|reduce|add|remove|delete|extract|rotate|reorder|"
        r"watermark|protect|encrypt|lock|unlock|decrypt|merge|combine|split|convert|export|"
        r"transform|save|ocr|summarize|summary|index|search)\b))",
        command.strip(),
        flags=re.IGNORECASE,
    )
    return [p.strip() for p in parts if p.strip()]


def _parse_single_clause(
    clause: str,
    *,
    total_pages: int,
    doc_ids: list[str],
    source_format: str,
    step_no: int,
) -> tuple[dict[str, Any] | None, str]:
    """Parse one clause into a tool step and return (step_or_None, updated_format)."""
    lower = clause.lower().strip()

    # 1. Format conversion (e.g., "convert to docx", "export as markdown", "save to pdf")
    conv_match = re.search(
        r"(?:convert|export|transform|save)(?:\s+\w+)*?\s+(?:to|as|into)\s+"
        r"(pdf|docx|word|xlsx|excel|pptx|powerpoint|slides|md|markdown|txt|html|csv|json|png|jpg)\b",
        lower,
    )
    if conv_match:
        raw_tgt = conv_match.group(1)
        alias = {
            "word": "docx",
            "excel": "xlsx",
            "powerpoint": "pptx",
            "slides": "pptx",
            "markdown": "md",
        }
        tgt = alias.get(raw_tgt, raw_tgt)
        allowed = converter.SUPPORTED_CONVERSION_MATRIX.get(source_format, [])
        if tgt not in allowed:
            raise ValueError(
                f"Cannot convert '{source_format.upper()}' to '{tgt.upper()}'."
            )
        return (
            _make_step(
                step_no=step_no,
                tool_name="convert_document",
                description=f"Convert document from {source_format.upper()} to {tgt.upper()}.",
                params={"target_format": tgt, "mode": "editable", "pptx_mode": "hybrid"},
                requires_approval=True,
            ),
            tgt,
        )

    # 1b. Table extraction to Excel/CSV
    if "extract" in lower and "table" in lower:
        out_fmt = "csv" if "csv" in lower else "xlsx"
        return (
            _make_step(
                step_no=step_no,
                tool_name="extract_tables",
                description=f"Extract detected tables into a styled {out_fmt.upper()} file.",
                params={"output_format": out_fmt},
                requires_approval=True,
            ),
            out_fmt,
        )

    # 1c. OCR (English / Tamil)
    if "ocr" in lower or "searchable pdf" in lower:
        if "tamil" in lower and ("english" in lower or "+" in lower or "both" in lower):
            lang = "eng+tam"
        elif "tamil" in lower:
            lang = "tam"
        else:
            lang = "eng"
        return (
            _make_step(
                step_no=step_no,
                tool_name="ocr_document",
                description=f"Run OCR ({lang}) and generate a searchable PDF.",
                params={"language": lang, "force_ocr": False},
                requires_approval=True,
            ),
            "pdf",
        )

    # 2. Merge multiple documents
    if "merge" in lower and len(doc_ids) >= 2:
        return (
            _make_step(
                step_no=step_no,
                tool_name="merge_pdf",
                description=f"Merge {len(doc_ids)} selected PDFs into one document.",
                params={"document_ids": doc_ids, "output_name": "merged_workflow.pdf"},
                requires_approval=True,
            ),
            "pdf",
        )

    # 3. Split PDF
    split_match = re.search(r"split(?:\s+every)?\s+(\d+)\s+pages?", lower)
    if split_match:
        every_n = max(1, int(split_match.group(1)))
        return (
            _make_step(
                step_no=step_no,
                tool_name="split_pdf",
                description=f"Split PDF every {every_n} page(s).",
                params={"mode": "every_n", "every_n": every_n},
                requires_approval=True,
            ),
            "pdf",
        )

    # 4. Compress to target KB/MB
    kb_match = re.search(r"(?:compress|shrink|reduce).*?(\d+(?:\.\d+)?)\s*(kb|mb)", lower)
    if kb_match:
        val = float(kb_match.group(1))
        unit = kb_match.group(2)
        target_kb = int(val * 1024) if unit == "mb" else int(val)
        return (
            _make_step(
                step_no=step_no,
                tool_name="compress_pdf",
                description=f"Compress PDF to under {target_kb} KB (creates a new version).",
                params={"preset": "medium", "target_kb": max(10, target_kb)},
                requires_approval=True,
            ),
            source_format,
        )
    if "compress" in lower or "smaller" in lower:
        return (
            _make_step(
                step_no=step_no,
                tool_name="compress_pdf",
                description="Compress PDF using balanced medium preset (creates a new version).",
                params={"preset": "medium", "target_kb": None},
                requires_approval=True,
            ),
            source_format,
        )

    # 5. Rotate pages
    rot_match = re.search(r"rotate(?:\s+\w+)*?\s+(90|180|270)", lower)
    if rot_match:
        angle = int(rot_match.group(1))
        return (
            _make_step(
                step_no=step_no,
                tool_name="rotate_pdf",
                description=f"Rotate pages by {angle} degrees clockwise.",
                params={"angle": angle, "pages": None},
                requires_approval=True,
            ),
            source_format,
        )

    # 6. Delete / remove pages
    del_match = re.search(r"(?:remove|delete)\s+pages?\s+([\d,\-\s]+)", lower)
    if del_match:
        spec = del_match.group(1).strip()
        to_delete = set(pdf_engine.parse_page_ranges(spec, total_pages))
        remaining = [p for p in range(1, total_pages + 1) if p not in to_delete]
        if not remaining:
            raise ValueError("Cannot delete all pages from the document.")
        return (
            _make_step(
                step_no=step_no,
                tool_name="delete_pages",
                description=f"Remove page(s) {spec} while keeping original version intact.",
                params={"pages": remaining, "page_spec": spec},
                requires_approval=True,
            ),
            source_format,
        )

    # 7. Extract pages
    ext_match = re.search(r"extract\s+pages?\s+([\d,\-\s]+)", lower)
    if ext_match:
        spec = ext_match.group(1).strip()
        selected = pdf_engine.parse_page_ranges(spec, total_pages)
        return (
            _make_step(
                step_no=step_no,
                tool_name="extract_pages",
                description=f"Extract page(s) {spec} into a new PDF document.",
                params={"pages": selected, "page_spec": spec},
                requires_approval=True,
            ),
            "pdf",
        )

    # 8. Page numbers
    if "page number" in lower or "number pages" in lower:
        return (
            _make_step(
                step_no=step_no,
                tool_name="page_numbers",
                description="Add 'Page N of Total' numbering to the bottom center of each page.",
                params={
                    "position": "bottom-center",
                    "template": "Page {n} of {total}",
                    "start_no": 1,
                },
                requires_approval=True,
            ),
            source_format,
        )

    # 9. Watermark
    wm_match = re.search(
        r"watermark\s+(?:with\s+)?['\"]?([^'\"]+)['\"]?", clause, flags=re.IGNORECASE
    )
    if wm_match:
        wm_text = wm_match.group(1).strip()[:80]
        return (
            _make_step(
                step_no=step_no,
                tool_name="watermark",
                description=f"Stamp diagonal watermark '{wm_text}' on every page.",
                params={"text": wm_text, "opacity": 0.22, "angle": 45, "font_size": 40},
                requires_approval=True,
            ),
            source_format,
        )

    # 10. Protect / Encrypt PDF
    prot_match = re.search(
        r"(?:protect|encrypt|lock)(?:\s+with)?(?:\s+password)?\s+['\"]?(\S+)['\"]?",
        clause,
        flags=re.IGNORECASE,
    )
    if prot_match and ("protect" in lower or "encrypt" in lower or "password" in lower):
        pwd = prot_match.group(1).strip()
        return (
            _make_step(
                step_no=step_no,
                tool_name="protect_pdf",
                description="Encrypt PDF with AES-256 password protection.",
                params={"password": pwd},
                requires_approval=True,
            ),
            source_format,
        )

    # 11. Summarize / Key takeaways (Phase 2 RAG)
    if "summarize" in lower or "summary" in lower or "key points" in lower or "takeaways" in lower:
        return (
            _make_step(
                step_no=step_no,
                tool_name="qa_summarize",
                description="Generate a citation-backed summary and key takeaways.",
                params={"focus": clause if len(clause) > 20 else None},
                requires_approval=True,
            ),
            source_format,
        )

    # 12. Semantic search
    if lower.startswith("search ") or lower.startswith("find "):
        q_str = re.sub(r"^(?:search|find)\s+(?:for\s+)?", "", clause, flags=re.IGNORECASE).strip()
        return (
            _make_step(
                step_no=step_no,
                tool_name="semantic_search",
                description=f"Run semantic search for '{q_str}'.",
                params={"query": q_str, "limit": 5},
                requires_approval=True,
            ),
            source_format,
        )

    # 13. Citation-backed Q&A
    if (
        lower.startswith(("ask ", "what ", "who ", "when ", "where ", "why ", "how ", "explain "))
        or "?" in clause
    ):
        q_str = re.sub(r"^ask\s+", "", clause, flags=re.IGNORECASE).strip()
        return (
            _make_step(
                step_no=step_no,
                tool_name="rag_qa",
                description=f"Answer with page citations: '{q_str[:80]}'.",
                params={"question": q_str, "top_k": 5},
                requires_approval=True,
            ),
            source_format,
        )

    return None, source_format


def plan_command_deterministic(
    command: str,
    *,
    total_pages: int,
    doc_ids: list[str],
    source_format: str = "pdf",
) -> list[dict[str, Any]]:
    """Deterministic multi-step workflow planner across Phase 1, 2, and 3 tools."""
    clauses = _split_compound_clauses(command)
    steps: list[dict[str, Any]] = []
    cur_format = source_format

    for clause in clauses:
        step, cur_format = _parse_single_clause(
            clause,
            total_pages=total_pages,
            doc_ids=doc_ids,
            source_format=cur_format,
            step_no=len(steps) + 1,
        )
        if step is not None:
            steps.append(step)

    if steps:
        return steps

    # Fallback: scan full command in case connectors weren't split cleanly
    single, _ = _parse_single_clause(
        command,
        total_pages=total_pages,
        doc_ids=doc_ids,
        source_format=source_format,
        step_no=1,
    )
    return [single] if single else []


async def plan_command_workflow(
    command: str,
    *,
    total_pages: int,
    doc_ids: list[str],
    source_format: str = "pdf",
) -> list[dict[str, Any]]:
    """
    Plan a chained multi-step workflow. Uses configured LLM when an API key is active,
    validating tool names strictly against ALLOWED_AGENT_TOOLS, and falls back to the
    deterministic multi-clause planner.
    """
    det_steps = plan_command_deterministic(
        command,
        total_pages=total_pages,
        doc_ids=doc_ids,
        source_format=source_format,
    )
    if det_steps:
        return det_steps

    # Optional LLM fallback for complex natural language phrasing when provider is configured
    system_prompt = (
        "You are DocuMind AI workflow planner. Convert the user request into a JSON array of "
        "steps using ONLY these tool_name values: "
        f"{', '.join(sorted(ALLOWED_AGENT_TOOLS.keys()))}. "
        'Each item must have {"tool_name": str, "description": str, "params": object}. '
        "Return ONLY valid JSON array, no prose."
    )
    llm_raw, _ = await call_chat_completion(
        system_prompt,
        f"Source format: {source_format}, pages: {total_pages}. Command: {command}",
        temperature=0.0,
    )
    if not llm_raw:
        return []

    try:
        cleaned = llm_raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
        parsed = json.loads(cleaned.strip())
        if not isinstance(parsed, list):
            return []
        steps: list[dict[str, Any]] = []
        for idx, item in enumerate(parsed[:8], start=1):
            if not isinstance(item, dict):
                continue
            tname = str(item.get("tool_name", ""))
            if tname not in ALLOWED_AGENT_TOOLS:
                continue
            steps.append(
                _make_step(
                    step_no=idx,
                    tool_name=tname,
                    description=str(item.get("description") or f"Run {tname}")[:250],
                    params=dict(item.get("params") or {}),
                    requires_approval=True,
                )
            )
        return steps
    except Exception:
        return []
