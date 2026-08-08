.PHONY: fe-test fe-build fe-lint admin-fe-test admin-fe-lint py-test test-db-up test-db-down

# nearby-app frontend: run vitest inside the dev container
fe-test:
	cd nearby-app && docker compose -f docker-compose.dev.yml run --rm frontend npx vitest run

# nearby-app frontend: production vite build inside the dev container
fe-build:
	cd nearby-app && docker compose -f docker-compose.dev.yml run --rm frontend npx vite build

# nearby-app frontend: oxlint inside the dev container
fe-lint:
	cd nearby-app && docker compose -f docker-compose.dev.yml run --rm frontend npm run lint

# nearby-admin frontend: run vitest inside the dev container
admin-fe-test:
	cd nearby-admin && docker compose run --rm frontend npx vitest run

# nearby-admin frontend: oxlint inside the dev container
admin-fe-lint:
	cd nearby-admin && docker compose run --rm frontend npm run lint

# Root integration suite, parallelized across CPU cores via pytest-xdist
py-test:
	PYTHONDONTWRITEBYTECODE=1 .venv-test/bin/python -m pytest tests/ -q -n auto

# Bring up the disposable PostGIS + MinIO test containers
test-db-up:
	docker compose -f tests/docker-compose.test.yml up -d

# Tear down the test containers
test-db-down:
	docker compose -f tests/docker-compose.test.yml down
