SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
WEB_PORT ?= 3000
BASE_URL ?= http://localhost:$(WEB_PORT)
PROD_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml

.PHONY: help up down logs ps build verify seed smoke prod-up prod-down prod-logs clean

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

verify: ## Run every gate the CI runs
	cd backend && ./mvnw -B verify
	cd frontend && npm run lint && npm run test -- --run && npm run typecheck && npm run build

seed: ## Upload 300 demo photos and a dump through the running stack
	AETHER_DATA_DIR=/tmp/opencode/aether-seed ./scripts/dev/seed.sh --count 300 --base-url $(BASE_URL)

smoke: ## Walk the API against the running stack (adds six photos and a dump)
	AETHER_DATA_DIR=/tmp/opencode/aether-seed ./scripts/dev/smoke.sh --base-url $(BASE_URL)

prod-up: ## Start the production overlay (requires DOMAIN in .env)
	$(PROD_COMPOSE) up -d --build

prod-down: ## Stop the production overlay (volumes kept)
	$(PROD_COMPOSE) down

prod-logs: ## Follow production logs
	$(PROD_COMPOSE) logs -f --tail=100

clean: ## DESTRUCTIVE: stop the local stack and delete its database and media volumes
	@printf 'This deletes aether_stack_pgdata and aether_stack_media. Type "yes": ' && read -r ok && [ "$$ok" = "yes" ]
	$(COMPOSE) down -v
