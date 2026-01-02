.PHONY: help install dev build start lint format typecheck check clean docker-build docker-run test-docker

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
	@echo "  make check         Run all quality checks (lint + typecheck)"
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

test-docker:
	docker run --rm -v $(PWD):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Cleanup
clean:
	rm -rf .next
	rm -rf node_modules/.cache
	@echo "Build artifacts cleaned"
