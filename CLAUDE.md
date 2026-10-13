# CLAUDE.md

Guidance for an agent working here; the rules come first, because they are the
ones broken by accident.

## Gas Town rules

- `make gate` must pass — `npm ci`, lint, typecheck, build and the unit suite,
  with no network access to any cloud and no secrets. The landing gate
  (`.forgejo/workflows/gate.yml`) runs the same command on a `land/**` branch.
- You never have cloud credentials and never deploy. Do not run `gcloud`,
  `pulumi` or any other cloud CLI, and do not add a secret, key or token to the
  repository. Deployment is done only by the human, through the devops system.
- The container contract the deploy system relies on: root `Dockerfile`, the
  server listening on `$PORT` (8080), the health route `/api/health`, and no
  baked secrets.
- Keep changes small and tested. Do not bump a major version beyond what your
  bead names.
- Never push to `main`. A branch is landed by the landing worker.

## Commands

Only targets that exist in the `Makefile`; `make help` prints the full list.

```bash
make gate          # ci-install -> check -> build -> test: exactly what CI runs
make check         # lint + typecheck (`make presubmit` runs that pair alone)
make test          # the unit suite (`vitest run`)
make dev           # the development server
make build         # `next build`
make integration STAGING_URL=<url> [EXPECT_SHA=<commit>]   # a deployment
make deploy-check  # the Go deploy program's tests and `go vet`
```

`make integration` and `make deploy-check` are deliberately not in `gate`: one
needs a deployment to call, the other the Forgejo Go registry `deploy/go.mod`
resolves through. `make integration` installs its own dependencies and checks
`STAGING_URL` first, because the staging workflow runs it in a fresh checkout.
`npm run make-og-previews` (no Make target) redraws `public/og/` after a place
changes.

## Layout

- `src/lib/` — the logic, pure where it can be, and where the tests live. Each
  file's header comment says what it is, and this guide does not repeat them.
- `src/components/ui/` — the React controls and page furniture.
- `src/app/` — the App Router. `FractalExplorer.tsx` is the whole client page
  (its state, effects and handlers), `page.tsx` writes the head, and `api/`
  holds the `health`, `version` and `og` routes.
- `tests/integration/` — the checks that call a deployed app.
- `scripts/` — `make-og-previews.mjs` (which writes the committed `public/og/`
  previews) and `make-og-card.mjs` (the social card and the icons).
- `deploy/` — the Pulumi program a release runs; see `deploy/README.md`.

Stack: Next.js (App Router), React, strict TypeScript, Tailwind, Vitest.

## Invariants

Five things the suite holds the code to. Breaking one fails the gate.

1. **A kind's `trapDistance` is the least distance to the trap over its own
   `orbit` points, from the second on.** `orbitTrap.ts` defines the shapes and
   `trapDistanceFor`; the escape-time kinds share `escapeTimeTrap` in
   `mandelbrot.ts`. `trapDistance.test.ts` holds each one to that walk.
2. **`escapeInfo` and `orbit` are the same walk as `iterations`.** A kind's
   count, the Math card's probe and its orbit plot must agree, and
   `escapeInfo.test.ts`, `orbit.test.ts` and the pixel parity in
   `mathProbe.test.ts` say so.
3. **Every `FRACTAL_TYPES` id has a `FRACTAL_MATH` descriptor.**
   `fractalMath.test.ts` fails an id with none, and an empty blurb.
4. **A picture is counts coloured; a colour change repaints from the counts
   already kept.** Every render goes through `renderRgba` — `countRgbaRows`,
   then `colourRgbaRows` — which the renderer, the thumbnails, the export and
   the previews share. A change of scheme, Reverse or Shift calls
   `FractalRenderer.recolour`, which answers `false` when it holds no buffer of
   the asked mode and shape, and the caller must then render. `COLOUR_ONLY_KEYS`
   is `s`, `r` and `o`; the key `m` (an orbit trap) is **not** colour-only, so
   turning a trap on or off is a render.
5. **`/api/og` draws nothing.** It answers `308` to the pre-built picture for
   the view (`ogImageFor`), so no request can spend a render.

## Adding a fractal

A fractal is a `FractalKind` module plus the entries the tests enumerate; the
failures say what is left.

1. `src/lib/<name>.ts` — the kind: an `id`, `iterations`, and `escapeInfo` and
   `orbit` (invariant 2), plus `trapDistance` if it is an escape-time set
   (invariant 1).
2. `FRACTAL_TYPES` and `resolveFractalKind` in `src/lib/fractalTypes.ts`. A
   fractal with a setting adds a `fractalVariants` descriptor, its
   `defaultVariant` and its `isVariantValue`.
3. `FRACTAL_MATH` in `src/lib/fractalMath.ts` (invariant 3), `defaultViewFor`,
   and the switcher row in `src/lib/helpEntries.ts`.
4. `src/lib/presets.ts` — at least one built-in view for it.
5. `src/lib/places.ts` — catalogue places, a `FEATURED_PLACE_IDS` entry (held
   to the flat-field guard in `places.test.ts`), and the whole-set place
   `wholeSetPlaceFor` looks for. A fractal whose real axis is the Mandelbrot
   set's adds itself to `REAL_AXIS_MATCHES_MANDELBROT`.
6. Run `npm run make-og-previews` and commit the new pictures under `public/og/`.
7. Run `make test`. Every test that enumerates the picker fails on the new id
   and names its own file. `plainPicture.test.ts`'s golden checksum is the one
   to regenerate by hand — and only from a tree known to be right.

A new _place_ is easier: add it to `PLACES`, run `npm run make-og-previews`, and
let `places.test.ts` say what else it wants.

## Tests

`vitest.config.mts` includes `src/**/*.test.{ts,tsx}` in a node environment — no
browser, no canvas package, no network — and `npm test` cannot reach the network,
because the integration tier has a config of its own.

- The `src/__tests__/*-panel.test.ts` files read component **source text with
  `readFileSync`, comments included**, because a node suite has no DOM. Many
  assert that a forbidden identifier is absent — `not.toContain("...")` over a
  component, or over every file under `src/`. A comment naming such a token
  fails the gate: do not put an identifier in a comment without checking what
  the panel tests forbid.
- `src/__tests__/make-targets.test.ts` reads the `Makefile`: the target names,
  the `integration` prerequisites and the `check-staging-url` message are
  pinned, and that message must stay word for word the one
  `src/lib/integrationTarget.ts` gives.
- `src/__tests__/og-previews.test.ts` holds the committed `public/og` set to
  the catalogue: a place with no picture, or a picture no place names, fails.

## Deployment

Nothing below is an agent's to do — see the rules at the top.

- A push to a `land/**` branch runs the landing gate.
- A landing on `main` starts `.forgejo/workflows/staging.yml`, which builds that
  commit and rolls staging onto it: a `fresh` job runs the gate's checks, and an
  `integration` job runs `make integration` against the new deployment.
- Production moves only when the human pushes a protected `v*` or `teardown-v*`
  tag, starting `.forgejo/workflows/deploy.yml` or `teardown.yml`, which run
  `scripts/release/**` at the tag; that in turn runs `deploy/`.

`scripts/release/**` and `.forgejo/workflows/**` are this app's own copies of the
devops templates, pinned through the deploy library in `deploy/go.mod`. They have
been edited here since they were first copied (the `integration` job is one such
change) and `GT_BASE_KEY_FILE` is written into each workflow, so check them
rather than assuming they match. Change them only for a deliberate release-flow
change.

`deploy/README.md` covers the stack config, the release flow, and the variables
the app reads at deploy time (`src/lib/version.ts`).

## Pointers

- `README.md` — the app as a visitor sees it, and how to run it.
- `docs/design/guided-exploration.md` and `docs/design/orbit-traps.md` — the
  designs the page and the trap engine were built to, each with an "As built".
- `git log`, the beads database and the tests — why a thing is the way it is.
  This file carries no changelog on purpose.
