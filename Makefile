SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
WEB_PORT ?= 3000
BASE_URL ?= http://localhost:$(WEB_PORT)
# Local observability keeps the published web port from the local override.
OBS_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.observability.yml
# Production has no published web port: Caddy is the only public entry point.
PROD_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.prod.yml

.PHONY: help up down logs ps build verify seed demo smoke observe-up observe-down observe-ps observe-logs oncall a11y prod-up prod-down prod-logs deploy-smoke backup restore rollback clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

up: ## Start the local stack (web on $(BASE_URL))
	$(COMPOSE) up -d --build
	@echo "web: $(BASE_URL)  ·  api: internal only  ·  db: internal only"

down: ## Stop the local stack (volumes kept)
	$(COMPOSE) down

logs: ## Follow local stack logs
	$(COMPOSE) logs -f --tail=100

ps: ## Show local stack health
	$(COMPOSE) ps

build: ## Build both images without starting
	$(COMPOSE) build

verify: ## Run the hermetic gates (backend, frontend, on-call, shell)
	cd backend && ./mvnw -B verify
	cd frontend && npm run lint && npm run format:check && npm run test -- --run && npm run typecheck && npm run build
	python3 -m unittest discover -s oncall -p 'test_*.py'
	bash -n scripts/dev/oncall-token.sh oncall/run.sh oncall/install-service.sh scripts/deploy/*.sh scripts/demo/*.sh

seed: ## Upload 300 sample photos and a dump through the running stack
	AETHER_DATA_DIR=/tmp/opencode/aether-seed ./scripts/dev/seed.sh --count 300 --base-url $(BASE_URL)

demo: ## Download real demo photos, then seed 36 photos and 3 dumps (idempotent downloads)
	./scripts/dev/fetch-demo-photos.sh
	AETHER_DATA_DIR=/tmp/opencode/aether-seed ./scripts/dev/seed.sh \
		--count 36 --dumps 3 \
		--titles "Low tide|Green hours|After the rain" \
		--aura "#7d8a7a" \
		--source-dir /tmp/opencode/aether-demo-photos \
		--base-url $(BASE_URL)

smoke: ## Walk the API against the running stack (adds six photos and a dump)
	AETHER_DATA_DIR=/tmp/opencode/aether-seed ./scripts/dev/smoke.sh --base-url $(BASE_URL)

observe-up: ## Start the local stack with Prometheus, Grafana, Jaeger, Loki and Alertmanager
	./scripts/dev/oncall-token.sh
	$(OBS_COMPOSE) up -d
	@echo "app: $(BASE_URL)  ·  grafana: http://localhost:3001  ·  prometheus: http://localhost:9090  ·  jaeger: http://localhost:16686"
	@echo "start the responder in another terminal with: make oncall"

observe-down: ## Stop the observability stack (volumes kept)
	$(OBS_COMPOSE) down

observe-ps: ## Show the observability stack health
	$(OBS_COMPOSE) ps

observe-logs: ## Follow the observability stack logs
	$(OBS_COMPOSE) logs -f --tail=100 prometheus grafana alertmanager otel-collector jaeger loki promtail

oncall: ## Run the host-side on-call responder (foreground; needs the observability stack)
	./oncall/run.sh

prod-up: ## Start production with observability (requires DOMAIN in .env)
	./scripts/dev/oncall-token.sh
	$(PROD_COMPOSE) up -d --build

prod-down: ## Stop the production overlay (volumes kept)
	$(PROD_COMPOSE) down

prod-logs: ## Follow production logs
	$(PROD_COMPOSE) logs -f --tail=100

deploy-smoke: ## Walk a deployed origin (BASE_URL=https://your.domain)
	./scripts/deploy/smoke.sh "$(BASE_URL)"

backup: ## Back up PostgreSQL and the media volume to backups/
	./scripts/deploy/backup.sh

restore: ## DESTRUCTIVE: restore a dump (make restore DUMP=backups/db-<utc>.sql.gz)
	./scripts/deploy/restore.sh "$(DUMP)" --yes

rollback: ## Roll back to the previous successful image (VPS, scripts/deploy/rollback.sh)
	./scripts/deploy/rollback.sh

a11y: ## Real-browser axe contrast pass at 320/768/1280 (needs npx playwright install chromium)
	cd frontend && npm run test:a11y

clean: ## DESTRUCTIVE: stop the local stack and delete its database and media volumes
	@printf 'This deletes aether_stack_pgdata and aether_stack_media. Type "yes": ' && read -r ok && [ "$$ok" = "yes" ]
	$(COMPOSE) down -v
