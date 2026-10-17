# Next Fractals - Interactive Fractal Explorer

An interactive explorer for the Mandelbrot set and its relatives: the Julia
sets, the Burning Ship, the Perpendicular Ship, the Tricorn, the Multibrot sets,
the Newton fractal, the Celtic Mandelbrot set, the Magnet sets, the Phoenix sets
and the Nova fractal. Zoom, pan and recolour a picture the browser draws itself,
read the mathematics behind it, and share a view or a whole walk as a link.

![Next Fractals Preview](public/og-card-2.png)

- **Production** — https://fractals-nextjs-prod-robymk5mfq-uc.a.run.app, updated
  only when the human pushes a release tag (`v*`).
- **Staging** — https://fractals-nextjs-staging-robymk5mfq-uc.a.run.app,
  redeployed from `main` after every landing.

Built with Next.js (App Router), React, strict TypeScript, Tailwind and Vitest.

## What it does

- **Explore** — the mouse wheel, a pinch, a drag and the arrow keys move the
  picture from the whole set to a deep zoom.
- **Fractals** — a switcher over the picture moves between them, and the ones
  with a setting offer their own chips: the Julia constant, the Multibrot power,
  the Newton polynomial, the Magnet type, the Phoenix constant.
- **Nearby, worth a look** — small pictures of named places near the view; one
  click, or Enter on a tile, flies there.
- **Surprise me, Tour and Auto-wander** — a random nearby place, a screensaver
  that hops from place to place, and a walk that drifts and hops by itself.
- **Math card** — the rule, the setting and the view's numbers as native MathML,
  with a live probe of the point under the pointer and a plot of its orbit. The
  mathematics of every fractal is data in `src/lib/fractalMath.ts`.
- **Look** — an orbit trap colours each point by how close its orbit comes to a
  point, a line or a circle rather than by how long it took to escape
  (`src/lib/orbitTrap.ts`).
- **Colour** — a scheme per picture, with Reverse and Shift, and an optional
  Cycle colours that walks the palette round by itself.
- **Views** — the built-in presets and your own saved views, in `localStorage`.
- **Links** — the address bar follows the view, Copy link shares it, and Copy
  tour link shares the places you have just visited as a walk. A shared link
  previews as a pre-built picture of the nearest place, never a render
  (`src/lib/ogImage.ts`).
- **Download PNG** — the canvas, a larger whole multiple of it, or a wallpaper
  shape.
- **Keys everywhere** — the pan, zoom and reset keys work from anywhere on the
  page, and reduced motion is honoured.

## Getting started

Node 20 or later (the `Dockerfile` and the landing gate image build on it), and npm.

```bash
npm ci        # or: make install
npm run dev   # or: make dev, which serves the app on http://localhost:3000
```

## Commands

`make help` prints the full list; these are the ones to reach for.

```bash
make gate          # ci-install -> check -> build -> test: exactly what CI runs
make check         # lint + typecheck
make test          # the unit suite (`vitest run`), with no network
make build         # next build
make integration INTEGRATION_URL=<url> [EXPECT_SHA=<commit>]   # a deployment (STAGING_URL= also works)
make integration-prod PROD_URL=<url> [EXPECT_SHA=<commit>]      # the same read-only suite against prod
make deploy-check  # the Go deploy program's tests and `go vet`
```

## Testing

`make test` is the unit suite: the pure logic in `src/lib`, the routes, and the
source-text checks the panel tests make. It runs in Node with no browser, no
canvas package and no network.

The integration tier is the other half. `make integration INTEGRATION_URL=<url>`
(`STAGING_URL` is the older name and still works) calls a deployment that is
already up — staging, or a container on `localhost:8080` — over HTTP, and
`EXPECT_SHA=<commit>` makes the version check exact. `make integration-prod
PROD_URL=<url>` runs the same suite against production and refuses a URL that
names staging; the suite only sends GET and HEAD, and a unit test holds it to
that. It is deliberately not in `make gate`, which has to keep passing with no
network and no deployment to call; the checks are in
`tests/integration/deployed.test.ts`.

## Docker

```bash
make docker-build   # docker build --platform linux/amd64 -f Dockerfile .
make docker-run     # run the image on 8080
make test-docker    # npm ci, build, lint and typecheck in a node:20-alpine container
```

## Deployment

Nothing here holds a cloud credential, and nothing here updates production. The
workflows in `.forgejo/workflows/` are the landing and release flow:

- `gate.yml` — the landing gate: a push to a `land/**` branch runs `make gate`.
- `staging.yml` — a push to `main` builds that commit, rolls staging onto it,
  and runs the integration tier against the service it deployed.
- `deploy.yml` — a protected `v*` tag, pushed by the human, builds the image,
  deploys that digest to staging and promotes the same digest to production.
- `teardown.yml` — a protected `teardown-v*` tag, pushed by the human, destroys
  the app's stacks.

The container contract the deploy system relies on is a root `Dockerfile`, a
server listening on `$PORT` (8080), the `/api/health` route and no baked
secrets. The program that deploys the app is `deploy/` (`deploy/README.md`), and
the scripts a release runs are in `scripts/release/`.

## Layout

- `src/lib/` — the logic, pure where it can be, and where its tests live.
- `src/components/ui/` — the React controls and page furniture.
- `src/app/` — the App Router: `FractalExplorer.tsx` is the client page, and
  `api/` holds the `health`, `version` and `og` routes.
- `tests/integration/` — the checks that call a deployed app.
- `scripts/` — the preview and social-card generators, and `scripts/release/`.
- `deploy/` — the Pulumi program a release runs; see `deploy/README.md`.
- `docs/design/` — the design notes the page and the trap engine were built to.
- `public/` — static assets, including one pre-built preview per catalogue place
  under `public/og/` (`npm run make-og-previews`).

Each file's own header comment says what it is, so the tree is not repeated
here; `CLAUDE.md` carries the guidance for working here.

## Contributing

Changes land through the landing gate on a `land/**` branch, not through a pull
request.
