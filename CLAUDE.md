# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Development server (runs on http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting and code quality
npm run lint
npm run format

# TypeScript compilation check
npx tsc --noEmit

# Unit tests (Vitest, node environment, no browser or network)
npm test

# Docker commands for testing CI/CD locally
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Build and test production Docker image
docker build --platform linux/amd64 -t fractals-nextjs:test -f Dockerfile .
docker run --rm -p 8080:8080 fractals-nextjs:test
```

## Project Architecture

This is a Next.js 14 TypeScript application that renders interactive Mandelbrot set fractals using Canvas API. Key architectural decisions:

### Core Rendering System

- **FractalRenderer** (`src/lib/fractalRenderer.ts`): Canvas-based rendering engine with progressive rendering and cancellation support
- **Mandelbrot calculations** (`src/lib/mandelbrot.ts`): Core mathematical functions for fractal generation
- **ZoomPanManager** (`src/lib/zoomPan.ts`): Interactive controls for navigation
- **ColorMapping** (`src/lib/colorMapping.ts`): Dynamic color schemes for visualization

### State Management Pattern

The main page (`src/app/page.tsx`) uses React hooks for:

- `bounds`: Current fractal view coordinates (FractalBounds)
- `isRendering/progress`: Rendering state and progress tracking
- Parameter controls: iterations, color schemes, canvas resolution
- Preset system: Built-in and custom fractal configurations

### Component Structure

- **UI Components** (`src/components/ui/`): Reusable form controls (Slider, Select, Input, Button)
- **Specialized Controls**: ZoomDisplay, CenterControls, PresetSelector, CustomPresetManager
- **Layout**: Single-page application with side-by-side canvas and control panels

### Performance Optimizations

- Progressive rendering with chunked calculations to avoid UI blocking
- Cancellable rendering operations when parameters change
- RequestAnimationFrame for smooth updates
- Canvas ImageData direct pixel manipulation

## Next.js Configuration

The application uses Next.js with these key settings:

- `output: 'standalone'` for Docker deployment
- `poweredByHeader: false` for security
- `reactStrictMode: true` for development checks
- `swcMinify: true` for production optimization
- TypeScript with strict mode enabled
- Path aliases configured (`@/*` maps to `./src/*`)
- Tailwind CSS with custom HSL color variables for theming

## Testing and Quality

ESLint for code quality and Vitest for unit tests. Tests live in
`src/**/__tests__/*.test.ts` and cover the pure logic in `src/lib` plus the
`/api/health` route; `vitest.config.mts` aliases `@/*` to `src/*` and pins the
node environment, so a test must not need a browser, canvas or network.

The CI pipeline runs:

```bash
npm ci
npm run build
npm run lint
npx tsc --noEmit
```

## Deployment

### Docker Configuration

- Multi-stage Dockerfile optimized for container deployment
- Standalone Next.js output for minimal container size
- Runs on port 8080 with non-root user for security
- Health endpoint at `/api/health` for container orchestration probes

### CI/CD Pipeline

#### Azure Container Apps (Bitbucket Pipelines)

Pipeline runs on every push with parallel steps (see `bitbucket-pipelines.yml`):

1. **Build and Test**: `npm ci && npm run build && npm run lint && npx tsc --noEmit`
2. **Deploy to Container Apps**: Pushes to ACR, deploys via Pulumi

Uses [devops-pulumi-ts](https://github.com/sloanahrens/devops-pulumi-ts) infrastructure.

**Branch-Based Deployments:**

- Each branch gets isolated Container App
- Branch names normalized: `feature/foo` → `feature-foo` (max 32 chars for Azure)
- Service pattern: `fractals-nextjs-<branch>`

**Cleanup:** Branch resources cleaned via `branch-cleanup` custom pipeline.

**Bitbucket Repository Variables:**
| Variable | Description | Secured? |
|----------|-------------|----------|
| `AZURE_CLIENT_ID` | Deploy managed identity client ID | No |
| `AZURE_TENANT_ID` | Azure AD tenant ID | No |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID | No |
| `AZURE_RESOURCE_GROUP` | Resource group name | No |
| `STATE_STORAGE_ACCOUNT` | Storage account for Pulumi state | No |
| `AZURE_LOCATION` | Azure region (e.g., westus2) | No |
| `PULUMI_CONFIG_PASSPHRASE` | State encryption passphrase | Yes |

## Version Notes

_Last updated: 2026-10-07_

### Vitest Test Suite (2026-10-07)

- Added Vitest (`vitest run` via the `test` npm script and the `test`
  Makefile target) covering `src/lib` and the `/api/health` route
- The config is `vitest.config.mts` so Vitest's native loader reads it as ESM
- `vite` is pinned to the 6.x line on purpose. The landing gate's `ci-base`
  image ships Node 20.18.1, and Vite 8's rolldown bundler wants
  `engines.node` `^20.19.0 || >=22.12.0`. npm drops *optional* dependencies
  that fail their engine check, so on that image rolldown's native binding
  was silently never installed and vitest died at startup. Vite 6 (rollup +
  esbuild) runs on Node 20.18. Revisit the pin when `ci-base` moves past
  Node 20.19.

### Azure Container Apps Migration (2026-01-05)

- Migrated from GCP Cloud Run to Azure Container Apps
- Updated Bitbucket pipeline for Azure OIDC authentication
- Using devops-pulumi-ts infrastructure stack

### Next.js 16 + ESLint 9 Migration

- Upgraded to Next.js 16.1.1 with ESLint 9 flat config
- `next lint` removed in Next.js 16 - now using `eslint .` directly
- ESLint config migrated to `eslint.config.mjs` flat config format
- Removed deprecated `swcMinify` option from `next.config.js`

### Potential Improvements

- **Testing**: UI components (`src/components/ui`) still have no tests; the
  suite covers only the pure logic in `src/lib` and the health route

## Gas Town rules (polecats and crew)

- Gate: `make gate` (npm ci, lint, typecheck, build, test) must pass with no network access to any cloud and no secrets. The landing gate runs the same command.
- You never have cloud credentials and never deploy. Do not run `gcloud`, `pulumi` or any cloud CLI, and do not add secrets, keys or tokens to the repo. Deployment is done only by the human through the devops system (see the `devops` rig's `docs/design.md`).
- The container contract the deploy system relies on: root `Dockerfile`, the server listens on `$PORT` (8080), health route `/api/health`, no baked secrets.
- Keep changes small and tested. Do not bump major versions beyond what your bead names.
