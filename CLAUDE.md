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

# Run the gate's checks in a container (`make test-docker` runs this)
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Build and test production Docker image
docker build --platform linux/amd64 -t fractals-nextjs:test -f Dockerfile .
docker run --rm -p 8080:8080 fractals-nextjs:test
```

## Project Architecture

This is a Next.js 16 (React 19) TypeScript application that renders interactive Mandelbrot set fractals using Canvas API. Key architectural decisions:

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
- A preview pass while a gesture is in flight, with the full-resolution render deferred to its end
- Canvas ImageData direct pixel manipulation

## Next.js Configuration

The application uses Next.js with these key settings:

- `output: 'standalone'` for Docker deployment
- `poweredByHeader: false` for security
- `compress: true` to gzip responses
- `reactStrictMode: true` for development checks
- TypeScript with strict mode enabled
- Path aliases configured (`@/*` maps to `./src/*`)
- Tailwind CSS with custom HSL color variables for theming

## Testing and Quality

ESLint for code quality and Vitest for unit tests. Tests live in
`src/**/__tests__/*.test.ts` and cover the pure logic in `src/lib` plus the
`/api/health` route; `vitest.config.mts` aliases `@/*` to `src/*` and pins the
node environment, so a test must not need a browser, canvas or network.

The landing gate (`.forgejo/workflows/gate.yml`) runs `make gate` on a
`land/**` branch, and that is the whole of what CI runs here:

```bash
make gate        # ci-install → check → build → test
                 #   ci-install = npm ci
                 #   check      = lint (`eslint .`) + typecheck (`tsc --noEmit`)
                 #   build      = `next build`
                 #   test       = vitest run
```

`make presubmit` is `make check` alone, for a quick pass without the install or
the build. The `deploy/` program has its own target, `make deploy-check`, which
is deliberately not part of `gate` (see the Version Notes below).

## Deployment

### Docker Configuration

- Multi-stage Dockerfile optimized for container deployment
- Standalone Next.js output for minimal container size
- Runs on port 8080 with non-root user for security
- Health endpoint at `/api/health` for container orchestration probes

### CI/CD Pipeline

No push to this repo deploys anything. The landing gate
(`.forgejo/workflows/gate.yml`) runs `make gate` on a `land/**` branch; it needs
no cloud credentials. Build and deploy happen on the deploy runner, through the
devops system, run by the human. The program that deploys the app is `deploy/`,
which that runner executes at a release tag and no CI here runs
(`deploy/README.md`). That runner also reads the app's release workflows,
`.forgejo/workflows/deploy.yml` and `teardown.yml`, which no push here starts:
a protected `v*` or `teardown-v*` tag does, and only the human may push one. See
the Gas Town rules at the end of this file.

## Version Notes

_Last updated: 2026-10-08_

### Log-scale zoom slider (2026-10-08)

- The Zoom Level slider is logarithmic: its position `t` in 0..1 maps to
  `MIN_ZOOM * 10^(4t)`, so equal steps are equal zoom *ratios* and the middle of
  the travel is 100x. Run linearly to 10000x, the whole 1x-100x range sat in the
  first percent of the track. `src/lib/zoomScale.ts` owns that mapping
  (`sliderToZoom`, `zoomToSlider`, spanning `MIN_ZOOM`/`MAX_ZOOM` from
  `mandelbrot.ts`).
- `Slider` stays generic: the page hands it the mapped position with `min={0}`
  and `max={1}`, so the slider's `formatValue` receives a *position* and has to
  map it back through `sliderToZoom` before formatting. Only the slider's
  position is mapped — Zoom In/Out and the typed coordinate path stay exact.
- Coordinate boxes hold only what the user typed (a `draft` in `page.tsx` and
  `CenterControls`). An untouched box shows `formatCoordinate` of the view — at
  most six significant digits, trailing zeros dropped — while Apply reuses the
  view's own float64, so a short display costs no precision. `ZoomDisplay` reads
  its coordinates through the same helper.

### One base view for zoom (2026-10-08)

- `mandelbrot.ts` is the one definition of what zoom 1 is: `BASE_WIDTH` x
  `BASE_HEIGHT` is now 4 x 3, the whole set and the shape of a canvas, where it
  used to be 3.5 x 2.5. The app opens on a slightly wider default view than
  before, and that view is now what the Zoom Level readout means.
- The readout had a second base of its own (`initialWidth = 4`, hard-coded in
  `calculateZoomLevel`), so the Overview preset read as 1x while the view math
  and the page's zoom state called it 0.875. The page's zoom floor is 1, so the
  first wheel notch after loading that preset was clamped away and the view
  jumped instead of zooming. `calculateZoomLevel` now reads the ratio back
  through `boundsToView`, and the built-in presets are framed at exactly 1, 200
  and 2000 against the 4-unit base.
- The readout is exact and `formatZoom` (presets.ts) is what makes it short:
  the Zoom Level slider and the View Info panel format with it, so a notch that
  moves the view by a hair over 10% shows as 1.1x instead of rounding to 1x.
  `MIN_ZOOM`, `MAX_ZOOM` and `clampZoom` moved from `page.tsx` into
  `mandelbrot.ts` so the range the page clamps a gesture into is testable.
- The page hands each gesture step the bounds that step produced
  (`boundsRef.current` in the wheel callback). A burst of wheel notches arrives
  faster than React commits, so a step that read the committed bounds again
  made the whole burst one notch.

### GCP project id (2026-10-08)

- The cloud project this app deploys into was `gt-fractals`; it is now
  `gt-fractals-m4xq` in every place this repository names it — the
  `fractals:project` key in both stack files, `GT_PROJECT` in both release
  workflows, and the constants and fakes the tests assert against. A project id
  is global, and the old one may be taken, so the human chose the new name.
- The project is created and bootstrapped outside this repository, by the
  reviewed manifest in the devops repo, so that manifest has to name the new id
  too (its own bead). Nothing here deploys: the rename changes what a future
  release targets, not a running service.
- The service account emails embed the project id, so the runtime account moves
  with it: `runtime-fractals-nextjs@gt-fractals-m4xq.iam.gserviceaccount.com`.
  The app name `fractals-nextjs`, the Pulumi project `fractals`, the stack names
  and the image path layout are unchanged.

### Deploy program (2026-10-08)

- Added `deploy/`, the Go Pulumi program that deploys this app to Cloud Run
  through the `gt.local/devops` library (bead B4.5 of the devops plan), and
  `scripts/release/`, copied verbatim from that library's repository at the
  `v0.1.0` its `go.mod` pins. No runner clones the devops repo, so the app
  carries the scripts its release flow runs, and both sides are one revision.
- `deploy/` is a Go module of its own, so the Node gates never build it.
  `make deploy-check` runs its mock test and `go vet`, and is deliberately not
  part of `make gate`: the gate image has no Go toolchain and no route to the
  Forgejo Go registry that serves `gt.local/devops`. `deploy/README.md` has the
  proxy settings, the stack names and how a release changes these files.
- Two names there are load-bearing and easy to get wrong. The Pulumi project is
  `fractals`, not this repository's name: the patrol finds the app's state under
  that project name. The app's own name is this repository's,
  `fractals-nextjs`, which is what the library turns into the service
  `fractals-nextjs-staging` and what the deploy workflow's `GT_APP` defaults to.

### App-side release workflows (2026-10-08)

- Added `.forgejo/workflows/deploy.yml` and `.forgejo/workflows/teardown.yml`,
  copied verbatim from the devops repo's `workflows/` templates at the `v0.1.0`
  the deploy program's `go.mod` pins — the same revision as `scripts/release/`
  (bead B4.5, which copied the scripts and left these two behind). The deploy
  runner picks them up from this directory; nothing in this repo runs them.
- Both are templates whose four app-owned settings sit in one `env:` block, and
  every default already fits this app, so neither file took an edit: `GT_APP`
  resolves to this repository's name, `fractals-nextjs`; `GT_STACK_DIR` is
  `deploy`; `GT_HEALTH_PATH` is `/api/health`; `GT_BASE_KEY_FILE` is the
  runner's default. All seven jobs across the two files run on `runs-on: deploy`,
  and neither names `secrets.` or `GITHUB_TOKEN`.
- Bump these two together with `deploy/go.mod`'s `gt.local/devops` version and
  `scripts/release/`, so the workflow, the scripts it calls and the library the
  program compiles against stay one revision.
- They start nothing until the human configures Forgejo — the protected `v*` and
  `teardown-v*` tags, the branch rule covering `.forgejo/workflows/`, and the
  `deploy` runner label. The devops repo's `workflows/README.md` is the list.

### eslint-plugin-react-hooks 7.1.x (2026-10-07)

- The `~7.0.1` pin is gone; the plugin resolves on 7.1.1. The four
  `react-hooks/set-state-in-effect` sites are refactored rather than
  suppressed, so the rule stays an error:
  - `PresetSelector` and `CustomPresetManager` read the saved presets through
    `useSyncExternalStore` instead of an effect that copied localStorage into
    state. `src/lib/presets.ts` now owns the store half of that contract
    (`subscribeToCustomPresets`, `getCustomPresetsSnapshot`,
    `getServerCustomPresetsSnapshot`), and `save`/`delete` notify it. The
    snapshot is keyed on the stored string so its identity is stable between
    changes — a fresh array per call would loop the hook — and it is frozen,
    because one array serves as both the client cache and the server
    snapshot.
  - `CenterControls` and the page's manual coordinate inputs adjust their
    state during the render that sees new bounds, comparing against the bounds
    they were last synced from. The effect that did this ran after commit, so
    the inputs could paint one stale frame; the render-phase version cannot.
- `getCustomPresets()` still reads storage afresh on every call, so callers may
  keep mutating the list it returns.

### Dependency Refresh (2026-10-07)

- `next` and `eslint-config-next` moved to 16.4.0; every other package was
  refreshed to the newest release its existing major allows (eslint 9.39.5,
  typescript 5.9.3, tailwindcss 3.4.19, typescript-eslint 8.71.1, prettier
  3.9.9, and the `@types/*` packages)
- `eslint-plugin-react-hooks` was pinned to `~7.0.1` here, because 7.1.1 turns
  its new `react-hooks/set-state-in-effect` analysis loose on four pre-existing
  components. Those four are refactored and the pin is gone as of the section
  below.
- `prettier-plugin-tailwindcss` stays on 0.6.x for the same Node reason as the
  Vite pin below: both 0.7.0 and 0.8.1 declare `engines.node >= 20.19`, and the
  gate image is Node 20.18.1. Revisit it alongside the Vite pin.
- Tailwind 3, ESLint 9, TypeScript 5 and Vite 6 are all held at their current
  major deliberately; each has a newer major (4, 10, 7, 8) that is out of scope
  for a dependency refresh. React is off that list as of the React 19 section
  below.
- `npm audit --omit=dev --audit-level=high` is clean. The remaining audit
  findings are dev-only and have no upgrade path today: `braces` and
  `micromatch` are reported as vulnerable at *every* published version, and the
  rest of the chain (chokidar, fast-glob, postcss-nested) only clears by
  moving to Tailwind 4 or waiting on upstream.

### React 19 (2026-10-07)

- `react`, `react-dom`, `@types/react` and `@types/react-dom` moved together to
  19.3.0. Next.js 16 still *runs* on React 18, but prints "React 18 support is
  deprecated in Next.js 16 and will be removed in Next.js 17" on every
  `next build`, so React 19 is the supported target going into Next 17.
- The switch needed no source change. React 19 drops `ReactDOM.render`,
  `findDOMNode`, `unmountComponentAtNode`, string refs, `createFactory`, and
  `defaultProps`/`propTypes` on function components; none are used here. The
  four `React.FC` components (`CenterControls`, `CustomPresetManager`,
  `PresetSelector`, `ZoomDisplay`) take no implicit `children`, so the 19 types
  are satisfied as written.
- `npm run build` is warning-free and `make gate` is green on the same
  60-test Vitest suite as before.

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

### Deploy Pipelines Moved to the DevOps System (2026-10-07)

- Removed the cloud CI pipeline from the repo root and both files under
  `.github/workflows/`; this repo no longer carries a deploy pipeline
- Deployment is done only by the human, through the devops system
- The image contract is unchanged: root `Dockerfile`, `$PORT` (8080),
  `/api/health`, no baked secrets

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
