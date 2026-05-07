## Simple Makefile to run Postgres locally (port 5481) and run migrations

# Only keep these knobs. Everything else is a magic value.
DB_CONTAINER_NAME ?= pg-tcg2
DB_PORT ?= 5385
DEFAULT_DATABASE_URL ?= postgresql://postgres:postgres@localhost:5385/postgres

.PHONY: help pg-up pg-down pg-logs pg-clean pg-wait migrate migrate-reset db-up db-reset

help:
	@echo "Targets:"
	@echo "  db-up         Start Postgres and run migrations"
	@echo "  pg-up         Start Postgres (Docker)"
	@echo "  pg-down       Stop and remove the Postgres container"
	@echo "  pg-logs       Tail Postgres logs"
	@echo "  pg-clean      Remove container and volume"
	@echo "  migrate       Run db-migrate up (uses DEFAULT_DATABASE_URL if DATABASE_URL is unset)"
	@echo "  migrate-reset Reset all migrations (db-migrate reset)"

# Start or reuse a local Postgres via Docker
pg-up:
	@docker volume inspect $(DB_CONTAINER_NAME) >/dev/null 2>&1 || docker volume create $(DB_CONTAINER_NAME) >/dev/null
	@cid=$$(docker ps -aq -f name=^$(DB_CONTAINER_NAME)$$); \
	if [ -n "$$cid" ]; then \
	  if [ -z "$$(docker ps -q -f name=^$(DB_CONTAINER_NAME)$$)" ]; then \
	    echo "Starting existing container $(DB_CONTAINER_NAME)..."; \
	    docker start $(DB_CONTAINER_NAME) >/dev/null; \
	  else \
	    echo "Container $(DB_CONTAINER_NAME) already running"; \
	  fi; \
	else \
	  echo "Creating and starting container $(DB_CONTAINER_NAME)..."; \
	  docker run -d --name $(DB_CONTAINER_NAME) \
	    -e POSTGRES_PASSWORD=postgres \
	    -e POSTGRES_USER=postgres \
	    -e POSTGRES_DB=postgres \
	    -p $(DB_PORT):5432 \
	    -v $(DB_CONTAINER_NAME):/var/lib/postgresql/data \
	    postgres:16-alpine >/dev/null; \
	fi

# Wait until Postgres accepts connections
pg-wait:
	@echo "Waiting for Postgres to be ready..."
	@until docker exec $(DB_CONTAINER_NAME) pg_isready -U postgres >/dev/null 2>&1; do \
	  sleep 1; \
	done; \
	echo "Postgres is ready."

pg-down:
	@docker stop $(DB_CONTAINER_NAME) >/dev/null 2>&1 || true
	@docker rm $(DB_CONTAINER_NAME) >/dev/null 2>&1 || true

pg-logs:
	@docker logs -f $(DB_CONTAINER_NAME)

pg-clean: pg-down
	@docker volume rm dev-pg >/dev/null 2>&1 || true

## Run migrations using db-migrate;  DEFAULT_DATABASE_URL
migrate:
	@echo "Running migrations..."
	@sh -c '\
	  DATABASE_URL="$${DATABASE_URL:-$()}"; \
	  echo "Using DATABASE_URL=$(DEFAULT_DATABASE_URL)"; \
	  DATABASE_URL="$(DEFAULT_DATABASE_URL)" npx prisma db push  \
	'

migrate-reset: pg-clean pg-up pg-wait migrate

db-reset: pg-clean pg-up

# Bring DB up and migrate in one go
db-up: pg-up pg-wait migrate
	@echo "Database ready and migrated."
