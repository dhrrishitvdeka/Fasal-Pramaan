# FasalPramaan AI — monorepo task runner
# Works with GNU Make (Git Bash / WSL / Linux / macOS).
# On Windows PowerShell without Make, use: .\scripts\fp.ps1 <command>

.PHONY: help setup dev up down clean seed migrate test lint build logs health demo

COMPOSE := docker compose
API_EXEC := $(COMPOSE) exec -T api

help:
	@echo "FasalPramaan AI — available targets"
	@echo "  make setup    Copy .env, build images, start infra, migrate, seed"
	@echo "  make dev      Start full stack (detached)"
	@echo "  make up       Alias for make dev"
	@echo "  make down     Stop all services"
	@echo "  make clean    Stop and remove volumes"
	@echo "  make migrate  Run Alembic migrations"
	@echo "  make seed     Load synthetic demo data"
	@echo "  make test     Run API + AI tests"
	@echo "  make lint     Run linters"
	@echo "  make build    Build all Docker images"
	@echo "  make logs     Tail service logs"
	@echo "  make health   Hit health endpoints"
	@echo "  make demo     Print demo credentials and URLs"

setup:
	@test -f .env || cp .env.example .env
	$(COMPOSE) build
	$(COMPOSE) up -d db redis minio
	@echo "Waiting for database..."
	@sleep 8
	$(COMPOSE) --profile tools run --rm migrate
	$(COMPOSE) --profile tools run --rm seed
	$(COMPOSE) up -d ai api worker dashboard mobile
	@echo ""
	@echo "FasalPramaan AI is starting. Run: make health"
	@echo "Dashboard: http://localhost:3000"
	@echo "Field app: http://localhost:8085"
	@echo "API docs:  http://localhost:8000/docs"

dev up:
	@test -f .env || cp .env.example .env
	$(COMPOSE) up -d db redis minio
	@sleep 6
	$(COMPOSE) --profile tools run --rm migrate
	$(COMPOSE) --profile tools run --rm seed
	$(COMPOSE) up -d ai api worker dashboard mobile

down:
	$(COMPOSE) down

clean:
	$(COMPOSE) down -v --remove-orphans

migrate:
	$(COMPOSE) --profile tools run --rm migrate

seed:
	$(COMPOSE) --profile tools run --rm seed

test:
	$(COMPOSE) run --rm -e DATABASE_URL=postgresql+psycopg://fasalpramaan:fasalpramaan_dev_only@db:5432/fasalpramaan api pytest -q
	$(COMPOSE) run --rm ai pytest -q

lint:
	$(COMPOSE) run --rm api ruff check app tests
	$(COMPOSE) run --rm ai ruff check app tests

build:
	# Build api once (shared by worker/migrate/seed) + ai + both user interfaces
	$(COMPOSE) build api ai dashboard mobile

prune-redundant-images:
	-docker rmi fasalpramaan-worker:latest fasalpramaan-migrate:latest fasalpramaan-seed:latest 2>/dev/null || true
	@echo "Removed redundant tags if present. Use: docker images | findstr fasalpramaan"

logs:
	$(COMPOSE) logs -f --tail=100

health:
	@curl -sf http://localhost:8000/health && echo " API OK" || echo " API not ready"
	@curl -sf http://localhost:8001/health && echo " AI OK" || echo " AI not ready"
	@curl -sf http://localhost:3000 >/dev/null && echo " Dashboard OK" || echo " Dashboard not ready"
	@curl -sf http://localhost:8085/healthz >/dev/null && echo " Field app OK" || echo " Field app not ready"

demo:
	@echo "=== FasalPramaan AI Demo ==="
	@echo "Dashboard: http://localhost:3000"
	@echo "Field app: http://localhost:8085"
	@echo "API:       http://localhost:8000"
	@echo "API docs:  http://localhost:8000/docs"
	@echo "MinIO:     http://localhost:9001  (minioadmin / minioadmin_dev_only)"
	@echo "AI:        http://localhost:8001/health"
	@echo ""
	@echo "Demo password for all users: Demo@12345"
	@echo "  admin@fasalpramaan.local      (administrator)"
	@echo "  reviewer@fasalpramaan.local   (reviewer)"
	@echo "  officer@fasalpramaan.local    (field_officer)"
	@echo "  farmer@fasalpramaan.local     (farmer)"
