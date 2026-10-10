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
- **Fractal picker** (`src/lib/fractalTypes.ts`): The list the Fractal select renders, the choice-to-kind and choice-to-default-view resolvers, and the per-fractal variant descriptor (`fractalVariants`, `defaultVariant`, `variantOn`)
- **Julia sets** (`src/lib/julia.ts`): The four named Julia constants, the `custom:<re>,<im>` spelling that names any other point, and the factory that turns one into a fractal kind
- **Custom constant input** (`src/lib/customConstantInput.ts`): The Real and Imaginary boxes' text turned into a `custom:<re>,<im>` name or the sentence that says why not, and the Custom option's select value
- **Burning Ship** (`src/lib/burningShip.ts`): The Burning Ship formula — the Mandelbrot loop with both parts of z folded onto the positive side before squaring — behind its own fractal kind
- **Tricorn** (`src/lib/tricorn.ts`): The Tricorn (Mandelbar) formula — the Mandelbrot loop with z conjugated before squaring, z -> conj(z)^2 + c — behind its own fractal kind
- **Multibrot** (`src/lib/multibrot.ts`): The Mandelbrot loop with a higher power, z -> z^d + c for d = 3, 4, 5 — `createMultibrotKind(power)` and `parseMultibrotPower`, the power being the fractal's variant
- **Newton** (`src/lib/newton.ts`): Newton's method for z^3 - 1 as a fractal kind — the orbit's root and its speed packed into the one number the renderer takes, the three roots in thirds of 0..maxIterations; the first fractal that is not an escape-time set
- **Wander step** (`src/lib/wander.ts`): One Auto-wander step — a view near the current one that a coarse sample says is worth looking at, drawn from an injected generator so a walk replays
- **Surprise target** (`src/lib/surprise.ts`): Where the top bar's Surprise me goes — one of the six `suggest` places, picked by an injected random function, or null when there are none
- **Tour engine** (`src/lib/tour.ts`): Where an unattended tour goes next — `nextTourStop` over the places catalogue from an injected random function, with the dwell and crossfade times, the fractal-switch odds and the recent window
- **Tour mode** (`src/lib/tourMode.ts`) and **wake lock** (`src/lib/wakeLock.ts`): The screensaver's clock — the idle start, the `#tour` and button starts, the hops, and the conditions that make it wait or give way — and the best-effort screen lock held while it plays; `decodeTour` in `src/lib/viewLink.ts` reads the `#tour` link
- **Wander controller** (`src/lib/wanderController.ts`): The Auto-wander clock — the countdown that says when a step is due, which steps are hops (`WANDER_HOP_EVERY`), and the states that suspend it: a render in flight, a hidden tab, the mode switched off
- **Blank view** (`src/lib/blankView.ts`) and **BlankHint** (`src/components/ui/BlankHint.tsx`): The detector for a nearly one-colour picture, and the quiet "Nothing to see here" pill with a Back button
- **Zoom scale** (`src/lib/zoomScale.ts`): The logarithmic zoom slider mapping, and the six-digit coordinate formatter
- **View link** (`src/lib/viewLink.ts`): The view as a URL fragment and back — one short key per field, and a decoder that judges every value on its own and leaves out what it cannot read
- **View link state** (`src/lib/viewLinkState.ts`): The page's half of a link — what a decoded link means as the state the page holds, the defaults a link's missing fields leave standing, the one reading a fragment gets whether the page loaded with it or was pasted one later, and the throttle that limits how often the address bar is written
- **Journey** (`src/lib/journey.ts`): The page's record of its browser history entries — a stack of view-link fragments with push, back, forward, replace and the arrival of a fragment the browser landed on, capped at 200
- **Download naming** (`src/lib/download.ts`): The filename a saved canvas is written under
- **ZoomPanManager** (`src/lib/zoomPan.ts`): Interactive controls for navigation
- **Pinch** (`src/lib/pinch.ts`): The pure helpers behind two-finger zoom — finger distance, midpoint, the zoom factor between two steps, and scale-about-a-point
- **Wheel zoom** (`src/lib/wheelZoom.ts`): The zoom factor one wheel event asks for — an exponential of how far it scrolled
- **Canvas navigation** (`src/lib/canvasNavigation.ts`): The wheel, drag, touch and key listeners on the canvas, and the key-to-bounds switch
- **Render quality** (`src/lib/renderQuality.ts`): Whether a redraw is a low-resolution preview or a full-resolution render
- **Manual bounds** (`src/lib/manualBounds.ts`): What the Manual Coordinates boxes make of the four numbers typed in
- **Build facts** (`src/lib/version.ts`): The build time, deploy time, commit and revision, and the footer wording
- **Site origin** (`src/lib/siteOrigin.ts`): The origin a request was served from — forwarded host, else host, validated — that `generateMetadata` in `src/app/layout.tsx` puts on og:image, twitter:image and og:url
- **Top bar** (`src/components/ui/TopBar.tsx`) and **idle fade** (`src/lib/idleFade.ts`, `src/components/ui/useIdleVisibility.ts`): The floating title/Surprise me/Tour/Back/Forward/Math/Help/Settings bar, the clock that fades it after two seconds without input, and the hook that holds it up on focus
- **Nearby strip** (`src/components/ui/NearbyStrip.tsx`) and **strip policy** (`src/lib/nearbyStrip.ts`): The "Nearby, worth a look" thumbnails laid over the bottom of the canvas, and the pure rules behind them — when the suggestions refresh, which page of them shows, the crossfade time
- **Settings drawer** (`src/components/ui/SettingsDrawer.tsx`): The modal `<dialog>` that holds every control card, a right-hand panel or a bottom sheet under 768 px
- **Help overlay** (`src/components/ui/HelpDialog.tsx`): The native `<dialog>` that lists every way to drive the explorer, shown modally so the browser supplies Escape, the inert page behind it and focus returning to the opener
- **Help entries** (`src/lib/helpEntries.ts`): The sections the overlay renders, and `opensHelpShortcut` — the one rule behind the `?` key
- **Places** (`src/lib/places.ts`): The catalogue of named views worth looking at, `suggest` — which of them are near a given view — `placeColorScheme`, the one rule for the scheme a place is drawn in and visited in, and `featuredPlace`/`wholeSetPlaceFor`, where the fractal switcher's buttons and Julia chips land
- **Auto-wander pill** (`src/components/ui/WanderControl.tsx`, `useWanderNudge.ts`) and **pill rules** (`src/lib/wanderControl.ts`): The play/pause pill on the picture's bottom right that shares the Settings checkbox's handler, its words and placement, and the once-per-browser first-run nudge
- **Fractal switcher** (`src/components/ui/FractalSwitcher.tsx`): The Mandelbrot / Julia / Burning Ship / Tricorn / Multibrot / Newton buttons, and the Julia constant or Multibrot power chips, drawn over the top left of the canvas and never faded
- **Fractal math** (`src/lib/fractalMath.ts`), **Math card** (`src/components/ui/MathCard.tsx`, `src/lib/mathCard.ts`) and **MathView** (`src/components/ui/MathView.tsx`): The mathematics of the picture on screen — `describeFractalMath(fractalId, variant)` returns, for every fractal in `FRACTAL_TYPES`, the rule, where each point starts, the one setting with its real value, how a point is judged and a plain blurb, as `MathExpr` trees; `MathView` typesets a tree as native MathML with a plain-text `aria-label` from `toPlainText`; the card shows the rule and setting on one line and, expanded, the view's numbers. **Every fractal needs a descriptor in `FRACTAL_MATH`**: `fractalMath.test.ts` fails a `FRACTAL_TYPES` id without one or with an empty blurb
- **Place thumbnails** (`src/lib/placeThumbnails.ts`): The small off-screen pictures of places — an LRU cache, a one-at-a-time queue with cancel and pause, and the canvas render behind it
- **ColorMapping** (`src/lib/colorMapping.ts`): Dynamic color schemes for visualization

### State Management Pattern

The main page (`src/app/page.tsx`) uses React hooks for:

- `bounds`: Current fractal view coordinates (FractalBounds)
- `isRendering/progress`: Rendering state and progress tracking
- Parameter controls: iterations, color schemes, canvas resolution
- Preset system: Built-in views (six Mandelbrot, five Julia, two Burning Ship, two Tricorn, three Multibrot, two Newton) and custom fractal configurations

### Component Structure

- **UI Components** (`src/components/ui/`): Reusable form controls (Slider, Select, Input, Checkbox, Button), plus the page furniture listed above (TopBar, NearbyStrip, SettingsDrawer, HelpDialog, VersionFooter)
- **View read-out** (`src/lib/viewReadout.ts`): The "Zoom 400x at -0.7453, 0.1127" line above the coordinate boxes
- **Specialized Controls**: CenterControls, PresetSelector, CustomPresetManager
- **Layout**: Single-page application, canvas-first: the picture fills the viewport under a floating top bar (`TopBar.tsx`: title, Help, Settings), and every control sits in the Settings drawer (`SettingsDrawer.tsx`) — see the Version Note of 2026-10-09

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

_Last updated: 2026-10-10_

### Math card: the rule, the settings and the view's numbers (2026-10-10)

- A Math button in the top bar (beside Help, `aria-pressed`) toggles a card over
  the left of the canvas that shows the mathematics of the picture: layer 1 of 3
  of the owner-approved math design (fr-1tk; the pointer probe and the orbit plot
  are separate beads). Every fractal is one small formula plus a handful of
  numbers, and the card reads the same state the renderer uses (the page's
  `fractalType`, `variant`, `centerX`, `centerY`, `zoomLevel`,
  `effectiveMaxIterations`, `autoIterationsOn`, `colorScheme`), so it cannot
  disagree with the picture. Read-only.
- `src/lib/fractalMath.ts`: `describeFractalMath(fractalId, variant)` returns a
  `FractalMath` `{ title, rule, start, setting, blurb, escape }`. `FRACTAL_MATH`
  maps each `FRACTAL_TYPES` id to a function of the variant; an id this build
  does not know gets the Mandelbrot set's, as `resolveFractalKind` does. A
  formula is a `MathExpr`, a small typed tree (`number`, `identifier`,
  `operator`, `superscript`, `subscript`, `fraction`, `row`, `conjugate`, `abs`,
  and `text` for the few words a formula carries, "the pixel's point"), never a
  string of markup. `text` is the one kind beyond the bead's list: "z starts at
  the pixel's point" needs words. The descriptors: Mandelbrot `z -> z^2 + c` from
  `z0 = 0, c = the pixel's point`; Julia the same rule from `z0 = the pixel's
  point` with the setting `c = a + bi` (the named constant's value, or the custom
  point, or the first named constant when the name cannot be read, as the
  renderer draws); Burning Ship `z -> (|Re z| + i|Im z|)^2 + c`; Tricorn `z ->
  conj(z)^2 + c`; Multibrot `z -> z^d + c` with the setting `d = 3|4|5` (a name
  that is not a power draws, and shows, 3); Newton `z -> z - (z^3 - 1)/(3 z^2)`
  from the pixel's point, whose escape sentence says the point is done when
  `z^3` is within 0.000001 of 1 and the colour is the root it reached. The
  setting's `label` is its meaning in a phrase ("Julia constant "Douady rabbit",
  added at every step"), shown beside its value in the expanded card.
- `toPlainText(expr)` is the pure walk that reads a tree aloud, and is the
  `aria-label` on the typeset `<math>` (`role="img"`, so the glyphs are not read
  out one by one): `z becomes z squared plus c`; a conjugated letter is "z bar";
  squared and cubed in words, any other power "to the power d"; `abs` "the
  absolute value of x,"; a fraction "the fraction ... over ... end fraction". Each
  descriptor's rule, start and setting have an exact-string test. `complexExpr`
  and `formatComplex` write a + bi from two numbers through `formatCoordinate`
  (six significant digits): a zero part is dropped (never both), an imaginary part
  of exactly 1 is `i`, the formulas use the typographic minus and the text an
  ASCII hyphen so a copied centre still parses.
- `MathView` renders the tree as the `<math>` family, which Chrome, Safari and
  Firefox draw natively with no dependency or font; React builds the MathML
  namespace on its own. `src/types/mathml.d.ts` adds the JSX typings React lacks
  (`math`, `mrow`, `mn`, `mi`, `mo`, `mtext`, `msup`, `msub`, `mfrac`, `mover`);
  `mover`'s `accent` is the string `"true"`, since React 19 warns about a
  boolean on an unknown attribute. No `dangerouslySetInnerHTML`, no new package.
- `MathCard` is a `role="region"` labelled by its heading (`useId`), no focus
  trap. The header line is always shown: a More/Less button
  (`aria-expanded`, `aria-controls` when expanded), the rule, and the setting's
  value. Expanded adds: where each point starts, the setting and its meaning,
  centre (a + bi), width of the view in the plane (`BASE_WIDTH / zoom`), zoom
  (`formatZoom`, the slider's formatter), the iteration cap with "(Auto)" when
  Auto chose it, the colour scheme's Settings name, the place's name when the view
  is within 1% of a catalogue place (`placeAtView` in `places.ts`, the tolerance
  `suggest` already uses to leave the place you are on out of its list, variant
  included), how a point is judged and the blurb.
- The page renders the card only while `mathOpen && !tourPlaying &&
  !tourOverlayOpen`, so a tour or an open drawer or Help takes it away and brings
  it back as it was (`mathOpen` is not reset), it is never over a dialog, and its
  Escape listener (on the window; it hands focus back to the Math button when
  focus was inside the card) exists only while the card is on screen. It sits in
  the canvas's wrapper after the switcher: `left-3`, `top-14`, or `top-24` while
  the switcher shows its chip row (`belowChips`, as the blank hint does), and
  `bottom-[9.75rem]`, 150 px of strip plus a gap, with `min-h-11` so the
  collapsed line always has room. The wrapper takes no pointer events (the canvas
  around the card still pans); the card scrolls (`max-h-full overflow-y-auto`)
  when the picture is too short to hold it. On a 375x667 phone the canvas is 281
  px tall: the Mandelbrot card expanded is 69 px of scrolling area clear of the
  strip, and with the chip row (Julia, Multibrot) the one-line card overlaps the
  strip's top 9 px, which is the price of `min-h-11`; at 1280x800 the expanded
  card is 352x460 and clear. Measured in headless Chrome with an iframe harness
  (so the viewport is the iframe's), not by eye.
- The numbers are throttled to the link writer's cadence (`MATH_CARD_UPDATE_MS =
  LINK_WRITE_INTERVAL_MS`, 500 ms; `mathCardDelayMs` is `linkWriteDelayMs`): a
  drag or a wheel burst redraws the card at most twice a second. The fractal and
  its setting are not throttled, and a change of either shows its own numbers at
  once (`Shown.key`), so the rule and the centre never disagree for a frame. The
  state changes only in the timer's callback, never in an effect body
  (`react-hooks/set-state-in-effect`).
- Expanded or collapsed is kept for the session: `getExpandedSnapshot` /
  `setExpanded` / `subscribeToExpanded` are the external store behind a
  `useSyncExternalStore` (server snapshot: collapsed), over `sessionStorage` under
  `fractals.mathCard.expanded` ("1"/"0"), every access behind try/catch (merely
  reaching `window.sessionStorage` can throw) and the last choice also held in
  memory, so the button works for the life of the page where storage refuses.
  Whether the card is open at all is page state and not kept: a reload starts
  with it closed, as the Settings drawer does.
- The top bar needed room. Seven buttons were 401 px wide at 375 px (the last one
  ended 26 px past the edge), so under `sm` the buttons are `px-1.5` (was `px-2`),
  the groups `gap-0.5`, the bar `px-1` and `gap-1`; the last button now ends at
  371 of 375 (measured by an iframe harness in headless Chrome, the dev server
  restarted first, since it served the old classes). From `sm` up nothing
  changed. At 320 px the bar already overflowed with six buttons (they ended at
  367) and still does, by 35 px (was 47 before this change, 81 with the seventh
  button unshrunk); the labels are never shortened.
- Tests: `fractalMath.test.ts` (the guard that `FRACTAL_MATH`'s keys are exactly
  the `FRACTAL_TYPES` ids, two or three sentences in every blurb, no markup in any
  text, the exact reading of every rule, start and setting, the Julia fallback,
  the Multibrot's non-power, `formatComplex`/`complexExpr` and `toPlainText`),
  `mathCard.test.ts` (the view's numbers, the cadence, the storage helpers with a
  missing and a throwing storage, the store), `placeAtView.test.ts` (every
  catalogue place from its own numbers, agreement with `suggest`, the 1%
  tolerance, variants), and `math-card-panel.test.ts` (sources: the button beside
  Help, hidden for a tour and the dialogs, the region and label, Escape, no focus
  trap, read-only, native MathML with typings for every element it uses, the help
  entry).

### Newton: a sixth fractal, coloured by root and speed (2026-10-10)

- The Newton fractal of z^3 - 1, owner-approved 2026-10-10 (fr-y6u), is the
  picture of Newton's method z -> z - (z^3 - 1) / (3 z^2) started at each pixel:
  which of the three cube roots of 1 (1 and -1/2 +- (sqrt 3 / 2) i) the orbit
  reaches, shaded by how fast. It is the first fractal here that is not an
  escape-time set, and the renderer loop is untouched.
- The risk named in the bead was that `FractalKind.iterations` returns one number
  and `mapIterationsToColor` paints `iterations / maxIterations` along a scheme
  (black from `maxIterations` up), so the root and the speed share one number.
  `newtonKind` (`src/lib/newton.ts`) returns `(root + NEWTON_BAND_MARGIN +
  (1 - 2 NEWTON_BAND_MARGIN) s / (s + NEWTON_HALF_SHADE_STEPS)) * NEWTON_BAND *
  maxIterations`: root 0 (z = 1), 1 (the root above the axis) and 2 each own a
  third of the range (`NEWTON_BAND` = 1/3), `s` is the step count, the margin is
  0.04 of a band and the half-shade is 6 steps. Decided and why:
  - BAND is a share of the cap, not a count of steps: the colour mapping
    normalises by `maxIterations`, so a root's third has to scale with it for the
    three roots to land in three different parts of every scheme at any Auto or
    manual iteration count. The packed number is therefore always in
    0..maxIterations and never reaches it for a settled point, so no settled
    point is drawn black.
  - Shading is `s / (s + 6)`, a saturating curve of the step count and not the
    count over the cap, so the picture does not depend on the iteration count
    (the same point has the same colour at a cap of 100 and 1000; only the
    black dust changes). Over the default view (400x300, whole counts) the
    median point settles in 6 steps, the middle half in 5 to 7 and nine in ten
    in 4 to 13, with a tail past 50 beside the boundary, which the curve grades
    instead of clipping.
  - The margin keeps the slowest shade of one root and the fastest of the next
    apart, so two basins never touch in colour, and keeps a slow point off the
    band's top edge.
- The loop. The orbit starts at the pixel and stops when `|z^3 - 1| < 1e-6`
  (`NEWTON_TOLERANCE`) at the start of a lap (a point at a root takes 0 steps), or
  at the cap. The step is written (2z + 1/z^2) / 3, which is the same map without
  forming z^3, so a far point does not overflow to infinity and then NaN. A z of 0
  has no step, an iterate that stops being finite stops the orbit, and a NaN or
  infinite pixel is treated the same: all return the cap (black). The root is the
  nearest of the three once settled. The smooth count is `n + max(-1, log2(ln tol /
  ln residual))`: near a simple root the residual's logarithm doubles per step, so
  the lap that first passes the tolerance overshoots by a fraction in (-1, 0], and
  this runs continuously from the lap before it (a residual of exactly 0, which
  `-0.5` reaches in one step, is clamped to -1).
- Exact facts the tests and the places lean on. Newton's map commutes with a turn
  of 120 degrees (N(wz) = wN(z)), so rotating a point moves its band on by one and
  keeps its shading, and mirroring about the real axis swaps roots 1 and 2. The
  map sends 0 to infinity, and its preimages of 0 are the roots of z^3 = -1/2:
  -2^(-1/3) = -0.793701 and 0.396850 +- 0.687401i. The six-sector junction at the
  origin reappears at each of them (drawn at zoom 150 at -0.793701 it is the origin's
  picture). The origin's junction is scale invariant: zoom 1000 at the origin looks
  like zoom 8. -0.5 is sent to the root 1 in one step.
- Registered like the Tricorn, with no variant: `FRACTAL_TYPES` has `{ id:
  "newton", label: "Newton" }` after the Multibrot, `resolveFractalKind("newton",
  ...)` returns `newtonKind` whatever variant the page holds, `fractalVariants` is
  `null`, so the switcher draws no second row and the codec writes `f=newton` and no
  `k`. `defaultViewFor("newton")` is (0, 0) at zoom 1: there is no set to frame, the
  map is three-fold symmetric about the origin where all three basins meet, and that
  frame (x -2..2, y -1.5..1.5) is 40% / 30% / 30% basin of the roots 1,
  -1/2 + (sqrt 3 / 2) i and -1/2 - (sqrt 3 / 2) i on a 400x300 grid, with each root
  at least 0.6 inside the frame (a test holds both).
- Two built-in views, `newton-overview` (the default frame, rainbow) and
  `newton-junction` (the origin at zoom 8, rainbow), under the per-fractal guards
  (`presets.test.ts` counts 14 fractal-owned views and 20 built-ins).
- Nine places in `places.ts` (`NEWTON_PLACES`; the test allows 8 to 10): the three
  basins, where all three meet (zoom 8), the same junction at 1000x, a second
  junction at -0.7937, a basin pinched into a lens (centre -0.5, zoom 4, a dark dot
  at the preimage of the root 1), two junctions on one boundary, a chain of
  junctions, a chain of bulbs on a straight boundary and the root at 1 beside the
  boundary. A place needs two basins in the frame, since a deep view inside one is
  a flat field however well chosen; `places.test.ts` checks that every Newton place
  has at least two bands each over 5% of a 40x40 grid. The featured place is
  `newton-junction` (rainbow): a pinwheel of six sectors in three colour families
  with bulbs along the boundaries; the whole-basins place is the opening view, which
  a switch should not repeat.
- Colour schemes, checked by eye. Every place was drawn in all five schemes on
  contact sheets at 240x180 with whole counts (what a tile shows), and the
  default view in all five schemes at 400x300 with smooth counts (what the page
  draws), through the real renderer in headless Chrome. The sheet drawer was a
  throwaway copy of `make-og-card.mjs`'s `--sheet` that took views (fractal,
  centre, zoom, scheme) in place of place ids, which is what a place not yet in the
  catalogue needs. What read:
  - Rainbow reads best: three hues, one per root (yellow/orange, magenta/violet,
    cyan/green) with rings of shade inside each, and the three roots' dark centres.
  - Fire and grayscale read clearly: three levels (red / orange / white and dark /
    mid / light) with shading inside each, but a wide empty basin fills a place
    with one flat level.
  - Classic is busy over the wide view, where its colours repeat between roots so
    a basin can be brown, white and orange at once, but gives clean purple / green /
    blue families on the pinwheels and chains.
  - Ocean is the weakest: three blues (dark, mid, light) that stay readable but
    separate least.
  The scheme each place names is the one it read best in, and then re-measured at
  64x48 with `nearUniformShare` (the share one colour holds, whole counts): the
  three-basin view is 16% in classic, 21% in rainbow, 31% in fire and grayscale and
  37% in ocean, the featured junction 22% in rainbow (8% classic, 33% fire, 35%
  ocean, 32% grayscale), and the two places with a wide empty basin on one side (the
  bulb chain and the root at 1) are 56 to 67% in fire and grayscale, which is why
  they name classic (21%) and rainbow (30%). A deep view inside one basin is one
  colour family and is blank to the detector, as it should be.
- The blank detector (fr-2oa) needs no change. The whole-basins view is not blank
  because three basins show: its commonest colour is at most 37% in any scheme. It
  was already run against every fractal's default view in every scheme and every
  place; `blankView.test.ts` adds the Newton whole view with the 60% bound and shows
  a deep view in one basin is blank.
- The button row. Six buttons are 375 px wide, so the row now scrolls sideways at
  375 px by about 28 px (351 of room inside the gutters) as well as at 320 px by
  about 83 (296), with `scrollIntoView` keeping the lit button in view: clicking
  Newton at 375 px lands on the junction with the button visible and `aria-pressed`
  true. Measured by a DevTools session in headless Chrome (`mobile` emulation at 375
  and 320), not by eye. Squeezing the padding to `px-1` would still scroll by 4 px,
  so the labels and `px-1.5` stay.
- Tests: `newton.test.ts` (the id, the band for a point at each root and near one,
  disjoint bands and clear of their edges over a grid, agreement with a textbook
  Newton oracle on the root and the step count, z = 2 in five steps worked by
  hand on the real axis, -0.5 in one, z = 0, far, huge, infinite and NaN points
  returning a finite number in range, a cap too low to settle, no settled point
  black, whole against smooth within a step and continuous along a line, the same
  colour at caps 100 and 1000, the 120 degree turn by one and two bands with the
  same shading and the mirror, three colour families and shading in every scheme,
  the default frame's roots and shares), the Newton cases in `fractalTypes.test.ts`,
  `viewLink.test.ts`, `viewLinkState.test.ts`, `presets.test.ts` and
  `places.test.ts`, and the new counts in `tour.test.ts` (six fractals; the
  200-hop share floor went from 20 to 10, since twelve seeds ranged from 4 to 74
  over six fractals). The three tests that used "newton" as an unknown fractal id
  now use "lyapunov".

### Multibrot: a fifth fractal with a power row (2026-10-10)

- The Multibrot sets, owner-approved 2026-10-10 ("add more fractals"), are the
  Mandelbrot loop with a higher power: z -> z^d + c for d = 3, 4, 5. With d = 2
  it is the Mandelbrot set, so the family starts at 3. A turn of c by 360/(d-1)
  degrees turns the orbit by the same angle ((wz)^d = w z^d when w^(d-1) = 1),
  so the set has d-1 lobes: two for z^3 (one above the other on the imaginary
  axis), three for z^4 (one pointing left), four for z^5. It is the first
  fractal after Julia to use the variant mechanism (see the Fractal variants
  note below): its variant is the power.
- `src/lib/multibrot.ts` exports `MULTIBROT_POWERS` ([3, 4, 5]),
  `parseMultibrotPower(value)` (the number for exactly "3", "4" or "5", else
  null: "3.0", "03", " 4", "6" and text are no power) and
  `createMultibrotKind(power)` (id `multibrot`; throws a `RangeError` for any
  other power, so a value from outside never reaches it: `resolveFractalKind`
  parses first and falls back to 3, as an unknown Julia name falls back to the
  first constant). The loop is the Tricorn's convention line for line: orbit
  from 0, `|z|^2 > 4` after the step, the loop index returned for an orbit that
  escapes (c = 2 is 1 for every power), the cap for one that does not. z^d is
  repeated complex multiplication, not a power function. Radius 2 stays the
  right escape radius: for |c| <= 2 and |z| > 2, |z^d + c| >= |z|^d - 2 > |z|. The
  smooth count is `n + 1 - log(log|z| / log 2) / log(d)`: log|z| grows by a
  factor d a step, so the fraction is a log base d (for d = 2 it is the
  Mandelbrot formula). There is no interior shortcut: the cardioid and bulb test
  is closed form for the Mandelbrot set only.
- Registered like Julia: `FRACTAL_TYPES` has `{ id: "multibrot", label:
  "Multibrot" }` after the Tricorn; `fractalVariants("multibrot")` is label
  "Power", options "3", "4", "5" labelled "z^3", "z^4", "z^5", `allowsCustom:
  false`; `defaultVariant` is "3"; `isVariantValue` takes the plain spellings
  only. The switcher's second row and the Settings select draw from the
  descriptor and needed no change; there is no Custom chip and no Real or
  Imaginary box. The renderer is untouched.
- One variant string still serves every fractal, so it can hold a value the
  next fractal cannot use (a constant going to the Multibrot, a power going to
  Julia). `variantOn(fractalId, variant)` in `fractalTypes.ts` is the rule: a
  value the fractal can draw stays, a fractal that takes a variant otherwise
  gets its default, a fractal that takes none leaves the value alone (so Julia
  -> Mandelbrot -> Julia still keeps the constant). The Fractal select
  (`handleFractalTypeChange`), a place (`handlePlaceSelect`, so the switcher's
  buttons, Tour and Auto-wander hops) and a link (`viewLinkToUpdates`: a
  Multibrot link with no usable power opens on 3, not on Julia's constant) all
  go through it. `handleVariantChange` frames the new variant at the *current*
  fractal's default view where it used to say "julia".
- Link: `k=3|4|5` beside `f=multibrot`, the existing variant field. The codec
  writes `k` when `isVariantValue(fractal, variant)` and reads a `k` any
  fractal can draw on its own (`variantNamed`); `viewLinkToUpdates` keeps it
  only for a fractal that can use it, so `f=julia&k=4` and `f=multibrot&k=Classic`
  each drop the field. Julia's links are byte for byte as before.
- Saved views: a new stored field `variant` for a fractal other than Julia
  that takes one (`presetFractalFields("multibrot", "4")` is `{ fractal,
  variant }`); Julia keeps `juliaConstant`, so an older build still reads what a
  Julia view saves and sees a Multibrot view as a fractal it does not know.
  `presetVariant` reads both fields, the fractal's own first, and falls back to
  the fractal's default. A fractal with no variant (Mandelbrot, ship, Tricorn)
  writes neither key.
- `defaultViewFor("multibrot")` is (0, 0) at zoom 1. Measured with a 0.002 grid
  at a cap of 400 the sets span x -0.69..0.69, y -1.32..1.32 (z^3), x
  -1.26..0.80, y -1.10..1.10 (z^4) and +-0.91 both ways (z^5); zoom 1 (x -2..2,
  y -1.5..1.5) leaves the tallest, z^3, 0.18 clear above and below, and a test
  samples the whole frame border for each power and finds it all escaped (the
  set is connected and holds the origin, so it is all inside). Zoom 1.1 would
  leave z^3's top bulb 0.04 from the edge.
- Three built-in views, `multibrot-cubic` (z^3, the default frame),
  `multibrot-quartic` (z^4, the same frame) and `multibrot-copy` (z^3, centre
  0.267, 1.26 at zoom 50: a small two-lobed copy riding on the top lobe, in the
  classic scheme), guarded per fractal like the others (`presets.test.ts` counts
  12 fractal-owned views and 18 built-ins).
- Twelve places in `places.ts` (`MULTIBROT_PLACES`; the test allows 10 to 12),
  four per power, from contact sheets drawn through the real iteration and the
  real colour mapping in several schemes (with smooth counts, as the page draws),
  then each re-measured with whole counts at 64x48, which is how a tile and the
  featured-place guard draw them: the rainbow scheme looks fine smooth and is a
  red field of 67-80% in whole counts, so most places name classic. The places:
  the whole set of each power, and for
  z^3 a heart on the top lobe, a small copy and a cusp between two bulbs; for
  z^4 a chain of copies on the left antenna, the cleft between two lobes and
  where two lobes touch; for z^5 a bulb in the notch between lobes, a bulb
  ringed with smaller ones and twin bulbs on the edge. Names are plain ("z^4:
  the cleft between two lobes"). Candidates dropped for being a flat field (a
  z^5 view at (0.62, 0.7) zoom 25 is solid black, one at (0.9, 0) zoom 10 is
  sky; a z^3 cusp at zoom 40 in the ocean scheme is mostly black). The featured
  place is `multibrot-3-small-copy` in classic, 36% one colour against the
  guard's 60% (the comment on `FEATURED_PLACE_IDS` says why: it reads as a
  two-lobed set, not the Mandelbrot set's one-lobed bulbs, and it lands on
  power 3).
- `suggest()` takes a Multibrot view's own power first, as it does a Julia
  view's own constant (`sameVariant`: constants as points for Julia, text for
  a power), and the place that "is the view" must share the variant too.
  `wholeSetPlaceFor(variant, fractal = "julia")` generalises the chip's
  destination: the page passes the fractal, so a power chip goes to the whole
  set of that power. Tour, Surprise me and Auto-wander need no code.
- The button row. Five buttons measure 323 px with `px-1.5` (was `px-2.5`, 362
  px for five): it fits 375 px (351 of room inside the gutters) and no longer
  needs to scroll there, and scrolls on 320 px (296 of room), where a small
  effect now brings the lit button into view (`scrollIntoView` on the current
  button when the fractal changes or the switcher comes back from hidden).
  Measured in headless Chrome by a DevTools session, not by eye: a plain
  `--window-size` screenshot in desktop Chrome lays the page out at its 500 px
  minimum and would show the wrong picture.
- Tests: `multibrot.test.ts` (the parser's refusals, the id, the RangeError,
  the origin, c = 2 at count 1 for each power, hand-worked orbits for c = 1 and
  c = i, the d-1 rotations on every power over 50+ escaping points both smooth
  and whole, that another angle is not a symmetry, the exact mirror, the smooth
  count against the log-base-d formula by hand, the cap, and the default frame's
  border escaping for each power), the Multibrot cases in `fractalTypes.test.ts`
  (`variantOn` included), `viewLink.test.ts`, `viewLinkState.test.ts`,
  `presets.test.ts` and `places.test.ts` (twelve places over the three powers,
  each power's whole set, the variant-first order of `suggest`), the new count
  in `tour.test.ts`, and the source-reading panel tests. Checked in headless
  Chrome against the dev server: the Multibrot button lands on the small copy
  with the Power row "z^3" lit, the chips go to each whole set and write
  `k=4` and `k=5`, Julia -> Multibrot opens power 3 (not Classic) and Back
  retraces each step, the Settings Presets list shows three views and the
  Power select shows z^3, z^4 and z^5.

### Auto-wander pill on the picture (2026-10-10)

- The only switch for Auto-wander was a checkbox in Settings, so a first-time
  visitor could neither find it nor turn it back on. `WanderControl.tsx` is a
  compact pill over the bottom right of the canvas: off, a play glyph and
  "Auto-wander"; on, a pause glyph and "Wandering", with " · N s" from the
  controller's countdown while it runs and plain "Wandering" while
  `isRendering` (`wanderPillLabel` in `src/lib/wanderControl.ts`, pure). It is an
  `aria-pressed` button named "Auto-wander" in both states, at least 44 x 36 px,
  with a focus ring and inline SVG glyphs. It never fades, and is hidden by
  `tourPlaying || tourOverlayOpen` like the switcher.
- One state, one handler: the pill's `onToggle` is `handleWanderChange`, the
  Settings checkbox's `onChange`. The Settings card keeps the checkbox and the
  seconds box and now says the same switch is on the picture. The page draws the
  pill after `NearbyStrip`, so it paints over the strip's gradient when it
  stacks above it.
- Placement is measured, not guessed from the viewport: the component watches
  its overlay (the wrapper's size) with a `ResizeObserver` and asks
  `wanderPlacement(width)`. At least `NEARBY_STRIP_MAX_WIDTH` (six 96 px tiles,
  More, gaps and padding: 744) plus the pill and a gap, it sits `beside` the
  tiles in the corner; narrower, or unmeasured, it is `above`, 114 px up
  (`bottom-[7.25rem]`, over the strip's heading line, the strip being 150 px
  tall). A canvas that is narrow because the window is short and wide gets the
  stacked form too.
- The first-run nudge. `useWanderNudge({ wanderOn, tourPlaying, overlayOpen })`
  returns true for `WANDER_NUDGE_SHOW_MS` (6 s) once, after the page has been open
  `WANDER_NUDGE_AFTER_MS` (15 s) with no wander used and no tour started
  (`decideNudge`: `show`, `later` or `never`). The flag
  (`WANDER_NUDGE_STORAGE_KEY`) is written to localStorage as the tooltip appears,
  through `readNudgeSeen`/`markNudgeSeen`, which swallow a throwing or missing
  storage, so the page then nudges on every visit. An open drawer or Help defers
  it; any `pointerdown` or `keydown` ends it. The pulse is the `wander-nudge-pulse`
  CSS animation in `globals.css` (two beats), switched off by
  `prefers-reduced-motion`, which leaves the "Let it wander for you" tooltip.
  State is set only from timers and events, never in an effect body
  (`react-hooks/set-state-in-effect`).
- Not changed: the interval box, what a step does, the Tour (which hides the
  pill and holds wander as before), Surprise me, and the keyboard.
- Tests: `wanderControl.test.ts` (label in each state, the countdown hidden
  during a render or when not a number, placement at 320 to 1003 px, the storage
  helpers with a throwing storage, `decideNudge` at 14.999 s and 15 s, overlays,
  used wander or tour, seen) and `wander-control-panel.test.ts` (sources: the
  pressed button and fixed name, one shared handler, the hiding rule, the draw
  order, the nudge's try/catch storage and reduced-motion CSS).

### Tricorn lands on the whole Tricorn (2026-10-10)

- fr-gxr's guard forbade any featured place centred on the real axis, so the
  Tricorn button went back to `tricorn-star` (0.872, 1.51 at 50x), which at
  800x600 in classic is a flat green field with one black arm, the picture
  fr-6oi was filed against (`nearUniformShare` scored it 29%: the measure
  catches flat fields, and a thin shape on one does not move it). The real axis
  is the Mandelbrot set only when the view is zoomed in until the axis fills
  it; at whole-set zoom the three-fold form shows. The featured place is
  `tricorn-whole` ("The whole Tricorn", classic, the origin at zoom 1): a black
  three-armed body, a green-to-magenta band round its edge and the arm tips
  running off the frame.
- The guard is now `zoom > REAL_AXIS_GUARD_MIN_ZOOM` (4) and centred within 5%
  of the view's height of the axis, for a fractal in
  `REAL_AXIS_MATCHES_MANDELBROT`. `places.test.ts` covers a deep on-axis place
  (`tricorn-along-the-arm`, fails), the whole set on the axis (passes, with the
  limit exclusive) and a deep off-axis place (`tricorn-star`, passes).
- Compared at 800x600: the whole set in classic, rainbow, fire and ocean, beside
  the Mandelbrot set's whole view and the star; and the same frame at zooms 1.1,
  1.25, 1.5, 2 and 2.5. Classic reads best; rainbow is a flat red field, fire and
  ocean dark with a thin edge, and zooming in only loses the arms (1.5 and up is
  a black wedge between two green fields), so no catalogue place at 1.5 to 2.5
  was added. The measured flat-field share at 64x48 with whole counts is 41% one
  colour against the guard's 60%.
- The whole set is also what the Fractal select opens the Tricorn on
  (`defaultViewFor("tricorn")`), so the test that a featured place is not the
  opening view exempts it (`FEATURED_IS_OPENING_VIEW`, in the test): the page
  opens on the Mandelbrot set, and a click from another fractal still goes
  somewhere.

### Tricorn lands on its star, not the Mandelbrot needle (2026-10-10; superseded by the note above)

- fr-6oi's pick, `tricorn-along-the-arm`, is centred on the real axis, where
  the Tricorn is exactly the Mandelbrot set (a real z is its own conjugate): at
  800x600 it is the same picture as `mandelbrot-needle-bulbs`, so the Tricorn
  button showed the Mandelbrot set. fr-gxr's featured place was `tricorn-star`
  (classic; centre 0.872, 1.51 at zoom 50), off the axis, a black body with
  three arms and antennae; fr-hbe (the note above) replaced it with the whole
  Tricorn. The contact-sheet comparison (all nine Tricorn
  places at 800x600 against the Mandelbrot set, and the other four featured
  places) is in `FEATURED_PLACE_IDS`'s comment; the Mandelbrot, Julia, Burning
  Ship and Multibrot landings were kept, none duplicating another button's.
- `REAL_AXIS_MATCHES_MANDELBROT` (`places.ts`, `{ tricorn: true }`) names the
  fractals whose real axis is the Mandelbrot set's; `places.test.ts` fails a
  featured place of one of them zoomed in on the axis (fr-hbe: above zoom 4,
  and centred within 5% of its view's height of the axis), naming the id, and
  checks the flag's claim on the orbit. A
  Multibrot is not listed: its powers of 3 and up differ on the axis. A new
  fractal that conjugates or otherwise keeps real orbits real adds itself here.
- The sheets were drawn at 800x600 with a throwaway copy of
  `make-og-card.mjs` whose sheet width and height were changed; the script's
  own `--sheet` is 400 px wide at the card's 1.91:1 shape.

### Featured places are held to a flat-field guard (2026-10-10)

- The Tricorn button landed on `tricorn-star`, which in the classic scheme is a
  flat bright-green field with one thin black arm. Every place was drawn on a
  contact sheet (`node scripts/make-og-card.mjs --sheet out.png --places
  id[:scheme],...`) and the Tricorn's featured place became
  `tricorn-along-the-arm` (rainbow): a black bulb, a chain of smaller ones and
  filaments on red (superseded by fr-gxr above: that view is on the real axis). Seahorse Valley, the Classic spirals and the armada were
  redrawn and kept. `FEATURED_PLACE_IDS`'s comment records what was compared.
- `nearUniformShare(pixels, width, height)` in `blankView.ts` is the share of
  the 32x24 sample grid within `BLANK_COLOR_DISTANCE` of the commonest sample
  (`isBlankImage` is that share at least 98%). `places.test.ts` fails a
  featured place above `FEATURED_MAX_UNIFORM_SHARE` (0.6), naming its id. The
  measure counts one exact colour as the base, so a smooth gradient field can
  score lower than it looks (`tricorn-star` scored 29%); it catches flat
  fields and big black or empty areas, and the contact sheet is still the
  judge of a good picture.

### Tricorn: a fourth fractal (2026-10-10)

- The Tricorn (the Mandelbar set), owner-approved 2026-10-10 ("add more
  fractals"), is the Mandelbrot loop with the conjugate taken first: z -> conj(z)^2
  + c. Conjugating keeps |z| and negates the angle that squaring doubles, so the
  set has three-fold rotational symmetry (a turn of 120 degrees about the origin
  maps it onto itself, which is exact in the maths: conj(wz)^2 = w conj(z)^2 for a
  cube root of unity w) and the Mandelbrot set's mirror symmetry about the real
  axis. On the real axis the conjugate changes nothing, so the Tricorn counts what
  the Mandelbrot set counts there.
- `src/lib/tricorn.ts` exports `tricornKind` (id `tricorn`), written line for
  line on `burningShip.ts`: the same orbit from 0, the `|z|^2 > 4` test after the
  step, the loop index returned for an orbit that escapes (so c = 2 is 1), the
  same smoothing and `maxIterations` for one that does not. There is no
  cardioid shortcut: that is closed form for the Mandelbrot set's bulbs only.
- Registered like the ship: `FRACTAL_TYPES` has `{ id: "tricorn", label:
  "Tricorn" }` after Burning Ship, `resolveFractalKind("tricorn", ...)` returns
  `tricornKind` whatever the variant beside it, and `fractalVariants` is `null`
  for it, so it gets no second chip row and no Settings variant select. The link
  codec (`fractalNamed`) and `presetFractal` validate against `FRACTAL_TYPES`, so
  `f=tricorn` round-trips and a saved Tricorn view lists under it with no change
  to either, and stores no `juliaConstant`. The renderer is untouched.
  `FRACTAL_KINDS` in `fractalKinds.ts` is still Mandelbrot alone, as it is for the
  ship and Julia: the picker's resolver is what the page draws by.
- `defaultViewFor("tricorn")` is (0, 0) at zoom 1. The set's arms point to -2 and
  to 1 +- 1.73i, so the origin frames the three alike; zoom 1 is the widest view
  (x -2 to 2, y -1.5 to 1.5), which holds the left arm and the body and loses
  the last 0.23 of the other two arms' tips at the top and bottom edges. Chosen
  from 400x300 renders of (0, 0) and (-0.25, 0): the second only moved the left
  tip off the frame's edge, at the cost of the symmetry.
- The button row. `FractalSwitcher` draws four buttons; measured in headless
  Chrome the row is about 290 px wide, ending at 302 px, so it fits 375 px and
  320 px, and the label is not shortened. The group still has `max-w-full
  overflow-x-auto` and a button `shrink-0 whitespace-nowrap`, so a picture
  narrower than that scrolls the row sideways like the chip row and never wraps
  it over the picture. `aria-pressed` was already `type.id ===
  fractalType`, so the fourth button is covered by the same line.
- Two built-in views (`presets.ts`, `fractal: "tricorn"`, no constant):
  `tricorn-overview` (the default view, bounds -2..2 by -1.5..1.5) and
  `tricorn-star` (centre 0.872, 1.51 at zoom 50, bounds 0.832..0.912 by
  1.48..1.54). They fall under the existing per-fractal guards in
  `presets.test.ts`, which now count 9 fractal-owned views and 15 built-ins.
- Nine places in `places.ts` (`TRICORN_PLACES`; the test allows 8 to 10), each
  picked from contact sheets drawn through the real renderer in several schemes,
  the numbers written as the render had them: the whole set, two bulbs on an
  arm, the body's frayed edge, the left arm's bulb, along the left arm, where the
  body meets an arm, a small Tricorn (a baby copy at about -1.768 on the real
  axis), a bulb on the upper arm, and a star on an antenna. The set repeats a
  feature on each of its three arms, so some frames run diagonally. The
  featured place is now `tricorn-whole` (fr-hbe; see the featured-places notes above:
  it was `tricorn-star`, then `tricorn-along-the-arm`, then `tricorn-star` again). A candidate drawn far out on the real axis (a speck
  at -1.94, zoom 200) was dropped: too dark to read even at the thumbnail size.
  Thumbnails, Surprise me, Tour and Auto-wander hops pick the new places up with
  no further code; `tour.test.ts` now expects four fractals.
- Tests: `tricorn.test.ts` (the id, the origin inside, c = 2 escaping at count 1,
  agreement with the Mandelbrot kind on the real axis, a hand-worked point that
  differs from it, the 120 degree turn both ways on seven points and on a point
  of the set, the mirror about the real axis, smooth against whole counts, the
  cap, the default view holding the set), plus the Tricorn cases in
  `fractalTypes.test.ts`, `viewLink.test.ts`, `viewLinkState.test.ts` and
  `presets.test.ts`, the new count in `places.test.ts`, and the button row's
  scrolling classes in `fractal-switcher-panel.test.ts`. Every place and the
  featured place already run through the catalogue guards (kind, range, link
  round trip, non-blank render, featured detail share).

### Link preview: a card on the app's own origin (2026-10-10)

- Sharing the staging link showed a generic link glyph: `layout.tsx` fell back to
  `https://fractals.team.trabian.ai` when `NEXT_PUBLIC_APP_URL` was unset (it is
  unset on Cloud Run), so og:image pointed at a host that is not this app,
  og:url was an invented `next-fractals-app.run.app`, the og title said "Nextjs
  Fractals", the declared 1200x630 was a 1578x1172 file, and there was no
  favicon.
- The origin comes from the request, because the release builds one image and
  promotes the same digest to production, so nothing can be baked in. The
  layout's static `metadata` is an async `generateMetadata` that reads
  `next/headers` and calls `siteOrigin(getHeader, env)` (`src/lib/siteOrigin.ts`,
  pure, tested in `siteOrigin.test.ts`): `x-forwarded-host`, else `host`; the
  scheme is `x-forwarded-proto` when it is `http` or `https`, else https, except
  a local host with none, which is http; a host that is not a plain hostname and
  port (a path, space, scheme, quote, credential) is never echoed and counts as
  absent; with no host, `NEXT_PUBLIC_APP_URL` if it is an http(s) URL, else
  `http://localhost:3000`. The result sets `metadataBase`, og:url and the
  absolute og:image and twitter:image. Reading `headers()` makes `/`
  server-rendered on demand (`ƒ` in the build output, not `○`); the page's HTML
  was already the same for everyone, and the one extra render per request is
  the price of a correct origin.
- Title is "Next Fractals - Interactive Fractal Explorer" for title, og:title and
  twitter:title. The description names the Tricorn too (it is in `FRACTAL_TYPES`
  on main); the card's own line stays the three sets the bead named. og:image:width/height are 1200 and 630,
  the file's own, with `og:image:alt`.
- `public/og-card.png` replaces `public/fractal-preview.png` (a new name, so chat
  apps do not serve the cached old image), and `src/app/icon.png` (192x192) and
  `src/app/apple-icon.png` (180x180) are Next file conventions, so the head
  links appear without code. All three come from `scripts/make-og-card.mjs`, a
  one-off generator that is neither in `make gate` nor in the Docker image: it
  bundles `FractalRenderer` with esbuild, draws in the system Chrome, and uses
  sharp (already installed by Next) to cut the icons and palette-compress the
  card under 300 KB. Run `node scripts/make-og-card.mjs` to regenerate and commit
  the PNGs; `--sheet out.png --places id[:scheme],...` draws a contact sheet of
  candidates. The card is `julia-classic-deep-spiral` in its own scheme at the
  card's 1.91:1 shape, the subject right of centre, under a dark left-to-right
  gradient carrying "Fractal Explorer" (Inter 800, fetched from Google Fonts) and
  the one-line subtitle. Checked by downscaling to 300 px wide: the title and the
  subtitle both read.
- Integration tier (`tests/integration/deployed.test.ts`, with `html.ts` for the
  tag readers): og:image and twitter:image are `<origin>/og-card.png` on the
  origin of `STAGING_URL`, og:url is that origin (Next writes the root URL
  without its slash, so the check accepts either), the card is 200 `image/png`
  with an IHDR of 1200x630 under 300 KB, and the head's `icon` and
  `apple-touch-icon` links answer 200 `image/png`. The unit suite is unchanged
  in what it needs: no network.

### Fractal variants (2026-10-10)

- A fractal can take one setting, its *variant*; only Julia did when this
  landed, and its variant is the Julia constant (the Multibrot's power, in the
  note above, is the second). This is a refactor so the next fractal that
  takes a setting needs a descriptor and no new controls.
  Nothing a visitor does changes; the one visible difference is the switcher's
  second row, which now opens with a quiet caption, "Julia constant".
- `fractalVariants(fractalId)` in `fractalTypes.ts` returns `{ label, options:
  { value, label }[], allowsCustom }` or `null`: Julia gets the label "Julia
  constant", the four `JULIA_CONSTANTS` and `allowsCustom: true`; the Mandelbrot
  set, the Burning Ship and any id this build does not know get `null`.
  `defaultVariant(fractalId)` is Julia's first constant and `""` for the rest.
  `isVariantValue(fractalId, value)` says whether a value is one the fractal can
  be drawn with, and `isCustomVariant(fractalId, value)` whether it is the
  fractal's custom choice.
- The page, `viewLinkState.ts`, `viewLink.ts`, `places.ts`, `tour.ts` and
  `FractalSwitcher` call it `variant` (`ViewLinkUpdates.variant`,
  `ViewLinkState.variant`, `Place.variant`, the switcher's `variant` and
  `onSelectVariant`, the page's `variant`/`setVariant`/`handleVariantChange`/
  `handleVariantSelect`). The page still holds one string that survives a change
  of fractal, as the Julia constant always did, so Julia ↔ Mandelbrot through the
  Fractal select keeps the constant, and a fresh page opens it on
  `defaultVariant("julia")`.
- The wire and storage formats are unchanged, byte for byte. A link still writes
  `k=<value>` only beside `f=julia` and reads it on its own; `presets.ts` keeps
  the stored field name `juliaConstant` (commented there) so every saved view
  still loads and a view saved now is still readable by an older build.
  `presetVariant(preset)` reads it, `presetFractalFields(fractal, variant)`
  writes it. The built-in presets and the catalogue keep their values.
- `FractalSwitcher` draws its second row from `fractalVariants(fractalType)`: a
  caption (`aria-hidden`, the group carries the same label), a chip per option,
  a Custom chip only when `allowsCustom`, and no row when the descriptor is
  `null`. The Settings select is drawn from the same descriptor and shows only
  when it exists; the Real and Imaginary boxes show for `isCustomVariant`. The
  custom-constant behaviour itself (`custom:<re>,<im>`, validation messages, the
  Custom chip opening Settings at Real) is untouched. The page declares
  `variants` just before its `return`: declared after the render-phase
  `setSyncedVariant` block, the React Compiler lint reports `applyView`'s
  memoization as not preserved.
- Tests: `fractalTypes.test.ts` (descriptor, defaults, `isVariantValue`,
  `isCustomVariant`), `viewLinkState.test.ts` (a Julia variant, named and
  custom, round-trips through `k=` and nothing is written for another fractal),
  `presets.test.ts` (a stored view with `juliaConstant` loads into the variant);
  the source-reading panel tests follow the renamed identifiers and read the
  switcher and select for the descriptor.

### Auto-wander hops; a stopped Tour resumes after 15 s (2026-10-10)

- Auto-wander's drifts stayed on one fractal and wandered into dull areas, and
  a Tour that input had stopped waited the full 20 s to start again. Every
  `WANDER_HOP_EVERY`th step (4, `wanderController.ts`) is now a hop to a
  catalogue place and the other three are the drifts `wander.ts` always took
  (`wander.ts` is untouched). A hop of any kind restarts the count, so the walk
  goes drift, drift, drift, hop; switching the mode off and on restarts it too.
  A tab that is hidden, a tour that plays or a render in flight takes no step,
  so none of them uses up a slot.
- `WanderController` now calls its handler with a `WanderStep`, `{ hop }`, and
  counts the drifts since the last hop itself. The page's handler (declared with
  the tour's hop handler, after `handlePlaceSelect` and `placeView`) turns a
  hop into `nextTourStop({ ...wanderHopRef.current ?? initialTourState(placeView),
  view: placeView }, PLACES, rng)`: the tour's rules (never the place on screen,
  the 12-place recent window, one hop in six changes fractal), a memory of the
  walk's own in `wanderHopRef`, and the page's seeded `rng`, with `view`
  refreshed to where the drifts have taken the walk. It goes through
  `handlePlaceSelect(place, { replace: true })`: the tile's 400 ms crossfade,
  the place's scheme and Julia constant, Auto iterations, and no `beginJump`,
  so the follower rewrites the current history entry as it does for a drift.
  `replace` defaults to `tour`, so a tour's hop is as it was.
- A blank landing. After a drift the controller holds `driftUnchecked`; the
  page calls `wander.notifySettled()` from an effect on `tourSettled` (a full
  render has drawn the view), declared after the handler effect so the hop is
  made by the handler of the render that settled. If the walk is running and
  not held, and the controller's `setBlankDetector` (the page passes
  `canvasIsBlank(canvasRef.current)`, the fr-2oa detector) says the picture is
  nearly one colour, the walk hops at once instead of waiting an interval. The
  flag is cleared by the check, by a hop, by `start()` and by `notifyActivity`
  from anywhere but the step handler (the drift's own `applyView` reports
  activity from inside it, tracked by `stepping`), so a view the visitor has
  since moved is never judged. A hop is never checked, so a replacement cannot
  loop.
- `TOUR_RESUME_MS` (15000, `tourMode.ts`) is the idle wait once a tour has
  played in the page session (`hasPlayed`, which is `stopped` and also an
  `armed` that an ask has since made); a cold page keeps `TOUR_IDLE_START_MS`
  (20000). The constructor takes `resumeMs` beside `idleMs`. Every condition
  that holds a start back (drawer, dialog, text focus, hidden tab, a render in
  flight) is as it was.
- Tests: `wanderControllerHops.test.ts` (fake time: the 4th step is a hop and
  the others drifts over 20, the count restarting, a hold taking no step, a
  faked detector forcing a hop and counting as one, never looking at a hop's
  picture or a view moved by hand, off and held walks staying still);
  `wanderHops.test.ts` (the controller wired to `nextTourStop` on a seeded
  generator: every 4th of 20 a catalogue hop, a blank landing replaced, about
  one hop in six changing fractal over 600, no repeat inside the recent window
  unless the fractal has nothing else outside it); `tourMode.test.ts` (15 s
  after a stop, 20 s on a cold page, a drawer still refusing);
  `wander-hop-panel.test.ts` (sources: the hop through the tile's handler with
  `replace`, the detector, `notifySettled` after the handler).

### Fractal switcher (2026-10-10)

- Changing fractal was Settings, Rendering Parameters, the Fractal select, and
  for Julia a second select; the owner found that too hard. Three buttons,
  Mandelbrot, Julia and Burning Ship, now sit over the top left of the canvas
  (`FractalSwitcher.tsx`, inside the canvas's own wrapper at `top-3 left-3`,
  `z-10`, under the bar's `z-20`), the current one `aria-pressed` and lit. While
  Julia is current a second row of chips follows it: Classic, Dendrite, Douady
  rabbit, Siegel disk (`JULIA_CONSTANTS`) and Custom. The row scrolls sideways
  (`overflow-x-auto`, `shrink-0 whitespace-nowrap`) and never wraps over the
  picture. The labels are never shortened: "Burning Ship" at `text-xs` fits
  320 px, so the bead's "Mandel / Ship" fallback was not needed.
- The component holds no state and is told `fractalType` and `juliaConstant`,
  so the Settings selects (kept as they were) and the switcher are two views of
  the same two values. A chip is pressed by the select's own rule: a named chip
  when `juliaConstant` is that name, Custom when `isCustomJuliaConstant`. Only
  the buttons take pointer events, so the canvas around them still pans. It
  does not fade: the bar's `useIdleVisibility` is the bar's alone. `hidden`
  (`tourPlaying || tourOverlayOpen`) renders nothing, for a tour and for the
  drawer or Help being open.
- A fractal button calls `handleSwitchFractal`, which is
  `handlePlaceSelect(featuredPlace(typeId))` and nothing else, and returns for
  the fractal already shown. It ends in the same state as the Fractal select —
  fractal, view, Julia constant — but as a place, so it has the crossfade, the
  place's own scheme and constant and Auto iterations, and the one history entry
  `beginJump` counts; Back returns to the previous fractal and view. The select
  still goes through `handleFractalTypeChange` to the fractal's default view.
- `FEATURED_PLACE_IDS` (`places.ts`) names one catalogue place per fractal:
  `mandelbrot-seahorse-valley`, `julia-classic-spirals` and
  `burning-ship-armada`, chosen from a contact sheet of the catalogue drawn at
  200x150 (the comment on the constant says why each won). A fractal's "whole"
  place is not used, since that is the opening view. `featuredPlace(fractal)`
  looks the id up and falls back to the Mandelbrot one for an id it does not
  know; it throws only if the id names no place, which the tests rule out.
- A named chip calls `handleSwitchConstant`: `wholeSetPlaceFor(name)` (the Julia
  place of that constant at `defaultViewFor("julia")`, compared as points) goes
  through `handlePlaceSelect`; with none, only the constant changes and the view
  stays. All four named constants have one (`julia-<name>-whole`). The chip of
  the constant already shown does nothing. Custom calls `handleSwitchCustom`:
  `handleJuliaSelect(CUSTOM_OPTION_VALUE)` (the select's own pick: the same
  point spelled as a custom name, no jump, no render), then opens the drawer
  with `focusJuliaRealRef` set; an effect on `settingsOpen` focuses the Real box
  (`Input` gained an `inputRef` prop) after the drawer's own effect has focused
  Close, since a child's effects run first. Opening the drawer by the Settings
  button leaves the flag false and focus where it was.
- `BlankHint` takes `belowChips` and sits at `top-14`, or `top-24` while the
  chips show, so it never lands on the switcher at any canvas width.
- `places.test.ts` tests `FEATURED_PLACE_IDS` and `featuredPlace` (one per
  picker fractal, in the catalogue, of that fractal, not the opening view, names
  its scheme, not blank at 64x48 and at least 20% of pixels off the corner) and
  `wholeSetPlaceFor`. `fractal-switcher-panel.test.ts` reads the sources: three
  buttons from `FRACTAL_TYPES`, `aria-pressed`, chips only for Julia, the stack
  level under the bar, hidden for a tour and the dialogs, the handlers, the Real
  box focus and the selects kept. `canvas-first-page.test.ts` lets the one
  focus effect list `settingsOpen`; nothing that draws may. Checked in headless
  Chrome at 1280x800 and 375x667: one entry per switch and Back returning,
  the selects following, Custom landing focus in Real, and the switcher gone
  while the drawer is open.

### Tour mode (2026-10-10)

- A screensaver: after about 20 s with no input, at once when the address is
  `#tour`, or at once when the top bar's Tour button is pressed, the page hides
  the bar, the strip and every control and hops place to place with a
  crossfade, about 8 s at each. Any key, touch, click, pointer move or wheel
  ends it and everything is back, on the place the tour was showing.
  Auto-wander is as it was.
- `src/lib/tourMode.ts` is the clock and the rules, with no DOM: `TourMode`
  (built once, timers read from the globals so the Vitest suite drives it on
  fake ones) holds a state, `idle` -> `armed` -> `playing` -> `stopped`, and
  the page's `TourConditions` (`overlayOpen`, `inputFocused`, `tabHidden`,
  `windowFocused`, `settled`). `TOUR_IDLE_START_MS` is 20000. `idle` is a
  page a tour may not start by itself on; `armed` is the idle wait running, or
  a start asked for waiting on the tab or the render; `stopped` is `armed` for
  a machine that has played, so the left-alone page tours again after another
  `TOUR_RESUME_MS` (15 s; see the 2026-10-10 note on Auto-wander hops). The events are `activity()`, `hashTour()`, `buttonStart()`, `stop()`
  and the hop timer; `setConditions(patch)` is how the page reports itself.
  The constructor starts no timer (the first `setConditions` does), so
  building one in a server render is harmless; `dispose()` goes back to `idle`
  so a strict-mode remount re-arms.
- Starting. The idle wait runs only where no drawer or Help is open, no text
  field is focused, the tab is visible and the window is focused. An ask
  (`hashTour`, `buttonStart`) is refused (returns false) only while a drawer,
  a dialog or a text field has the user's attention; otherwise it plays at
  once or, if the tab is hidden or the picture is not drawn, waits for both.
  Every start waits for `settled` (a full render has drawn the view on screen),
  so a tour never begins over a render in flight. Input does not withdraw an
  ask, since someone opened `#tour`; opening a drawer does.
- Playing. The first hop is made at the start (`onHop(true)`), then the dwell
  runs from each time the picture settles, so a slow render lengthens a stay.
  A hop that causes no render does not stall it. A hidden tab holds the hop
  timer and gives the next dwell in full when it is seen; a window losing focus
  does not stop a tour. A drawer, dialog or focused field appearing stops it.
- `page.tsx` holds `tourState` and the one flag `tourPlaying = tourState ===
  "playing"`. While it is true the top bar is not rendered, `NearbyStrip` gets
  `hidden`, the progress line and the blank-picture hint are left out, the stage
  has `data-tour="true"` (`globals.css`: no pointer, no focus ring on the
  canvas), and a `role="status"` line says "Tour playing. Press any key to
  stop." Stopping is the flag going false, which brings every one back; the
  drawer and Help are closed `<dialog>`s that a tour never touches.
- A hop is `nextTourStop(...)` over `PLACES` with `Math.random`, started from
  `initialTourState(placeView)` at the first hop, and goes through
  `handlePlaceSelect(place, { tour: true })` — the tile's handler, with
  `TOUR_CROSSFADE_MS` instead of `CROSSFADE_MS` and no `beginJump`. With
  `prefers-reduced-motion` the existing `startCrossfade` cut applies, and the
  dwell is unchanged because the clock knows nothing of motion.
- History. The address bar is left alone while a tour plays: the follower
  effect stands down on `tourPlaying`. The first hop writes the view being left
  into the current entry (`writeLeavingView`, the half of `beginJump` that does
  that), which is what replaces `#tour` or a `tour=1` link in the bar, and
  keeps that entry on the view before the tour. A tour's end counts as one jump
  (`seenTourState`, adjusted during the render that sees the flag fall, which
  bumps `jumpSerial`), so the follower makes the one `pushState` for the place
  on screen once it is drawn and the Nearby strip refreshes for it. A long tour
  adds no entry; Back after a stop returns to the view before the tour. This
  differs from replacing the entry on every hop, which would have lost that
  view. A `hashchange` calls `tourMode.stop()` first: a navigation made in the
  browser's own chrome sends the page no input event.
- Input. A capture-phase listener on the window for `TOUR_ACTIVITY_EVENTS`
  (`pointermove`, `pointerdown`, `keydown`, `touchstart`, `wheel`) calls
  `activity()`. A `pointermove` at the position the last one had is not input
  (`pointerMoved`): hiding the bar changes the page under a resting pointer and
  the browser reports a move at the same place. A repeated `keydown` is ignored
  while a tour plays, so a key held from before does not end it. Focus into an
  `INPUT`, `SELECT`, `TEXTAREA` or editable region (`isTextEntry`) sets
  `inputFocused`.
- Link. `decodeTour(fragment)` in `viewLink.ts` is true for exactly `#tour`, or
  for a link of version 1 with `tour=1`; a bare `tour=1`, another value or
  another version asks for nothing, and it never throws. `encodeView` and
  `decodeView` are unchanged, so a tour is never written and `#tour` decodes to
  no fields (the opening Mandelbrot view). `applyViewLink` calls
  `tourMode.hashTour()` after setting the view, so a load and a paste are the
  same path.
- `src/lib/wakeLock.ts`: `holdScreenAwake(navigator.wakeLock, document)` asks
  for a `screen` lock while the tour plays, asks again when the tab comes back
  (a browser drops it on hide), releases on stop, and swallows every failure.
- Auto-wander is held while a tour plays by the same `wander.setHidden` it uses
  for a hidden tab; it gets a fresh interval when the tour ends.
- The Tour button is in the top bar's centre beside Surprise me (the bar fits
  375 px with six buttons: the last ends at 367). The Help overlay has a Tour
  group (`helpEntries.ts`).
- Tests: `tourMode.test.ts` (fake time: 20 s of silence starts one, activity
  resets, activity while playing stops, the asks start at once, a drawer or
  field refuses, a render in flight or a hidden tab waits, dwell from the
  settle, dispose), `wakeLock.test.ts`, `viewLink.test.ts` (`decodeTour`:
  spellings, garbage, round trip), and `tour-mode-panel.test.ts` (sources: the
  button, one flag hiding the bar, strip, progress line and hint, the hop
  through the tile's handler, the follower standing down, the one entry at the
  end, listeners, the lock). Checked in headless Chrome at 1280x800 against the
  dev server: `#tour` starts with the bar and strip gone and the bar replaced
  by the view's link, a mouse move stops it and one entry is added, Back returns
  to the opening view; 22 s of quiet starts one and a key stops it; the button
  starts one and a click stops it, with Back and Forward moving between the
  views.

### A blank picture says so (2026-10-10)

- A deep scroll can land in a region with nothing to see (the owner reached 127x
  in a uniform field outside the set with no hint what to do). When a full
  render has settled on a nearly one-colour picture, `BlankHint.tsx` shows a
  small pill at the top centre of the canvas, "Nothing to see here. Try a nearby
  place, or go back.", with a Back button that is the top bar's `handleBack`
  (left out when `historyState.canGoBack` is false, leaving the text). The
  wrapper takes no pointer events, only the pill does, so the canvas under it
  still pans. It is a hint, not an automatic jump: nothing moves the view.
- `src/lib/blankView.ts`: `isBlankImage(pixels, width, height)` samples a 32x24
  evenly spaced grid, takes the commonest sampled colour, and is true when at
  least 98% of the samples are within 24 (sum of channel differences) of it. 15
  of the 768 samples off is blank, 16 is not. `canvasIsBlank(canvas)` reads the
  canvas down to 64x48 with `drawImage` and asks it, answering null (no hint)
  when the canvas cannot be read.
- `page.tsx` holds `blankLink`, the link of the view found blank, not a flag:
  the hint shows when it equals `currentLink`, so a view that moved on never
  shows the last one's hint. The effect asks only when `!isRendering` and
  `renderedLink === currentLink` (a settled full render, never a gesture's
  preview), after `BLANK_HINT_DELAY_MS` (600) so a flicker between renders or
  the 400 ms crossfade never shows it. Its cleanup clears `blankLink`, so a
  render or gesture starting hides the hint at once and the delay starts over.
- `blankView.test.ts` has the boundary cases and renders every catalogue place,
  and each fractal's default view in each colour scheme, at 64x48 through the
  renderer, asserting none is blank; it also shows the inside of the set and the
  field outside it are. `blank-hint-panel.test.ts` reads the sources for the
  wiring.

### Tour engine (2026-10-10)

- `src/lib/tour.ts` is the decision logic of a Tour and changes no screen
  itself (the Tour mode note above has the page that runs it). No browser API,
  no timers.
  `nextTourStop(state, places, rng)` returns `{ place, state }`; `TourState` is
  `{ view, recent, hopsSinceSwitch }` and `initialTourState(view)` makes one.
  The constants are `TOUR_DWELL_MS` (8000), `TOUR_CROSSFADE_MS` (1500),
  `TOUR_FRACTAL_SWITCH_ODDS` (1/6), `TOUR_RECENT_LIMIT` (12), plus
  `TOUR_SWITCH_LOCKOUT_HOPS` (2) and `TOUR_NEAR_CANDIDATES` (8). `tourMode.ts`
  owns the clock, the crossfade and the idle start.
- A hop draws `rng` twice, the switch roll then the pick, so a seeded walk
  replays. A hop within `TOUR_SWITCH_LOCKOUT_HOPS` of a switch cannot switch.
  Any other hop switches with the chance that makes **one hop in six** a switch
  over a long tour, not the plain 1/6: with the lockout, rolling 1/6 on the
  eligible hops gives 1/8 overall, and the acceptance rate is 1/6, so the roll
  is `odds / (1 - lockout * odds)` = 1/4. A switch picks a place of another
  fractal, preferring one not in `recent`.
- A hop that stays takes `suggest(view, places, places.length)` (the fractal's
  places but the one the view is on, nearest first), chooses by `rng` among the
  nearest 8 not in `recent`, and widens when that is empty: the unvisited places
  of the fractal past the nearest 8, then the nearest 8 again, then every other
  place of the fractal. The widening step between the spec's two fallbacks
  exists so a place is not repeated while the fractal has an unvisited one
  (Julia and the ship have 10 places against a window of 12). A fractal with no
  other place is left by a switch that skips the roll and the lockout.
- `recent` holds each id once, oldest first, at most 12. The place comes back as
  the catalogue has it: its colours are `placeColorScheme(place, current)`, the
  caller's to apply, so schemes change as places do and the engine invents none.
  With no other place anywhere the place the view is on comes back (found with
  `suggest`, so "is the view" is its tolerance), or a place made from the view
  when the catalogue is empty; neither throws.
- `tour.test.ts` runs the engine on a seeded generator: determinism and no
  mutation, never the current place, no repeat inside the window while the pool
  has an alternative, a bounded `recent`, the switch rate over 5000 hops within
  1/6 ± 0.03, a gap of more than two hops between switches, every fractal
  reached, a 200-hop run's shares, and empty, one-place, one-fractal and
  unmeasurable-view catalogues.

### Nearby tiles show what the click shows (2026-10-10)

- A tile was drawn in the page's current colour scheme while a click applied
  `place.colorScheme ?? colorScheme`, and every place in the catalogue names
  a scheme, so a tile and its destination were in different colours (mean
  difference of 43 to 97 out of 255 on staging). `placeColorScheme(place,
  current)` in `places.ts` is now the one rule: the place's scheme when it
  names one, else the page's. `Tile` in `NearbyStrip.tsx` asks the thumbnail
  store for that scheme and `handlePlaceSelect` sets it, so they cannot drift;
  the page's scheme is only the fallback for a place that names none.
- The strip's list key is the places alone, no longer the page's scheme. A
  colour change used to cancel the queue and remount every tile; now a tile
  whose place names its own scheme has the same `place` and `scheme` in its
  effect and is not asked or repainted, and a tile that follows the page asks
  again by itself. The cache key was already `place.id|scheme`, so a place with
  its own scheme is only ever cached under it.
- The same comparison showed a second cause. A pixel's colour is its iteration
  count over the maximum, and thumbnails drew at half of `autoIterations`
  (`thumbnailIterations`, removed), so even in the right scheme they sat on a
  different part of the palette: 3 to 118 per channel against the click's
  picture, with the scheme held equal. They draw at `autoIterations(zoom)`
  now, which at 64x48 costs next to nothing.
- `places.test.ts` tests `placeColorScheme` and, for every place and each of
  the five schemes as the page's, that the tile's scheme is the click's.
  `placeThumbnails.test.ts` renders every place's thumbnail and, separately,
  the picture the click draws (same view and 4:3 shape, Auto's count, the
  shared scheme) at 64x48 and fails above a mean difference of 1 per channel;
  the measured difference is 0.00 for all 39, and a tile in the wrong scheme
  is shown to exceed the bound. `nearby-strip-panel.test.ts` reads the sources
  for the shared call at both sites and the scheme-free list key.

### Wheel zoom follows the scroll amount (2026-10-10)

- `ZoomPanManager.handleWheel` zoomed by exactly 10% per event whatever the
  event's size. A mouse notch is about one event, so that felt right, but a
  trackpad swipe is dozens of tiny events plus momentum after the fingers lift,
  so one light swipe zoomed 2x to 20x. On the canvas-first page every scroll is
  a zoom, and the owner landed at 127x in a blank field outside the set.
- `src/lib/wheelZoom.ts`: `wheelZoomFactor(deltaY, deltaMode, ctrlKey,
  viewportHeight)` is `exp(-delta * k)`. The delta is `deltaY` in pixels, lines
  times 16, or pages times the viewport height (a `deltaMode` it does not know
  is pixels), clamped to +-120 after that conversion so one huge event cannot
  jump. `k` is 0.0016 for a plain wheel (a 100-unit notch is 1.17x, near the
  old 1.1) and 0.01 with Control held, because a trackpad pinch arrives as
  Control+wheel with small deltas. A zero or non-finite delta is 1.
- Because the factor is an exponential, scroll adds up: 30 events of 3 are one
  event of 90 (about 1.15x), and zooming in then out by the same delta
  multiplies to 1, so a reversal returns the bounds.
- Only the factor changed. `zoom()` still centres the new view on the complex
  point under the cursor and `clampZoom` still limits it; `handleWheel` still
  returns null for a zero `deltaY` and calls `preventDefault` otherwise
  (Control+wheel included, so the browser does not zoom the page). The gesture
  start and end reporting in `canvasNavigation.ts` is untouched. The Help row
  and README name no step size, so neither changed.
- `wheelZoom.test.ts` drives the function; `zoomPan.test.ts` drives
  `handleWheel` through a swipe, a round trip, line mode, Control and the
  clamp; the notch in `canvasNavigation.test.ts` is `wheelZoomFactor(-100, ...)`
  rather than a literal 1.1.

### Pinch to zoom (2026-10-09)

- Two fingers on the canvas zoom it. `src/lib/pinch.ts` holds the pure parts:
  `touchDistance`, `touchMidpoint`, `pinchFactor` (the new distance over the
  last step's, and 1 when either distance is zero or not a number, so fingers
  on one spot never divide by zero) and `scaleAboutPoint(bounds, from, to,
  factor, width, height)`, which scales the view so the point that was under
  `from` ends under `to`. With `from` and `to` the midpoint at the previous
  and the current step, one call is both the zoom and the pan of a pinch whose
  fingers travel together.
- `scaleAboutPoint` clamps the new zoom with `clampZoom` (1x to 10000x, the
  wheel path's limits) *before* it works out the anchor. The page clamps the
  zoom again in `applyView`, but it keeps the centre it was given; clamping
  only there would let a pinch at a limit slide the anchor off the fingers.
- `ZoomPanManager` keeps a `pinchState` (the distance and midpoint of the last
  step, in canvas pixels). A touchstart with two or more touches ends any pan
  and measures the first two; touchmove with two or more steps the pinch; a
  touchend that leaves one finger down hands over to `startPan` at that
  finger, so the view does not move until the finger does; one that leaves
  two or more re-measures the pair. `handleTouchEnd(event?)` without an event
  ends everything, which is what `touchcancel` does. A move with no start (the
  listener attached with fingers down) is taken as the baseline and moves
  nothing.
- `canvasNavigation.ts` calls `preventDefault` on `touchmove` while two or
  more fingers are down (the listener was already non-passive; the canvas also
  has `touch-action: none`). A touch is one gesture from the first finger down
  to the last finger up, opened once and closed once however it changes
  between pan and pinch: ending it when the touches fall below two would draw
  a full-resolution picture only for the hand-over pan to cancel it.
  `touchcancel` closes it at once.
- A pinch goes through `applyView` like the wheel and a drag, so it counts as
  no deliberate move: the address bar's current entry follows it and no entry
  is pushed.
- `pinch.test.ts` drives the helpers (scale up and down, anchor fixed, both
  limits, zero distance, shape kept); `zoomPan.test.ts` and
  `canvasNavigation.test.ts` drive the manager and the listeners, including
  the hand-over to a pan, the three-finger re-measure, cancel and the single
  start and end of a gesture. `helpEntries.ts` has a "Two-finger pinch" row.

### Guided-exploration design is in the repo (2026-10-09)

- `docs/design/guided-exploration.md` is the design the canvas-first page, the
  Nearby strip, Surprise me, Back and Forward, and the Settings drawer were
  built to, as approved on 2026-10-09. Its "As built" section lists where the
  code differs from the text (the top bar's order, pinch built after the
  first landing, the strip's six tiles from a pool of 18, thumbnails paused
  rather than started late, no in-memory history fallback); the code is the
  truth.
- README, this file and the Help entries were audited against the code in the
  same landing. The README's Project Structure tree now names every module
  under `src/components/ui` and `src/lib`, including `surprise.ts`, and the
  Help overlay gained a Settings row (`helpEntries.ts`), the one control the
  top bar has that it did not name.

### Surprise me; Random walk becomes Auto-wander (2026-10-09)

- The top bar has a centre button, "Surprise me" (`TopBar.tsx`): under `sm`
  the bar is a flex row with the title drawn only for a screen reader (still
  the page's `<h1>`), from `sm` up a three-column grid with the button in the
  middle. A press picks one place at random and goes there through
  `handlePlaceSelect`, the Nearby tile's own handler, so the crossfade and the
  single history entry are the tile's; `handleSurprise` has no setters or push
  of its own.
- `src/lib/surprise.ts`: `surpriseTarget(view, places, pick = Math.random)`
  takes `suggest(view, places, SURPRISE_CANDIDATES)` (6, the strip's lead
  page) and indexes it with `pick()`. `suggest` already leaves out the place
  the view is, so a surprise is never where you are; a `pick` outside [0, 1)
  or not a number is held to the ends of the list; an empty list is `null`.
  The page asks it with `() => 0` whether any place exists and disables the
  button when none does (`canSurprise`). It reads the view from the page's
  state (`placeView`), at the press, so a second press right after the first
  starts from the place the first chose and the renderer cancels the old
  render the way any other move does.
- The Random walk checkbox, its seconds box and the countdown line left the
  Navigation card for a card of their own, headed "Auto-wander", right after
  it; the checkbox reads "Auto-wander". `wander.ts` and `wanderController.ts`
  are untouched, and so is every other word of the control. The Help overlay's
  group is "Auto-wander" and has a "Surprise me" row in Nearby places; the
  README says the same.
- `surprise.test.ts` drives the helper (never the current place, respects
  `pick`, empty and unmeasurable cases); `surprise-panel.test.ts` reads the
  sources for the button's name and place, the handler going through the
  tile's, and the Auto-wander card; the card order test in
  `canvas-first-page.test.ts` includes it.

### Nearby strip, Back and Forward (2026-10-09)

- A strip over the bottom of the canvas (`NearbyStrip.tsx`, inside the wrapper
  that is exactly the canvas's size) shows six places from
  `suggest(view, PLACES, ...)` as 64x48 thumbnails, headed "Nearby, worth a
  look", with a More tile after them. A tile is a `<button>` whose accessible
  name is the place (`aria-label`); its caption is `aria-hidden`, shown on
  hover, on `focus-visible`, and always where there is no hover. The row
  scrolls sideways; only the tiles take pointer events, so the canvas under
  the gaps still pans. It renders nothing for an empty list.
- The pictures come from a `createThumbnailStore` the component owns, drawn in
  `placeColorScheme(place, colorScheme)`: the place's own scheme, else the
  page's. The page passes `paused={isRendering}`,
  which is `store.pause()`/`resume()`, so the strip never competes with the
  picture being waited for. Tiles are keyed by the list and ask the
  store when they mount and draw straight onto their canvas when it answers (a
  cached one is immediate, no state); a changed list `cancelAll()`s in the
  cleanup that runs before the new tiles ask. A failed thumbnail is the store's
  flat grey and the tile still works.
- The strip does not fade; only the top bar does (fr-s8f). It first shared the
  bar's `useIdleVisibility`, which hid it after two quiet seconds, exactly when
  a visitor lost in an empty field needed it. It is now always shown
  (`data-visible="true"`, no opacity transition, its row always taking pointer
  events), and `useIdleVisibility(hold)` is the bar's alone, so the hook lost
  its `resetKey`. `hidden` is an optional prop (default false): true renders
  nothing, so no tile mounts and the store is asked for nothing, and the
  `cancelAll` cleanup also runs on a change of `hidden`. It is for Tour mode to
  hide the strip, which it does. The strip's height, gradient and tile size are as
  they were.
- Suggestions refresh by `nearbyRefreshDue` (`nearbyStrip.ts`): a full render
  has settled on the view (`renderedLink === currentLink`) and the count of
  deliberate moves is not the one the list was worked out at. A deliberate move
  is `jumpSerial + linkArrivals` — the jumps `beginJump` counts, plus every
  link put into effect (`applyViewLink`: the load's, a paste, Back, Forward).
  Wheel, drag, keys, sliders and walk steps go through `applyView`, which
  counts nothing, so they leave the strip alone; the first settled render of a
  visit refreshes because nothing has been suggested yet. The refresh is state
  adjusted during the render that sees the settle (the page's usual pattern;
  `react-hooks/set-state-in-effect` is an error here), and works out a pool of
  18 (`NEARBY_POOL_SIZE`) so More has pages to rotate: `nearbyWindow` takes six
  from `offset`, wrapping, and `nextNearbyOffset` advances by a page. More is
  offered only when the pool is larger than a page.
- A click is `handlePlaceSelect`: it works out the link the place will settle
  on with `encodeView` and returns if it is the link already shown (a flight
  that causes no render would otherwise leave the crossfade waiting forever),
  then `beginJump()` and the setters a preset uses — fractal, the Julia
  constant for a Julia place, centre, zoom, the place's colour scheme if it
  names one — plus `setAutoIterationsOn(true)`, because the catalogue says each
  place is drawn at the count Auto picks for its zoom. Canvas size and the
  by-hand iteration count are left alone. It pushes no entry itself: the
  follower makes the one, as for a preset.
- The crossfade is a second `<canvas>` over the first (`crossfadeRef`, with
  `aria-hidden` and no pointer events). `startCrossfade(target)` copies the
  canvas into it at full opacity, unless `prefers-reduced-motion: reduce`
  matches, and an effect on `[currentLink, renderedLink]` fades it out over
  `CROSSFADE_MS` (400) once `renderedLink` is the target — or as soon as
  `currentLink` has moved off it, so a drag during a flight cannot strand the
  old frame. "The first full-resolution pass" is the finished full render;
  previews do not set `renderedLink`. The opacity is set on the element, not
  held in state, because nothing renders from it.
- Back and Forward in `TopBar` call `history.back()` and `history.forward()`
  and add no listener: the fragment change lands on the existing `hashchange`
  path. They are disabled from `historyButtons(journey)` (`journey.ts`), held in
  `historyState` because the `Journey` is a mutable object a render cannot see
  into; `syncHistoryButtons` is called after `journey.push` (in `pushViewLink`)
  and after `journey.arrive` (in the `hashchange` listener), the only two moves
  that change whether either direction is open. Their accessible names are
  "Back" and "Forward".
- The Presets card is the dropdown alone; the button row and the clipped-label
  problem it had are gone. Saved views and custom presets stay in the drawer.
- `nearbyStrip.test.ts` drives the refresh policy, the window and the offset;
  `journey.test.ts` grew `historyButtons`; `nearby-strip-panel.test.ts` reads
  the sources for the label, the tile buttons, More, the focus hold, the pause,
  the click's setters, the crossfade and the top bar buttons;
  `preset-button-labels.test.ts`, kept at its path, now says the button row
  stays gone.

### One place for position and zoom (2026-10-09)

- Inside the Settings drawer the Center X and Center Y sliders and the View
  Info card (`ZoomDisplay`, deleted with its file) are gone; each thing now
  appears once. The Navigation card keeps the Zoom Level slider, Zoom In, Zoom
  Out and Reset View, and the card that held View Info is headed "Coordinates":
  a read-out line over `CenterControls` (the Center Coordinates boxes with Apply
  and Reset). The Manual Coordinates card is unchanged.
- The read-out is `describeView(bounds)` in `src/lib/viewReadout.ts`, a
  `role="status"` paragraph: `Zoom 400x at -0.7453, 0.1127`. The zoom goes
  through `formatZoom` and the centre through `formatCoordinate`, the helper the
  boxes below it use (six significant digits), so line and boxes never disagree
  about one view. It is not the link's ten-digit rounding: that would print a
  centre fifteen characters wide on a line meant to be glanced at. It reads
  `bounds`, which every setter that moves the view already updates, so it
  follows drags, presets, links and the walk with no state of its own.
- Handlers and state are untouched: `centerX`/`centerY` and their setters
  remain, since the gestures, links, presets and the walk all write them; only
  the slider handlers that called them are gone.
- `src/lib/__tests__/viewReadout.test.ts` covers the Mandelbrot and Julia
  opening views, a deep zoom, negative centres and long float noise;
  `canvas-first-page.test.ts` now fails if either slider or the card returns.

### Canvas-first page: top bar and Settings drawer (2026-10-09)

- The page is the picture. `page.tsx` no longer has a heading block or a
  two-column layout: a `.fractal-stage` (`globals.css`) is the viewport's height
  with `--top-bar-height` (3rem) cleared at the top, and the canvas is sized by
  `.fractal-canvas` to the largest `min(100vw, (100dvh - bar) * aspect)` wide, at
  the aspect of its own resolution (`--canvas-aspect`, set by the page from
  `canvasWidth / canvasHeight`; 4:3 unless the size boxes say otherwise). The
  page cannot scroll. Checked in headless Chrome at 1280x800 (1003x752 canvas)
  and 375x667 (375x281).
- The render progress bar is a 4 px line on the canvas's top edge inside a
  wrapper that is exactly the canvas's size; "Rendering... N%" is an `sr-only`
  `role="status"` line. The sub-line under the old heading is gone — the Help
  overlay says it.
- `TopBar.tsx` holds the page's `<h1>Fractal Explorer</h1>` (the integration
  check reads it from the prerendered HTML), a Help button and a Settings button
  that takes a ref, so the drawer can hand focus back to it. It fades through
  `createIdleFade` (`idleFade.ts`): visible with a 2 s wait running at load,
  `activity()` on a window `pointermove`, `pointerdown`, `keydown` or
  `touchstart`, and a *held* clock that never starts a timer. Held means the
  drawer is open or a control in the bar has *keyboard* focus
  (`:focus-visible`) — a mouse click also focuses a button and the drawer
  returns focus to Settings, so holding on any focus would pin the bar after one
  use. The owner makes a new clock whenever the hold changes, which is what
  gives the bar a full wait after the drawer closes; the bar is made visible for
  that change during render rather than from the effect. A faded bar takes no
  pointer events, so the touch that brings it back does not also press a button.
- `SettingsDrawer.tsx` is a native `<dialog>` shown with `showModal()`, the way
  `HelpDialog` is, so Escape, the inert page and focus moving in are the
  browser's; the Close button and a click on the dialog element itself (the
  backdrop — the panel inside has no padding on the dialog) close it through the
  same `onClose`. It is a panel against the right edge, 28 rem wide, and a bottom
  sheet (full width, `max-h-[85vh]`, scrolling) under `md`. It never puts a
  `display` class on the dialog, which would override its closed `display: none`.
  Focus goes to the Close button on open (Chrome would pick the scrolling panel)
  and back to the Settings button on close.
- The cards are the drawer's children and stay mounted while it is closed, so
  opening and closing it changes no state, starts no render and cancels none;
  the cards, their handlers and the wander and link logic are as they were, in
  the same order. Download PNG, which had sat under the canvas, is a card of its
  own after the saved views, and `VersionFooter` is the drawer's last child.
- The `?` listener is on the window and unchanged, so it still opens Help from
  anywhere, including over an open drawer, where Help stacks above it.
- `src/__tests__/canvas-first-page.test.ts` reads the three sources for the
  dialog attributes, the close paths, the card order, the hold rules and the
  stage CSS; `src/lib/__tests__/idleFade.test.ts` drives the clock on fake
  timers; `help-overlay-panel.test.ts` now finds the Help button in the bar.

### Deliberate jumps are browser history entries (2026-10-09)

- The address bar followed the view with `replaceState` alone, so the browser's
  Back left the page after any amount of exploring. A jump now makes a history
  entry: a preset (built-in or saved), Apply Coordinates, a pick from the
  Fractal select and a pick from the Julia constant select. Wheel, drag, keys,
  the zoom buttons, Reset View, a random-walk step and the sliders still only
  rewrite the current entry, exactly as before; the throttle
  (`shouldWriteLink`, 500 ms) is untouched for them.
- A jump handler calls `beginJump()` in `page.tsx`, which does two things. It
  writes the view being left into the current entry first (only if that view
  has been drawn), because the follower may be holding that write back for the
  throttle and the jump's render would cancel it; and it bumps `jumpSerial`.
  The follower effect compares that count with `handledJumpRef` once the jump's
  view has been drawn, and then calls `pushViewLink` instead of the throttled
  write: one `history.pushState` for the new fragment, past the throttle. The
  count is state, not a flag, because a jump that lands on the view already
  shown causes no render of its own; `pushViewLink` returns when the address
  bar already holds the fragment, so such a jump makes no entry.
- Back and Forward are not a second path. They change the fragment, so the
  existing `hashchange` listener (fr-psx) applies it through `applyViewLink`;
  the listener first tells the journey with `journey.arrive`. A view equal to
  the one on screen sets nothing, so no render starts. A pasted link is a real
  browser entry already (it is an address-bar navigation), so it needs no
  push, and `arrive` records it as a new step. `popstate` is not listened to.
- `src/lib/journey.ts` is the record of what the page believes the entries
  are, so tests can assert it without a browser. `Journey` holds fragments as
  `window.location.hash` gives them (`#v=1&...`, and `""` for the entry the
  page opened on when it had none). `push` drops the entries ahead and ignores
  the fragment already current; the oldest is dropped past 200
  (`MAX_JOURNEY_ENTRIES`); `replace` is what the follower's `replaceState`
  does to the current entry; `arrive(fragment)` matches a fragment against the
  entry before, then the entry after (so a view on both sides of the current
  one follows Back, which leaves the current fragment right), else pushes it.
  The browser keeps the entries; the journey is only the page's record, so a
  Back past the page's own entries (after a reload, say) arrives as a new step
  rather than moving the journey.
- Typing in the Real and Imaginary boxes is not a jump. It fires on every
  readable keystroke and goes to `handleJuliaConstantChange` directly, so it
  rewrites the entry the Custom pick belongs to instead of leaving one per
  digit; choosing Custom changes the controls and not the picture, so it makes
  none either.
- If `pushState` throws, `pushViewLink` writes the fragment with `replaceState`
  instead (itself guarded) and the journey keeps the step; nothing reaches the
  user.
- `src/lib/__tests__/journey.test.ts` covers the stack;
  `src/__tests__/journey-history-panel.test.ts` reads `page.tsx` for the
  wiring a Node suite cannot render — which handlers begin a jump and which do
  not, the push after the draw and past the throttle, the `hashchange` path.
  The check in `share-link-panel.test.ts` that the page never pushes now says
  there is exactly one `pushState` and the follower's writer has none.

### Place thumbnails (2026-10-09)

- `src/lib/placeThumbnails.ts` is the second step of guided exploration and
  changes no screen: nothing in the page imports it yet; the Nearby strip does.
  `createThumbnailStore({ render, width = 64, height = 48, capacity = 120 })`
  returns `{ request(place, scheme, onReady), cancelAll(), get(place, scheme),
  pause(), resume() }`. The store owns no canvas: `render` is injected, so the
  queue and cache are tested with a fake, and `createCanvasThumbnailRender` is
  the real one.
- Results are cached by place id and scheme in an LRU of `capacity`; `get` and
  a cached `request` both count as a use. A `request` of a cached entry calls
  `onReady` before it returns; concurrent requests for one key join the one
  render, queued or running. Renders run one at a time in request order, and
  each starts on a `setTimeout(0)` of its own, so the browser gets a turn
  between pictures and a `pause()` in the same turn as a `request` lands
  before anything is drawn.
- `cancelAll` drops the queue, aborts the render in flight through the
  `AbortSignal` it was given, and never calls any dropped `onReady`. It
  forgets the running job at once rather than waiting for it, so the next
  request starts fresh, and a cancelled render that finishes late is ignored
  by job identity: it neither fills the cache nor frees the slot of the render
  that replaced it. The cache and the `pause` state survive it.
- `pause()` stops new renders but lets the one running finish: a 64x48 picture
  is a few thousand pixels, so aborting it costs more than it saves. The strip
  pauses while the main render runs. Cached entries are still answered.
- A render that rejects, throws, or returns an image not of the asked size
  caches a `{ status: "failed", placeholder, reason }` marker for the life of
  the store, in a map outside the LRU so eviction cannot make a place that
  cannot be drawn retry in a loop. `placeholder` is the flat grey the strip
  draws; `onReady` gets the failed entry too. `get` never throws. A listener
  that throws does not strand the others or the queue; the error is rethrown
  on a timer so it still surfaces.
- The real render draws with `FractalRenderer` on an `OffscreenCanvas`, or a
  detached `<canvas>` where there is none, one canvas and renderer per call so
  an aborted render cannot paint over the next. It draws at
  `autoIterations(zoom)`, the count a click on the tile draws the place at
  (see the 2026-10-10 note below for why it is no longer half of that). An
  abort rejects instead of returning the half-drawn canvas.
- `src/lib/__tests__/placeThumbnails.test.ts` runs the store on fake timers
  against a render the test finishes by hand — cache hit, LRU order,
  in-flight sharing, ordering, cancel mid-render and a late finish, failure
  markers, pause and resume — and renders a Mandelbrot, a Julia and a Burning
  Ship place through the real renderer at 64x48 on the Node canvas stand-in,
  asserting at least 5% of each picture differs from its corner pixel.

### Places and suggest() (2026-10-09)

- `src/lib/places.ts` is the first step of guided exploration and changes no
  screen: nothing in the page imports it yet. A `Place` is `{ id, name,
  fractal, juliaConstant?, centerX, centerY, zoom, colorScheme? }` — the fields
  a link and the page's own state already carry — so going to one is setting
  what a link sets. `PLACES` holds 19 Mandelbrot, 10 Julia and 10 Burning Ship
  places and `placesForFractal(id)` filters it in catalogue order.
- The numbers were picked from renders, not worked out: candidates were drawn
  headless at low resolution onto contact sheets, the striking ones kept, and
  their centre and zoom written in as the render had them. The six Mandelbrot
  built-in views and the Julia and ship ones are in the catalogue under their
  own numbers, with one exception: the whole-set place of each fractal sits at
  `defaultViewFor`, not at the overview preset's frame (which is centred at
  -0.5, not -0.75), so the view the app opens on is itself a place and
  `suggest` never offers it back to a visitor who has not moved.
- `suggest(view, places, count)` is pure and deterministic. It keeps places of
  the view's fractal, drops the one that *is* the view (centre within 1% of the
  view's span and zoom within 1%, same Julia constant), and ranks the rest by
  the centre's distance measured in the view's own spans plus the zoom's
  distance in octaves from two octaves deeper than the view — the step a click
  should usually be. A tie breaks by id. For a Julia view the places that share
  its constant (compared as points, so `custom:0.50,0.5` is `custom:0.5,0.5`)
  come first, each group ranked on its own; a view with no readable constant
  shares one with nothing. A view that cannot be measured, or a count under 1,
  returns `[]`; a larger count returns what exists.
- `src/lib/__tests__/places.test.ts` drives `suggest` over hand-built
  catalogues and holds every `PLACES` entry to the same guards: a unique id and
  name, a kind `resolveFractalKind` returns for its fractal, a finite centre
  with a zoom inside `MIN_ZOOM`..`MAX_ZOOM`, an `encodeView`/`decodeView`
  round trip that returns the same numbers (so a centre carries at most ten
  significant digits), and a 64x48 render at `autoIterations(zoom)` with the
  existing renderer in which at least 5% of the pixels differ from the corner
  pixel.

### Preset button labels are no longer clipped (2026-10-09)

_Superseded: the Nearby strip replaced the button row, which is gone; what
follows is how it was, and `preset-button-labels.test.ts` now asserts the row
stays gone instead of measuring its classes._

- The built-in view buttons asked for six columns from `lg` up, but from there
  the Presets card is the fixed `w-96` column beside the canvas, not a share of
  the viewport: each button got about 26px of text width and "Julia: Classic"
  read "Classi". The grid is `grid-cols-2 sm:grid-cols-3 lg:grid-cols-2` now,
  and a button carries `min-w-0 break-words`, so a name that does not fit wraps
  inside its button. Labels and the `Julia:` prefix are unchanged.
- `src/__tests__/preset-button-labels.test.ts` read `PresetSelector.tsx` for
  the classes that decided this — a column count past three, a missing
  `lg:grid-cols-2`, a button that cannot shrink or wrap, and any
  `truncate`/`whitespace-nowrap`/`overflow-hidden`/fixed-width class — since
  the Node suite has no layout to measure.

### Custom Julia constant controls (2026-10-09)

- The Julia constant select offers a fifth option, "Custom", after the named
  four. While `juliaConstant` is a readable custom name the select shows it and
  two labelled text boxes, Real and Imaginary (`inputMode="decimal"`), sit under
  it holding the point's numbers; for a named constant the boxes are not
  rendered. The option's value is `CUSTOM_OPTION_VALUE`, which is neither a
  constant's name nor a custom name, so the page can tell a pick of Custom from
  a pick of a constant; `juliaConstant` itself never holds it.
- Choosing Custom from a named constant writes that constant's point through
  `customConstantName` and does nothing else: the same picture, spelled as a
  custom name, so the view is not reframed. It is `handleJuliaSelect`, which
  hands every other pick to `handleJuliaConstantChange` unchanged.
- `src/lib/customConstantInput.ts` is the pure step between the boxes and the
  name: `parseCustomConstantInput(realText, imaginaryText)` answers
  `{ constant }` (the `custom:<re>,<im>` name) or `{ error }` (one sentence,
  the Real box judged first). A box is a plain decimal, optionally signed, from
  -2 to 2 inclusive after trimming; an empty box, text, exponent notation
  (`1e3`), a comma used as the decimal separator (`0,5`, which gets its own
  sentence) and a number past the range are all errors. `isCustomJuliaConstant`
  is the predicate behind the select's value and the boxes' guard.
- `editJuliaInput` runs that on every keystroke. An error is shown under the
  boxes as a `role="status"` paragraph in a `min-h-5` container of its own, like
  the coordinate messages, and returns before `juliaConstant` is touched, so the
  last valid constant stays drawn and nothing is cancelled or redrawn. A valid
  pair goes to `handleJuliaConstantChange`, the select's own handler, so the
  renderer's cancel-and-redraw path and the default reframing are unchanged and
  the address bar follows by the existing link path. A pair that names the
  constant already held (`0.50` for `0.5`) is skipped, so retyping a digit does
  not reframe the view.
- The boxes hold what was typed (`juliaRealText`, `juliaImaginaryText`), and
  follow the constant when it moves for another reason — a link, a pasted
  fragment, a saved view, the select — by adjusting during the render that sees
  a new name, against `syncedJuliaConstant`. A name the boxes themselves
  produced is recorded as synced where it is set, which is what stops a half
  typed `0.` being rewritten to `0`. That render also clears the message.
- `src/lib/__tests__/customConstantInput.test.ts` covers the listed cases
  (empty, `abc`, `1e3`, `2.0001`, `-2`, `0.5`, surrounding spaces, the comma);
  `src/__tests__/custom-julia-constant-panel.test.ts` reads `page.tsx` for the
  wiring a Node suite cannot render.

### A constant can be any point, written out (2026-10-09)

- A Julia constant is a point of the plane and the app carries one as a string
  everywhere — the page's state, a preset's `juliaConstant`, a link's `k=` — so
  the four named ones are four of those strings and a fifth spelling names any
  other point: `custom:<re>,<im>`, for example `custom:-0.8,0.156`. This landing
  is the format and the readers; the controls that produce one are the section
  above it.
- `src/lib/julia.ts` owns the spelling: `CUSTOM_CONSTANT_PREFIX`,
  `customConstantName(real, imaginary)` (each part rounded to six decimals and
  written as plain decimal digits with the trailing zeros dropped, at most 26
  characters), `parseJuliaConstant(value)` (`ComplexNumber | null`: a named
  constant, a well-formed in-range custom name, or null) and
  `isJuliaConstantName(value)`, a narrowing predicate. Both parts are limited
  to ±2, inclusive, which is the box every named constant and every point of
  the Mandelbrot set sits in; a part outside it, a part that is not finite, and
  a whole string past `MAX_CUSTOM_CONSTANT_LENGTH` (40) have no name and no
  parse. The pattern is anchored, so `custom:0.5,0.5x` is no name rather than
  the point at the front of it, and the prefix is case-sensitive.
- `parseJuliaConstant` never throws and never guesses, which is what lets each
  caller keep the fallback it already had: `resolveFractalKind`
  (`src/lib/fractalTypes.ts`) draws the first named constant for a name it
  cannot read, `presetJuliaConstant` (`src/lib/presets.ts`) names that constant
  so the select and the canvas agree, the `k=` reader
  (`src/lib/viewLink.ts`, `constantNamed`) drops the field, and
  `viewLinkToUpdates` (`src/lib/viewLinkState.ts`) asks again and leaves the
  page's own constant standing. A custom name that *is* readable survives a
  link round trip and a save/load byte for byte, because a name is stored and
  carried as text and is never re-rendered from its numbers.
- The page's own preset format is unchanged: a custom constant is another value
  in the `juliaConstant` string it already had.

### Help overlay (2026-10-09)

- A Help button under the page heading, and the `?` key, open a dialog headed
  "How to use the explorer" listing every way to drive the explorer. Until now
  the only hint was the one subtitle line under the heading.
- `src/components/ui/HelpDialog.tsx` is a native `<dialog>` shown with
  `showModal()`, so Escape, the inert page behind it and focus returning to the
  element that opened it are the browser's, not the component's. It is always
  mounted and the `open` prop only drives `showModal()` and `close()`; a click
  whose target is the dialog element itself is the backdrop, and the element's
  own `close` event — fired by Escape as well as by `close()` — is the one exit
  all three ways report through. `aria-labelledby` points at the heading.
- `src/lib/helpEntries.ts` holds `HELP_SECTIONS`, the four groups the dialog
  renders (Mouse and touch, Keyboard, Random walk, Views and links; later
  Nearby places was added and Random walk became Auto-wander) as
  `{ title, entries: { keys, action }[] }[]`. It lists only what this build
  really does — one-finger drag, and a two-finger pinch since fr-5p9 (see the
  Pinch section above); it had been "no pinch" while `zoomPan.ts` ignored a
  touch with more than one finger.
- The `?` listener is on the window rather than the canvas, because help has
  to be reachable with focus anywhere on the page; the canvas-local arrow keys
  cannot do that. `opensHelpShortcut` is that decision as a pure function, so
  the Node suite drives it directly: it fires for the `?` key only, refuses
  Control, Meta and Alt (Shift is how `?` is typed, so it is not refused),
  and refuses a press whose target is an `INPUT`, `SELECT`, `TEXTAREA` or an
  editable region. `page.tsx` builds that descriptor off the `KeyboardEvent`
  and calls `preventDefault()` before opening, so Chrome's quick-find — which
  is also bound to `?` — does not cover the page.
- `src/lib/__tests__/helpEntries.test.ts` checks the data's shape — every
  section titled and non-empty, every entry with keys and an action, no key
  named twice within a section — and drives `opensHelpShortcut` over each of
  its refusals. `src/__tests__/help-overlay-panel.test.ts` reads the sources
  the way the manual coordinates and share link tests here do: it walks the
  Keyboard rows against `src/lib/canvasNavigation.ts`, failing if the help
  names a canvas key (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `+`,
  `-`) the `keyNavigationBounds` switch does not read, and checks the modal
  wiring, the labelled title, the three exits, and that the Help button sits
  under the heading and above the canvas.
- Verified in headless Chrome against the production build: both ways in open
  the dialog, Escape, Close and the backdrop close it, focus lands inside on
  open and returns to the Help button on close, Tab never leaves the dialog
  (the page behind it is inert), and a `?` typed into a number field or with
  Control held opens nothing.

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
  is set) and `/og-card.png`, the social card `src/app/layout.tsx`
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
  fetches the route after the page is up, so the page itself does not wait on it, and
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
  view's own float64, so a short display costs no precision. The read-out line
  above the boxes (`viewReadout.ts`) formats through the same helper.

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
  the Zoom Level slider and the read-out above the coordinate boxes format with it, so a notch that
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
  `PresetSelector`, and `ZoomDisplay`, since removed) take no implicit `children`, so the 19 types
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
