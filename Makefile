.PHONY: dev dev-api dev-web migrate test lint

dev:
	docker compose up --build

dev-api:
	cd apps/api && ../../.venv/Scripts/uvicorn.exe app.main:app --reload --port 8000

dev-web:
	pnpm --filter @documind/web dev

migrate:
	cd apps/api && alembic upgrade head

test:
	cd apps/api && ../../.venv/Scripts/pytest.exe -v --cov=app --cov=../../services/document-worker/worker
	pnpm test

lint:
	.venv/Scripts/ruff.exe check --config apps/api/pyproject.toml apps/api services/document-worker tests
	.venv/Scripts/python.exe -m mypy --config-file apps/api/pyproject.toml apps/api/app services/document-worker/worker
	pnpm lint
	pnpm typecheck
