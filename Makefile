.PHONY: help install dev build start lint format typecheck check clean docker-build docker-run test-docker test integration integration-prod check-integration-url check-integration-prod-url check-prod-url smoke deploy-check check-registry-url

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
	@echo "  make integration INTEGRATION_URL=<url> [EXPECT_SHA=<commit>]   (STAGING_URL=<url> also works)"
	@echo "  make integration-prod PROD_URL=<url> [EXPECT_SHA=<commit>]     (the same read-only suite; refuses a staging URL)"
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

# A fresh checkout or worktree has no node_modules, and a lockfile that moved on
# leaves an old one behind, so the targets an agent runs before it submits
# (lint, typecheck, build and test, which `check` and `presubmit` reach) take
# `deps`, and `deps` installs when the dependencies are missing or older than
# package-lock.json. npm writes its own hidden lockfile into node_modules on every
# install; that file is the stamp, so a warm tree pays nothing. `ci-install`
# below still installs every time, and `gate` runs it first, so `deps` is already
# satisfied by the time the gate reaches `check` and nothing installs twice.
.PHONY: deps
deps: node_modules/.package-lock.json

node_modules/.package-lock.json: package-lock.json
	npm ci
	@touch $@

# Development
dev:
	npm run dev

build: deps
	npm run build

start:
	npm start

# Quality
lint: deps
	npm run lint

format:
	npm run format

typecheck: deps
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
.PHONY: ci-install test presubmit gate

ci-install:
	npm ci

# Vitest suite for the pure logic in src/lib and the /api/health route.
test: deps
	npm test

presubmit: check

gate: ci-install check build test

# ── Integration tier (the deployed app) ─────────────────────────────────
# The checks that call a deployed app, and the one suite here that needs the
# network. It is deliberately not in `gate`: the gate runs with no network and
# no deployment to call, and it must keep passing on a machine that has neither.
# Run by hand against any deployment, or by the staging workflow after a deploy
# (`make integration INTEGRATION_URL=<url> EXPECT_SHA=<commit>`). STAGING_URL is
# the older name for the same URL and still works; INTEGRATION_URL wins if both
# are set.
#
# The target installs its own dependencies (`ci-install`), because the staging
# workflow checks the repository out fresh and runs this one command: that
# checkout has no node_modules, and `npm run test:integration` died on
# `vitest: not found` before it could say anything about the deployment.
#
# `check-integration-url` is a prerequisite ahead of the install, so a run that
# forgot the URL still fails with the command to type (the message
# src/lib/integrationTarget.ts gives) in a second, rather than after npm ci.
integration: check-integration-url ci-install
	npm run test:integration

# The same one-line message integrationTarget.ts gives when neither variable is
# set. It is written out twice on purpose: this one has to answer before
# node_modules exists, so it cannot come from the TypeScript.
# `make-targets.test.ts` fails if the two stop being identical, so change this
# one and that one together.
check-integration-url:
	@if [ -z "$(strip $(INTEGRATION_URL))" ] && [ -z "$(strip $(STAGING_URL))" ]; then \
		echo "INTEGRATION_URL (or its alias STAGING_URL) is not set: make integration INTEGRATION_URL=<url> [EXPECT_SHA=<commit>]"; \
		exit 1; \
	fi

# The same suite against production, for the deploy workflow's check that the
# release it just rolled out is the one serving. It is read-only by construction
# (`integration-read-only.test.ts` holds tests/integration to GET and HEAD), and
# EXPECT_SHA=<commit> makes the version check prove the released commit rather
# than any commit. PROD_URL is the variable `smoke` takes for the same URL; it
# becomes INTEGRATION_URL here, ahead of any STAGING_URL in the environment.
integration-prod: check-integration-prod-url ci-install
	INTEGRATION_URL="$(PROD_URL)" npm run test:integration

# Refuse a run with no URL, and a URL that names staging: the prod check pointed
# at staging would pass for the wrong deployment. Both answer before the
# install, as `check-integration-url` does.
check-integration-prod-url:
	@if [ -z "$(strip $(PROD_URL))" ]; then \
		echo "PROD_URL is not set: make integration-prod PROD_URL=<url> [EXPECT_SHA=<commit>]"; \
		exit 1; \
	fi
	@if printf '%s' "$(PROD_URL)" | grep -qi staging; then \
		echo "PROD_URL names staging, so make integration-prod will not run against it: use make integration INTEGRATION_URL=<url>"; \
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
# `integration` is handed INTEGRATION_URL. That name is the caller's, not this
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
# ahead of the run, as check-integration-url is on `integration` above: a run that
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
# image with no Go toolchain and no route to a Go registry that serves
# gt.local/devops, the one module this needs.
#
# The registry is the deployment's own, so its URL is not written here: it is
# the `goModuleRegistryUrl` key of the params file (PARAMS_FILE), so a fork
# points it at the registry it publishes the deploy library to and this file
# does not change. `registryUrl` is the same registry's host, which the deploy
# generator wants; GOPROXY needs the module URL, path and all. GOPROXY takes
# that URL with the public proxy behind it, following the devops repo's
# consume.yml; a caller who sets GOPROXY still wins (make
# deploy-check GOPROXY=...) on a runner that reaches the module another way.
# The file is read with sed, which `make` already needs, so the deploy half
# still needs no Node.
PARAMS_FILE ?= deploy/params.json
REGISTRY_URL = $(shell sed -n 's/.*"goModuleRegistryUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' '$(PARAMS_FILE)' | head -n 1)
GOPROXY ?= $(REGISTRY_URL),https://proxy.golang.org,direct
DEPLOY_GO_ENV = GOPROXY=$(GOPROXY) GOPRIVATE=gt.local GONOPROXY=none GONOSUMDB=gt.local GOFLAGS=-mod=mod

# Refuse a run whose params file names no registry, before Go is reached. A
# missing or unreadable file, or a file without the key, yields no URL, and a
# run with no URL would hand go the malformed list ",https://proxy.golang.org,
# direct"; it stops here instead. A caller who set GOPROXY gives the run its
# own value, so the check is skipped for them.
check-registry-url:
	@if [ "$(origin GOPROXY)" = "file" ] && [ -z "$(strip $(REGISTRY_URL))" ]; then \
		printf '%s\n' \
			'$(PARAMS_FILE) names no goModuleRegistryUrl, so there is no Go module registry to resolve the deploy library through.' \
			'Set goModuleRegistryUrl to the registry this deployment publishes gt.local/devops to, or name one for this run:' \
			'    make deploy-check GOPROXY=<url>,https://proxy.golang.org,direct' >&2; \
		exit 1; \
	fi

deploy-check: check-registry-url
	cd deploy && $(DEPLOY_GO_ENV) go test ./...
	cd deploy && $(DEPLOY_GO_ENV) go vet ./...
