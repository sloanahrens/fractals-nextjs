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

# Integration tier: checks a deployed app over the network (needs STAGING_URL)
make integration STAGING_URL=https://... EXPECT_SHA=<commit>

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
- **Fractal kinds** (`src/lib/fractalKinds.ts`): The registry of drawable fractals, and the id lookup that falls back to the Mandelbrot set
- **Fractal picker** (`src/lib/fractalTypes.ts`): The list the Fractal select renders, and the choice-to-kind and choice-to-default-view resolvers
- **Julia sets** (`src/lib/julia.ts`): The four named Julia constants and the factory that turns one into a fractal kind
- **Burning Ship** (`src/lib/burningShip.ts`): The Burning Ship formula — the Mandelbrot loop with both parts of z folded onto the positive side before squaring — behind its own fractal kind
- **Wander step** (`src/lib/wander.ts`): One random-walk step — a view near the current one that a coarse sample says is worth looking at, drawn from an injected generator so a walk replays
- **Wander controller** (`src/lib/wanderController.ts`): The walk's clock — the countdown that says when a step is due, and the states that suspend it: a render in flight, a hidden tab, the mode switched off
- **Zoom scale** (`src/lib/zoomScale.ts`): The logarithmic zoom slider mapping, and the six-digit coordinate formatter
- **View link** (`src/lib/viewLink.ts`): The view as a URL fragment and back — one short key per field, and a decoder that judges every value on its own and leaves out what it cannot read
- **View link state** (`src/lib/viewLinkState.ts`): The page's half of a link — what a decoded link means as the state the page holds, the defaults a link's missing fields leave standing, the one reading a fragment gets whether the page loaded with it or was pasted one later, and the throttle that limits how often the address bar is written
- **Download naming** (`src/lib/download.ts`): The filename a saved canvas is written under
- **ZoomPanManager** (`src/lib/zoomPan.ts`): Interactive controls for navigation
- **ColorMapping** (`src/lib/colorMapping.ts`): Dynamic color schemes for visualization

### State Management Pattern

The main page (`src/app/page.tsx`) uses React hooks for:

- `bounds`: Current fractal view coordinates (FractalBounds)
- `isRendering/progress`: Rendering state and progress tracking
- Parameter controls: iterations, color schemes, canvas resolution
- Preset system: Built-in views (six Mandelbrot, five Julia, two Burning Ship) and custom fractal configurations

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

The integration tier is separate on purpose. `tests/integration/**` calls a
deployed app and runs under `vitest.integration.config.mts` via
`make integration STAGING_URL=<url> [EXPECT_SHA=<commit>]` (or
`npm run test:integration`). `make integration` installs dependencies itself
(`ci-install`), because the staging workflow runs that one command in a fresh
checkout, and it checks `STAGING_URL` before the install, so a run without it
fails at once rather than after `npm ci` — `src/__tests__/make-targets.test.ts`
pins both. Neither config sees the other's tests, so `npm test` cannot reach the
network and the tier cannot run without a deployment to call.
`src/lib/integrationTarget.ts` reads the two variables and builds the URLs, and
it is unit-tested in the gate. See the README's Integration Tests section for
what each check asserts.

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

The app runs at two Cloud Run URLs:

- **Production** — https://fractals-nextjs-prod-robymk5mfq-uc.a.run.app — updated when the human tags a release (`v*`).
- **Staging** — https://fractals-nextjs-staging-robymk5mfq-uc.a.run.app — redeployed from `main` after every landing.

### Docker Configuration

- Multi-stage Dockerfile optimized for container deployment
- Standalone Next.js output for minimal container size
- Runs on port 8080 with non-root user for security
- Health endpoint at `/api/health` for container orchestration probes

### CI/CD Pipeline

A push to a `land/**` branch starts the landing gate
(`.forgejo/workflows/gate.yml`), which runs `make gate` and needs no cloud
credentials. A push to `main`, which only the landing worker makes, starts
`.forgejo/workflows/staging.yml`: it builds that commit and rolls the staging
service onto it. Neither workflow touches production — a release is run by the
human, through the devops system. The program that deploys the app is `deploy/`
(`deploy/README.md`), executed at a release tag. The human's tag also starts the
app's release workflows, `.forgejo/workflows/deploy.yml` and `teardown.yml`,
which no push here starts: a protected `v*` or `teardown-v*` tag does, and only
the human may push one. See the Gas Town rules at the end of this file.

## Version Notes

_Last updated: 2026-10-09_

### Built-in views for every fractal (2026-10-09)

- Julia and Burning Ship offered no built-in views, so once the preset list
  followed the selected fractal they showed an empty panel: the seven views
  added to `BUILTIN_PRESETS` (`src/lib/presets.ts`) are five Julia ones — the
  whole Classic set, its spirals at zoom 3, Dendrite, Douady rabbit and Siegel
  disk — and two for the ship, the whole of it and the armada at zoom 40. The
  six Mandelbrot views keep their ids, order and values, and the new ones
  follow them.
- A built-in view now carries the fractal it was framed on, the field saved
  views have had since fr-hah; the built-ins were the last views without one.
  Each Julia view names a `JULIA_CONSTANTS` constant, and the ship views name
  none — the shape `presetFractalFields` writes for a saved ship view.
  `handlePresetSelect` already reads both fields, so loading a new view puts
  the Fractal and Julia constant selects on the picture the bounds were framed
  on.
- The guard in `src/lib/__tests__/presets.test.ts` measures each of the seven
  with **its own fractal's** orbit: `measurePreset` takes a kind (defaulting to
  `mandelbrotKind`, so every existing Mandelbrot assertion is unchanged) and
  the new views are measured on 96x72 samples — the grid they were framed on —
  through `resolveFractalKind`, the same lookup the page loads a view by.
  Judging a Julia frame with the Mandelbrot orbit would judge a picture it is
  not; the `distinct` floor of 20 needs that finer grid, since the Dendrite's
  thin filaments give 18 counts at 64x48.
- The four whole-set Julia views share one frame, `JULIA_WHOLE_VIEW` (±2 by
  ±1.5), which is what a Julia set is: symmetric about the origin whatever its
  constant. The spirals view is the same view at zoom 3, and its frame is
  written `±2/3` rather than the bead's rounded `±0.66667`: the guard asserts
  4:3 within 1e-9 and the rounded number misses by 6.7e-6. Same centre and
  zoom either way — the printed precision, not the view. At 96x72 the seven
  measure 1.7%, 9.5%, 0%, 10.6%, 13.9%, 14.5% and 10.9% inside, all well under
  the 60% ceiling.
- `presetsForFractal(BUILTIN_PRESETS, …)` now returns 6, 5 and 2 views, and a
  second guard fails if any built-in ends up listed under no fractal at all —
  a view the picker can never reach. `PresetSelector`'s comment about the empty
  grid is reworded: only a fractal this build does not know lists no built-ins
  now, not Julia and the ship.

### A fragment pasted into an open page is read too (2026-10-09)

- The fragment was read once, by the effect that runs at mount, so a
  same-document navigation — editing the fragment in the address bar, or
  following a link on the page with a different one — did nothing: the page kept
  the view it had, and the address-bar follower wrote that view back over what
  was pasted. Found while verifying `fr-9k0` in headless Chrome, where going
  from `#...z=2.56` to `#...z=200` left the page at 2.56.
- `page.tsx` now puts a fragment into effect in one function, `applyViewLink`,
  which both reads call: the mount effect passes `window.location.hash` to it,
  and so does a `hashchange` listener the page adds in an effect of its own. The
  listener is the only notice a page gets of a fragment it did not load with,
  since neither an address-bar edit nor a same-document link reloads the
  document. It goes through the same ten setters every control uses, so the
  canvas, the sliders and the manual coordinate boxes move together, and the
  follower then writes the settled view back — which is why the paste survives.
- It cannot feed itself: the follower moves the address bar with
  `history.replaceState`, which fires no `hashchange`.
- `src/lib/viewLinkState.ts` gained `viewLinkUpdatesFrom`, the decode and the
  fill-in as one call, which is where the decision about an unreadable fragment
  lives. The two effects answer that question the same way, because there is one
  function and not two policies: what the fragment does carry is applied and the
  page's opening view stands for the rest. Ignoring a fragment this build cannot
  read in full was the alternative and was rejected — the follower writes only
  the view a render settled on, so a fragment nobody read would sit in the bar
  contradicting the canvas until the user moved something else. Read instead,
  the page settles on the view that URL describes, the follower writes it back,
  and bar and canvas agree whether or not every field arrived. It is also what a
  fresh load of the same URL does, so a paste is a load.
- `src/lib/__tests__/viewLinkState.test.ts` drives the new function over the
  `#`-prefixed form `window.location.hash` gives, a partial fragment, and a
  fragment that names no readable field; `src/__tests__/share-link-panel.test.ts`
  grew the source walk for the listener — added in an effect, removed in its
  cleanup, calling the shared apply — and now reads the setters in
  `applyViewLink` rather than in the mount effect, which no longer holds them.

### A view is a link you can share (2026-10-09)

- `src/lib/viewLink.ts` (the previous landing) is the format and this one is
  its two uses. `encodeView` writes the view on screen as a fragment —
  `#v=1&f=julia&k=Classic&x=-0.644&y=-0.094&z=2.56&s=fire&i=auto&w=800&h=600` —
  and `decodeView` reads a fragment back into the fields it can, judging every
  value on its own and leaving out what it cannot read. Nothing in it throws,
  so a fragment from anywhere is a page that looks the way it did, never an
  error screen.
- `src/lib/viewLinkState.ts` is the page's half, and it is a module rather than
  page code because both halves of it are pure. `viewLinkToUpdates` turns the
  codec's partial view into all ten values the page holds, filling what the
  link did not carry from `DEFAULT_VIEW_LINK_UPDATES` — and the page takes its
  *initial* state from that same object, so a link's defaults and a fresh visit
  are one view rather than two lists kept in step. A Julia constant is applied
  only to a Julia view, mirroring the codec's rule about writing `k` only
  beside `f=julia`. `shouldWriteLink` and `linkWriteDelayMs` are the throttle.
- The page reads the fragment once, in an effect after mount, and applies it
  through the same setters every control uses, so the canvas, the sliders and
  the manual coordinate boxes move together. It never reads `window` while
  rendering, which is what keeps the static prerender and the first client
  markup the same.
- The address bar follows the view, but only a view that has been drawn. What
  gates it is `renderedLink`: `drawCanvas` takes the link it is drawing and
  hands it back in its `finally`, inside the run-token check, so the state holds
  the link of the view the last finished full render left on the canvas. The
  writer returns unless the state's link is that one, which is what makes a
  fresh page write nothing until its first render, what keeps a drag from
  rewriting the URL on every step, and what makes `Copy link` worth writing the
  address bar itself. It writes at most once per 500 ms, and a write the
  interval holds back is scheduled rather than dropped — a view that moves again
  first clears that timer and starts another.
- `replaceState`, never an assignment to `location.hash` (which reloads) and
  never `pushState` (a view is not a place the user went). Copy link writes the
  address bar itself before reading `href`, because the follower is a render and
  half a second behind at the best of times, so it copies the view on screen;
  `navigator.clipboard` failing, or not being there at all, shows the URL in a
  read-only field and selects it. That offer is taken away by the render that
  sees a new view, the way the coordinate boxes resync. There is no cloud, no
  server and no new dependency in any of this: a link is the page's own state
  written down.
- Whether the fragment is read in an effect, whether the button falls back,
  and where the copy control sits are checked by
  `src/__tests__/share-link-panel.test.ts`, which reads `page.tsx` the way the
  manual coordinates test here does; what a link *means* is
  `src/lib/__tests__/viewLinkState.test.ts`'s business.

### Manual coordinates say what Apply did (2026-10-09)

- Apply used to swallow both of its failures: a box it could not read was
  skipped in silence, and a box of another shape than the view was fitted to it
  with nothing to say so. The panel now shows one short message under the four
  boxes, in a container of its own so the row below does not move as it comes
  and goes.
- `src/lib/manualBounds.ts` holds the half that can be tested without a
  browser. `readManualCoordinate` reads a box as `Number` rather than
  `parseFloat`, so `1abc` is no number rather than 1, and `checkManualBounds`
  answers `{ ok: true, bounds }` or `{ ok: false, messages }`: an unreadable box
  is reported alone (`Enter all four coordinates as numbers.`, one sentence for
  the four), and each reversed pair is named separately so a box reversed on
  both axes is corrected in one pass. `hasBaseAspect` is the other question —
  is the box 4:3 within `ASPECT_TOLERANCE` (1e-6 relative) — asked by the page,
  because a box of another shape is fitted rather than refused.
- A box the user never touched still hands Apply the view's own float64 rather
  than the six-digit text on screen, which is what the draft pattern is for; the
  reading moved from `parseFloat` to `readManualCoordinate` and nothing else
  about a valid apply changed (same centre, same zoom, `wander.notifyActivity()`,
  and the note cleared). The zoom is still not clamped: a hand-typed box beyond
  `MAX_ZOOM` applies as it always did.
- The message clears on typing in any box and on every Apply, and those are its
  only two triggers: a view that moves underneath an untouched panel leaves the
  text alone, because the note a successful non-4:3 apply shows would be cleared
  by the bounds change that apply itself causes.
- `src/__tests__/manual-coordinates-panel.test.ts` reads `page.tsx` the way the
  other source-reading tests here do, for the parts a Node suite cannot render:
  the message sits under the last box and above the Apply button, the refusal
  branch runs before the setters that move the view, and editing a box clears
  the message.

### Saved views belong to their fractal (2026-10-09)

- `FractalPreset` gains two optional fields, `fractal` (a `FRACTAL_TYPES` id)
  and `juliaConstant` (a `JULIA_CONSTANTS` name, written only for a Julia
  view), so a saved view can say what it is a picture of. The storage key and
  the shape of existing entries are unchanged: absent means the Mandelbrot set,
  which is what the app could draw when those entries were saved. The writer's
  half is `presetFractalFields`, which gives a Julia view both fields and any
  other fractal only the id — no `juliaConstant` key at all — so the stored JSON
  for every other fractal stays what it was.
- `presetFractal` reads that field and answers `null` for an id this build does
  not know — deliberately not the Mandelbrot fallback `getFractalKind` gives. A
  preset naming a fractal this build cannot draw is left out of every listing
  rather than shown as another fractal's picture, and `presetsForFractal` is
  the filter behind the dropdown, the built-in buttons and the saved list.
  `presetJuliaConstant` answers a name the picker offers, falling back to the
  first constant — the picture `resolveFractalKind` already draws for a name it
  cannot resolve, so the select and the canvas agree.
- Reading storage is not a write. The parser passes entries through as they
  were stored — a field this build has never heard of is carried, not dropped —
  and discards only a value that could not be a preset at all. A view for an
  unknown fractal therefore stays in storage, unlisted and undeletable from the
  UI, for a build that knows the fractal.
- `handlePresetSelect` sets the fractal, and the Julia constant for a Julia
  view, before applying the preset's view, so loading one puts the picker on the
  picture the bounds were framed on. `CustomPresetManager` takes
  `currentFractal` and `currentJuliaConstant` in place of `saveDisabledReason`,
  and Save Current is offered for every fractal.
- `src/__tests__/single-save-button.test.ts` grew a guard on the removed hint's
  text, in the style of the one it already had on the label: the walk reads
  sources, so the disabled wording cannot come back unnoticed.

### make integration installs its own dependencies (2026-10-09)

- `integration` takes `ci-install` as a prerequisite, so `make integration`
  works in the fresh checkout the staging workflow runs it in. It failed on the
  first real run (Forgejo run 442) with `sh: 1: vitest: not found`: `make gate`
  installs first, the integration target did not, and the workflow runs exactly
  one command. Nothing was added to the workflow — a protected path, and the
  template has to stay app-agnostic.
- `check-staging-url` is the first prerequisite, ahead of the install, and
  echoes the message `src/lib/integrationTarget.ts` gives for a missing
  STAGING_URL. Two copies of one message, because the guard has to answer
  before `node_modules` exists and so cannot read the TypeScript;
  `src/__tests__/make-targets.test.ts` fails if they stop saying the same thing.
  A run without STAGING_URL fails in a second instead of at the end of `npm ci`.
- That test reads the Makefile rather than shelling out to `make -n`, in the
  style of the other source-reading tests here: it asserts `integration`'s
  prerequisites in order, that its recipe runs `npm run test:integration`, and
  that no path through `gate` reaches the integration tier. `gate`'s own
  prerequisites are unchanged.

### The deploy program reads the deploy time (2026-10-08)

- `deploy/main.go` turns the stack config's optional `deployedAt` into the
  container's `DEPLOYED_AT`, the variable `src/lib/version.ts` shows as
  "Deployed <time>". A release writes that key when it applies a new image
  (`set_deployed_at_config`, devops dv-bte); the read is optional because a
  stack may have no deploy time at all, and then the container is started with
  no environment variables rather than an empty one, so the page says nothing
  instead of showing a blank date.
- A value that is present is checked first and fails the deploy if it is not an
  RFC 3339 timestamp in UTC with the `Z` designator (`2026-10-09T00:14:07Z`),
  the shape the release writes and checks before writing it. The program fails
  before the provider is asked to create anything: a `deployedAt` set by hand
  is a time no release stands behind, and `src/lib/version.ts` can only reject
  what it cannot parse.
- `deploy/main_test.go` covers absent, valid and each invalid shape, and
  `specKeys`/`releaseKeys` now name `deployedAt` -- the repository ships no
  value for it, exactly as for `imageDigest`.
- One thing this cannot fix: a release whose digest is the one the stack
  already runs writes no `deployedAt`, and this program then renders no
  `DEPLOYED_AT`, which is a container spec that differs from the running
  revision -- the new revision such a release exists to avoid. The release flow
  has to leave that apply alone; filed as `dv-iuqp` in the devops rig.

### Integration tier (2026-10-08)

- Added `tests/integration/`, the checks that call a deployed app rather than
  the route handlers directly: `/api/health`, `/` (its `<h1>` and document
  title), `/api/version` (its `commit`, and equality with `EXPECT_SHA` when that
  is set) and `/fractal-preview.png`, the social preview `src/app/layout.tsx`
  points its metadata at. What they need is a deployment, so the staging
  workflow can run `make integration STAGING_URL=<url> EXPECT_SHA=<commit>`
  after it rolls staging onto a commit; that wiring is the devops side's
  (dv-sdpq), and nothing in this repository runs the tier today.
- It is a second vitest config, `vitest.integration.config.mts` over
  `tests/integration/**`, rather than a directory inside the gate's config:
  `make gate` and `npm test` must pass with no network, and neither config's
  `include` can see the other's tests. `make integration` and
  `npm run test:integration` run it, and both fail with the command to type when
  `STAGING_URL` is unset.
- `src/lib/integrationTarget.ts` is the tier's whole environment: an http(s)
  `STAGING_URL` with no default, an optional `EXPECT_SHA`, and the request URL
  builder, unit-tested in the gate. `REQUEST_TIMEOUT_MS` (15 s) lives there too,
  and the config raises vitest's 5 s test timeout past the two attempts one
  request gets — the attempt and its single retry — because a slow deployment is
  not a hung test.

### Which build is running (2026-10-08)

- The page ends in a footer saying which build is being served and how long ago
  it went live, and `GET /api/version` answers with the same facts as JSON:
  `{ builtAt, deployedAt, commit, revision }`, each null when the app has no
  value for it or the value is not shaped like what it claims to be.
- The four values come from the environment, one variable each:
  `NEXT_PUBLIC_BUILD_TIME` (baked in by `next.config.js` at `next build`),
  `DEPLOYED_AT` and `GIT_SHA` (a deploy-time pair the devops side will set, not
  set today) and `K_REVISION` (Cloud Run's own). The route answers
  `force-dynamic` so the last three are read per request.
- Turbopack is why the route spells its four reads out as literal
  `process.env.NAME` expressions. That expression is what the build replaces
  with the constant it baked in; a value reached through `readVersionInfo`'s
  own `process.env` default is a lookup in the server's environment, where a
  build constant does not exist, and it comes back null — which is what this
  route did until the reads were written out. The webpack build also had a
  post-pass that rewrote aliased reads; it is skipped under Turbopack. A
  build-time constant read in server code has to name itself.
- `src/lib/version.ts` holds the reading and the wording: `readVersionInfo`
  validates (the two times must parse, `GIT_SHA` is 7-40 hex characters,
  `K_REVISION` matches `[a-z0-9-]{1,100}`) and `describeVersion(info, now,
  timeZone?)` returns `{ text, title }`, preferring the deploy time so a
  rollback does not read as "Built", and returning empty text when it has
  neither — which is the footer's cue to render nothing.
- The footer is a client component (`src/components/ui/VersionFooter.tsx`) that
  fetches the route after the page is up, so `/` stays a static prerender, and
  it renders nothing if the fetch fails.

### Random walk (2026-10-08)

- The Navigation panel carries a "Random walk" checkbox, off on load and not
  remembered, and a "Seconds between steps" box (1-120, 5 by default) whose
  entry only takes effect when it is a whole number in range: anything else,
  an empty box included, is shown as typed and leaves the last good interval in
  force. While the mode is on a line under the controls reads "Next step in
  about N s". A step moves the view and nothing else — the fractal, its Julia
  constant, the colour scheme, the iteration settings and the canvas size are
  the walk's context, not its subject — and it goes through `applyView`, so it
  clears the preset and updates the sliders like any other move.
- `WanderController` (`src/lib/wanderController.ts`) owns the clock and
  `nextWanderView` (`src/lib/wander.ts`, the previous landing) owns the step.
  The controller knows four things — the mode is on, the tab is visible, a
  render is in flight, how much of the wait is left — and one rule: the
  countdown runs only when mode, tab and render all allow a step. Every method
  changes one of those and re-settles, so there is no transition table to keep
  right, and no timer can outlive the state that justifies it.
- A full render suspends the wait rather than racing it. The page tells the
  controller when a full-quality draw starts and finishes (`notifyRenderStart`
  and `notifyRenderDone` in `drawCanvas`), and the countdown starts when one
  finishes: a slow machine gets a step one interval after the picture, never
  during it. A step is not the end of the wait but the start of one — the walk
  re-arms when that step's own render reports done — which is what ties the
  cadence to finished pictures rather than to wall time.
- Every manual move restarts the interval without switching the mode off. The
  gesture and key paths restart it through `applyView`, which they all share
  with the walk's own step, and the sliders, Zoom In/Out, Reset View, Apply, a
  preset and a fractal or Julia constant change restart it where they are.
  `document.hidden` pauses the walk and a fresh countdown runs when the tab
  comes back; unticking the box stops it at once. The controller takes its
  timers as an argument, so the vitest suite drives the whole thing on fake
  ones.

### The fractal picker (2026-10-08)

- `src/lib/fractalTypes.ts` is the picker's half of the chain: `FRACTAL_TYPES`
  is the list a `Select` renders, `resolveFractalKind(typeId, constantName)`
  turns a choice into the `FractalKind` the renderer takes, and
  `defaultViewFor(typeId)` is the view that choice opens on — (-0.75, 0) at 1x
  for the Mandelbrot set, the origin for a Julia set. Both resolvers fall back
  to the Mandelbrot side for an id or a constant name they do not know.
- The page now passes a kind: the fractal is state, the renderer effect is
  keyed on it, and the draw effect lists it, so a new kind means a new
  renderer and a render. The effect cancels the outgoing renderer's render
  first — the old kind paints the same canvas, and two renderers interleaving
  rows is a torn image.
- `downloadFileName` takes an optional prefix, defaulting to `mandelbrot`, so
  the name of a Mandelbrot save is byte for byte what it was and a Julia save
  starts `julia_`. `CustomPresetManager` used to take an optional
  `saveDisabledReason`, which the page set on Julia because a saved preset had
  no fractal field; the format gained one and the prop is gone — see the
  saved-views section above.

### Controls stay usable during a render (2026-10-08)

- Every control but Download PNG is live while the canvas is rendering. It used
  to sit behind `isRendering`, so on staging at 10000x a two-minute render left
  Reset View and twenty other controls greyed out and a drag was the only way
  back. Using a control now does exactly what a wheel or a drag does: it starts
  a render of the new view. Download PNG keeps the lock, because the canvas it
  reads may be half drawn.
- `FractalRenderer` cancels the run it replaces with a run token (`runToken`),
  a counter, where a single `shouldCancel` flag served both of the two states it
  has to tell apart. The older run checks the token at the top of each row and
  after the row's chunks resolve — the point where it could otherwise colour and
  paint one more row of a view the user has left — and then stops without
  clearing `isRendering`, which belongs to the run that superseded it. A
  superseded run also never reports progress again, so the bar only ever
  follows the newest render.
- The page keeps the same promise for React state with `drawTokenRef`: an
  overtaken draw ignores its own progress callbacks and does not clear
  `isRendering` in its `finally`, which would otherwise blank the bar while the
  newer draw was still going.
- Changing the canvas size mid-render needs the explicit cancel the new-kind
  path already had: a resize builds a *new* `FractalRenderer`, two renderers
  share no run token, and the replaced one would have gone on painting its
  old-sized image over the newly sized canvas. The resolution controls are
  usable mid-render now, which is what makes that reachable.

### The set's interior skips the loop (2026-10-08)

- `isInMainBulbs` (`src/lib/mandelbrot.ts`) tests the two components of the set
  that have a closed form: the main cardioid and the period-2 bulb, with strict
  inequalities so a boundary point still goes to the orbit.
  `mandelbrotIterations` and `smoothMandelbrotIterations` return the cap for
  such a point instead of iterating an orbit that cannot escape, which is what
  took a view framed on the interior minutes on staging — a 10000x zoom into
  the cardioid is nearly all interior pixels, each one running the whole cap.
- The check lives in those two entry points rather than in
  `escapeTimeIterations`, because it holds only for an orbit that starts at
  z = 0. The Julia kinds share the loop and start at the point, so a Julia
  orbit beginning inside the cardioid still runs.
- No count changes, only how fast it arrives. The grid equivalence test in
  `mandelbrot.test.ts` compares both functions against a copy of the plain loop
  written out in the test, over a 400x300 view at caps 50 and 300.

### The renderer draws a fractal kind (2026-10-08)

- The formula is no longer inside the rendering loop. `FractalKind`
  (`src/types/fractal.ts`) is `{ id, iterations(point, maxIterations, smooth) }`,
  `mandelbrotKind` (`src/lib/mandelbrot.ts`) is the Mandelbrot set behind it, and
  `FractalRenderer` takes a kind in its constructor, defaulting to that one.
  `renderRowChunk` calls `kind.iterations`, so a second fractal is a module plus
  an entry in `FRACTAL_KINDS` (`src/lib/fractalKinds.ts`) and nothing in the
  loop changes. Previews carry the renderer's kind rather than falling back to
  the default.
- `mandelbrotIterations` and `smoothMandelbrotIterations` are unchanged and
  still the definition of the formula; `mandelbrotKind.iterations` delegates to
  them and the two functions keep their exports. Nothing in the app passes a
  kind yet, so this commit draws the same pixels as the one before it.
- `getFractalKind(id)` returns `mandelbrotKind` for an unknown id rather than
  undefined, so an id from a version that knows a fractal this build does not
  renders the familiar set instead of a blank canvas.

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
