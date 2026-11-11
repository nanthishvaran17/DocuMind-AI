"""DocuMind AI FastAPI Control Plane."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the shared `services/document-worker` package is importable regardless of
# which `app.*` submodule is loaded first (uvicorn, alembic, or pytest).
_WORKER_PATH = Path(__file__).resolve().parents[3] / "services" / "document-worker"
if _WORKER_PATH.is_dir() and str(_WORKER_PATH) not in sys.path:
    sys.path.insert(0, str(_WORKER_PATH))
