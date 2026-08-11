# BEYU OS — common development tasks.
# Run `make help` for the list.

.DEFAULT_GOAL := help
SHELL := /bin/bash

.PHONY: help install dev build test typecheck lint clean \
        up down logs db-migrate db-seed db-reset verify-audit check

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install all workspace dependencies
	pnpm install

dev: ## Run all applications in watch mode
	pnpm dev

build: ## Build every package and service
	pnpm build

test: ## Run the full test suite
	pnpm test

typecheck: ## Type-check every project
	pnpm typecheck

lint: ## Lint every project
	pnpm lint

check: typecheck lint test ## Everything CI runs, locally

clean: ## Remove build output and caches
	pnpm clean
	rm -rf node_modules/.cache .turbo

# --- infrastructure --------------------------------------------------------

up: ## Start PostgreSQL, Redis, Kafka and MinIO
	docker compose up -d
	@echo "Waiting for PostgreSQL..."
	@until docker compose exec -T postgres pg_isready -U beyu -d beyu_os >/dev/null 2>&1; do sleep 1; done
	@echo "Stack ready."

down: ## Stop the stack (volumes are preserved)
	docker compose down

logs: ## Tail stack logs
	docker compose logs -f

# --- database --------------------------------------------------------------

db-migrate: ## Apply pending migrations
	pnpm db:migrate

db-seed: ## Load structural reference data
	pnpm db:seed

db-reset: ## Drop and rebuild the database (refuses in production)
	pnpm db:reset

verify-audit: ## Recompute and verify the audit hash chain
	pnpm --filter @beyu/api db:verify-audit
