.PHONY: help install dev build start lint format typecheck check clean docker-build docker-run test-docker test integration check-prod-url smoke deploy-check

# Default target
help:
	@echo "fractals-nextjs - Interactive Mandelbrot Set Generator"
	@echo ""
	@echo "Setup:"
	@echo "  make install       Install dependencies"
	@echo ""
	@echo "Development:"
	@echo "  make dev           Start development server (port 3000)"
	@echo "  make build         Build for production"
	@echo "  make start         Start production server"
	@echo ""
	@echo "Quality:"
	@echo "  make lint          Run ESLint"
	@echo "  make format        Format code with Prettier"
	@echo "  make typecheck     Run TypeScript type checking"
	@echo "  make test          Run the Vitest suite"
	@echo "  make check         Run all quality checks (lint + typecheck)"
	@echo ""
	@echo "Integration (calls a deployed app over the network; not part of the gate):"
	@echo "  make integration STAGING_URL=<url> [EXPECT_SHA=<commit>]"
	@echo ""
	@echo "Smoke (a deployment that is already serving; read-only, not part of the gate):"
	@echo "  make smoke PROD_URL=<url>"
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy-check  Test and vet the deploy program (deploy/, Go)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  Build production Docker image"
	@echo "  make docker-run    Run Docker container (port 8080)"
	@echo "  make test-docker   Test CI/CD pipeline locally"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean         Remove build artifacts"

# Setup
install:
	npm ci

# Development
dev:
	npm run dev

build:
	npm run build

start:
	npm start

# Quality
lint:
	npm run lint

format:
	npm run format

typecheck:
	npx tsc --noEmit

check: lint typecheck
	@echo "All checks passed!"

# Docker
docker-build:
	docker build --platform linux/amd64 -t fractals-nextjs:latest -f Dockerfile .

docker-run:
	docker run --rm -p 8080:8080 fractals-nextjs:latest

# `npm ci`, the production build, lint and typecheck inside a container, with the
# Vitest suite deliberately left out, so this is not `make gate`: a change that
# only this passes has not been through the gate. Run `make gate` for that.
test-docker:
	docker run --rm -v $(PWD):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Cleanup
clean:
	rm -rf .next
	rm -rf node_modules/.cache
	@echo "Build artifacts cleaned"

# ── Gas Town landing gate (no cloud access, no secrets) ──────────────────
.PHONY: ci-install test presubmit gate check-staging-url

ci-install:
	npm ci

# Vitest suite for the pure logic in src/lib and the /api/health route.
test:
	npm test

presubmit: check

gate: ci-install check build test

# ── Integration tier (the deployed app) ─────────────────────────────────
# The checks that call a deployed app, and the one suite here that needs the
# network. It is deliberately not in `gate`: the gate runs with no network and
# no deployment to call, and it must keep passing on a machine that has neither.
# Run by hand against staging, or by the staging workflow after a deploy
# (`make integration STAGING_URL=<url> EXPECT_SHA=<commit>`).
#
# The target installs its own dependencies (`ci-install`), because the staging
# workflow checks the repository out fresh and runs this one command: that
# checkout has no node_modules, and `npm run test:integration` died on
# `vitest: not found` before it could say anything about the deployment.
#
# `check-staging-url` is a prerequisite ahead of the install, so a run that
# forgot STAGING_URL still fails with the command to type (the message
# src/lib/integrationTarget.ts gives) in a second, rather than after npm ci.
integration: check-staging-url ci-install
	npm run test:integration

# The same message integrationTarget.ts gives for a missing STAGING_URL. It is
# written out twice on purpose: this one has to answer before node_modules
# exists, so it cannot come from the TypeScript. `make-targets.test.ts` fails
# if the two stop being identical, so change this one and that one together.
check-staging-url:
	@if [ -z "$(STAGING_URL)" ]; then \
		echo "STAGING_URL is not set."; \
		echo ""; \
		echo "Set STAGING_URL to the deployment to test, for example:"; \
		echo "  make integration STAGING_URL=https://fractals-nextjs-staging-example.run.app"; \
		echo "  STAGING_URL=https://... npm run test:integration"; \
		echo ""; \
		echo "EXPECT_SHA=<commit> is optional, and makes the version check exact."; \
		exit 1; \
	fi

# ── Smoke check (a deployment that is already serving) ───────────────────
# One read-only pass over a service that is up: its health path, the explorer
# page, the version route and the static social card. It reads status codes and
# nothing else -- no body, no credential -- so it is safe to point at anything
# that is serving, and it is the quick answer to "the deploy said it was up; is
# it answering".
#
# Deliberately not in `gate`: like `integration`, it needs a deployment to call,
# and the gate runs with none. It is not `integration` either: that tier reads
# what the pages say and installs node_modules to do it, while this needs a
# shell, curl and nothing checked out.
#
# The URL arrives as PROD_URL, named for the environment it points at the way
# `integration` is handed STAGING_URL. That name is the caller's, not this
# file's: the hourly check of a service people are using runs
# `make smoke PROD_URL=<url>`, so the variable is part of what the target
# promises rather than a local choice. A caller who knows the script better than
# the target has nothing to learn -- scripts/smoke.sh's own --url and
# GT_SERVICE_URL work as they always did, and PROD_URL is this target's name for
# the same URL.
smoke: check-prod-url
	scripts/smoke.sh --url "$(PROD_URL)"

# Refuse a run that names no service, before the script is reached. The script
# refuses one too, but it names its own flag and the variable behind it, and the
# name the caller of this target is given is PROD_URL. It is a prerequisite,
# ahead of the run, as check-staging-url is on `integration` above: a run that
# forgot the URL is told so in a second, and what this target reads is legible
# without following it into the script.
check-prod-url:
	@if [ -z "$(strip $(PROD_URL))" ]; then \
		printf '%s\n' \
			'PROD_URL is not set, so there is no service to smoke.' \
			'Set it to the URL of the deployment to check, for example:' \
			'    make smoke PROD_URL=https://fractals-nextjs-prod-example.run.app' >&2; \
		exit 1; \
	fi

# ── The deploy program (deploy/, a Go module of its own) ──────────────────
# The Pulumi program the release flow runs, and the mock test that covers it
# (deploy/README.md). It is not part of `gate`: the landing gate runs in a Node
# image with no Go toolchain and no route to the Forgejo Go registry that
# serves gt.local/devops, the one module this needs. GOPROXY defaults to that
# registry with the public proxy behind it, following the devops repo's
# consume.yml; override it (make deploy-check GOPROXY=...) on a runner that
# reaches the module another way.
GOPROXY ?= http://forgejo:3000/api/packages/sloan/go,https://proxy.golang.org,direct
DEPLOY_GO_ENV = GOPROXY=$(GOPROXY) GOPRIVATE=gt.local GONOPROXY=none GONOSUMDB=gt.local GOFLAGS=-mod=mod

deploy-check:
	cd deploy && $(DEPLOY_GO_ENV) go test ./...
	cd deploy && $(DEPLOY_GO_ENV) go vet ./...
