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
	.venv/Scripts/pytest.exe -v --cov=apps/api/app --cov=services/document-worker/worker
	pnpm test

lint:
	.venv/Scripts/ruff.exe check apps/api services/document-worker tests
	pnpm lint
	pnpm typecheck
