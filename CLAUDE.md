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
- **Julia sets** (`src/lib/julia.ts`): The four named Julia constants, the `custom:<re>,<im>` spelling that names any other point, and the factory that turns one into a fractal kind
- **Custom constant input** (`src/lib/customConstantInput.ts`): The Real and Imaginary boxes' text turned into a `custom:<re>,<im>` name or the sentence that says why not, and the Custom option's select value
- **Burning Ship** (`src/lib/burningShip.ts`): The Burning Ship formula — the Mandelbrot loop with both parts of z folded onto the positive side before squaring — behind its own fractal kind
- **Wander step** (`src/lib/wander.ts`): One Auto-wander step — a view near the current one that a coarse sample says is worth looking at, drawn from an injected generator so a walk replays
- **Surprise target** (`src/lib/surprise.ts`): Where the top bar's Surprise me goes — one of the six `suggest` places, picked by an injected random function, or null when there are none
- **Wander controller** (`src/lib/wanderController.ts`): The Auto-wander clock — the countdown that says when a step is due, and the states that suspend it: a render in flight, a hidden tab, the mode switched off
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
- **Top bar** (`src/components/ui/TopBar.tsx`) and **idle fade** (`src/lib/idleFade.ts`, `src/components/ui/useIdleVisibility.ts`): The floating title/Back/Forward/Help/Settings bar, the clock that fades it after two seconds without input, and the hook that holds it up on focus and shares the clock with the Nearby strip
- **Nearby strip** (`src/components/ui/NearbyStrip.tsx`) and **strip policy** (`src/lib/nearbyStrip.ts`): The "Nearby, worth a look" thumbnails laid over the bottom of the canvas, and the pure rules behind them — when the suggestions refresh, which page of them shows, the crossfade time
- **Settings drawer** (`src/components/ui/SettingsDrawer.tsx`): The modal `<dialog>` that holds every control card, a right-hand panel or a bottom sheet under 768 px
- **Help overlay** (`src/components/ui/HelpDialog.tsx`): The native `<dialog>` that lists every way to drive the explorer, shown modally so the browser supplies Escape, the inert page behind it and focus returning to the opener
- **Help entries** (`src/lib/helpEntries.ts`): The sections the overlay renders, and `opensHelpShortcut` — the one rule behind the `?` key
- **Places** (`src/lib/places.ts`): The catalogue of named views worth looking at, `suggest` — which of them are near a given view — and `placeColorScheme`, the one rule for the scheme a place is drawn in and visited in
- **Place thumbnails** (`src/lib/placeThumbnails.ts`): The small off-screen pictures of places — an LRU cache, a one-at-a-time queue with cancel and pause, and the canvas render behind it
- **ColorMapping** (`src/lib/colorMapping.ts`): Dynamic color schemes for visualization

### State Management Pattern

The main page (`src/app/page.tsx`) uses React hooks for:

- `bounds`: Current fractal view coordinates (FractalBounds)
- `isRendering/progress`: Rendering state and progress tracking
- Parameter controls: iterations, color schemes, canvas resolution
- Preset system: Built-in views (six Mandelbrot, five Julia, two Burning Ship) and custom fractal configurations

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
- The fade is the top bar's: both use `useIdleVisibility(hold)`, which holds on
  `hold` or on keyboard focus (`:focus-visible`) inside, so the strip never
  fades while a tile has focus. The hook's second argument, `resetKey`, shows
  the bar and restarts its wait when it changes; the strip passes its list,
  because the list only exists once the first render has settled and would
  otherwise arrive already faded. `canvas-first-page.test.ts` reads the hook
  for the rules the bar used to carry itself.
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
