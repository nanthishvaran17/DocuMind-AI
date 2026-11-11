# ADR-001: Isolate PyMuPDF (AGPL-3.0) inside `services/document-worker`

- **Status:** Accepted
- **Date:** 2026-11-11

## Context
DocuMind AI requires high-precision PDF rendering, layout inspection, and text/image manipulation. `PyMuPDF` (`fitz`) provides superior speed and rendering accuracy, especially for complex layouts and thumbnail generation, but is licensed under **AGPL-3.0**. Importing an AGPL dependency directly into the main control-plane API (`apps/api`) creates licensing exposure for the entire control plane.

## Decision
1. `PyMuPDF` is **strictly prohibited** from `apps/api` and all other services except `services/document-worker` (and `services/ocr-service` only when explicitly enabled as a worker image).
2. `apps/api` only performs metadata validation, magic-byte checks, and job orchestration.
3. Inside `services/document-worker`, all PDF operations pass through a clean engine abstraction (`pdf_engine.py`) with permissive-licensed fallbacks (`pypdf`, `pikepdf`, `pdfplumber`, `ReportLab`, `Pillow`) so the worker remains functional even when `PyMuPDF` is omitted or disabled.
4. Any commercial distribution of DocuMind AI must either obtain a commercial Artifex PyMuPDF license or run with `PDF_ENGINE_ALLOW_PYMUPDF=false` using the permissive engines (`pikepdf` + `pypdf` + `pdfium`/`poppler`).
