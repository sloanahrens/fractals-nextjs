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

This is a Next.js 16 (React 19) TypeScript application that renders interactive Mandelbrot set, Julia, Burning Ship, Perpendicular Ship, Tricorn, Multibrot, Newton, Celtic, Magnet, Phoenix and Nova fractals using Canvas API. Key architectural decisions:

### Core Rendering System

- **FractalRenderer** (`src/lib/fractalRenderer.ts`): Canvas-based rendering engine with progressive rendering and cancellation support, and the counts of the render that finished (or, for a render drawn with `config.trap`, its orbit-trap distances: one kept buffer at a time, a tagged `counts` or `trap` value): `recolour(scheme, maxIterations, options?, trap?)` repaints the canvas from them in another scheme and its `ColorOptions` (reverse and shift), computing no orbit, and answers false when it has kept none, holds a buffer of another mode or shape than the `trap` it was asked for, or holds one that is not the canvas's own size; the page uses it for a colour change and for a frame of colour cycling, which are the redraws that do not have to count the view again
- **renderRgba** (`src/lib/renderRgba.ts`): A view as raw RGBA bytes with no canvas, in two steps — `countRgbaRows` (each pixel's point to its count through the kind) and `colourRgbaRows` (the count to a colour through the scheme and its `ColorOptions`) — with `renderRgbaRows` (some rows into a buffer) and `renderRgba` (the whole picture) as the two composed, so a picture is exactly its counts, coloured, and a colour change is the second step alone. `FractalRenderer` draws every row through it, and so does the preview generator. An optional trailing `trap` on `renderRgbaRows` and `renderRgba` runs the sibling pair in its place — `countTrapRows` (each pixel's point to its trap distance) and `colourTrapRows` (the distance to a colour through `trapPosition`, `mapPositionToColor`, the scheme and its `ColorOptions`) — and absent is the count pipeline untouched, byte for byte
- **Orbit traps** (`src/lib/orbitTrap.ts`; the Orbit trap select in the Rendering Parameters card and the link key `m` are fr-3h2, see its Version Note): colouring a pixel by the closest its orbit comes to a fixed shape instead of by escape count, for every fractal in the picker. `TrapShape` is `point` (-0.5), `line` (the imaginary axis) or `circle` (the origin, radius 0.5), all in the plane the orbit moves in; a pixel's distance is the least over the points the orbit lands on, the start excluded, so Newton's exact origin (no step) has none and reads Infinity. `trapDistanceFor(kind, point, cap, shape)` asks the kind's optional `trapDistance` (the eight escape-time kinds ship an allocation-free loop with a Brent cycle check, `escapeTimeTrap` for Mandelbrot and Julia; no cardioid shortcut) and otherwise walks `orbit()` (Newton, Nova, Magnet, which end where their own counts do). **A kind's `trapDistance` must be the minimum over its `orbit` points from the second on**: `trapDistance.test.ts` holds it to that to 1e-9. `trapPosition(d)` is `d / (d + 0.5)` held to [1e-6, 1 - 1e-6], a function of the distance alone, and goes through `mapPositionToColor` (the part of `mapIterationsToColor` after its black test), so schemes, Reverse, Shift and cycling work unchanged. Distances are a `Float32Array` rounded once when stored, so a repaint is the full render byte for byte; see `docs/design/orbit-traps.md` (As built)
- **Image route** (`src/app/api/og/route.ts`, over `parseOgQuery` in `src/lib/ogView.ts` and `previewForQuery` in `src/lib/viewPreview.ts`): `GET /api/og?<view link>` no longer draws anything. It answers 308 to the pre-built picture the view previews as (`/og/<place-id>.jpg`, `ogImage.ts`), or to the static card when the query is not a view, so a preview URL a crawler cached before the pre-built previews still shows a picture and no request can make the server render; the origin comes from the request, validated (`siteOrigin`); see the Version Notes of 2026-10-10 (fr-c4z, fr-xnl, fr-5om)
- **Pre-built previews** (`src/lib/ogImage.ts`, `nearestPlace` in `src/lib/places.ts`, `scripts/make-og-previews.mjs`, `public/og/`): one 1200x630 JPEG per catalogue place, drawn ahead of time through the app's own pipeline, and the rule that says which one a shared link previews as — the nearest place of the view's own fractal, same variant preferred, or the static card; `next.config.js` caches `/og/*` for a day; see the Version Notes of 2026-10-10 (fr-xnl)
- **Mandelbrot calculations** (`src/lib/mandelbrot.ts`): Core mathematical functions for fractal generation
- **Fractal kinds** (`src/lib/fractalKinds.ts`): The registry of drawable fractals, and the id lookup that falls back to the Mandelbrot set
- **Fractal picker** (`src/lib/fractalTypes.ts`): The list the Fractal select renders, the choice-to-kind and choice-to-default-view resolvers, and the per-fractal variant descriptor (`fractalVariants`, `defaultVariant`, `variantOn`)
- **Presets** (`src/lib/presets.ts`): The built-in views, one set per fractal, and the saved views in localStorage — a view's fractal and variant, its centre and zoom, its colour scheme and settings — with `presetsForFractal` and the fractal/variant/colour field readers the page loads a view through, and `formatZoom`/`calculateZoomLevel` for the readouts
- **Julia sets** (`src/lib/julia.ts`): The four named Julia constants, the `custom:<re>,<im>` spelling that names any other point, and the factory that turns one into a fractal kind
- **Custom constant input** (`src/lib/customConstantInput.ts`): The Real and Imaginary boxes' text turned into a `custom:<re>,<im>` name or the sentence that says why not, and the Custom option's select value
- **Julia map** (`src/lib/juliaMap.ts`, `src/components/ui/JuliaMap.tsx`): The Mandelbrot set drawn small in the Settings drawer as the map of Julia constants — point at it or drag along it and the constant is the point under the pointer — the clamped pixel-to-point mapping and back, and the arrow-key step
- **Burning Ship** (`src/lib/burningShip.ts`): The Burning Ship formula — the Mandelbrot loop with both parts of z folded onto the positive side before squaring — behind its own fractal kind
- **Perpendicular Ship** (`src/lib/perpendicularShip.ts`): The Burning Ship's cousin with only one half of the step folded — the Mandelbrot loop with the imaginary part taken against the size of the real part, z -> (|Re z| - i Im z)^2 + c, that is x' = x^2 - y^2 + cx and y' = -2|x|y + cy — behind its own fractal kind
- **Tricorn** (`src/lib/tricorn.ts`): The Tricorn (Mandelbar) formula — the Mandelbrot loop with z conjugated before squaring, z -> conj(z)^2 + c — behind its own fractal kind
- **Celtic** (`src/lib/celtic.ts`): The Celtic Mandelbrot formula — the Mandelbrot loop with the real part of the square folded by an absolute value, z -> (|Re(z^2)| + i Im(z^2)) + c, that is x' = |x^2 - y^2| + cx and y' = 2xy + cy — behind its own fractal kind
- **Multibrot** (`src/lib/multibrot.ts`): The Mandelbrot loop with a higher power, z -> z^d + c for d = 3, 4, 5 — `createMultibrotKind(power)` and `parseMultibrotPower`, the power being the fractal's variant
- **Magnet** (`src/lib/magnet.ts`): The two rational maps of the magnetic model, z -> ((z^2 + c - 1)/(2z + c - 2))^2 (Type I) and z -> ((z^3 + 3(c-1)z + (c-1)(c-2))/(3z^2 + 3(c-2)z + (c-1)(c-2) + 1))^2 (Type II), both from z0 = 0 — `createMagnetKind(type)`, `parseMagnetType` and `MAGNET_TYPES`/`MAGNET_TYPE_LABELS`, the type being the fractal's variant. z = 1 is a superattracting fixed point for every c, so the set is the c whose orbit settles there and that is nearly the whole plane: the picture's flat black is the settled set, and the colours draw the island of c that runs off to infinity instead. Outside is |z| > 100 (`MAGNET_BAILOUT`), smoothed with the shared degree-2 formula carried to that radius; settled is |z - 1| < 1e-6 (`MAGNET_TOLERANCE`); a vanishing denominator is a pole and is counted as the orbit's last step
- **Phoenix** (`src/lib/phoenix.ts`): A Julia set with a memory, z(n+1) = z(n)^2 + c + p z(n-1) from the pixel with z(-1) = 0 — `createPhoenixKind(constant)`, `PHOENIX_CONSTANTS` (Classic c = 0.5667 p = -0.5, Spirals 0.3 / 0.5, Hourglass 0.5667 / -0.55; the constant is one point with c in `real` and p in `imaginary`) and `parsePhoenixConstant`, the named constant being the fractal's variant, with no Custom choice. The kind's orbit loop carries z(n-1) itself, so the renderer hands it a point as for any other fractal; `iterations`, `escapeInfo` and `orbit` walk the same two-step rule, and escape is |z|^2 > 4 with the shared smooth count. With p = 0 it is exactly the Julia set of c, and c and p being real makes it mirror about the real axis
- **Nova** (`src/lib/nova.ts`): Newton's method on z^3 - 1 with the pixel added at every step, z(n+1) = z(n) - (z(n)^3 - 1)/(3 z(n)^2) + c from z = 1 (a critical point of the Newton map) — `novaKind`, no variant. The second kind that is not an escape-time set: an orbit ends when a step is shorter than `NOVA_TOLERANCE` (1e-6, settled), or reaches `|z| > NOVA_BAILOUT` (1e6) or a z of exactly 0 (escaped: the map sends 0 to infinity), and the count is the steps taken, the cap for an orbit that never ends (painted black). The smooth count is `n + ln(d'/tol)/ln(d'/d)` from the last two step lengths, in [n, n+1] and continuous across a change of n; an escape has no fraction. `EscapeInfo.settled` tells the Math card's probe and orbit plot which way an orbit ended, and the plot draws no escape circle for it
- **Newton** (`src/lib/newton.ts`): Newton's method for one of four polynomials as a fractal kind — `NEWTON_POLYNOMIALS`' z^3 - 1 (the default, and what a link with no `k` names), z^4 - 1, z^5 - 1 and z^3 - 2z + 2, each a `NewtonPolynomial` (its roots and the arithmetic of one step, `z - p(z)/p'(z)`); `createNewtonKind(polynomial)` builds the memoized kind for one, and the orbit's root and its speed are packed into the one number the renderer takes, the n roots in n-ths of 0..maxIterations; the first fractal that is not an escape-time set. z^3 - 2z + 2 has an attracting two-step loop beside the origin (0 -> 1 -> 0), whose orbits never settle and are drawn black
- **Wander step** (`src/lib/wander.ts`): One Auto-wander step — a view near the current one that a coarse sample says is worth looking at, drawn from an injected generator so a walk replays
- **Surprise target** (`src/lib/surprise.ts`): Where the top bar's Surprise me goes — one of the six `suggest` places, picked by an injected random function, or null when there are none
- **Tour engine** (`src/lib/tour.ts`): Where an unattended tour goes next — `nextTourStop` over the places catalogue from an injected random function, with the dwell and crossfade times, the fractal-switch odds and the recent window
- **Tour mode** (`src/lib/tourMode.ts`) and **wake lock** (`src/lib/wakeLock.ts`): The screensaver's clock — the idle start, the `#tour` and button starts, the hops, and the conditions that make it wait or give way — and the best-effort screen lock held while it plays; `decodeTour` in `src/lib/viewLink.ts` reads the `#tour` link
- **Wander controller** (`src/lib/wanderController.ts`): The Auto-wander clock — the countdown that says when a step is due, which steps are hops (`WANDER_HOP_EVERY`), and the states that suspend it: a render in flight, a hidden tab, the mode switched off
- **Blank view** (`src/lib/blankView.ts`) and **BlankHint** (`src/components/ui/BlankHint.tsx`): The detector for a nearly one-colour picture, and the quiet "Nothing to see here" pill with a Back button
- **Zoom scale** (`src/lib/zoomScale.ts`): The logarithmic zoom slider mapping, and the six-digit coordinate formatter
- **View link** (`src/lib/viewLink.ts`): The view as a URL fragment and back — one short key per field, the colour scheme's two own settings among them (`r=1` reversed, `o` the shift) and the colouring method `m` (`point`, `line` or `circle`, an orbit trap; absent is the iteration count), and a decoder that judges every value on its own and leaves out what it cannot read; `linkWithoutColour` drops everything that colours a picture without changing what it is made of
- **View link state** (`src/lib/viewLinkState.ts`): The page's half of a link — what a decoded link means as the state the page holds, the defaults a link's missing fields leave standing (the frame of the fractal the link names for a missing centre or zoom, so a fractal-only link opens on that fractal's own default view rather than the Mandelbrot set's, and the page's opening view for everything else — and so for a link naming no fractal at all), the one reading a fragment gets whether the page loaded with it or was pasted one later, and the throttle that limits how often the address bar is written
- **Journey** (`src/lib/journey.ts`): The page's record of its browser history entries — a stack of view-link fragments with push, back, forward, replace and the arrival of a fragment the browser landed on, capped at 200, and `visited`, the entries walked so far, which a tour link is made of
- **Download naming** (`src/lib/download.ts`): The filename a saved canvas is written under
- **Export size** (`src/lib/exportSize.ts`): The sizes the Download PNG controls offer — the canvas, 2x and 4x, with the largest whole multiple within 12 megapixels standing in for a candidate the cap rules out — the `_2x`/`_4x` an export file is named with, the shared part-before-the-extension rule (`appendToFileName`), and the 250 ms throttle on the button's progress text
- **Export shape** (`src/lib/exportShape.ts`): The wallpaper shapes the Shape select offers — Screen (4:3), Desktop 16:9, Phone 9:19.5, Square 1:1, with their own pixel sizes — `exportFrame(centerX, centerY, zoom, aspect)`, the region a picture of that shape draws, which contains the screen's 4:3 view rather than cropping it, and the `_16x9_3840x2160` a wallpaper file is named with
- **ZoomPanManager** (`src/lib/zoomPan.ts`): Interactive controls for navigation
- **Pinch** (`src/lib/pinch.ts`): The pure helpers behind two-finger zoom — finger distance, midpoint, the zoom factor between two steps, and scale-about-a-point
- **Wheel zoom** (`src/lib/wheelZoom.ts`): The zoom factor one wheel event asks for — an exponential of how far it scrolled
- **Canvas navigation** (`src/lib/canvasNavigation.ts`): The wheel, drag and touch listeners on the canvas, and the key-to-bounds switch (`keyNavigationBounds`) that the page's own key listener calls
- **Page keys** (`src/lib/pageKeys.ts`): Which keypresses drive the view from anywhere on the page — the arrows and `+`/`-`/`=`/`_` (pan and zoom) and `R` (reset, exactly as Reset View does) — `pageKeyAction` declining a press whose target is a field, a slider, a button, a link, an editable region, the Math card or an open dialog, and any combination with Control, Meta or Alt; the page reads it off the window in `FractalExplorer.tsx`, so the canvas no longer handles its own keys and one press moves the view once
- **Render quality** (`src/lib/renderQuality.ts`): Whether a redraw is a low-resolution preview or a full-resolution render
- **Manual bounds** (`src/lib/manualBounds.ts`): What the Manual Coordinates boxes make of the four numbers typed in
- **Build facts** (`src/lib/version.ts`): The build time, deploy time, commit and revision, and the footer wording
- **Site origin** (`src/lib/siteOrigin.ts`, read per request by `src/app/requestOrigin.ts`): The origin a request was served from — forwarded host, else host, validated — that `pageMetadata` (`src/lib/pageMetadata.ts`, called by `generateMetadata` in `src/app/layout.tsx` and `src/app/page.tsx`) puts on og:image, twitter:image and og:url
- **Query link and view preview** (`src/lib/viewQuery.ts`, `src/lib/viewPreview.ts`, `src/lib/pageMetadata.ts`): Copy link copies the view as `<origin><path>?<fragment>` and Copy tour link copies a walk the same way (`copyTourUrl`); a page load reads a query or a hash (hash wins) and rewrites the bar to the hash form, a tour link in either counting as a link; `generateMetadata` in the server page turns the search parameters into og:image, the pre-built picture of the nearest place of that view's fractal, or the static card when there is no view; `previewFor` reads a tour link first, so a walk previews as its first stop; see the Version Notes of 2026-10-10 (fr-cr5, fr-d3u, fr-xnl, fr-bo2)
- **Share sheet** (`src/lib/shareView.ts`): The browser's own share sheet, for the view on screen — `shareSheet(navigator)` is the sheet this browser opens or null where it has none, and that one test is the whole of whether the Share button is drawn, read after mounting through `useSyncExternalStore` (the server snapshot is false) so neither the prerendered HTML nor the first client render has the button and hydration cannot mismatch; `shareViewPayload` builds what the sheet is handed from `copyLinkUrl` — the query-form URL Copy link copies, so the two cannot disagree — under `shareTitle`, the view's own `describeViewLine` line plus `TITLE`, which is the title the head gives the same link; `canSharePayload` asks `navigator.canShare` about that very payload where the browser has it and counts a browser without it as a yes; `shareOutcome` says a dismissal (`AbortError`) is silent and anything else falls back to Copy link's clipboard flow; the page's `handleShare` is the whole of the wiring; see the Version Note of 2026-10-11 (fr-jca)
- **Tour link** (`src/lib/tourLink.ts`): Up to eight views in order in one fragment — one column per codec field (`v=1&t.f=mandelbrot~julia&t.x=…`), each stop written and read by `viewLink`'s own encoder and decoder, so a stop is judged exactly as a single view is; a stop carries no canvas size and no count when its zoom picks one; see the Version Note of 2026-10-10 (fr-d3u)
- **Tour playlist** (`src/lib/tourPlaylist.ts`): Playing a tour link — the stops still to show and the view on screen (`PlaylistState`), `createPlaylist`, `nextPlaylistStop` (which skips a stop that is the view already up, and answers null when the walk is over so the ordinary tour takes over), `stopPlaylist` (stopping is final), `sameView` (every field but the canvas size) and `playlistStops`, the places a journey would be shared as; the page reads a walk on load, applies its first stop, and hops through the rest with the tour's own crossfade and dwell; see the Version Note of 2026-10-10 (fr-bo2)
- **Site text** (`src/lib/siteText.ts`): The app's own words about itself — the document title, the description built from `FRACTAL_TYPES` labels, the social card's tagline and title lines, and the card's alt text — so the page's head and `scripts/make-og-card.mjs` read one place; see the Version Note of 2026-10-10 (fr-3y2)
- **Top bar** (`src/components/ui/TopBar.tsx`) and **idle fade** (`src/lib/idleFade.ts`, `src/components/ui/useIdleVisibility.ts`): The floating title/Surprise me/Tour/Back/Forward/Math/Help/Settings bar, the clock that fades it after two seconds without input, and the hook that holds it up on focus
- **Nearby strip** (`src/components/ui/NearbyStrip.tsx`) and **strip policy** (`src/lib/nearbyStrip.ts`): The "Nearby, worth a look" thumbnails laid over the bottom of the canvas, and the pure rules behind them — when the suggestions refresh, which page of them shows, the crossfade time
- **Settings drawer** (`src/components/ui/SettingsDrawer.tsx`): The modal `<dialog>` that holds every control card, a right-hand panel or a bottom sheet under 768 px
- **Help overlay** (`src/components/ui/HelpDialog.tsx`): The native `<dialog>` that lists every way to drive the explorer, shown modally so the browser supplies Escape, the inert page behind it and focus returning to the opener
- **Help entries** (`src/lib/helpEntries.ts`): The sections the overlay renders, and `opensHelpShortcut` — the one rule behind the `?` key
- **Places** (`src/lib/places.ts`): The catalogue of named views worth looking at, `suggest` — which of them are near a given view — `placeColorScheme`, the one rule for the scheme a place is drawn in and visited in, `nearestPlace` — the place a view previews as, the whole rule behind `ogImage` — and `featuredPlace`/`wholeSetPlaceFor`, where the fractal switcher's buttons and the Julia, Multibrot and Magnet chips land. A place of a fractal that takes a variant names it, so Julia's constants, the Multibrot's powers and the Magnet's magnetic types each have their own whole-set place at the fractal's opening frame; `FEATURED_PLACE_IDS` is judged by the featured guard (at most 60% one colour), which is why the Magnet's button leads with a drift of disks rather than the whole island
- **Auto-wander pill** (`src/components/ui/WanderControl.tsx`, `useWanderNudge.ts`) and **pill rules** (`src/lib/wanderControl.ts`): The play/pause pill on the picture's bottom right that shares the Settings checkbox's handler, its words and placement, and the once-per-browser first-run nudge
- **Fractal switcher** (`src/components/ui/FractalSwitcher.tsx`): The Mandelbrot / Julia / Burning Ship / Perp. Ship / Tricorn / Multibrot / Newton / Celtic / Magnet / Phoenix / Nova buttons, and the Julia constant, Multibrot power, Newton polynomial, Magnet type or Phoenix constant chips, drawn over the top left of the canvas and never faded
- **Fractal math** (`src/lib/fractalMath.ts`), **Math card** (`src/components/ui/MathCard.tsx`, `src/lib/mathCard.ts`) and **MathView** (`src/components/ui/MathView.tsx`): The mathematics of the picture on screen — `describeFractalMath(fractalId, variant)` returns, for every fractal in `FRACTAL_TYPES`, the rule, where each point starts, the one setting with its real value, how a point is judged and a plain blurb, as `MathExpr` trees; `MathView` typesets a tree as native MathML with a plain-text `aria-label` from `toPlainText`; the card shows the rule and setting on one line and, expanded, the view's numbers, the probe's rows and the orbit plot (`OrbitPlot.tsx`); it is up from the first visit, and whether it is shown and expanded is kept in localStorage (`mathCard.ts`, key `fractals.mathCard.v1`). **Every fractal needs a descriptor in `FRACTAL_MATH`**: `fractalMath.test.ts` fails a `FRACTAL_TYPES` id without one or with an empty blurb
- **Math probe** (`src/lib/mathProbe.ts`, `escapeInfo` on `FractalKind` in `src/types/fractal.ts`): The number under the pointer, what its orbit did and the colour the picture paints it, shown in the expanded Math card — `probePoint(kind, point, maxIterations, scheme)` reads the count from the kind (whole steps for the words, the smooth count for the colour) and `describeProbe(fractalId, info, cap)` words it; every kind ships `escapeInfo(point, maxIterations)`, an optional method the probe falls back to the count for; `createFrameThrottle` is the one-point-per-frame rule and `pointerToCanvasPixel` the CSS-to-canvas scaling; `shouldClearProbe` is the rule that holds the probe while the pointer is on the Math card rather than the picture, so the plot and its Play control stay reachable. **A kind's `escapeInfo` must agree with its `iterations`** — `escapeInfo.test.ts` and the pixel parity in `mathProbe.test.ts` hold it to a drawn view
- **Orbit plot** (`src/lib/orbitPlot.ts`, `src/components/ui/OrbitPlot.tsx`, `orbit` on `FractalKind` in `src/types/fractal.ts`): The path that point took, drawn under the probe's rows in the expanded Math card — `orbit` is the points the kind's own loop visits (optional, as `escapeInfo` is; `orbitFor` answers the point alone for a kind without it), the probe keeps 60 steps of it in `PointProbe.orbit`, `orbitToPlot(orbit, size, minExtent)` places them in a square plot (frame never inside the escape circle nor past twice it, values that are not numbers read as the origin), the escape circle of radius 2 is drawn for the kinds that leave it (`hasEscapeCircle` is false for Newton, which has no radius, and for the Magnet, whose orbits leave at 100 and would have the circle of 2 inside their wandering), `describeOrbit(fractalId, info, steps)` is the `aria-label`, `orbitStepColour` paints a dot through the picture's own mapping, and a Play control walks it a step every 120 ms (off under `prefers-reduced-motion`). **A kind's `orbit` must be the same walk as its `iterations` and `escapeInfo`** — `orbit.test.ts` holds the path to the count for every kind
- **Place thumbnails** (`src/lib/placeThumbnails.ts`): The small off-screen pictures of places — an LRU cache, a one-at-a-time queue with cancel and pause, and the canvas render behind it
- **ColorMapping** (`src/lib/colorMapping.ts`): Dynamic color schemes for visualization
- **Palette controls** (`src/lib/paletteControls.ts`, `Slider`'s `onGestureStart`/`onKeyDown`): The Settings drawer's Reverse checkbox and Shift slider as the controls read them — the slider's whole percent against the view's fraction of a turn (`shiftToPercent`/`percentToShift`), `normalizeShift` (the mapping's reading, a whole turn being no shift), `isDefaultColorOptions` (judged exactly, so a slider dragged to its far end still has a Reset), `formatShiftPercent` and the keys that move a focused slider. The slider's far end is held rather than read modulo a turn, so a drag to the right does not snap the thumb back; a change of either setting repaints from kept counts and is one history entry per gesture, marked on the slider's pointer-down or on the first key press that moves it (`FractalExplorer.tsx`)
- **Colour cycling** (`src/lib/cycleColours.ts`): The "Cycle colours" mode, which walks the palette's Shift slowly round a turn and repaints from the counts the last render left — `CYCLE_SPEEDS` (Slow 60 s, Medium 25 s, Fast 10 s a loop) and `cycleSpeedFor`, `CYCLE_MIN_PAINT_GAP_MS` (50, twenty repaints a second), `cycleShift(startShift, elapsedMs, loopMs)` (advanced by elapsed time, so a slow device cycles at the same speed and only the picture is choppier), `shouldPaint(now, last, minGap)` and `cyclePaused(conditions)` (a hidden tab, a render in flight, a hand on the picture or the slider, the Help overlay, a tour, reduced motion). The page's frame loop reads and writes `recolour` and nothing else — it never starts a render — and the palette it is painting lives in a ref rather than in the view, so the link, the history and the saved views are untouched until the visitor switches the mode off, which is where the palette stops and the one entry is written

### State Management Pattern

The main page (`src/app/FractalExplorer.tsx`, a client component; `src/app/page.tsx` is the server page that renders it and writes its metadata) uses React hooks for:

- `bounds`: Current fractal view coordinates (FractalBounds)
- `isRendering/progress`: Rendering state and progress tracking
- Parameter controls: iterations, color schemes, canvas resolution
- Preset system: Built-in views (six Mandelbrot, five Julia, two Burning Ship, two Perpendicular Ship, two Tricorn, three Multibrot, two Newton, two Celtic, two Magnet, two Phoenix, two Nova) and custom fractal configurations

### Component Structure

- **UI Components** (`src/components/ui/`): Reusable form controls (Slider, Select, Input, Checkbox, Button), plus the page furniture listed above (TopBar, NearbyStrip, SettingsDrawer, HelpDialog, VersionFooter, FractalSwitcher, WanderControl, MathCard, OrbitPlot, JuliaMap, BlankHint)
- **View read-out** (`src/lib/viewReadout.ts`): The "Zoom 400x at -0.7453, 0.1127" line above the coordinate boxes
- **Specialized Controls**: CenterControls, PresetSelector, CustomPresetManager
- **Layout**: Single-page application, canvas-first: the picture fills the viewport under a floating top bar (`TopBar.tsx`: title, Surprise me, Tour, Back, Forward, Math, Help and Settings), and every control sits in the Settings drawer (`SettingsDrawer.tsx`) — see the Version Note of 2026-10-09

### Performance Optimizations

- Progressive rendering with chunked calculations to avoid UI blocking
- Cancellable rendering operations when parameters change
- A preview pass while a gesture is in flight, with the full-resolution render deferred to its end
- A colour change repaints from the iteration counts the last render left (`FractalRenderer.recolour`), so it costs a pass over the pixels and no orbit at all
- Cycling the palette (`cycleColours.ts`) is that same repaint on a frame loop, at most twenty a second; it holds rather than queues a frame it cannot paint, and it never starts a render
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
`/api/health`, `/api/version` and `/api/og` routes; `vitest.config.mts` aliases `@/*` to `src/*` and pins the
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

_Last updated: 2026-10-11_

### Orbit traps: the Orbit trap select and the link key `m` (2026-10-11)

- fr-3h2. Orbit-trap colouring (the engine of fr-adc, below) is usable and shareable: an **Orbit trap** select (Off, Point, Line, Circle) sits in the Rendering Parameters card between Reverse and Shift, `min-h-11` (44 px) through a new optional `selectClassName` on `Select`, and a link, a tour link and a saved view carry the choice. The pre-built preview images, the page metadata and `/api/og` are untouched (a test reads their sources for the word `trap`); the Help entry says a shared trap link previews as the normal picture.
- **The link key is `m`**, as the design note recommended: `point`, `line` or `circle`, written by `encodeView` after `o` and before `i` and only when a shape is on, so a view with no trap is byte for byte the link it was. The reader takes the three spellings exactly (`m=Point`, `m=`, `m=spiral`, a padded value are no trap and the page keeps its own); a repeated key reads by its first value. `ViewLinkState.trap` is optional and `ViewLinkUpdates.trap` is `TrapShape | null` (default null in `DEFAULT_VIEW_LINK_UPDATES`; the three test fixtures that build a `ViewLinkUpdates` by hand gained `trap: null`). **`m` is not a colour-only key**: `COLOUR_ONLY_KEYS` stays `s`, `r`, `o`, so two links that differ in `m` are two pictures, `drawCanvas` sees `linkWithoutColour(showing) !== linkWithoutColour(link)` and renders, and a scheme, Reverse or Shift change inside one trap still compares equal and repaints from the kept distances. This is the one place the bead's wording ("repaints instantly through recolour()") is bent: distances cannot be repainted into existence, so the first choice of a shape, a change of shape and turning the trap off are each one render (the design note, section 2 "Why", says why both buffers are not kept); every repaint after that, including each cycling frame, is `recolour(scheme, cap, options, trap)`.
- **Tour links.** `STOP_KEYS` in `tourLink.ts` gained `"m"` between `o` and `i`: a `t.m` column that exists only when some stop has a trap, and `VIEW_FIELDS` in `tourPlaylist.ts` gained `trap` so `sameView` tells a trap stop from the plain stop at the same place. A played stop applies its trap or, naming none, turns it off (`showStop`). Eight stops with a trap on every one stay under `MAX_TOUR_LINK_LENGTH` (a test builds that tour).
- **What each hop does with Trap.** Kept: a Nearby tile, a fractal button, a preset and an Auto-wander hop (they keep Reverse and Shift too). Dropped: a tour hop and Surprise me, through the `resetColour` flag `handlePlaceSelect` already had, which now also puts `trap` back to null (and the crossfade target carries the trap, so "this place is already the view" stays true). Reset colours turns Trap off (the button is enabled while one is on: `isDefaultColorOptions(reverse, shift, trap)`), and so does Reset View (`resetToDefault`, which already puts the scheme, Reverse and Shift back). The design note recommended that neither reset touch the trap; the bead overrode it for Reset colours, and Reset View follows its siblings.
- **History.** Choosing a trap calls `handleParameterChange` and not `beginJump`, so it adds no history entry of its own: the address bar's current entry follows it and Back returns to the place before. This is what the bead's "adds no history entries" says; note Reverse and the Reset button do mark one entry each (`beginJump`), so the bead's "as Shift and Reverse behave" is not literally true of them. If the owner wants a trap to be an entry like Reverse, `handleTrapChange` needs one `beginJump()` before `handleParameterChange`.
- **Saved views** carry the trap as an optional `trap` field written only when a shape is on (`presetColorFields(reverse, shift, trap)`; stored JSON for every existing view is unchanged, and an older build ignores the field and opens a newer view plain). `presetTrap(preset)` reads it, judging it alone: a value that is not one of the three shapes is no trap. `presetColorOptions` is deliberately unchanged (its `{ reverse, shift }` shape is asserted in the older tests).
- **Surfaces that show this view's colours.** The export config carries the trap (`runExport`), the Nearby strip is handed `thumbnailLook` (`ThumbnailLook = ColorOptions & { trap }`, memoized on `[reverse, shift, trap]`; the thumbnail store's key gains the trap last, so a request without one keys exactly as before, and the real thumbnail render passes `trap` to the renderer, so a tile is the picture a click shows — `placeThumbnails.test.ts` holds that to the existing mean-difference bound for three places in each shape), and the Math card's probe swatch is the trap's colour (`probePoint(..., options, trap)` colours `Math.fround(trapDistanceFor(...))` through `trapPosition` and `mapPositionToColor`, the value the picture paints, checked for every pixel of a small view in each shape). The orbit plot's dots are coloured along the orbit and stay as they were.
- **Tests.** `viewLink.test.ts` (`m` after `o`, only when on, byte-for-byte without, an unknown shape not written, the three spellings read, garbage and repeats, round trip over every sample state, the longest link, `linkWithoutColour` keeping `m`), `viewLinkState.test.ts`, `tourLink.test.ts` and `tourPlaylist.test.ts` (the `t.m` column, round trip, unreadable value, the full tour under the limit, `sameView`), `presets.test.ts` (written only when set, read back, a view without it plain, a value it cannot read), `paletteControls.test.ts` (the select's options and their reading, `isDefaultColorOptions` with a trap), `mathProbe.test.ts`, `placeThumbnails.test.ts`, and the new `src/__tests__/trap-controls-panel.test.ts` (sources: the select in the card between Reverse and Shift and nowhere else, 44 px, labelled, a change a state change with no render call and no `beginJump`, the draw's trap in the config and the repaint, cycling passing the trap, Reset colours and Reset View, the hop rules, everything that carries the trap, the previews' sources naming no trap, and the Help and README words). Five older panel tests moved with the source (`colour-controls`, `palette-options`, `recolour`, `cycle-colours`); none was loosened beyond naming the new argument.
- Docs: Help (an "Orbit trap" row after Reverse / Shift), the README (an Orbit Traps bullet beside Color Mapping and Sharing a View), the design note's As built, and this note.

### Orbit traps: the engine, with no UI yet (2026-10-11)

- fr-adc. Trap mode feeds a stored per-pixel trap distance through the same palette, Shift and Reverse, so a recolour stays instant. Nothing a visitor sees changed: no control, link key, Help text or README feature text (fr-3h2 is the next bead), and no page code names a trap. The design and its measurements are `docs/design/orbit-traps.md`; its As built section says where the code differs.
- **Pipeline.** `FractalConfig.trap?: TrapShape` (`point`, `line`, `circle`); with it, `FractalRenderer.renderFractal` runs `countTrapRows` and `colourTrapRows` (siblings of the count pair in `renderRgba.ts`, not branches in it) and `renderRgbaRows`/`renderRgba` take a trailing `trap`. `mapIterationsToColor` is now its black test, the division by the cap, then `mapPositionToColor(t, scheme, options)`; `plainPicture.test.ts` holds checksums of every fractal's opening view taken from the tree before this landed, so a count picture is the bytes it was.
- **The kept buffer is one at a time.** `FractalRenderer.kept` is `{ mode: "counts" | "trap", ... }`: counts as a `Float64Array`, trap distances as a `Float32Array` (half the memory; safe because a distance is one smooth quantity rounded once, when stored, and the render and the repaint colour from the stored value). It goes where the counts went: when a render starts, on `cancelRender`, on a resize (the length check), and a preview pass keeps nothing. `recolour(scheme, cap, options?, trap?)` repaints only from a buffer of the asked mode and shape and answers false otherwise, so a stale buffer or a caller that knows nothing of buffers (the colour-cycling frame loop) can never paint the wrong picture. A toggle or a change of shape is a render, not a repaint.
- **Distances.** Each escape-time kind (Mandelbrot, Julia, Burning Ship, Tricorn, Celtic, Perp. Ship, Multibrot, Phoenix) has a `trapDistance` loop that keeps a running minimum of `trapKey` and stops on escape, at the cap, or when the orbit has come back within 1e-12 of a point saved at steps 1, 2, 4, 8, ... (Phoenix compares the pair, z and the point before it): 3 to 50 times faster on interior-heavy views than the same loop without the check, and a cap of a billion is instant at a cycle. The Mandelbrot kind's cardioid shortcut is not used: the answer for an interior point is its closest approach, not the cap. Measured at 800x600 and a cap of 1000, trap renders are 0.2 to 0.7 s for the escape-time kinds (Mandelbrot 0.4 s against 0.06 s for its count), Magnet 4 to 5 s against 3 s; count renders did not move.
- **Placement is fixed** (no movable traps this wave) and chosen so no trap passes through an attractor of any fractal: the point at -0.5, the imaginary axis and the circle of 0.5 about the origin. `renderRgbaTrap.test.ts` draws every fractal and variant at its opening view in each trap and fails above 60% one colour or blank, which keeps a future change of placement honest.
- **A pixel with nothing to measure** (a cap under 1, a point that is not a number, Newton's exact 0) has distance Infinity, which `trapPosition` puts at the far end of the palette, never black. The inside of the set is coloured like everywhere else; no pixel is black for being in the set, and the band keeps rainbow's hue-360 end out of reach of Reverse and Shift.
- Tests: the new `orbitTrap.test.ts` (each shape by hand, the curve), `trapDistance.test.ts` (the `orbit()` walk as oracle for every kind and variant, all shapes, caps 0 to 1000, odd points; finite for an inside, an outside and an axis point of every fractal in the picker; the cycle check at a billion steps; Newton, Nova and Magnet's walk), `renderRgbaTrap.test.ts`, `fractalRendererTrap.test.ts` (a repaint is the full render byte for byte for every fractal, shape, scheme and option pair and counts no orbit; the refusals; the export renderer's own buffer), `plainPicture.test.ts`, and a `mapPositionToColor` block in `colorMapping.test.ts`.

### Nova: an eleventh fractal, Newton's method with the pixel added (2026-10-11)

- fr-z0o. Nova is the iteration z(n+1) = z(n) - (z(n)^3 - 1)/(3 z(n)^2) + c from
  z(0) = 1, with c the pixel. z = 1 is a root of z^3 - 1 and so a critical point
  of the Newton map (its derivative 2(z^3 - 1)/(3 z^3) is 0 there), which is the
  start that makes the picture a Mandelbrot-like parameter plane. It follows the
  Tricorn and Celtic line for line elsewhere: no variant row, and no renderer,
  recolour, link-format, tour or export change.
- **`src/lib/nova.ts`** exports `novaKind` (id `nova`), `NOVA_TOLERANCE`,
  `NOVA_BAILOUT` and `NOVA_START`. The step is written (2z + 1/z^2) / 3 + c so a
  far point does not overflow z^3 into a NaN. An orbit ends the first time (a)
  the step it just took was shorter than 1e-6, which is settling, (b) it lands
  past 1e6 or on a non-finite value, or (c) it stands on z = 0 and has no step
  (the map sends 0 to infinity; this is how c = -1 ends, z1 being 0). (b) and (c)
  are escapes. `steps` is the number of steps taken when it ended, at most one
  under the cap (so `escaped` is exactly `steps < cap`, as for every kind), and
  the cap for an orbit that never ends, which the colour mapping paints black
  like the inside of any set. A pixel that is not a number is the cap, as Newton's
  is. This counts steps taken, where the escape-time kinds count the index of the
  step that escaped; c = 0 is 1 (N(1) = 1, so the first step has length 0) and
  c = -1.5 is 2 (z1 = -0.5, N(-0.5) = 1, z2 = -0.5).
- **The smooth count** credits a settled orbit with a fraction of its last step.
  Steps shrink by a fixed factor near a fixed point, so with d the last step's
  length (under the tolerance) and d' the one before it (at or over it),
  `fraction = ln(d'/tol) / ln(d'/d)`, in [0, 1): 0 when d' is only just over the
  tolerance, tending to 1 as d approaches it, so `n + fraction` is in [n, n+1]
  and continuous across a change of n (below the boundary n + 1^-, above it
  n + 1 + 0^+). The first step has no step before it and is credited
  `ln(tol)/ln(|c|)`, which is the same limit at |c| = tol and 0 for c = 0. The
  lengths are squared, which leaves the ratio of logs alone. An escape carries no
  fraction: nothing about a point sent past a million says how far into a step
  it crossed. `nova.test.ts` finds places where the whole count steps along the
  real axis by bisection and checks the smooth count a hair either side
  (differing by under 1e-4, with the fraction near 1 below and near 0 above), and
  holds [n, n+1] over a 2400-point grid.
- **`EscapeInfo.settled`** is new and optional (`src/types/fractal.ts`): a kind
  whose orbits can end two ways says which. `escapeInfo` answers `{ steps,
  escaped, settled }`, `escaped` meaning the orbit ended within the cap (as for
  Newton, which also uses it for settling) and `settled` that it ended by
  settling. `describeProbe` words it "Settles after 22 steps", "Escaped at step
  1" or "Never settled in 400 steps", and `describeOrbit` "settles", "escaped",
  "first 60 steps, still moving" (the plot's window is shorter than the orbit,
  which can run to 40-odd steps and much more near the set) or "never settles".
  `hasEscapeCircle("nova")` is false, the frame is the escape-time one
  (`orbitMinExtent` 2, the least the plot shows), and `orbit(point, maxSteps)` is
  walkNova's loop with the points kept: the start z = 1, then one point per step,
  ending on the point that ended it (or on 0 for a pole), so an ended path has
  `steps + 1` points like Newton's.
- **Facts the tests lean on.** The recurrence has real coefficients and starts on
  the real axis, so conjugating c conjugates every step: the picture is its own
  mirror about the real axis, bit for bit (counts and orbit points), and has no
  other symmetry. c = 0 settles at 1 on the fixed point 1; c = -1.5 settles at 2
  on -0.5; c = -1 hits the pole at step 1; c = 2e6 escapes at step 1; c = -0.5 and
  the real axis from -1.45 to -0.4 never settle. Far from the origin the map is
  z -> 2z/3 + c, so the plane beyond the set settles in about 30 to 40 steps and takes
  one shade, which is why the rainbow, fire and ocean schemes draw the default
  frame 60 to 85% one colour and every place but one is in classic.
  `nova.test.ts` checks the counts against a textbook Newton quotient with c
  added, over 2400 points, the no-NaN guard over a grid and the pole's
  neighbourhood, and a non-number pixel.
- **`defaultViewFor("nova")` is (-0.55, 0) at zoom 1.5.** Measured with a 0.01
  grid at a cap of 300 (points that never settle or take 60 steps or more), the
  set spans x -1.49..0.36 by y -0.59..0.59, so -0.55 is the middle of it. Zoom 1.5
  (x -1.88..0.78, y -1..1) holds it with 0.4 clear above and below, which zoom 1
  (the widest view) would show a third smaller; a test samples the frame's border
  and finds every point settling in under 45 steps. This is the first default
  view that is not at zoom 1.
- **Two built-in views** (`nova-overview`, the default frame; `nova-bulbs`, the
  tree of bulbs at zoom 6), under the per-fractal guards (24 fractal-owned views,
  30 built-ins).
- **Six places** (`NOVA_PLACES`, the test allows 4 to 6), picked from contact
  sheets at 400x300 through the real pipeline in the five schemes and measured at
  64x48 with whole counts: the whole set (17% one colour in classic), the curling
  tip of the arc (zoom 8), the big disk and its small neighbour (zoom 10, the one
  place in rainbow, where the greens and magentas separate bulbs classic runs
  together), a tree of bulbs under the arc (zoom 6), the pinch on the real axis
  (zoom 15) and bands along the arc (zoom 30). The set is mirrored about the real
  axis, so only the upper half's places are named. **The featured place is the
  whole set**, which is also what the Fractal select opens Nova on, so
  `places.test.ts` exempts it from "a switch goes somewhere"
  (`FEATURED_IS_OPENING_VIEW`).
- **Math card**: `FRACTAL_MATH.nova`, title "Nova fractal", the rule
  z -> z - (z^3 - 1)/(3z^2) + c (the Newton rule's own p and p' trees, with c
  added), start `z0 = 1, c = the pixel's point`, no setting, a three-sentence
  blurb and an escape sentence that says a step under 0.000001 means settled,
  that past 1,000,000 means escaped, that a point which never settles is black,
  and what the orbit plot shows.
- **`npm run make-og-previews`** was run and the six `public/og/nova-*.jpg` files
  committed (45 to 135 KB, all at quality 80; the set is 104 pictures, 7.5 MB).
  Nothing else in `public/og/` changed.
- **The button row**: eleven buttons are wider than the ten's, so the row
  scrolls sideways at 375 and 320 px as it already did. It was not re-measured in
  a browser; the switcher's classes are unchanged.
- Tests: the new `src/lib/__tests__/nova.test.ts`, and the Nova cases added to
  `fractalTypes`, `viewLink`, `viewLinkState`, `viewPreview`, `tourLink`,
  `escapeInfo`, `orbit`, `mathProbe`, `orbitPlot`, `renderRgba`, `fractalMath`,
  `places`, `presets` and `tour` tests and the switcher panel test, each extended
  to the new count rather than loosened.
- Docs: the README (intro, Fractal Types, Fractal Switcher, Custom Presets, Math
  card, Project Structure, Mathematics), the Help overlay's switcher row, the
  design doc's As built, and this note.

### Phoenix: a tenth fractal, a Julia set with a memory (2026-10-11)

- fr-04l. The Phoenix sets are Julia sets of a two-term step,
  z(n+1) = z(n)^2 + Re(c) + Im(c) z(n-1), with z(-1) = 0 and the pixel as
  z(0), escape when |z|^2 > 4. They draw feathered, flame-like shapes. It is
  the third fractal to use the variant mechanism for a constant (after Julia
  and, with a power or a type, the Multibrot and the Magnet), and it follows
  the Tricorn and Celtic line for line elsewhere: no renderer, recolour, link
  format, tour or export change.
- **`src/lib/phoenix.ts`** exports `createPhoenixKind(constant)` (id
  `phoenix`), `PHOENIX_CONSTANTS` and `parsePhoenixConstant`. A kind keeps its
  own state, so `z(n-1)` lives inside the orbit loop: the renderer hands over a
  point as for any other fractal. `iterations`, `escapeInfo` and `orbit` are the
  same two-step loop (x' = x^2 - y^2 + c + p x_prev, y' = 2xy + p y_prev), so
  the Math card's orbit plot follows the rule the count does;
  `escapeInfo.test.ts`, `orbit.test.ts` and the pixel parity in
  `mathProbe.test.ts` hold the three together. The orbit starts at the pixel
  and z(-1) is not a point of the path. The count is the shared one: the step
  index of the escape, the cap for an orbit that does not, and
  `n + 1 - log2(log2|z|)` smooth. There is no interior shortcut.
- **The constant is a pair of different kinds of number**, c (added every step)
  and p (the weight of the point two steps back), carried as the real and
  imaginary parts of one `ComplexNumber` so that "the bead's Re(c) and Im(c)"
  is literal. Three are named, in the order the row offers them: **Classic**
  (c = 0.5667, p = -0.5, the constant the fractal is known by: two feathered
  flames, one above the other), **Spirals** (c = 0.3, p = 0.5: dust arranged in
  spirals, no point runs the cap) and **Hourglass** (c = 0.5667, p = -0.55: a
  connected black body pinched at its waist). The last two were picked from
  contact sheets of about twenty constants drawn through the real pipeline in
  several schemes, for being unmistakably different from Classic and from each
  other, and each was then checked to draw a non-blank picture at its whole-set
  place. There is **no Custom choice** (`allowsCustom: false`): a pair of
  numbers of different kinds has no map to pick them from the way the Julia map
  picks a point, and an arbitrary pair is as likely to draw a flat field.
- **Variant values.** The variant is the constant's name, as a Julia constant's
  is, so a link carries `k=Classic`, `k=Spirals` or `k=Hourglass` beside
  `f=phoenix`, and a saved view stores it as `variant`.
  `fractalVariants("phoenix")` is label "Phoenix constant" with the three
  options, `defaultVariant("phoenix")` is "Classic", `isVariantValue` takes the
  three names exactly (no case folding, no padding) and `variantOn` gives
  Phoenix "Classic" for a value it cannot draw. "Classic" is also a Julia
  constant's name, and that is harmless: the codec reads a `k` only by asking
  whether any fractal can draw it, and `viewLinkToUpdates` keeps it only for a
  fractal that can, as it does for the digits Newton and the Multibrot share.
  Going from Julia (on "Classic") to Phoenix therefore lands on Phoenix's
  Classic, and every other Julia constant falls to it as the default.
- **Exact facts the tests lean on.** With z(-1) = 0 the first step cannot feel
  p, so it is the Julia step; with p = 0 the whole kind is the Julia kind of c,
  smooth counts included (`phoenix.test.ts` compares them over a grid). c and p
  are real and z(-1) starts at 0, so conjugating the pixel conjugates the whole
  orbit and every set is mirrored about the real axis, bit for bit; there is no
  symmetry about the imaginary axis. Worked by hand, Classic from z0 = 1 is
  1, 1.5667, 2.5212 (one step completed before the escape), and from z0 = 0.8
  the memory term holds the orbit in a step longer than the p = 0 step does
  (count 2 against 1), which is the test that dropping z(n-1) changes a count.
  Radius 2 stays right for the constants offered: |c| + |p| is under 1.1.
- **`defaultViewFor("phoenix")` is the origin at zoom 1.** Measured with a
  0.01 grid at a cap of 300 (points that run 30 steps or more), Classic spans
  x -0.67..0.75 by y +-1.27, Spirals x -0.88..0.72 by y +-1.13 and Hourglass
  x -0.65..0.75 by y +-1.28, all inside zoom 1's x -2..2 by y -1.5..1.5 with 0.2
  or more clear above and below. `phoenix.test.ts` samples the frame's border
  for each constant and finds nothing slow to leave.
- **Two built-in views** (`phoenix-overview`, the Classic set at the default
  frame; `phoenix-feathers`, the upper flame's edge at zoom 4), under the
  per-fractal guards in `presets.test.ts` (22 fractal-owned views, 28
  built-ins).
- **Six places** (`PHOENIX_PLACES`, the test allows 4 to 6): the whole of each of
  the three constants (which `wholeSetPlaceFor` must find, one per constant),
  feathers on Classic's upper flame (zoom 4, classic, 21% one colour at 64x48
  with whole counts), curls on its tail (zoom 10, rainbow, 17%) and a spiral
  arm of Spirals (zoom 5, classic, 11%). The whole sets measure 48 to 50% one
  colour in classic. **The featured place is the whole Classic set**, which is
  also the view the Fractal select opens the fractal on, so `places.test.ts`
  exempts it from "a switch goes somewhere" as it does the Tricorn and Celtic
  sets (`FEATURED_IS_OPENING_VIEW`). Phoenix is not in
  `REAL_AXIS_MATCHES_MANDELBROT`: its real axis is not the Mandelbrot set's.
- **Math card**: `FRACTAL_MATH.phoenix` is a function of the variant. The rule
  is z(n+1) = z(n)^2 + c + p z(n-1) with subscripts, the start `z0 = the pixel's
  point, z-1 = 0`, the setting "Phoenix constant "Classic", c added at every
  step and p weighing the point before the last" with the pair written
  `c = 0.5667, p = -0.5`, a three-sentence blurb that says the extra term feeds
  the number from the step before back into each new point and so feathers the
  sets, and the shared escape sentence with one on what the orbit plot shows
  (each new dot is pulled by the dot before the last). `toPlainText` reads the
  rule "z sub n plus 1 equals z sub n squared plus c plus p times z sub n minus
  1". The orbit plot draws the escape circle of 2, as for every escape-time
  kind.
- **`npm run make-og-previews`** was run and the six
  `public/og/phoenix-*.jpg` files committed (25 to 164 KB, all at quality 80).
  Nothing else in `public/og/` changed.
- **The button row**: ten buttons are wider than the nine's, so the row
  scrolls sideways at 375 and 320 px as it already did. It was not re-measured
  in a browser; the switcher's classes are unchanged.
- Tests: the new `src/lib/__tests__/phoenix.test.ts`, and the Phoenix cases
  added to `fractalTypes`, `viewLink`, `viewLinkState`, `viewPreview`,
  `tourLink`, `escapeInfo`, `orbit`, `mathProbe`, `orbitPlot`, `renderRgba`,
  `fractalMath`, `places`, `presets` and `tour` tests and the switcher panel
  test, each extended to the new count rather than loosened.
- Docs: the README (intro, Fractal Types, Fractal Switcher, Shareable Links,
  Custom Presets, Math card, Project Structure, Mathematics), the Help
  overlay's switcher row, the design doc's As built, and this note.

### Newton is a family: a Polynomial row of four polynomials (2026-10-11)

- fr-ztk. The Newton fractal gains a setting, the polynomial whose roots
  Newton's method hunts for, using the variant mechanism as the Multibrot does
  for its power: **z^3 - 1** (today's picture, the default, and what a link with
  no variant names), **z^4 - 1**, **z^5 - 1** and **z^3 - 2z + 2** (the classic
  equation whose map has a basin that never settles). Each root keeps its own
  colour family, shaded by how fast the method reaches it, exactly as the one
  polynomial did. No picker entry was added and no control was written: the
  switcher's chip row and the Settings select draw the four from
  `fractalVariants("newton")`.
- **`src/lib/newton.ts` generalised, with the arithmetic of z^3 - 1 kept byte
  for byte.** A polynomial is now a `NewtonPolynomial`: its `id` (the variant
  value), its `label` (the equation, as a chip shows it), its `roots` in band
  order, and an `evaluate(real, imaginary, out)` that writes both `|p(z)|` (the
  convergence test) and one Newton step into a caller-owned
  `NewtonStepState` — one call rather than two because the residual and the step
  share the powers of z they need, and computing them twice would roughly double
  the cost of the app's heaviest fractal. `NEWTON_POLYNOMIALS` is the four;
  `parseNewtonPolynomial` reads only the app's own spellings ("3", "4", "5",
  "cycle"); `newtonPolynomialFor` falls back to z^3 - 1 for anything else, and
  `createNewtonKind(polynomial)` throws a `RangeError` for a value from outside
  and is **memoized**, so `resolveFractalKind("newton", "Dendrite")` is the very
  same object as `newtonKind` and the identity assertions the older tests make
  still hold.
- **The z^3 - 1 case is unchanged, and that was the point.** `unityEvaluate(power)`
  builds `w = z^(d-1)` by repeated multiplication, then `z^d = w z` for the
  residual, then the step `((d-1)z + 1/w)/d` from the same `w` — for d = 3 that
  is exactly the old `(2z + 1/z^2)/3` with `z^2` computed once and used twice, in
  the same order, so `newton.test.ts`'s 26 tests passed untouched through the
  rewrite. The band is now `1 / roots.length` rather than the `NEWTON_BAND`
  constant, which is the same double (1/3) for the three-root polynomials; all
  four kinds keep `id: "newton"`, as the Multibrot's powers keep `id:
  "multibrot"`, so `hasEscapeCircle`, `orbitMinExtent` and `describeProbe` need
  no change.
- **The four polynomials and their roots**, written out rather than solved for
  at load: z^3 - 1 keeps `NEWTON_ROOTS` (1, -0.5 ± 0.8660254037844386i);
  z^4 - 1 is 1, i, -1, -i; z^5 - 1 is the five fifth roots of 1; z^3 - 2z + 2 is
  -1.7692923542386314 and 0.8846461771193157 ± 0.5897428050222056i (one real
  root and a conjugate pair — its discriminant is negative).
- **z^3 - 2z + 2, and why it is interesting.** p'(z) = 3z^2 - 2 vanishes at
  ±√(2/3), where there is no step and the orbit gives up like any other
  Newton's. More importantly the map sends 0 to 1 and 1 straight back to 0 — an
  attracting two-step loop — so the orbits around them never reach a root: they
  run the whole cap and are painted black, which is the dark disc the picture is
  built around. Nothing detects this specially; it falls out of the residual
  never dropping below the tolerance, and `escapeInfo` reports it as unsettled
  like any other cap-bound orbit. Measured: 0, 1, 0.01, -0.01 + 0.02i, 0.99 +
  0.01i and 0.1i all run a cap of 300, and 2000 as well; a point far enough out
  (0.5, 0.2, 0.95 on the real axis) settles, one as close as 1.02 - 0.01i after
  173 steps. So the loop's basin is bounded and its edge is what the picture's
  black region is made of.
- **The variant row.** `fractalVariants("newton")` is `label: "Polynomial"`,
  options "3", "4", "5", "cycle" labelled "z^3 - 1", "z^4 - 1", "z^5 - 1" and
  "z^3 - 2z + 2", `allowsCustom: false`; `isVariantValue` takes those four and
  nothing else, and `defaultVariant("newton")` is "3". The value for the fourth
  is the word **"cycle"**, not a digit, because it is the one polynomial with no
  power to name it by and the loop is what makes it the classic example. It is a
  value no other fractal draws, so the codec's cross-fractal reading is
  unchanged: "3", "4" and "5" were already Multibrot powers, and "cycle" is
  dropped by every other fractal's `viewLinkToUpdates`/`variantOn` the way a
  power is dropped by Julia. **An old Newton link is the same picture**: `f=newton`
  with no `k` decodes to no variant, and `viewLinkToUpdates` fills it from
  `variantOn("newton", …)` — "3", which is z^3 - 1. `presetFractalFields`
  writes the choice under `variant`, `presetVariant` reads it and falls back to
  "3", and `presetFractalFields("newton", …)` needing a `variant` is why
  `fractalVariants("newton")` being non-null matters to saved views too.
- **Places.** All nine existing Newton places gained `variant: "3"` (without
  it `sameVariant` would read them as a different picture from every Newton
  view, which is exactly the bug the Multibrot places avoid by carrying one),
  and six were added, two per new polynomial: the whole picture of each — which
  has to sit exactly on `defaultViewFor("newton")` (the origin at zoom 1)
  because that is what `wholeSetPlaceFor` looks for, and the one frame holds
  every root of all four — and one detail each. `NEWTON_PLACES` is 15 and
  `places.test.ts`'s count went from [8, 10] to [14, 16]. Measured at 64x48 with
  whole counts: `newton-4-whole` 16% one colour, 117 distinct counts;
  `newton-4-braid` (0.7, 0.7 at zoom 6, ocean) 31% and 165; `newton-5-whole`
  16% and 202; `newton-5-braid` (0.9, 0.6 at zoom 6, rainbow) 18% and 242;
  `newton-cycle-whole` 18% and 65; `newton-cycle-loop` (the origin at zoom 6,
  classic) 12% and 64. The two "whole" views for z^4 - 1 and z^5 - 1 read best
  in rainbow, like the existing whole-basins place; the z^4 - 1 braid is the one
  place in ocean, because ocean's four blues separate its four basins where a
  scheme that repeats a hue does not. **The featured place is unchanged**
  (`newton-junction`, the pinwheel at the origin), so `FEATURED_PLACE_IDS` and
  the featured guards are untouched.
- **The places test's basin guard now reads each place's own band.** "At least
  two basins show in every Newton place" divided by `NEWTON_BAND` (a third);
  it now divides `cap` by the place's own root count, via
  `newtonPolynomialFor(place.variant).roots.length`, so the four- and five-root
  polynomials are judged by their own bands.
- **Math card.** `FRACTAL_MATH.newton` is a function of the variant (as the
  Multibrot's and the Magnet's are). The rule is assembled per polynomial from a
  `p(z)` and a `p'(z)` tree — z → z − (z³ − 1)/(3z²), …(z⁴ − 1)/(4z³),
  …(z⁵ − 1)/(5z⁴), and for the cubic z → z − (z³ − 2z + 2)/(3z² − 2) — and the
  **setting is no longer null**: label "Polynomial, the equation whose solutions
  it hunts for", value the equation written `= 0`. The blurbs and escape
  sentences are per polynomial; the cycle's says the method is caught in a loop
  beside the origin and that the orbit plot draws it circling rather than
  arriving. `toPlainText` words a fourth and fifth power as "to the power 4" and
  "to the power 5" (only squared and cubed are special), so that is what the
  card's reading says and what the tests assert.
- **`npm run make-og-previews`** was run and the six
  `public/og/newton-{4,5,cycle}-*.jpg` files committed (41 to 132 KB, all at
  quality 80; the set is 92 pictures, 6.5 MB). Nothing else in `public/og/`
  changed.
- **The button row and the chip row**: the Newton chip row is the widest of the
  four (its longest label is "z^3 - 2z + 2"), and it scrolls sideways like the
  others where the picture is narrower than it. The switcher's classes are
  unchanged and it was not re-measured in a browser.
- Tests: `newton.test.ts` grew from 26 tests to 60 — the polynomial registry and
  the parser's refusals, and a `describe.each` over the three new polynomials
  (every root reached at its band's near edge, a point near each root, disjoint
  bands over a grid, far/huge/NaN points, longer orbits sitting further along
  the band, smooth-count continuity across a whole-count jump inside one basin,
  the turn that moves a band on by one for the two `z^d - 1` powers, the mirror
  about the real axis, and one colour family per root in every scheme) plus a
  block for the cyclic cubic (the 0↔1 loop at any cap, points beside it, the two
  vanishing-derivative points, agreement with a textbook Newton oracle over the
  plane, and that most of the frame settles). The new polynomials were added to
  `escapeInfo`, `orbit`, `mathProbe` and `renderRgba`'s per-kind tables, and the
  new files to `blankView.test.ts` — whose default-view guard now covers
  Newton's four opening views explicitly, **because two non-Newton variant
  openings are genuinely blank** (a Julia Dendrite and a z^5 Multibrot at 64x48
  in one scheme each) and the general claim would be false. `presets.test.ts`
  gained the Newton `variant` field for both `presetFractalFields` and
  `presetVariant`; `ogImage.test.ts` that each polynomial's whole view previews
  as its own picture; `fractalTypes.test.ts` the descriptor, `isVariantValue`,
  `defaultVariant` and `variantOn` for the new value; `viewLink.test.ts` the
  `k` round trip and (as before) that a value the fractal cannot draw is not
  written; `viewLinkState.test.ts` that a Newton link with no `k` opens on
  z^3 - 1 and one with a `k` applies it; `viewPreview.test.ts` the line, which
  now reads "Newton fractal, z^3 - 1, 8x"; `fractalMath.test.ts` the three new
  rules, the four equations and the per-polynomial words; and the `tourLink`
  stops carry `variant: "3"`, which they must now. `make gate` is green.
- Docs: the README (Fractal Types, Fractal Switcher, Custom Presets, the Math
  card, Project Structure, the Mathematics Newton section, and the count in the
  Mathematics intro, which said "Seven of the eight"), the Help overlay's
  switcher row, the design doc's As built (a new "Newton's polynomials" entry),
  and this note.

### Magnet: a ninth fractal, with the magnetic types as its variant (2026-10-11)

- fr-ihs. The Magnet set is the parameter plane of the magnetic model's two
  rational maps, from the renormalisation transformation for a hierarchical
  lattice (Yang and Lee's complex temperatures, in Peitgen and Richter's *The
  Beauty of Fractals*, pp. 129-146). Both start at z = 0 and step by squaring a
  fraction: Type I is z -> ((z² + c − 1)/(2z + c − 2))², Type II is
  z -> ((z³ + 3(c−1)z + (c−1)(c−2))/(3z² + 3(c−2)z + (c−1)(c−2) + 1))². It is
  the second fractal after the Multibrot to use the variant mechanism, and the
  type is its variant: a Type row of chips, `k=1` or `k=2` in a link, stored as
  `variant`. It follows the Tricorn and the Celtic line for line everywhere
  else, with no new machinery in the renderer, the recolour or the link format.
- **`src/lib/magnet.ts`** exports `MAGNET_TYPES` ([1, 2]), `MAGNET_TYPE_LABELS`
  ("Type I", "Type II"), `parseMagnetType` and `createMagnetKind(type)`, which
  throws a `RangeError` for any other type, so a value from outside never
  reaches it (`resolveFractalKind` parses first and falls back to Type I, as an
  unknown Julia name falls back to the first constant). `MAGNET_BAILOUT` is 100
  and `MAGNET_TOLERANCE` is 1e-6, both as the bead names them.
- **The picture, and what it is worth knowing before framing one.** z = 1 is a
  fixed point of either map for every c, and a superattracting one — the
  derivative is 0 there as well, because the two sides of the fraction are
  equal at z = 1 as functions of c. So the c whose orbit is drawn into that
  fixed point is *nearly the whole plane*, and the set the picture is named for
  is most of any frame: the renderer paints it the cap, which is black. What
  the colours draw is the island of c whose orbit runs off to infinity instead,
  with the fractal boundary between the two basins through it. This is the
  first fractal here whose "inside" is the majority of the plane, and it has
  three consequences below (no overview view, no whole-set featured place, and
  a mostly black default frame). It is not a bug in the kind: Ultra Fractal's
  own `Standard_Magnet1Mandelbrot` documents the same two bailouts, 100 and
  5e-5, and practitioners note the same large convergence zone.
- **The count.** A point is inside when |z − 1| < 1e-6, tested at the top of
  each lap, and the count is the cap, which the colour mapping paints black
  like the inside of any other set. A point is outside when |z| > 100, tested
  after the step, and the count is the steps completed before the step that
  took it out. The smoothing is the shared degree-2 formula carried to this
  kind's radius: `n + 1 − log2(log|z| / log 100)`. The radius has to appear —
  that expression is the shared `n + 1 − log2(log2|z|)` exactly when R = 2, and
  a formula that left R out would move every count by log2(log2 100), about
  2.7 steps. With R = 100 a point that stepped out just past the bailout gets
  a shade under n + 1 and one that overshot by the whole of the next squaring a
  shade under n, so the seam where the whole count steps is under 0.5 of a step
  and the count moves by under 0.01 between samples 1e-5 apart.
- **The pole guard.** Both denominators have real roots — the points the map
  sends to infinity. The first type's `2z + c − 2` is zero at the orbit's own
  start z = 0 when c = 2; the second type's `(c − 1)(c − 2) + 1` is zero at
  z = 0 where c² − 3c + 3 = 0, that is 1.5 ± (√3/2)i. A step from one answers
  `null` rather than dividing by zero, and the kind counts the orbit as gone on
  that step, so no NaN and no infinity reaches the renderer: a grid of 8100
  points across the plane gives a finite count in 0..cap for every one of them,
  and a NaN or infinite input point runs the cap like any other kind's does.
- **The smooth count can come out a little under zero**, because a point just
  off a pole steps out enormously and log|z| of an enormous step is worth more
  than a step. The other kinds' can too; the colour mapping reads a negative
  count as the start of the palette, and the tests state the floor the grid
  holds to (−8) rather than clamping, which would be new behaviour for a
  shared convention.
- **Registered like the Multibrot**: `FRACTAL_TYPES` has `{ id: "magnet",
  label: "Magnet" }` after Perp. Ship, `fractalVariants("magnet")` is label
  "Type" with options "1" and "2" labelled "Type I" and "Type II" and
  `allowsCustom: false`, `defaultVariant` is "1" and `isVariantValue` takes the
  plain spellings only. `viewLink`, `presetFractal` and the tour link read ids
  and variants through those, so a link and a saved view of either type
  round-trip with no change to the codec. `viewPreview` names it "Magnet set"
  in a link's line.
- **A cross-fractal consequence of the shared `k` field, and the test that had
  to move.** The codec reads a `k` by asking every fractal whether it can draw
  the value, so `f=multibrot&k=2` now decodes with a variant of "2" where
  before "2" was nothing: `viewLinkToUpdates` drops it for the Multibrot, which
  cannot draw it. `viewLink.test.ts`'s "drops a power it cannot read" list
  therefore loses "2" and gains a test stating the new reading; the magnet list
  loses "3" for the same reason, the other way round.
- **`defaultViewFor("magnet")` is (1.3, 0) at zoom 1.** Type I's island spans
  x −0.46..3.07 by y ±2.16 and Type II's x −0.20..2.30 by y ±1.53 (measured on
  a 0.02 grid at a cap of 150 and a 0.005 one at 400). Zoom 1 is the widest
  view the explorer has (4 by 3) and MIN_ZOOM is 1, so no shallower frame
  exists: this one holds either island across with the settled black either
  side, and crops Type I's top and bottom lobes, which is the most of its
  height the explorer can show at once. About 21% of the frame is the island
  and the rest is the settled set.
- **Two built-in views, both magnified, and no overview.** `presets.test.ts`
  requires every non-Mandelbrot built-in to be at most 60% "inside" at 96x72,
  and every frame that holds the Magnet's island is 65% or more; there is
  therefore no overview preset, and the two shipped are `magnet-drift` (Type I,
  centre 1.6 at zoom 8) and `magnet-lobe` (Type II, centre 1.6 + 1.05i at zoom
  8), 41% and 49% inside (on the cell-centred grid the guard measures on), with
  82 and 31 distinct counts. The preset count went from 24 to 26 and the
  fractal-owned count from 18 to 20.
- **Six places** (`MAGNET_PLACES`, the test allows 4 to 6): the whole Type I
  island and the whole Type II island, both at the default frame (which
  `wholeSetPlaceFor("1"|"2", "magnet")` must find, one per type); the curtain
  of disks (Type I at 1.3, zoom 4); a drift of disks (Type I at 1.6, zoom 8);
  dust over the waist (Type I at 0, 1.2i, zoom 16); and the bright lobe (Type
  II at 1.6 + 1.05i, zoom 8). All are classic. **The featured place is the
  drift of disks, not a whole-set view, and that is a deliberate departure from
  the bead.** The featured guard holds a button's landing under 60% one colour
  and no Magnet frame that reads as the whole set is under 65%, so the button
  leads with the structure the picture is made of instead; the drift measures
  41% of a 96x72 grid inside, 82 distinct counts and 39% one colour at 64x48.
  `FEATURED_IS_OPENING_VIEW` does not gain magnet, and the
  reason is written where the other entries' reasons are, in the
  `FEATURED_PLACE_IDS` comment.
- **Math card**: `FRACTAL_MATH.magnet` is a function of the variant, with the
  type's own fraction as the rule (Type I `z → ((z² + c − 1)/(2z + c − 2))²`,
  Type II the longer one), `z₀ = 0` and c the pixel's point, the setting "Type"
  with Type I or Type II as its value, a three-sentence blurb that says most of
  the plane settles and the colours draw the island, and an escape sentence
  naming the tolerance and the bailout. `fractalMath.test.ts` reads both rules
  aloud.
- **The orbit plot draws no escape circle for magnet**: its orbits leave at
  100 rather than 2, so the circle of 2 would sit inside their wandering rather
  than at the boundary of the picture. `hasEscapeCircle` is now false for
  newton and for magnet, and `orbitMinExtent` gives magnet the escape-time
  frame of 2 (the scale a magnet orbit moves at) with Newton keeping 1.
- **`npm run make-og-previews`** was run and the six `public/og/magnet-*.jpg`
  files committed (46 to 170 KB, all at quality 80; the set is 86 pictures,
  6.1 MB). Nothing else in `public/og/` changed.
- **The button row**: nine buttons are wider than the eight's, so the row
  scrolls sideways at 375 and 320 px as it already did. It was not re-measured
  in a browser; the switcher's classes are unchanged.
- Tests: the new `src/lib/__tests__/magnet.test.ts`, and the Magnet cases
  added to `fractalTypes`, `viewLink`, `viewLinkState`, `viewPreview`,
  `tourLink`, `escapeInfo`, `orbit`, `mathProbe`, `orbitPlot`, `renderRgba`,
  `fractalMath`, `places`, `presets`, `tour` and the switcher panel test, each
  extended to the new count rather than loosened. `escapeInfo.test.ts` and
  `orbit.test.ts` grew an optional grid (the magnet set is not around the
  origin) and `mathProbe.test.ts` an optional view (the same). `make gate` is
  green.
- Docs: the README (intro, Fractal Types, Fractal Switcher, Custom Presets,
  Mathematics, Project Structure), the Help overlay's switcher row, the design
  doc's As built, and this note.

### Perpendicular Ship: an eighth fractal (2026-10-11)

- fr-d1s. The Perpendicular Ship is the Burning Ship's cousin with only one half
  of the step folded: the Mandelbrot loop with the imaginary part taken against
  the size of the real part, z -> (|Re z| - i Im z)^2 + c, that is
  x' = x^2 - y^2 + cx and y' = -2|x|y + cy. The two folds of the Burning Ship are
  both along the axes; here they sit at right angles, which turns the ship's
  jagged two-sided outline into a flat-backed black hull with a bowed sail and
  rows of masts along its edge. It is added with no new machinery: it follows the
  Tricorn and the Celtic line for line.
- **`src/lib/perpendicularShip.ts`** exports `perpendicularShipKind` (id
  `perpendicular-ship`) with `iterations`, `escapeInfo` and `orbit`, all the same
  loop (the count returns the step index of the escape, the cap for an orbit that
  does not, and the shared smooth count; `escapeInfo.test.ts`, `orbit.test.ts`
  and the pixel parity in `mathProbe.test.ts` hold the three together). No
  interior shortcut: the cardioid test is closed form for the Mandelbrot set only.
- **The exact facts the tests lean on.** Both `x^2` and `|x|` are even in x, so a
  step does not depend on the sign of the point's real part; conjugating every
  point of an orbit turns -2|x|y into -2|x|(-y) while x^2 - y^2 is unchanged, so
  conjugating c conjugates the orbit and the set keeps the Mandelbrot set's
  mirror symmetry about the real axis, bit for bit; and on the real axis y stays
  0 and the fold changes nothing, so the counts agree with the Mandelbrot kind's
  there, smoothing included. Worked by hand, c = i cycles
  (0, i, -1 + i, -i, -1 + i, ...) and never escapes, and c = -1.7 + 0.1i reaches
  (-2.0107, -0.3868) on the step that escapes, whose |z|^2 is 4.19: three steps
  completed, where the Mandelbrot kind takes five.
- **The smooth count is the shared convention**, so every colour scheme,
  recolour, Shift/Reverse and cycling work unchanged. `perpendicularShip.test.ts`
  measures the seam where the whole count steps (under 0.5 of a whole step) and
  the movement between samples 1e-5 apart (under 0.01), as the Celtic kind's own
  test does.
- **Registered like the Tricorn, with no variant**: `FRACTAL_TYPES` has `{ id:
  "perpendicular-ship", label: "Perp. Ship" }` after Celtic, `resolveFractalKind`
  returns `perpendicularShipKind` whatever variant the page holds,
  `fractalVariants` is `null` so there is no second row and the codec writes
  `f=perpendicular-ship` with no `k`; `viewLink`, `presetFractal` and the tour
  link read the id through `FRACTAL_TYPES`, so a link and a saved view
  round-trip with no change to either. `viewPreview.ts` names it "Perpendicular
  Ship" in a link's line. The label is the one shortened name in the picker, on
  purpose: eight full ones are about 435 px at text-xs and the switcher's row is
  capped at the picture's width and scrolls, so "Perp. Ship" keeps the row
  readable on a phone. Every surface the picker draws the name on says it that
  way (the switcher, the Fractal select, the canvas's own label, a saved file's
  name), while the Math card's title, a link's line (`viewPreview`) and the Help
  row spell the fractal in full.
- **`defaultViewFor("perpendicular-ship")` is (-0.55, 0) at zoom 1.** Measured
  with a 0.02 grid at a cap of 200 and a 0.004 one at 400, the set spans
  x -1.78..0.68 by y -1.09..1.09, so -0.55 is the middle of its real extent and
  zoom 1 (x -2.55..1.45, y -1.5..1.5) holds the whole of it with 0.4 or more
  clear on every side. Corners are sky; the set is 10 to 60% of a 60x45 grid.
- **Five places** (`PERPENDICULAR_SHIP_PLACES`, the test allows 4 to 6), each
  drawn at 480x360 through the real pipeline in the five schemes and then held to
  the catalogue's guards (not blank, at most 60% one colour at 64x48 with whole
  counts, link round trip): the whole ship (16% one colour in classic), the bow
  and its neck, the masts along the deck (rainbow), the lace tendrils off the
  hull (classic) and a shredded sail on the hull's edge (rainbow). Only the upper
  half's places are named, since the set is mirrored about the real axis and the
  lower half is the same pictures the other way up. The real axis is the
  Mandelbrot set's, so `REAL_AXIS_MATCHES_MANDELBROT` lists
  `perpendicular-ship` and no place is zoomed in on it. **The featured place is
  the whole ship**, which is also the view the Fractal select opens it on, so
  `places.test.ts` exempts it from "a switch goes somewhere" the way it does the
  Tricorn and the Celtic set (`FEATURED_IS_OPENING_VIEW`).
- **Two built-in views** (`perpendicular-ship-overview`, the default frame;
  `perpendicular-ship-tendrils`, the lace at zoom 4), under the per-fractal
  guards in `presets.test.ts` (18 fractal-owned views, 24 built-ins).
- **Math card**: `FRACTAL_MATH["perpendicular-ship"]` — title "Perpendicular
  Ship", the rule z -> (|Re z| - i Im z)^2 + c, starting at 0 with c the pixel's
  point, no setting, a three-sentence blurb and the shared escape sentence with
  one more about what the orbit plot shows (a step squares the real part and
  takes the imaginary part against its size, so a point and its reflection in the
  imaginary axis go to the very same next point). `fractalMath.test.ts` reads the
  rule aloud.
- **`npm run make-og-previews`** was run and the five
  `public/og/perpendicular-ship-*.jpg` files committed (36 to 136 KB, all at
  quality 80; the set is 80 pictures, 5.4 MB). Nothing else in `public/og/`
  changed.
- **The button row**: eight buttons are wider than the six's 375 px, so the row
  scrolls sideways at 375 and 320 px as it already did. The switcher's classes
  are unchanged and the row was not re-measured in a browser.
- Tests: the new `src/lib/__tests__/perpendicularShip.test.ts`, and the
  Perpendicular Ship cases added to `fractalTypes`, `viewLink`, `viewLinkState`,
  `viewPreview`, `tourLink`, `escapeInfo`, `orbit`, `mathProbe`, `orbitPlot`,
  `renderRgba`, `fractalMath`, `places`, `presets` and `tour` tests, each
  extended to the new count rather than loosened (the tour test's share run went
  from 200 to 400 hops, since eight fractals over 200 hops can leave one with
  almost nothing: twelve seeds ranged 0 to 62 over 200 and 8 to 124 over 400).
  `make gate` is green.
- Docs: the README (intro, Fractal Types, Switcher, Custom Presets, Project
  Structure, Mathematics), the Help overlay's switcher row, the design doc's As
  built, and this note.

### Celtic Mandelbrot: a seventh fractal (2026-10-11)

- fr-gx5. The Celtic Mandelbrot set is the Mandelbrot loop with the real part of
  the square folded by an absolute value: z -> (|Re(z^2)| + i Im(z^2)) + c, that
  is x' = |x^2 - y^2| + cx and y' = 2xy + cy, from z = 0, escape when |z|^2 > 4.
  It is the first fractal added with no new machinery: it follows the Tricorn and
  the Burning Ship line for line.
- **`src/lib/celtic.ts`** exports `celticKind` (id `celtic`) with `iterations`,
  `escapeInfo` and `orbit`, all the same loop (the count returns the step index of
  the escape, the cap for an orbit that does not, and the shared smooth count;
  `escapeInfo.test.ts`, `orbit.test.ts` and the pixel parity in `mathProbe.test.ts`
  hold the three together). No interior shortcut: the cardioid test is closed
  form for the Mandelbrot set only.
- **Two exact facts the tests lean on.** The fold touches only the real part, so
  conj(z_n(c)) is z_n(conj c) step for step and the set keeps the Mandelbrot
  set's mirror symmetry about the real axis, bit for bit; and on the real axis y
  stays 0 and |x^2| is x^2, so the counts agree with the Mandelbrot kind's there,
  smoothing included. It has no symmetry about the imaginary axis. Worked by
  hand, c = i is in the Mandelbrot set and escapes the Celtic loop at step 2
  (0, i, 1 + i, 3i), and c = 2 escapes at 1 in both. Every step's real part is at
  least c's, which is what the Math card's escape sentence says the orbit plot
  shows.
- **The smooth count has a seam where the whole count steps**, measured: the
  shared formula is the Mandelbrot one with escape radius 2, exact only as the
  radius grows, and with |c| of order 1 the escaping point's size is |z|^2 + c
  rather than |z|^2. Along a line well outside the set the seam is under 0.5 of a
  whole step and everywhere else the smooth count moves by under 0.01 between
  samples 1e-5 apart (`celtic.test.ts`). The Mandelbrot kind has the same seam; it
  is the convention, left alone.
- **Registered like the Tricorn, with no variant**: `FRACTAL_TYPES` has `{ id:
  "celtic", label: "Celtic" }` after Newton, `resolveFractalKind("celtic", ...)`
  returns `celticKind` whatever variant the page holds, `fractalVariants` is
  `null` so there is no second row and the codec writes `f=celtic` with no `k`;
  `viewLink`, `presetFractal` and the tour link read the id through
  `FRACTAL_TYPES`, so a link and a saved view round-trip with no change to
  either. `viewPreview.ts` names it "Celtic Mandelbrot" in a link's line.
- **`defaultViewFor("celtic")` is (-0.8, 0) at zoom 1.** Measured with a 0.004
  grid at a cap of 400 the set spans x -1.78..0.33 (the spike at -2 is thinner
  than the grid) by y -1.55..1.55, so the body runs a little past zoom 1's
  1.5 at the top and bottom, which is the widest view there is, and -0.8 is the
  middle of the real extent: the spike and the nose are both inside with 0.8 to
  spare. Corners are sky; the set is 10 to 60% of a 60x45 grid.
- **Six places** (`CELTIC_PLACES`, the test allows 4 to 6), each picked from
  contact sheets at 400x300 through the real pipeline and then held to the
  catalogue's guards (not blank, at most 60% one colour at 64x48 with whole
  counts, link round trip): the whole set (25% one colour), two bulbs on the nose
  (47%), lace and small copies (25%), an arrowhead among the lace (48%), the fold
  line and its arcs (39%) and branching dust (20%). Every place is in classic: the
  contact sheets in rainbow, fire and ocean were flat fields (46 to 79% one
  colour) or dark. The real axis is the Mandelbrot set, so
  `REAL_AXIS_MATCHES_MANDELBROT` lists `celtic` and no place is zoomed in on it.
  **The featured place is the whole set**, which is also the view the Fractal
  select opens the fractal on, so `places.test.ts` exempts it from "a switch goes
  somewhere" the way it does the Tricorn (`FEATURED_IS_OPENING_VIEW`), and the
  "opens each fractal on a place" test is satisfied by the same place.
- **Two built-in views** (`celtic-overview`, the default frame; `celtic-lace`,
  the lace at zoom 4), under the per-fractal guards in `presets.test.ts` (16
  fractal-owned views, 22 built-ins).
- **Math card**: `FRACTAL_MATH.celtic` — title "Celtic Mandelbrot set", the rule
  z -> (|Re(z^2)| + i Im(z^2)) + c, starting at 0 with c the pixel's point, no
  setting, a three-sentence blurb and the shared escape sentence with one more
  about what the orbit plot shows. `fractalMath.test.ts` reads the rule aloud.
- **`npm run make-og-previews`** was run and the six `public/og/celtic-*.jpg`
  files committed (16 to 167 KB, all at quality 80; the set is 75 pictures,
  5.0 MB). Nothing else in `public/og/` changed.
- **The button row**: seven buttons are wider than the six's 375 px, so the row
  scrolls sideways at 375 and 320 px as it already did. It was not re-measured
  in a browser; the switcher's classes are unchanged.
- Tests: the new `src/lib/__tests__/celtic.test.ts`, and the Celtic cases added
  to `fractalTypes`, `viewLink`, `viewLinkState`, `viewPreview`, `tourLink`,
  `escapeInfo`, `orbit`, `mathProbe`, `orbitPlot`, `renderRgba`, `fractalMath`,
  `places`, `presets` and `tour` tests, and the switcher panel test, each
  extended to the new count rather than loosened.
- Docs: the README (intro, Fractal Types, Switcher, Custom Presets, Project
  Structure, Mathematics), the Help overlay's switcher row, the design doc's As
  built, and this note.

### Share: the browser's own share sheet, where there is one (2026-10-11)

- fr-jca. A phone can send a view to a chat in one tap rather than through the
  clipboard, so the Settings drawer's Navigation card now has a **Share**
  button beside Copy link, drawn only where the browser has a sheet to open.
  It hands the sheet the *same link* Copy link copies — the query form, on this
  origin and path — under the view's own title, and changes nothing else: the
  copy buttons, the address bar and the page's state are as they were.
- **`src/lib/shareView.ts`** is the new module and holds every decision, so the
  page's `handleShare` is wiring and a Node suite drives the rest.
  `shareSheet(navigator)` is `navigator.share` as a callable, or null where the
  browser has none — the whole of the visibility test, and the reason a desktop
  Firefox sees no button at all. `shareViewPayload({ origin, pathname, link,
  line })` is `{ title: shareTitle(line), url: copyLinkUrl(origin, pathname,
  link) }`, so the URL is Copy link's own builder (the page still has exactly
  one `copyLinkUrl(` in it, and a test pins that) rather than a second form
  that could drift, and `shareTitle` is `${line} - ${TITLE}` from `siteText.ts`
  — the same title `pageMetadata.ts` gives the head for the same link, so the
  sheet and a chat that follows the link say the same words. The `line` is
  `describeViewLine`'s ("Julia set, Dendrite, 400x"), so the payload describes
  the view rather than the app.
  `canSharePayload(navigator, payload)` asks `navigator.canShare` about the
  payload actually being sent where the browser has it (a browser that throws
  instead of answering has not said yes) and counts one without it as a yes;
  `shareOutcome(error)` answers `"cancelled"` for an `AbortError` — the visitor
  dismissing the sheet, which is their own answer and says nothing — and
  `"fallback"` for everything else.
- **No hydration mismatch is structural, not remembered.** The button is gated
  on `useSyncExternalStore(subscribeToShareSupport, getShareSupportSnapshot,
  getServerShareSupportSnapshot)`, the shape `orbitPlot.ts` already uses for
  `prefers-reduced-motion`: the server snapshot is `false`, the client snapshot
  is read once after mounting, and there is nothing to subscribe to because a
  browser does not grow a share sheet while the page is open (so a `setState` in
  an effect — which `react-hooks/set-state-in-effect` refuses here — is not
  needed either). The button is therefore in neither the prerendered HTML nor
  the first client render, and a browser that has a sheet gains it on hydration.
- **The handler** (`FractalExplorer.tsx`). `handleShare` builds the link the way
  Copy link does — `viewLinkFor(cycleShiftRef.current)`, so the palette is the
  one the canvas is painted with even while it is cycling — and never calls
  `writeViewLink`: the sheet needs nothing of the address bar, which already
  names the view on screen. A browser with no sheet, and one that says this
  payload is not shareable, are the same answer and go through the same
  `copyUrl(payload.url)` Copy link uses, so a failed share is the old flow —
  "Link copied", or the read-only field where the clipboard refuses — rather
  than a button that did nothing. A dismissal calls nothing; a non-abort
  rejection calls `copyUrl`. `navigator.share` is called on the navigator it
  came from (a WebIDL method detached from its receiver is allowed to refuse)
  and a synchronous throw is caught and falls back the same way. The button is
  `variant="secondary" size="sm"` like its neighbours and its text is its
  accessible name.
- **Not changed**: Copy link and Copy tour link (their panel tests are
  untouched), the address bar and the journey, the clipboard path (`copyUrl`
  is still the page's one `clipboard.writeText`), the page's state, the query
  codec, and every server-side path.
- **Verified in headless Chrome** (CDP against the standalone production build
  on port 3145, `Page.addScriptToEvaluateOnNewDocument` for the share sheet).
  The prerendered HTML carries no Share button (zero `<button …>Share</button>`
  while Copy link is there) and the button is in the DOM after mounting, so the
  server and the first client render agree; Chrome 154 for Testing on macOS has
  `navigator.share` itself, so the plain page already draws the button. Clicking
  it handed the sheet `{title: "Mandelbrot set, 1x - Next Fractals - Interactive
  Fractal Explorer", url: "http://127.0.0.1:3145/?v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto&w=800&h=600"}`,
  and `navigator.canShare` was asked about that same payload. A view with its
  own palette (`?v=1&f=julia&k=Dendrite&z=400&s=fire&r=1&o=0.25`) arrived as
  `…?v=1&f=julia&k=Dendrite&x=0&y=0&z=400&s=fire&r=1&o=0.25&i=auto&w=800&h=600`
  under "Julia set, Dendrite, 400x - …", with the address bar left on the hash
  form (Share writes nothing to it). An `AbortError` left every status line
  empty and drew no field; an `Error`, and a sheet that threw synchronously
  instead of rejecting, each put the URL in the read-only field with "Press
  Ctrl+C to copy" — the copy flow, which is what the headless clipboard's
  refusal gets. With `canShare` answering no, `navigator.share` was never called
  at all. With `navigator.share` removed the page drew no Share button, Copy
  link and Copy tour link sat side by side as before and Copy link still worked.
  No console output of any kind — no hydration warning — in any run.
- Tests: the new `src/lib/__tests__/shareView.test.ts` (no sheet for a
  navigator without `share`, a null, or something else under that name; the
  sheet called with the payload on the navigator it came from; the server
  snapshot false; `canSharePayload` a yes from a browser that cannot answer,
  the browser's own answer where there is one, and a no from one that throws;
  `shareOutcome` silent for an `AbortError` of any shape and fallback for an
  `Error`, another `DOMException`, `null`, `undefined` and a bare string; the
  payload's URL equal to `copyLinkUrl`'s and carrying no `#`; the title) and
  the new `src/__tests__/share-panel.test.ts` (sources: the button beside Copy
  link and only there, its style and its `{shareOffered && (`, the store read
  with no `setShareOffered` anywhere, the handler's link, payload, title and
  the one `copyLinkUrl(` left in the page, no address-bar write, the fallback
  through `copyUrl`, and the one `clipboard.writeText`). `make gate` is green.
- Docs: the README's Sharing a View bullet, its Project Structure
  (`shareView.ts`), a "Share" row in the Help overlay's Views and links group,
  and the Share sheet bullet in Project Architecture.

### The view keys work anywhere on the page, and R resets (2026-10-11)

- fr-ia7. The arrows panned and `+`/`-` zoomed only while the canvas itself had
  focus (`handleCanvasKeyDown`), so a keyboard user had to Tab to the image
  first — and nothing on the page reset the view from the keyboard. Both are
  fixed by one listener on the window: the arrows pan, `+`/`-`/`=`/`_` zoom and
  **R puts the view back to the fractal's own default frame**, exactly as Reset
  View does, from wherever focus happens to be. A field, a slider, a button, a
  link, an editable region, the Settings drawer, the Help overlay and the Math
  card all keep their own keys, and so does any combination with Control, Meta
  or Alt.
- **`src/lib/pageKeys.ts`** is the new module and the whole rule.
  `PAGE_VIEW_KEYS` is the eight pan-and-zoom keys; `pageKeyAction(event)`
  answers `"view"`, `"reset"` or null from the parts of the event the decision
  needs — `key`, the three modifiers, the target's tag name, whether it is
  contenteditable, and whether it sits inside an open dialog or the Math card.
  It declines `INPUT` (a range slider is an input, which is what keeps the
  arrow keys driving the Zoom Level slider rather than the picture), `SELECT`,
  `TEXTAREA`, `BUTTON` and `A`. Like `opensHelpShortcut` beside it, the rule is
  pure and takes no DOM, so every accept and every decline is a Node test.
  Shift is not among the modifiers it checks: it is how `+`, `_` and `R` are
  typed, so a rule that refused it could offer no zoom in and no capital R.
- **The page reads it off the window** (`FractalExplorer.tsx`): one
  `useEffect` adds `handlePageKeyDown` to `keydown`, and the canvas's own
  `onKeyDown` is **gone**. One listener rather than two, deliberately: React's
  synthetic handler and a window one would each see a key pressed with the
  picture focused and move the view twice. The step and the bounds maths are
  still `keyNavigationBounds`'s, so one gesture means one thing; the live
  `boundsRef` rather than the committed state, so a held key's repeats each
  step from the view the last one produced.
- **The four facts about the focused element are read in the handler**:
  `target?.tagName`, `target?.isContentEditable`, `Boolean(target?.closest(
  "dialog[open]"))` — the drawer and the Help overlay are both `<dialog>`, so
  one selector covers both — and `mathCardPanelRef.current?.contains(target)`,
  which needed no new markup because the page already holds the card's panel.
  `preventDefault` is called only after the rule has answered and only for a
  key the page acts on, so page scroll and the browser's own shortcuts are
  untouched everywhere else.
- **R is `resetToDefault`, the Reset View button's own handler**, so the two
  cannot drift; it is not a jump (Reset View is not one), so it rewrites the
  current history entry rather than pushing one, and it restarts the walk's
  countdown through `applyDefaultView` exactly as the button does.
- **A tour takes the page over, so the view keys stand down while one plays**
  — `pageKeyAction` declines when `tourPlaying`. The tour is documented in five
  places as "any key, touch, click or mouse movement stops it and brings
  everything back on the place it was showing", and a page-wide listener that
  also panned would break that: the key would stop the tour *and* jump the
  picture a tenth of the way from the place it stopped on. This is also the
  page's own pattern — the address bar's follower, the probe, the palette
  cycling and the strip all stand down for a tour. The key still ends the tour
  exactly where it did before, through the window capture listener.
- **The guard asks about the keypress and not about the page, and that is not
  a detail.** The tour's input listener is on the window in the *capture*
  phase, so it sees every key before this one does — and it stops the tour as
  it goes, so by the time the page's handler runs, React's `tourPlaying` is
  already false and the key that stopped the tour would move the picture
  anyway. Measured in headless Chrome: `defaultPrevented` was false at the
  handler and the view still panned exactly one step. So `handleActivity`
  writes `keyEndedTourRef` — whether a tour was playing when this keydown
  arrived — *before* it gives the walk up and calls `activity()`, for every
  keydown including a repeat, and the handler declines on
  `tourPlaying || keyEndedTourRef.current`. Three consecutive headless runs
  then held the view still through the key that stopped a tour, with the tour
  still stopping.
- **Auto-wander is deliberately not in that guard.** A key during a walk moves
  the view and restarts the countdown, which is what the canvas-focused keys
  did before this landing and what the walk is built around ("every manual move
  restarts the interval"); standing them down would be a new restriction rather
  than the "identically to the canvas-focused behaviour" the bead asks for.
  R during a walk resets the view and restarts the countdown like any other
  manual move.
- **Two handlers became `useCallback`s and nothing about them changed.**
  `applyDefaultView` (deps `[wander]`) and `resetToDefault` (deps
  `[applyDefaultView, fractalType]`) are now stable, so the listener effect is
  not torn down and re-added on every render and `react-hooks/exhaustive-deps`
  stays quiet — the page had no warnings before this landing and has none
  after. The render path, the follower, the renderer, the crossfade and the
  tour are untouched.
- Docs: the Help overlay's Keyboard section loses its stale "Tab — Focus the
  image, so the keys below reach it" row and gains R's, and each row says the
  keys work from anywhere on the page; the README's Keyboard Navigation feature
  bullet, its Keyboard usage row and its Project Structure (`pageKeys.ts`); and
  the Page keys bullet in Project Architecture.
- Tests: the new `src/lib/__tests__/pageKeys.test.ts` (every pan and zoom key,
  `r` and `R`, eleven keys the page leaves alone, Control/Meta/Alt, Shift as
  the way `+`, `_` and `R` are typed, each of the five declining tag names
  including a slider, a contenteditable, an open dialog and the Math card, and
  the body, the canvas and no target at all — plus the guard that
  `PAGE_VIEW_KEYS` is exactly what `keyNavigationBounds` reads, both ways), the
  new `src/__tests__/page-keyboard-panel.test.ts` (sources: the listener on the
  window with its cleanup, the canvas handler gone and exactly one
  `keyNavigationBounds` call left, the facts handed to the rule, the early
  return, the reset through `resetToDefault`, the live bounds ref, the two
  `preventDefault` sites, and the Help and README wording), and the updated
  `canvas-first-page.test.ts` assertion (the canvas keeps its role, label and
  focus; its keys are the page's now). `make gate` is green.
- **Verified in headless Chrome** (CDP against the standalone production build
  on 127.0.0.1, real `Input.dispatchKeyEvent`): with the body focused an
  ArrowRight pans −0.75 → −0.35 (a tenth of the 4-unit span at zoom 1), `+`
  doubles the zoom, and R returns the opening link byte for byte; a press on
  the **focused canvas** pans exactly one step (−0.75 → −1.15, not the two a
  doubled handler would give); an arrow in a checkbox and `r` in a field leave
  the view alone; the Zoom Level slider takes the arrow itself (its own value
  0 → 0.001) and the page does not pan as well; an arrow on a button does
  nothing; Control+Arrow is the browser's; and with the drawer shut the keys
  drive the view again, the address bar following to `x=0.446332778` and on to
  `x=0.8426655559`. One thing measured and worth knowing: in some headless runs
  the render crawls at about one percent a second (Chrome throttling the
  yielding loop the renderer uses), so the address bar — which only follows a
  view that has been drawn — lags well behind; the live view moved correctly on
  every press in every run, and this is the renderer's own timing, not this
  landing's.

### /api/og stops rendering: a 308 to the pre-built picture, and the renderer is gone (2026-10-10)

- fr-5om. The follow-on fr-xnl named, and the owner's concern of 2026-10-10:
  `/api/og` was an unauthenticated endpoint that drew a PNG per request, so any
  stranger could ask the service to spend CPU. It draws nothing now. A request
  is answered with a **308** to the picture the view previews as, so a preview
  URL a crawler or chat app cached before the pre-built pictures existed still
  shows a picture; a query that is not a view — empty, garbage, a tour link
  this build cannot read — is answered with a 308 to the static card rather
  than a 404, so an old cached URL never shows a broken image. Both carry
  `Cache-Control: public, max-age=86400`.
- **One rule picks the picture, and it is the page's own.** The route is a
  dozen lines: `previewForQuery(new URL(request.url).search)?.image ??
  CARD_PATH`, and the origin from `siteOrigin((name) =>
  request.headers.get(name), env)` — validated, never the raw `Host`, as
  `requestOrigin` reads it for the page. `previewForQuery` is new in
  `viewPreview.ts` and is the whole of `previewFor` moved onto a query string;
  `previewFor(searchParams)` is now `previewForQuery(queryOf(searchParams))`, so
  the page's head and this route choose the picture through the same code and
  cannot disagree. That is the constraint's "the same pure function the page
  uses" made structural rather than checked. `viewPreview.ts` imports no
  renderer, so nothing the route reaches can draw.
- **What is gone.** `src/lib/ogRoute.ts` (the handler, the injected cache, gate
  and clock, the single-flight map and the sliced renderer), `src/lib/ogLimits.ts`
  (`LruCache`, `RenderGate`, `startBudget`, `OG_CACHE_ENTRIES`,
  `OG_QUEUE_LIMIT`, `OG_RENDER_BUDGET_MS`), `src/lib/pngEncode.ts` (`encodePng`,
  the only thing on `node:zlib`), and their three test files. The route's
  `runtime = "nodejs"` went with the encoder — it is runtime-agnostic now, and
  `dynamic = "force-dynamic"` is what remains (it still reads the query).
  `renderRgba.ts` is **kept**: `FractalRenderer` draws every row through it and
  so does `scripts/make-og-previews.mjs`, so it is untouched, `BYTES_PER_PIXEL`
  and all.
- **`ogView.ts` is now just the reader.** `parseOgQuery` returns
  `{ ok: true, view }` where `view` is the filled `ViewLinkUpdates` the picture
  is chosen from — the strict key-by-key validation is unchanged (a key present
  and refused still names the key; a too-long or wrong-version query is still
  "Not a view"), and the sentence still never echoes a value. Everything that
  was only for drawing is gone with the renderer: the `OgView` type's `key`,
  `kind`, `bounds`, `maxIterations` and `colorOptions`, `OG_MAX_ITERATIONS`, the
  canonical-key round trip and the `resolveFractalKind`/`autoIterations`
  imports. `OG_WIDTH`, `OG_HEIGHT` and `cardBounds` stay, because
  `make-og-previews.mjs` bundles them and frames every place with them.
  `viewPreview.previewForQuery` reads `parseOgQuery`'s view instead of decoding
  the query a second time, which is why the two cannot mean different things.
- **The property is pinned twice.** `src/__tests__/og-route.test.ts` walks
  `route.ts`'s source and fails if it names any of `ogRoute`, `ogLimits`,
  `pngEncode`, `renderRgba`, `node:zlib`, `LruCache`, `RenderGate`, `encodePng`,
  `renderOgPng`, `createOgHandler`, `renderRgbaRows` or `FractalRenderer`; and
  it drives the handler over a valid view (Dendrite at 400x → the whole
  Dendrite's picture), the whole Mandelbrot set, an empty query, `v=1` alone,
  `v=2`, an unreadable field, a 600-character value, a script-looking fractal,
  `&&&` and a bare `%`, asserting 308 with the expected `Location` and an empty
  body every time — never anything drawn. It also checks the origin is read
  from a forwarded host and that a forwarded host which is not a plain hostname
  and port (`evil.example.com/steal?x=`) is not echoed.
- **Verified against the standalone production build** (`node
  .next/standalone/server.js`, 127.0.0.1): `?v=1&f=julia&k=Dendrite&z=400` →
  `308` `Location: http://127.0.0.1:3137/og/julia-dendrite-whole.jpg`;
  `?v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto` →
  `/og/mandelbrot-whole.jpg`; no query, `?v=1&x=banana` and a hostile
  `x-forwarded-host` → `/og-card-2.png` (the hostile host not echoed); following
  each redirect gives the file itself (23,985 bytes `image/jpeg`, 149,648 bytes
  `image/png`).
- **Not changed**: the pre-built images and the place choice, the page's head
  (`fr-xnl` left it pointing at `/og/*`), the `/og/*` caching rule in
  `next.config.js`, `renderRgba`'s draw, and the route's path.
- Docs: the README's Image Route bullet, its integration list, its Project
  Structure (three modules removed, the route, `ogView.ts` and `renderRgba.ts`
  reworded) and its Link preview section; the design doc's As built; the
  `ogView.ts` and `viewPreview.ts` module comments; and this note.
- Tests: the rewritten `src/lib/__tests__/ogView.test.ts` (the reader: the
  codec's own query with and without its `?`, a reversed or shifted scheme, the
  fill-from-frame rule including the fr-99q Dendrite link, every refusal by
  name, one good field beside a bad one, the length ceiling, no value echoed,
  the zoom clamp, agreement with the decoder, and `cardBounds`'s three geometry
  cases) and the rewritten `src/__tests__/og-route.test.ts` above; the
  integration tier's image-route check follows the 308 to
  `/og/mandelbrot-whole.jpg` and the card for a query that is not a view.
  `make gate` is green.

### Static link previews: one pre-built picture per place, nothing drawn on request (2026-10-10)

- fr-xnl. A shared view used to preview as a picture `/api/og` drew for the
  request, and that route is an unauthenticated CPU endpoint: any stranger could
  ask the service to render. So every picture a preview can name is now drawn
  ahead of time and served as a static file, and nothing in the page's head
  points at `/api/og` any more (owner's concern and proposal, 2026-10-10). The
  head is otherwise unchanged: og:url, the title, the descriptions and the
  strictness of what counts as a view are as they were.
- **`src/lib/ogImage.ts`** is the new module and holds the whole rule.
  `ogImagePath(placeId)` is `/og/<place-id>.jpg`, spelled once for the generator
  and the head; `ogImageFor(view)` is that path for the nearest place of the
  view's fractal, or `CARD_PATH` (`/og-card-2.png`, moved here from
  `pageMetadata.ts`) when the view has no place. `OG_IMAGE_DIR` (`/og`),
  `OG_IMAGE_WIDTH`/`HEIGHT` (1200x630, which the card's own constants now alias)
  and `OG_IMAGE_MAX_BYTES` are the rest.
- **`nearestPlace(view, places)`** in `places.ts` is the rule underneath: the
  places of the view's own fractal, with the places that share its variant
  preferred when the fractal takes one (a Julia constant, a Multibrot power) and
  every place of the fractal as the fallback, so a custom Julia constant
  previews as some Julia set rather than another constant's shape. Within those,
  a view that *is* a place by `placeAtView`'s tolerance (1% of the view's span in
  the centre, 1% in zoom) names that place — which is what tells the whole
  Classic Julia set from its spirals, two places at one centre — and any other
  view names the place whose centre is nearest in the view's own spans
  (`centreDistanceFrom`, the centre half of `distanceFrom`, which `suggest` and
  `distanceFrom` now share). The zoom is otherwise not part of it on purpose:
  `distanceFrom`'s depth term answers "which place is a good next step" and would
  send the whole-set view to a place it is not on. Ties break by id, so a view
  always names one picture.
- **The pictures** come from `scripts/make-og-previews.mjs`, run by hand as
  `npm run make-og-previews` and never by `make gate`, the Docker build or CI:
  it esbuild-bundles the app's own modules into a temporary file, imports them,
  and draws every place with `renderRgba` at `cardBounds` (the 1.91:1 frame
  `/api/og` drew a card in), in `placeColorScheme(place, "classic")`, at
  `autoIterations(place.zoom)`, smooth — the picture the page draws when a
  visitor lands on that place, so a card cannot drift from the app. It encodes
  with `sharp` — the encoder `make-og-card.mjs` already uses, installed with
  Next.js, so `package.json` and the runtime bundle gain nothing — and fails
  rather than writes a picture that is nearly one colour (`isBlankImage`) or
  heavier than `OG_IMAGE_MAX_BYTES`; a `.jpg` no place names is deleted, so the
  committed set always matches the catalogue.
- **The file sizes, and the encoder the bead named.** The landing asked for
  quality 80 with at most 200 KB a file, and named `jpeg-js` as the encoder. The
  two cannot both hold: `jpeg-js` encodes full-resolution colour (4:4:4) where
  every other encoder subsamples it, so the busiest cards come out two to three
  times the budget — at quality 80 the set was 10.7 MB with `mandelbrot-seahorse-tail`
  at 616 KB and sixteen places over 200 KB, and at quality 60 nine were still
  over. Raising the per-file guard instead (700 KB, 10.7 MB committed) was
  written first and then dropped: the budget is the acceptance criterion, the
  pictures pay for it only slightly, and the repo's own card generator already
  uses `sharp`. It starts each picture at 80 and steps down only as far as it
  must: 67 of the 69 places are drawn at 80, `julia-classic-spirals` at 70 and
  `mandelbrot-seahorse-tail` at 67, and the set is 4.6 MB. `jpeg-js` was removed
  from `package.json` again — nothing else used it.
- **The head** (`viewPreview.ts`, `pageMetadata.ts`). `previewFor` gained
  `image` (the path), `imageType` and `alt`, built by `imageFor` from the same
  `nearestPlace` the picture comes from, so the alt cannot describe another
  picture: "Julia set, Dendrite, 400x, a picture of Dendrite: the whole set" —
  the line the title carries (for a tour, the tour's own line), and the place the
  picture is of, since it is not the view's own frame. `pageMetadata` points
  og:image and twitter:image at `<origin><preview.image>`, declares
  `image/jpeg` and 1200x630, and leaves og:url, the title and the descriptions
  exactly as they were. A query that is not a view, and no query at all, are
  still the static card and `CARD_ALT`. `VIEW_IMAGE_PATH` is gone from
  `pageMetadata.ts` — nothing named it — and `ogUrl` is untouched.
- **`/og/*` is cached** by a `headers()` rule in `next.config.js`:
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`. Next
  serves a file under `public/` with `max-age=0` and an ETag, so a crawler or a
  browser revalidated one on every share; these change only when the generator
  is run. The rule names `/og/:path*` and nothing else, and a test asserts the
  whole `headers()` value so the page, the health route and every other asset
  keep the headers they had.
- **`/api/og` is untouched** — route, limits, cache and renderer as they were,
  and no page points at it. Removing it is fr-5om, the bead this one blocks.
  _Superseded by the note above (fr-5om): the route now redirects and the
  renderer, limits and encoder are gone._
- Tests: `src/lib/__tests__/ogImage.test.ts` (`ogImagePath`; every place
  previews as its own picture; a view between two gives the nearer; a Dendrite
  view at the Classic spirals' own centre is a Dendrite picture and a power-5
  view on a power-3 place a power-5 one; a custom Julia constant is a Julia
  place; every `FRACTAL_TYPES` id resolves to a place of its own fractal;
  garbage — a `NaN`, an infinity, a zoom of nought or less, an unknown fractal —
  is the static card; and `nearestPlace` over a hand-built catalogue: the nearer
  of two, the place the view is on, the variant preference and its fallback, and
  null for a view it cannot measure or place),
  `src/__tests__/og-previews.test.ts` (the committed `.jpg` set is exactly the
  catalogue — a place with no file, or a file no place names, fails — every file
  is a JPEG, between 1 KB and the weight guard, and the set under 15 MB; the
  card is beside them; and the whole `headers()` value, `/og/:path*` only, with
  the exact `Cache-Control`), the rewritten cases in `pageMetadata.test.ts` and
  `viewPreview.test.ts` (the path, the JPEG type, the alt naming the place, the
  tour's alt carrying the tour's line, and the hostile-input walk now reading
  the alt and the image path too), and the integration tier's preview checks
  (the Dendrite link's og:image is `<origin>/og/julia-dendrite-whole.jpg`, is
  declared `image/jpeg`, and the file answers 200 `image/jpeg` with
  `max-age=86400`; the Copy link round trip's picture is
  `/og/multibrot-4-whole.jpg`; and the head names no `/api/og`). `make gate` is
  green.
- Docs: the README's Image Route bullet, its integration list, its Link preview
  section (a new **Pre-built previews** subsection: what is pre-built, the rule,
  how to regenerate, why), its Project Structure (`ogImage.ts`, `public/og/`,
  `make-og-previews.mjs`) and its regenerating paragraphs; the
  `guided-exploration.md` As-built entry; and this note.

### Share a tour: Copy tour link, and opening one plays the walk (2026-10-10)

- fr-bo2. The tour link codec landed in fr-d3u (write, read and preview a walk
  of up to eight views) with nothing that produced or played one. Both halves
  are here: a **Copy tour link** button beside Copy link in the Settings
  drawer's Navigation card, which copies the places just visited as a walk, and
  a page that reads a tour link, puts its first stop on screen and takes the
  rest of the stops in order before carrying on as the ordinary tour.
- **`src/lib/tourPlaylist.ts`** is the new module and the whole of the walk's
  logic, pure and with no clock of its own, in the shape of `tour.ts`.
  `PlaylistState` is `{ stops, view }` — the stops still to show, and the view
  on screen that the next one is judged against; `PlaylistStep` is a stop and
  the walk after showing it. `createPlaylist(stops, view)` is null for fewer
  than `MIN_TOUR_STOPS` (two), so a link of one view is not a walk.
  `nextPlaylistStop(state)` walks forward, **skipping any stop that is the view
  on screen** — which is how the link's own first stop, already put up by the
  page, is not shown twice — and answers null when there is nothing left, which
  is the handover to the wandering tour. `stopPlaylist(state)` throws the
  remaining stops away, so **stopping is final**: `nextPlaylistStop` of it is
  null for good. `sameView(a, b)` is the comparison behind both — every field
  but the canvas size, which is the page's own and not the view's. Nothing is
  mutated, so a walk asked twice answers the same way.
- **`playlistStops(fragments, current)`** builds the stops a tour link would
  name from a journey: the entries walked, oldest first, with the view on screen
  last (it may not have reached the journey's record yet, and a walk ends where
  the visitor is), a place visited twice kept once at the later visit, and more
  than `MAX_TOUR_STOPS` cut to the most recent eight. An entry of `""` — the
  page opened with no fragment — is the view it opened on, not nothing, because
  `viewLinkUpdatesFrom("")` is that view.
- **`journey.ts` gained `get visited()`**: the entries up to and including the
  step the page is on, as a copy. A step Forward has not been taken is not a
  place the visitor went, and this is what the button is made of.
- **`viewQuery.ts` gained `copyTourUrl(origin, pathname, stops)`**, the same
  origin-and-path query shape `copyLinkUrl` writes (and calling it, so the page
  still has one `copyLinkUrl(` in it) and null for fewer than two stops. Its
  `isViewQuery` now also accepts a query `decodeTourLink` can read, which is
  what makes a `?v=1&t.f=…` load be read as a walk at all: `decodeView` sees
  none of a tour's `t.`-prefixed columns, so without this the query stayed in
  the address bar and the page opened on its default view.
- **The page** (`FractalExplorer.tsx`). `applyViewLink` reads `decodeTourLink`
  *before* the view codec; for a walk it applies the first stop through the same
  setters (but **not** the canvas size: a stop carries none, so a walk does not
  resize the picture), then `createPlaylist(stops, stops[0])` into
  `playlistRef` — a ref, since only a hop reads it — and asks the clock for a
  tour through `hashTour()`, the same ask `tour=1` makes. A refused start (a
  drawer or a field has the user's attention) drops the walk, so nothing waits
  to be walked by a tour nobody asked for.
- **A hop** asks the walk first: `nextPlaylistStop`, then `showStop(stop)` —
  `startCrossfade(target, TOUR_CROSSFADE_MS)` and the stop's fields through the
  setters, with the target link built from the stop and the page's own canvas.
  It is nobody's jump, as a hop to a place is not, so the tour's end still
  counts the one history entry. When the walk runs out the ref is cleared and
  the handler falls through to `nextTourStop`, so the tour wanders on from the
  last stop. **The tour's first hop holds the walk's first stop**: an ordinary
  tour hops at the start, which for a walk would show its first stop for no
  dwell at all, so the first hop only makes the `writeLeavingView()` the address
  bar needs and returns, and the dwell runs from there.
- **Stopping drops the walk**, at the two places the page sees a tour end:
  `giveUpWalk()` calls `stopPlaylist` on the ref, and it is called from the
  input listener (when the clock is `playing`, before `activity()`) and from the
  `hashchange` listener (after `tourMode.stop()`, before `applyViewLink`, since
  the fragment arriving may name a walk of its own). Those are every way a tour
  ends: input, a change of fragment, and a dialog opening — and a dialog is
  opened by input, which is the first. Doing it at stop sites rather than
  following `tourState` is what keeps a walk put up *while* a tour is running
  out of being given up with it: a link applied mid-tour sets the ref and then
  asks for a tour, and a state effect would run after both and throw the new
  walk away. It also keeps the ref out of `TourMode`'s `onChange` (passing a ref
  into that constructor is a render-time ref read, which `react-hooks/refs`
  refuses). The old claim that the engine's own stops are the page's to catch
  does not hold: `tabHidden` suspends a hop rather than ending a tour.
- **The button** is beside Copy link and is disabled with `COPY_TOUR_HINT`
  ("Visit a couple of places first") under it until there are two stops to walk.
  `tourStops` is `playlistStops(journey.visited, viewLinkUpdatesFrom('#' +
  currentLink))` in a `useMemo` on `[journey, currentLink]`: the journey is a
  plain object no render follows, but nothing that changes these stops changes
  without the view moving too, so the view is the dependency that keeps them
  current. The clipboard path is one function, `copyUrl(url)`, which both
  buttons go through — so the manual fallback field and the "Link copied"
  confirmation are Copy link's, and there is still one `clipboard.writeText` in
  the page. Copy tour link does **not** write the address bar (the bar names the
  view on screen; this link names several).
- **Not changed**: the tour link codec (`tourLink.ts`), the single-view codec,
  `#tour` and `tour=1`, `TOUR_IDLE_START_MS` and the idle start, `/api/og`, and
  `previewFor` — which already previews a tour link's first stop (fr-d3u), so a
  copied walk's card is right with no change here.
- **Verified in headless Chrome** (CDP against the standalone production build
  on port 3100, real `Input.dispatchMouseEvent`, 10 checks all passing): the
  button is in the drawer, off on a fresh page with "Visit a couple of places
  first" under it and on after two fractal switches; it copied
  `/?v=1&t.f=mandelbrot~julia~newton&t.k=~Classic~&t.x=-0.75~0~0&t.y=0~0~0&t.z=1~3~8&t.s=classic~classic~rainbow`
  — the opening view, the Julia place and the Newton place, oldest first — and
  said "Link copied". Opening that URL in a new tab settled the address bar on
  the first stop's own hash (`#v=1&f=mandelbrot&x=-0.75&y=0&z=1&s=classic&i=auto&w=800&h=600`),
  dropped the query, and played the walk: sampling the canvas every 500 ms, it
  changed at 0.5, 9.1 and 17.2 s — one stop per 8 s dwell plus the 1.5 s
  crossfade — and then at 25.8 and 33.8 s, which is the ordinary tour wandering
  on from the last stop. A mouse move stopped it and the picture held identical
  over the next 6 s, with the "Tour playing" line gone, and the hash form
  `#v=1&t.f=mandelbrot~julia&...` played the same way. The head a crawler gets
  for a copied URL is the walk's first stop: `og:title` "Tour of 3 views,
  starting at Mandelbrot set, 1x", and `og:image` that stop's nearest place's
  pre-built picture (`/og/mandelbrot-whole.jpg` for the copied walk above) —
  `previewFor`'s tour branch, which fr-xnl's landing gave a picture to with no
  change here. The check was re-run against the rebased tree, since fr-xnl
  touches the same head.
- Tests: the new `src/lib/__tests__/tourPlaylist.test.ts` (sameView over the
  canvas and over two places; `createPlaylist` refusing none and one; the stops
  in order with the walk spent as they are shown; the link's own first stop not
  shown twice; a stop that is the view on screen skipped; null when it has run
  out; the state not mutated and the answer deterministic; stopping final and
  the older walk untouched; `playlistStops` in order with the view last, the
  entry a page opened with, a repeat kept at the later visit, the view not
  counted twice, two canvas sizes being one place, the most recent eight and one
  stop for a journey that has not moved), the new cases in `journey.test.ts`
  (`visited` in order, without the steps ahead, empty, and a copy), the new
  cases in `viewQuery.test.ts` (`copyTourUrl`'s shape and round trip, null for
  fewer than two stops; a tour link read from the query and from the hash, and a
  one-column query not being one), and the new
  `src/__tests__/tour-link-panel.test.ts` (sources: the button beside Copy link
  and nowhere else, disabled with its reason, the stops from `journey.visited`
  and the view on screen, the shared clipboard path with one `writeText`, no
  address-bar write, `decodeTourLink` read before the view codec, the canvas
  kept, the walk created and the refused start, the hop through
  `nextPlaylistStop`/`showStop` and the handover to `nextTourStop`, the first
  stop held, the crossfade and the no-jump rule, `giveUpWalk` called from the
  input listener before `activity()` and from the `hashchange` listener before
  `applyViewLink`, and the Help and README rows). `make gate` is green.
- Docs: the README's Tour and Shareable Links bullets, its Project Structure
  (`tourPlaylist.ts`, `viewQuery.ts`) and its Link preview paragraph; a "Copy
  tour link" row in the Help overlay; and this note.

### A link that names a fractal and no centre opens on that fractal's frame (2026-10-10)

- fr-99q. A hand-written or truncated link can name a picture and no place in
  it: `#v=1&f=julia&k=Dendrite&z=400` carries no `x` or `y`, and the reader
  filled the missing centre from the page's own view — the Mandelbrot set's,
  centred on -0.75. Framed there, a Julia set is empty plane, which is what
  showed on staging (the preview image for that link was a flat colour). The
  centre and the zoom a link does not carry now come from the named fractal's
  own default view, so such a link opens on that fractal's whole view, at
  whatever zoom it did ask for.
- **The whole fix is in `viewLinkToUpdates`** (`src/lib/viewLinkState.ts`), and
  that is why it is complete: the page (`viewLinkUpdatesFrom`), the preview
  (`previewFor`), the card (`parseOgQuery`) and a tour stop (`tourLink.stopAt`)
  all fill a link's missing fields through that one call, so the browser and
  every image agree by construction rather than by three lists kept in step. The
  three fields are judged one at a time (`decoded.centerX ?? view.centerX`, and
  so for `y` and `z`), so a link carrying a zoom and no centre keeps the zoom it
  asked for. A link naming no fractal is filled from `defaultViewFor` of the
  fractal it falls back to, which is the page's own opening view, so that case
  is byte for byte what it was; a link carrying all of `x`, `y` and `z` never
  reaches the defaults at all.
- `DEFAULT_VIEW_LINK_UPDATES` is unchanged: it is still the page's opening view
  and the page still takes its initial state from it. The codec, the key order,
  the version, the clamping and the `MAX_FRAGMENT_LENGTH` limit are untouched,
  as is every fractal's default view.
- Tests: `viewLinkState.test.ts` (every `FRACTAL_TYPES` id from a fractal-only
  link lands on its own `defaultViewFor` frame and still resolves to its own
  kind; a zoom without a centre and a centre without the rest; a set of
  fractal-less fragments still equal to `DEFAULT_VIEW_LINK_UPDATES`),
  `ogView.test.ts` (the same for the card's bounds and key; the reported
  Dendrite link's card is `cardBounds(0, 0, 400)`; and the pixels, where the
  card's frame is a varied picture at 21% one colour and the Mandelbrot set's
  centre under the same Julia kind is a single colour at 100%, which is what the
  bug was),
  `viewPreview.test.ts` (a fractal-only link's fragment equals
  `encodeView(viewLinkToUpdates(decodeView(query)))` — the agreement the fix is
  about — and `/api/og` accepts it; the Dendrite link's line and fragment), and
  `viewQuery.test.ts`, whose Julia case pinned the old Mandelbrot fallback and
  now names `defaultViewFor("julia")`. `make gate` is green.
- Docs: the `viewLink.ts` doc comments on reading and on writing, the
  `viewLinkState.ts` ones on the module and on `viewLinkToUpdates`, the README's
  Sharing a View and Link preview sections, and the View link state bullet in
  Project Architecture.

### Cycle colours: a palette that flows, repainting and never counting again (2026-10-10)

- fr-9in. The Rendering Parameters card now offers a **Cycle colours** checkbox
  and a **Cycle speed** select (Slow 60 s per loop, Medium 25 s, Fast 10 s;
  Slow by default) under the Shift slider and Reset colours. Switched on, the
  palette walks slowly round a turn and the picture is repainted from the
  iteration counts the last full render left — the path fr-di8 built — so a
  deep view animates for the price of a colour change and no orbit is ever
  counted twice. It is the mode fr-q7x and fr-ep7 were the groundwork for: the
  Shift is a setting of the picture, and cycling is that setting moved.
- **`src/lib/cycleColours.ts`** is the new pure module and the only new source
  file: `CYCLE_SPEEDS` (`slow` 60 000, `medium` 25 000, `fast` 10 000 ms a
  loop) and `cycleSpeedFor(id)`, which answers the slowest for an id this build
  does not know, as `exportShapeFor` and `resolveFractalKind` do;
  `DEFAULT_CYCLE_SPEED`; `CYCLE_MIN_PAINT_GAP_MS` (50, twenty repaints a
  second); `cycleShift(startShift, elapsedMs, loopMs)`; `shouldPaint(now,
  last, minGapMs)`; and `cyclePaused(conditions)`.
- **The shift is advanced by elapsed time and not by frames**, which is what
  the bead asks for and what makes the speed honest: a device that manages 12
  frames a second rather than 60 arrives at the same point of the turn at the
  same moment and only the picture is choppier. `cycleShift` reads the start
  the way the mapping does (`normalizeShift`, a whole turn being none), so a
  NaN start is no shift rather than a NaN handed to the palette, and returns
  the fraction itself unchanged for no time passed or a loop that is not a
  length. The result is always in 0 up to (not including) 1.
- **A frame asks for a repaint and nothing else.** `FractalRenderer.recolour`
  is called with the scheme, the cap the counts were made at, and
  `{ reverse, shift: next }`; it answers false when there is nothing to repaint
  from (a render has started and dropped the counts), and the frame is then
  *skipped rather than queued*: the clock moves on, the palette holds still,
  and it carries on from where it was when there is a picture again. The
  cycling effect calls no render path at all — the panel test reads its body
  and fails if it names `drawCanvas`, `renderFractal`, `renderPreview`,
  `setIsRendering`, `setFullRenderNonce`, `cancelRender` or either wander
  notice — because the view never moves while the palette flows, and the counts
  a repaint needs are exactly the ones still on the canvas.
- **The hold is a pause and not a stop, and it is one pure decision.**
  `cyclePaused` answers true for a hidden tab (nobody is watching, and a
  browser throttles its frames), a render in flight (the counts are gone), a
  pointer mid-gesture on the picture, a pointer down on the Shift slider, the
  Help overlay, a playing tour, and `prefers-reduced-motion`. The page holds
  the whole frame loop — the effect returns before it asks for a frame — and
  starts it again with its clock at `performance.now()`, which is what makes
  time spent held no part of the visitor's turn. The Help overlay is in the
  list and the Settings drawer is not, deliberately: the drawer is where the
  switch lives, the picture is visible beside it, and a visitor who has just
  switched the palette on should see it run; the drawer's own slider is the
  thing the bead's fourth clause is about, and its drag is the hold.
- **Cycling is a mode and not part of the view**, and the page is built so that
  this is structural rather than remembered. The palette being painted lives in
  `cycleShiftRef`, *not* in the `shift` state: a frame writes the ref and
  nothing else, so the view's link, the address bar, `renderedLink`, a saved
  view and the Shift slider are all untouched while the palette flows, no
  `setState` runs twenty times a second through a 3 000-line component, and the
  Nearby strip's thumbnails and the Math card's probe are not asked for a
  picture every frame. **Verified in headless Chrome** against the production
  build: with the switch on, the address bar's fragment and `history.length`
  are both unchanged through 1.4 s of a flowing palette.
- **The ref follows the view's Shift, not the other way round.** An effect
  writes `cycleShiftRef.current = shift` whenever the view's Shift moves — the
  slider, Reset colours, a link, a preset, a saved view — so the animation
  carries on from wherever the visitor has just put the palette rather than
  snapping back to where it was. That is also what makes a drag of the slider
  work while the palette is flowing: the drag holds the animation (pointer
  down) *and* rebases it, so releasing does not fight the picture back to where
  the animation had reached.
- **Switching it off is one move of the view and one history entry.**
  `handleCycleChange(false)` marks the jump and sets the Shift to the ref's
  value, which is where the palette stopped. The view genuinely changes, so the
  draw is the recolour path, `renderedLink` follows, and the follower pushes
  the one entry — Back then returns to the palette as it was before the
  animation started. Nothing else in the page writes the Shift from the ref
  (the panel test pins that to one site).
- **A link made while the palette flows carries the palette that is on the
  canvas.** `currentLink` was one `useMemo` around `encodeView`'s field list;
  the list is now `viewLinkFor(shiftValue)` and `currentLink` is
  `useMemo(() => viewLinkFor(shift))`, so Copy link can spell the same view
  with the animated Shift (the constraint's "the link and Copy link carry the
  Shift at the moment they are made"). The offer of a field to copy from still
  belongs to the *view* (`copy.link` is `currentLink`), so a palette that is
  still flowing does not take it away.
- **The blank-picture detector stands down while the palette flows**, which is
  a small guarding change this bead needed: a cycling canvas is one the visitor
  asked to watch change, and the rainbow scheme's palette-end hue — the one
  `hsvToRgb` paints black, noted in fr-q7x — would otherwise be able to raise
  "Nothing to see here" over a picture in motion.
- **Two landed panel tests moved with the code and nothing else did**:
  `palette-options-panel.test.ts` reads `viewLinkFor` (and pins `shift:
  shiftValue` and the `currentLink` line) and `share-link-panel.test.ts` pins
  the copy's `viewLinkFor(cycleShiftRef.current)` and `writeViewLink(`#${link}`)`.
  `blank-hint-panel.test.ts` grew `cycling` in its settled-render assertion.
- **Left as they are, knowingly**: the Math card's probe and the Nearby strip
  read `colorOptions`, which is the view's own palette, so while the palette
  flows their swatches and thumbnails are the palette the view holds rather
  than the one on the canvas (the strip is better for it: six thumbnails
  repainted twenty times a second is not what a calm wallpaper should cost).
  Exporting is unchanged and out of scope: a PNG saved while the palette flows
  is drawn in the view's own Shift.
- **Verified in headless Chrome** (CDP with real mouse events, against the
  standalone production build on port 3100, 19 checks, all passing): the
  checkbox and the select are in the drawer under the Shift slider, the three
  speeds are the catalogue's and Slow is the default; switching the switch on
  repaints the canvas (12 distinct samples of 12 over 1.4 s) with `Rendering...`
  never once in the document, the fragment and `history.length` both unmoved;
  the picture keeps moving (20 distinct samples of 20 over 1.3 s); switching it
  off writes exactly one entry (`1 -> 2`), the link and the Shift slider both
  carrying the palette it stopped at (`o=0.05`, 5%), the picture holding still
  after, and Back returning to the view before the animation; a held mouse
  button on the canvas freezes the palette and releasing it starts the flow
  again; and under emulated `prefers-reduced-motion: reduce` the switch is
  disabled, says why, and the picture does not move.
- Docs: the README's Cycle Colours bullet and its Project Structure
  (`cycleColours.ts`), the CLAUDE.md architecture bullet above, and a "Cycle
  colours" row in the Help overlay's Views and links group.
- Tests: the new `src/lib/__tests__/cycleColours.test.ts` (the three speeds and
  the fallback, the label's own loop length; where the palette has reached —
  no time passed, a clock or a loop that is not a length, a NaN start, the
  fraction a time is worth, wraparound and the range over six elapsed times,
  a start read the way the mapping reads it, and thirty frames of 20 ms being
  one step of 600 ms; whether a frame is due a repaint, at the boundary and at
  twenty a second; and each hold condition on its own and together) and the new
  `src/__tests__/cycle-colours-panel.test.ts` (sources: the controls in the
  drawer under the palette and nowhere else, the speeds read through the
  resolver, the session-only state, the link that neither carries the mode nor
  starts it, the frame loop's single outstanding request and its cleanup, the
  repaint and the eight render paths a frame may not name, a skipped frame,
  elapsed-time advancement, all seven hold conditions, the gesture's two
  callbacks, the four writes a frame may not make, the Shift it may not touch,
  the ref and its sync, the one entry on switching off, the slider's rebase and
  its release, reduced motion, the blank detector's stand-down, and the copied
  link's palette). `make gate` is green.

### Colour controls: Reverse and Shift in Settings, repainting live and part of the view (2026-10-10)

- fr-ep7. The Rendering Parameters card's Color Scheme select now has the
  scheme's two settings under it as controls: a **Reverse** checkbox, a
  **Shift** slider (0 to 100 percent, step 1, with a "35%" readout) and a
  **Reset colours** button. Both repaint from the counts the last render left,
  so the picture follows the control as it moves however deep the view, and both
  are part of the view already — the link carried `r` and `o` from fr-q7x, and
  nothing about the codec, the mapping, the renderer or `/api/og` changed here.
- **`src/lib/paletteControls.ts`** is the new pure module and the only new
  source file: `DEFAULT_REVERSE` (false), `DEFAULT_SHIFT` (0),
  `SHIFT_PERCENT_MIN`/`SHIFT_PERCENT_MAX` (0/100), `normalizeShift(value)`
  (the mapping's reading — a shift is a distance round a loop, so a whole turn
  is none and a negative fraction is the same distance the other way; anything
  that is not a finite number is no shift, so a `NaN` never reaches the
  palette), `shiftToPercent`/`percentToShift` (the control against the view),
  `formatShiftPercent`, `isDefaultColorOptions` and
  `shiftSliderKeyChangesValue`. `viewLinkState.ts` takes its two defaults from
  it now, and `presets.ts` uses `normalizeShift`, so "no shift" is decided
  once.
- **One deliberate asymmetry, and why.** `shiftToPercent` holds a value to
  0..1 rather than reading it modulo a turn, which is what `normalizeShift`
  does: the slider's far end is a whole turn, and read modulo a drag to the
  right would snap the thumb back to nought — the same picture, which is why
  the mapping reads a whole turn as no shift, but a control somewhere the
  pointer is not. For the same reason `isDefaultColorOptions(reverse, shift)`
  is `reverse === false && shift === 0` exactly, so a slider dragged to its far
  end is still something Reset colours can put back. A shift of a whole turn is
  still not written to a saved view (`presetColorFields` normalizes first), and
  the link codec already wrote it as nothing: the two do draw the same picture,
  and only the control's rest position is what the exact test is about.
- **The controls** sit directly under the Color Scheme `Select` in the
  Rendering Parameters card, in that order, and nowhere else on the page. The
  slider is the existing `Slider`, which gained two optional props for this:
  `onGestureStart` (a pointer going down on it) and `onKeyDown`. Its travel is
  its own percent, so the readout says "35%" and the ends say "0%" and "100%".
  Reset colours is disabled exactly when there is nothing to put back.
- **A change repaints, and does not render.** `handleReverseChange`,
  `handleShiftChange` and `handleResetColours` only set state; the draw effect
  follows, `drawCanvas` finds the two links equal once each has had its scheme,
  reversal and shift taken out (`linkWithoutColour`), and `recolour` paints the
  kept counts in the new settings — the path fr-di8 built. No `isRendering`, no
  progress line and no wander notice, exactly as for a scheme change, and with
  nothing kept (a canvas that has not finished a render) the view is counted as
  it always was. Each goes through `handleParameterChange`, so the selected
  preset goes.
- **One history entry per gesture, marked on the first step that moves the
  slider.** A jump is what makes an entry, and it is taken by the render that
  first sees the count go up — and only takes one if the view has moved by then.
  Marking it on the pointer going down (which is where a gesture begins, and
  what the Julia map's drag does) would spend the jump on the view already on
  screen, and the drag would then leave no entry at all — found in headless
  Chrome, not reasoned out. So `handleShiftChange` marks the entry on its first
  step of a gesture (`shiftEntryMarkedRef`, put back by `beginShiftGesture` from
  `onGestureStart` on pointer down, and by `onKeyDown` on the first non-repeat
  press of one of the eight keys that move a range input,
  `shiftSliderKeyChangesValue`), and the rest of the drag's steps only move the
  value, rewriting the entry the jump made instead of leaving one each. A held
  key repeats its `keydown`, so its repeats are the one gesture's steps, while a
  fresh press is a new entry. The checkbox and Reset colours mark one each,
  before the setter that moves off the view the entry names.
- **A hop that was nobody's aim resets the palette.** `handlePlaceSelect` gained
  a `resetColour` flag: a Nearby tile, a fractal button, a preset or an
  Auto-wander hop keeps the visitor's reversal and shift (a place names a scheme
  and no palette setting, and the options colour whatever scheme it names, as
  `placeColorScheme` already ruled for the scheme itself), while a tour hop
  (`{ tour: true, resetColour: true }`) and a Surprise me press
  (`{ resetColour: true }`) put both back, so a tour is not tinted by a setting
  left over from before it. Its crossfade target now carries the settings too:
  built without them the flight waited for a picture that never came once the
  palette had been moved, and "this place is already the view" was never true.
- **Saved views carry them.** `FractalPreset` gained `reverse?` and `shift?`;
  `presetColorFields(reverse, shift)` writes each only when it says something
  (so a view saved in the scheme's own colours keeps the stored JSON it had, and
  an older build reads the view unchanged) and `presetColorOptions(preset)`
  reads both, judging each on its own, so a view saved before the settings
  existed opens on the scheme's own colours. `CustomPresetManager` takes
  `currentReverse`/`currentShift` and `handlePresetSelect` restores them with
  the scheme.
- **The thumbnails already followed**, from fr-q7x: the strip is handed
  `colorOptions` and the store's key includes them, so a tile is the picture a
  click shows — the only change here is that the click's own link now carries
  them.
- **Verified in headless Chrome** (the production build, a CDP session with
  real `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent`, 27 checks, all
  passing): the drawer's Shift slider and Reverse checkbox are laid out where
  they should be and Reset colours starts disabled; a drag from the slider's
  left end to about 40 percent moves it, **changes the canvas's pixels with
  `Rendering...` never once appearing in the progress line** — the repaint path
  and not a render — puts `o=0.4` in the address bar, and makes exactly one
  history entry for the whole drag, with Back restoring the palette *and* the
  identical picture (checksum equal to the pre-drag canvas's). Toggling Reverse
  repaints with no render, writes `r=1`, makes one entry, and Reset colours
  clears both, restores the first picture byte for byte, drops `r` and `o` from
  the link, disables itself again and counts no render. Two ArrowRight presses
  on the focused slider move it two steps and leave two entries, again with no
  render. The drag's history behaviour was the one thing this check changed:
  marking the jump at pointer-down left the drag with no entry at all.
- Docs: the README's Color Mapping and Custom Presets bullets and its Project
  Structure (`paletteControls.ts`), a Help row ("Reverse / Shift") in the Views
  and links group, and this note.
- Tests: the new `paletteControls.test.ts` (the mapping's reading of a whole
  turn, a negative fraction and a value that is not a number; the percent
  against the fraction with the whole round trip for every step; the far end
  held rather than read back; the readout; the defaults judged exactly; the
  eight keys and the ones that only move through the drawer), the new
  `presets.test.ts` cases (each field written only when it says something, a
  shift written the way the mapping reads it, both read back, a view that names
  neither, each field judged alone, a shift outside 0 to 1), the new
  `colour-controls-panel.test.ts` (sources: the controls in the drawer under the
  select and nowhere else, the native slider's travel and readout, Reset
  disabled when there is nothing to put back, a change repainting and starting
  no render, the preset cleared, one entry per gesture marked on the first step
  of the drag and never per step after it, the mark put back at pointer-down and
  on the first key that moves the slider, `resetColour` on a tour hop
  and on Surprise me and not on a tile, the crossfade target carrying the
  settings, and the saved view's fields), and the two updated assertions in
  `surprise-panel.test.ts` and `tour-mode-panel.test.ts`. `make gate` is green.
### Tour links in the library: up to eight views in one fragment, and a preview of them (2026-10-10)

- fr-d3u. A link can now name a short walk rather than one view: up to eight
  views in order, written and read by one new module, and previewed as its first
  stop. This is the library half — the page that plays a tour link and the
  button that copies one follow (fr-bo2), and nothing a visitor can do produces
  or follows one yet.
- **`src/lib/tourLink.ts`** is the whole of it, and it is built out of the view
  codec rather than beside it: every stop is encoded by `encodeView` and read
  back by `decodeView`, under the codec's own keys, so a stop is judged exactly
  as a single view is and there is no second set of rules to keep in step.
  `encodeTourLink(stops)` returns the fragment text or null (fewer than two
  stops is no tour; more than eight are cut to the last eight *distinct* stops,
  a stop being the fields the codec wrote); `decodeTourLink(text)` returns the
  stops or null.
- **The form is the view link's own query string laid side by side** rather than
  one stop after another: one column per field, each column holding what that
  field is in every stop, separated by `~`, under a `t.` prefix —
  `v=1&t.f=mandelbrot~julia&t.k=~Dendrite&t.x=-0.75~-0.5&t.y=0~0.25&t.z=1~400&t.s=classic~fire`.
  The columnar shape is what keeps a full tour short: the eight longest stops
  this build can name, every field present, come to 397 characters where one
  field-per-stop-per-stop would be 896 — over the limit. The `t.` prefix is
  load-bearing rather than decorative: without it a query carrying both a tour
  link and a single view would have the two colliding on identical keys (`f`,
  `x`, …) and `URLSearchParams.get` would hand each reader the other's text.
  With it, each reader sees only its own keys and a mixed query is read as both,
  the tour winning (`previewFor`).
- **The columns are joined by hand, with each value percent-encoded on its own**
  by `encodeURIComponent`, not by `URLSearchParams.toString()`. The serializer
  would escape the `~` that holds a column together (`t.f=a%7Eb`), leaving
  nothing to split on; the codec's own writer escapes `~` too, so a value the
  codec produced can never contain one and the separator is safe. On the way
  back, a stop's values are put under their own keys again with
  `URLSearchParams` and handed to `decodeView`, which decodes once — the same
  once the encoder encoded them, so a custom Julia constant
  (`k=custom%3A-1.234567%2C-1.234567`) round-trips byte for byte.
- **A stop carries what a view carries except the canvas size** — how big the
  page's canvas is is the page's business, not the walk's — **and the iteration
  setting when the zoom picks it**: a stop with no count is drawn at the count
  its zoom asks for, so writing `auto` would be writing the default. Everything
  else travels, the colour scheme's two own settings (`r`, `o`) among them.
- **`MAX_TOUR_LINK_LENGTH` is 900 and `MAX_FRAGMENT_LENGTH` stays 500.** The two
  readers are held apart by their limits so a paste cannot be half of one and
  half of the other. The version is the codec's own (`v=1`): a stop is a
  version-1 view and the columns are that view's fields, so `decodeView` on a
  tour link reads the version and then finds none of its keys — an empty view,
  which is how `isViewQuery` and `parseOgQuery` already treat a fragment that
  names no view. `decodeTourLink` on a view link finds no `t.` column and
  answers null. The name is `decodeTourLink`, not the bead's `decodeTour`,
  because `viewLink.decodeTour` is the `#tour` request — the *wandering* tour,
  which carries no views — and two functions of one name in one landing is how a
  reader gets them mixed up.
- **Reading is the suspicious half**, as it is for a view: nothing throws (a
  truncated paste, a trailing `%`, a percent sign at the end, five thousand
  characters, nested encodings, script-looking text, a repeated key), the
  version and the length are checked before anything else, and every field is
  judged by the codec, which leaves out what it cannot read. A stop with no
  readable field at all is dropped and the walk around it is kept — a tour is a
  list of views, and one bad name in it is not the end of the list — and fewer
  than two stops left is null, which is what makes a "tour" of one view
  decodable as no tour.
- **The preview** (`src/lib/viewPreview.ts`): `previewFor` reads a tour link
  *before* the single-view path, so a query carrying both previews as the walk;
  it returns og:image's fragment as `encodeView` of the first stop (re-encoded
  from the decoded state, never the tour link's text, so the card is one
  `/api/og` will draw) and the line `describeTourLine` builds — "Tour of 5
  views, starting at Julia set, Dendrite, 400x". An unreadable tour link falls
  through to the view beside it, or to the static card. `pageMetadata` and
  `src/app/page.tsx` needed no change: they call `previewFor`, and `ogUrl` does
  too, so og:url becomes `<origin>/?<the first stop's link>`.
- **Not changed**: the single-view codec (a view link is byte for byte what it
  was), `decodeTour` and the `#tour` and `tour=1` spellings, `viewQuery.ts` and
  so what a page load does with a query — the page half of tour links is fr-bo2 —
  the `/api/og` route, and any UI.
- Tests: `src/lib/__tests__/tourLink.test.ts` (the exact link for two stops; the
  canvas size and the auto count left out; the scheme's settings and a named
  count carried; fewer than two stops refused; ten stops cut to the last eight
  distinct; a full tour under the limit, with the longest custom constant and
  ten-digit centres, round-tripped; two, five and eight stops round-tripped in
  order, with and without the leading `#`; a stop judged by the codec, the bad
  one dropped and its neighbours kept; missing fields filled from the page's
  defaults; fewer than two, another version, and a link past the limit all null;
  only the first eight of a longer link read; a list of hostile inputs, none
  throwing and each null or an array; a stop whose fractal cannot draw its
  variant; script-looking text never reaching a value; and the two readers never
  confusing a view link with a tour link),
  `viewPreview.test.ts` (a tour previews as its first stop and its phrase says
  how long the walk is; a tour link beats a single view in one query; an
  unreadable tour link falls back to the view or to the static card; a two-stop
  link and one past the limit; `describeTourLine`), and `pageMetadata.test.ts`
  (the image, og:url, title, descriptions and alt for a tour link, and the
  static head for one that cannot be read). `make gate` is green.

### Palette options: a scheme can be reversed and shifted, in links, renders and previews (2026-10-10)

- fr-q7x. A colour scheme has two settings of its own: **reverse** (walk the
  palette backwards) and **shift** (start it a fraction of a turn round). They
  colour a picture without changing what it is made of — a point's iteration
  count is the same number whoever is watching — so they travel with the view in
  a link, in the card `/api/og` draws for it, and in every render the page or an
  export makes. This landing is the library half: nothing sets them yet (fr-ep7
  adds the Settings controls), but a link that carries them draws them here, in
  a shared preview, in a thumbnail and in the Math card.
- **`ColorOptions`** (`src/types/fractal.ts`) is `{ reverse?: boolean; shift?:
  number }`, and `mapIterationsToColor(iterations, maxIterations, scheme,
  options?)` applies it in one order: a point at or past the cap is black first
  and whatever the settings — that is not a place on the palette but the absence
  of one — and otherwise the position is `t = iterations / maxIterations`,
  reversed to `1 - t`, then shifted to `t + shift` modulo a whole turn. Reversed
  and then shifted, because that is what a visitor setting one and then the
  other sees. Each is applied only when it asks for something, so no options,
  `reverse: false` and `shift: 0` all hand the mapping the very double it has
  always been given, and so draw the very colours. `reverse` is not wrapped and
  `shift` is, which is what the two mean: a shift is a distance round a loop, a
  reversal a reflection. One consequence worth knowing, and left as it is: the
  rainbow scheme's hue is exactly 360 at a shift or reversal that lands on the
  palette's end, where `hsvToRgb`'s switch has no branch and paints black —
  today's negative smooth counts paint black there too, and giving that hue a
  branch would change pixels this landing must not.
- **Threaded through the pipeline** as an optional trailing argument, so every
  existing caller compiles and draws exactly as it did: `colourRgbaRows(...,
  options?)`, `renderRgbaRows(..., smooth, options?)`, `renderRgba(..., smooth,
  options?)`, an optional `FractalConfig.colorOptions`, and
  `FractalRenderer.recolour(scheme, maxIterations, options?)`. `FractalRenderer`
  hands its config's options to the row colouring, and its repaint to the same
  step, so a repaint is the picture a full render in the same options draws.
- **The link codec** (`viewLink.ts`) writes `r=1` — only when reversed — and
  `o=<shift>` — only when it is not nought — between `s` and `i`, in that order,
  so the link of a view that touches neither is byte for byte what it was before
  the keys existed. `o` carries two decimals, because a hundredth of the way
  round a palette is a shade nobody can name; a value whose two decimals come to
  a whole turn (0.999 rounds there) is written as none at all, and a shift
  outside 0..1 (`-0.25`, `1.25`) is written as the fraction it is worth, since
  the mapping reads every shift modulo a turn. Reading is strict, as every field
  here is: `r` is read only as exactly `1`, and `o` only as a number inside 0 to
  1, with a whole turn (1) read as nought, which is no shift — so `r=2`,
  `o=abc`, `o=2` and `o=-1` are dropped and the page keeps its own value. The
  version stays `v=1` and `MAX_FRAGMENT_LENGTH` stays 500: a link with every
  field is about 105 characters, and a test pins that. `ViewLinkState` and
  `ViewLinkUpdates` gain `reverse` and `shift`, defaulting to `false` and `0` in
  `DEFAULT_VIEW_LINK_UPDATES`, so a link that says nothing leaves the page as it
  opens.
- **`linkWithoutScheme` is now `linkWithoutColour`** (`viewLink.ts`), and drops
  `s`, `r` and `o` rather than `s` alone: all three colour a picture without
  changing its counts, so a change of any of them is the repaint from the counts
  the last render left, never a redraw. This is the landing's one rename; the
  fr-di8 note below says `linkWithoutScheme` and means this function.
- **`/api/og` honours them.** `parseOgQuery`'s strict key list gains `r` and
  `o`, so a query carrying one that cannot be read is the same 400 as any other
  bad key, and the canonical key is written with them — cache key and all — so
  two cards that differ only in the palette are two images.
  `renderOgPng` hands `view.colorOptions` to its row renderer. The card is the
  picture the link names rather than the scheme's plain one.
- **The page** (`FractalExplorer.tsx`) holds them as part of the view: `reverse`
  and `shift` state initialised from the defaults, moved by `applyViewLink` like
  every other field, written by `currentLink`, and passed on as one `useMemo`d
  `colorOptions` object — a fresh object each render would have every surface
  that takes it in a dependency list asking for a picture again on every render.
  `drawCanvas` puts it in the render config and in the `recolour` call, since a
  repaint of the counts must be made in the settings the picture is drawn in or
  it would lay the scheme's plain colours over a reversed picture; `runExport`
  puts it in the export's config. Reset View puts both back.
- **The surfaces that show this view's colours are told about them too**, since
  each is meant to be the picture rather than the scheme's plain one: the Math
  card's probe (`probePoint`/`probeAtPointer` take the options, so the swatch is
  the colour on screen), the orbit plot's dots (`orbitStepColour`, and
  `OrbitPlot`'s new optional `colorOptions` prop through `MathCard`), and the
  Nearby strip's tiles (the thumbnail store's `request` and `get` take an
  optional options, which joins the cache key only when there is one — so a
  caller with no such settings keys exactly what it always did).
- **Not changed**: how a count is computed, any control or animation (fr-ep7,
  which is the note above: the controls and the saved-view fields landed
  there), the schemes themselves, and the route's size limits. At this landing
  a preset still stored a scheme alone, so a view saved with the settings up
  returned without them.
- Tests: `colorMapping.test.ts` (no options is the mapping's own output for
  every scheme; reverse is the place `1 - t`; shift is the place `t + shift`
  with a whole turn coming back round; reverse then shift, shown not to be the
  other order; a point of the set black whatever the settings; whole channels in
  range under both), the new block in `renderRgba.test.ts` (no settings is the
  picture that was there; each count coloured through the mapping with the same
  settings; the row-by-row picture and the whole one still agreeing, which is
  what a repaint rests on), the new cases in `fractalRenderer.test.ts` (every
  fractal and variant repaints in each scheme in each of three option pairs as
  the full render of them, and a config's own settings are drawn), the new cases
  in `viewLink.test.ts` (`r` and `o` written after `s`, only when they say
  something, to two decimals, wrapped and rounded, read back, a whole turn read
  as nought, `r=2`/`o=2`/`o=abc`/`o=-1` dropped, a settings-free link unchanged,
  every sample state's settings round-tripped, and a link with every field
  inside `MAX_FRAGMENT_LENGTH`), `viewLinkState.test.ts` (a link's `r` and `o`
  applied beside its scheme, and a link without them leaving the page's own),
  `ogView.test.ts` (the settings in the key and in what draws, the rounded shift
  naming the same picture again, a whole turn naming the plain one, and each
  unreadable value refused by name), `ogRoute.test.ts` (the real renderer's
  PNG for a reversed, shifted view is the shared pipeline's pixels for it, and
  not the plain scheme's), `viewPreview.test.ts` (a link with `r` and `o`
  re-encoded with them, its phrase unmoved, and an unreadable one refused),
  `viewQuery.test.ts` (the settings carried through the copied query and back),
  `mathProbe.test.ts` (the swatch is the picture's pixel under those settings,
  and the steps and path are unmoved), `orbitPlot.test.ts` and
  `placeThumbnails.test.ts` (the dots and the tiles painted through the
  settings, and two settings making two cached pictures), the updated
  `recolour-panel.test.ts` and `nearby-strip-panel.test.ts`, and the new
  `src/__tests__/palette-options-panel.test.ts` (the page's half: the state,
  the memo, the link, the render and repaint, the export, the probe, the strip
  and the card, and Reset View).
- Docs: the `viewLink.ts` doc comment's example and key list; the README's
  Shareable Links, Color Mapping and Sharing a View; and the Project
  Architecture bullets for `renderRgba`, the image route and the view link.

### Recolour instantly: a colour change repaints from kept counts (2026-10-10)

- fr-di8. Changing the colour scheme no longer recomputes the picture. The
  pipeline is now visibly two steps — a point to its iteration count, the count
  to a colour — and `FractalRenderer` keeps the counts of the render that
  finished, so a scheme change is the second step alone. It is the foundation
  for the palette options and colour cycling that follow (fr-q7x). Nothing a
  visitor sees changes except the wait: at zoom 2000, 1200 x 900 with Auto
  iterations, a colour change takes about 80 ms where a full render of the same
  view takes about 1.9 s.
- **`src/lib/renderRgba.ts`** is split in two. `countRgbaRows(counts, firstRow,
  endRow, bounds, width, height, maxIterations, kind, smooth = true)` writes
  each pixel's count, in the order the pixels are walked, into a buffer of the
  caller's; `colourRgbaRows(out, counts, firstRow, endRow, width, maxIterations,
  scheme)` writes the pixels those counts make. `renderRgbaRows` and
  `renderRgba` are the two run one after the other over a counts buffer of the
  rows' own size, so the composed pipeline is byte for byte what the one-pass
  loop drew — checked against that loop over every fractal and variant, three
  views, five schemes, two caps and both smooth and whole counts while this was
  written (the permanent guards are the by-hand test in `renderRgba.test.ts`,
  which now runs over six kinds, and `fractalRenderer.test.ts`'s parity with
  `renderRgba`).
- **The counts buffer is a `Float64Array`, not the bead's `Float32Array`, and
  that is a deliberate departure.** A `Float32Array` rounds every count to about
  seven significant digits, and colouring a rounded count is not colouring the
  count: measured over 200 x 150 views, `Math.fround` moves no pixel of the five
  escape-time fractals and moves **203 of 30,000 (0.68%) of Newton's**, because
  Newton packs a root and a speed into one number. That would break the bead's
  own first acceptance line ("output byte-identical to before") and its
  "recolour matches full render byte for byte", and it would have to break
  `mathProbe.test.ts`'s pixel parity, which compares the probe's float64 colour
  to the render's. `CountBuffer` is typed `Float32Array | Float64Array` so a
  caller may still choose the halved memory where a shade is not load-bearing;
  every caller here takes the exact one. The stored counts are about 3.8 MB at
  800 x 600 and 8.6 MB at 1200 x 900 (the bead's 1.9/4.3 MB were the float32
  figures), held one at a time.
- **`FractalRenderer`** keeps `counts`, the smooth counts of the last render to
  finish, dropped the moment a render starts and by `cancelRender` — so counts
  are never held for a view the canvas has left or a picture that only got half
  drawn. A whole-count pass (a preview) keeps nothing: it draws a different
  picture. A superseded run keeps nothing either; the run that finished keeps
  its own. `recolour(scheme, maxIterations)` colours those counts into the
  canvas's own image data and puts it up — synchronous, no orbit, no progress,
  answering false (canvas untouched) when there is nothing to repaint from, and
  refusing counts that are not the canvas's own size, which would scramble the
  picture rather than shade it.
- **The page decides when.** A repaint is only sound when nothing but the scheme
  has moved since the render that finished, and everything else a picture is
  made of is already in its link — fractal, variant, centre, zoom, iteration
  cap, canvas size — so `linkWithoutScheme(fragment)` in `viewLink.ts` (the
  codec's own text, less its `s` field) makes the question a comparison of two
  strings. `drawCanvas` asks it after the preview branch has returned and
  before it starts a render: if the canvas's shown view and the view being drawn
  agree once each has had its scheme taken out and `recolour` answers true, the
  draw names the view (`setRenderedLink`) and returns. Otherwise it renders
  exactly as it did. The shown view is read through `renderedLinkRef`, written
  wherever `setRenderedLink` is: as a value in `drawCanvas`'s dependency list
  the draw effect would re-run every time a render settled, redrawing what it
  had just drawn.
- A repaint is not a render, so it does nothing a render does: no `isRendering`,
  no progress line, and no `wander.notifyRenderStart`/`Done`, which would
  restart the walk's countdown for a picture that never changed shape. It is
  synchronous, so there is nothing for a newer draw to overtake and no token to
  hold. A colour change that arrives while a different view is rendering finds
  the counts gone and renders in full, which is the same answer the page would
  have given before this landing.
- Verified in headless Chrome (CDP, real `input` and `change` events, against
  the standalone production build): at the deep view above, the scheme change
  repainted in 83 ms with no "Rendering..." line ever in the document, the
  address bar followed to `s=fire`, **the repainted canvas was byte-identical to
  a full render of the same view in the same scheme** (forced by taking the
  canvas through 800 x 600 and back), and switching back to classic reproduced
  the first full render of that view byte for byte. The repainted canvas is also
  byte-identical to the same view rendered off the browser through the shared
  pipeline (`renderRgba` + `encodePng`). A *reload* of that URL is not a valid
  comparison and was measured to differ: the page rewrites the address bar with
  the codec's ten-significant-digit centre, and at zoom 2000 that is a genuinely
  different picture — the exact centre and the bar's one differ in 30,389 of
  1,080,000 pixels, each matching its own offline render byte for byte. The
  fractal boundary is what makes the last digits of a centre matter at that
  depth, not anything about the repaint.
- Tests: the split's own cases in `renderRgba.test.ts` (the counts are the
  kind's own numbers, a row into the start of a buffer, the colouring leaves the
  counts alone, and the two steps make the one-pass picture for every fractal
  including Newton), a `FractalRenderer recolour` block in
  `fractalRenderer.test.ts` (every fractal and variant repaints in each of the
  five schemes as the full render of that scheme; a repaint counts no pixels,
  which is the acceptance line the pipeline exists for; and false with nothing
  kept, after a cancel, from a whole-count pass, and while another render is
  replacing the counts), `linkWithoutScheme` in `viewLink.test.ts`, and the new
  `src/__tests__/recolour-panel.test.ts` (the repaint is for a full draw only,
  the guard, the fall-through to the render, no progress or wander notice, the
  ref, and the two writes kept in step). `share-link-panel.test.ts`'s ordering
  assertion reads the full-render path now, since a repaint names its view too
  and has no token. `make gate` is green.
- Docs: the README's Color Mapping line; the Core Rendering System and
  Performance Optimizations bullets in this file; and this note.

### Julia map: pick the constant by pointing at a small Mandelbrot inset (2026-10-10)

- fr-owi. With Julia on, the Settings drawer's Rendering Parameters card now
  carries the Mandelbrot set drawn small as the map of Julia constants: point at
  it, or drag along it, and the constant becomes the point under the pointer, so
  the picture on the canvas turns into that Julia set as the pointer moves. It is
  the fifth way to name a constant — the four named chips, the Custom boxes, a
  link, a saved view — and it is not a sixth: a pick is spelled `custom:<re>,<im>`
  by `customConstantName`, goes through the page's one `variant` state, is written
  by the link codec and is remembered by Back exactly as a typed constant is.
- **`src/lib/juliaMap.ts`** is the pure half and holds every constant:
  `JULIA_MAP_WIDTH` (160), `JULIA_MAP_HEIGHT` (120), `JULIA_MAP_ITERATIONS` (60),
  `JULIA_MAP_ARROW_STEP` (1/50), `JULIA_MAP_LABEL`, `juliaMapBounds()`, and the
  two clamps-and-maps that are each other's inverse:
  `insetPointToComplex(x, y, width, height, bounds)` and
  `complexToInsetPoint(point, width, height, bounds)`. Both hold a pixel outside
  the inset to the nearer edge, so a drag that runs off it keeps picking the
  edge's point and a ring for a constant the frame cannot show sits on the edge
  rather than somewhere it is not; a value that is not a number, and an inset
  with no extent on an axis, both read as the start of that axis, which is what
  keeps a NaN out of a constant's name. `stepJuliaMapPoint(point, horizontal,
  vertical, width, height, bounds)` is one arrow key: `JULIA_MAP_ARROW_STEP` of
  the width in both axes (the inset is the frame's own 4:3 shape, so a pixel is
  the same step either way), back through the same clamped mapping.
- **The frame departs from the bead's wording, on purpose.** The bead says "the
  Mandelbrot base view (`calculateZoomBounds` at zoom 1)", which the app's own
  opening view reads as centred on -0.75; `juliaMapBounds()` is the base view
  (4 by 3) centred on the **origin** instead, x -2 to 2 by y -1.5 to 1.5. That is
  the box `julia.ts` lets a custom constant name — each part within 2 — so every
  point of the inset is a constant `customConstantName` will accept. Framed on
  the opening view, the left 0.75 units of a 4-unit map (19% of the width, and
  the whole region left of the set's own -2 tip) would name points the app
  refuses, and pointing there would do nothing at all. The set's left tip sits on
  the frame's left edge, which is where the picture of the set has always ended.
- **The plane is drawn the way this app draws the plane.** The picture comes from
  `renderRgba` with `mandelbrotKind`, so its rows go through `pixelToComplex` as
  every other picture here does — the imaginary part growing *down* the canvas —
  and the ring is placed by the same mapping. That is the property that matters:
  the ring sits exactly where the constant is drawn. The picture is the Mandelbrot
  set, which is symmetric about the real axis, so it reads the same way round
  either way; what it buys is that the ring and the picture cannot disagree. One
  consequence worth knowing: `ArrowUp` steps towards a *smaller* imaginary part.
- **`src/components/ui/JuliaMap.tsx`** is the control: a 160 x 120 canvas with an
  `aria-hidden` SVG ring over it (two circles, a dark one under a light one,
  because one stroke cannot be seen on every colour scheme), inside a focusable
  div (`tabIndex={0}`, `aria-label={JULIA_MAP_LABEL}`, `touch-none`, a focus ring)
  with a one-line caption under it. It holds **no state at all**: the picture is
  written straight onto the canvas from the render, as the strip's thumbnails are
  written onto their tiles.
- Drawing is once per colour scheme, on a macrotask of its own, and only after
  the main picture has settled (`settled`; `if (!settled) return;` is the first
  thing the effect does), so the chart of the parameter plane never competes with
  the picture it is a chart of. Each scheme's `ImageData` is kept in a ref, so a
  scheme the visitor has already seen is put back synchronously with no render,
  and a scheme change or a revisit costs nothing. `JULIA_MAP_ITERATIONS` is 60
  because a boundary point of the set is a pixel wide at this size whatever the
  cap: the map is a chart, not a picture to walk into.
- **The order in the card is load-bearing, not cosmetic.** The map sits directly
  under the Julia constant select and *above* the Real and Imaginary boxes
  (`{fractalType === "julia" && (<JuliaMap …/>)}` then the
  `isCustomVariant(fractalType, variant) && …` block). A pick makes the constant
  a custom one, which makes those two boxes appear; with the map below them it
  was pushed 66 px down the panel under a pointer that was mid-drag, and the drag
  landed where the map used to be (found in headless Chrome, before this order).
  Everything above the map is fixed once the fractal is Julia, so nothing can
  move it while a gesture is on.
- **One gesture is one history entry.** `onGestureStart` is called once, on
  pointer down, and is the page's `beginJump`; the drag's moves only set the
  constant, so they rewrite the entry that jump is making instead of leaving one
  each. Measured in headless Chrome against the production build with real mouse
  and touch input: `history.length` is unchanged through a whole drag and grows
  by exactly one when it ends, and Back returns to the constant the gesture
  started from. `setPointerCapture` on the press means a drag that leaves the
  inset keeps picking.
- **A pick changes `c` and not the view.** `handleJuliaMapPick` names the point
  with `customConstantName` and sets it with `setVariant` alone — the path the
  Custom option of the select already took — so the visitor's zoom and centre
  stay, the picture follows the pointer live, and the Real and Imaginary boxes
  (the render-phase sync), the select, the address bar and the link all follow
  the state. It returns for a point that names the constant already drawn, which
  would otherwise start a render for nothing, and it calls `wander.notifyActivity()`
  so the walk's countdown restarts as it does for any hand-made move. Reframing
  through `handleVariantChange` was rejected: it would throw the visitor's zoom
  away between one pointer move and the next.
- Keyboard. The arrow keys step the constant `JULIA_MAP_ARROW_STEP` of the width
  and `preventDefault`, so the drawer does not scroll under them. A key press is
  a refinement rather than a jump — the same rule typing into the boxes follows —
  so it writes the address bar but adds no history entry.
- `tourSettled` in `FractalExplorer.tsx` is now **`pictureSettled`**: the tour and
  the map both ask whether a full render has drawn the view, and the name that
  used to be the tour's alone was wrong for the second caller.
- Verified in headless Chrome (CDP, real `Input.dispatchMouseEvent` and
  `Input.dispatchTouchEvent`, against the standalone production build): the map
  is drawn after the picture settles (alpha 255 at the centre, real Mandelbrot
  colours); a press at the Douady rabbit's place gives exactly `-0.123` and
  `0.745` and rings at 75.08, 89.8 — the pixel that point maps to; a mouse drag
  and a touch drag each update the constant on every move and leave exactly one
  entry; Back restores `k=Classic`; the arrow keys move `+0.08` real and `-0.08`
  imaginary (a fiftieth of the 4-wide frame) and add no entry; a touch drag does
  not scroll the drawer (`touch-action: none`); changing the colour scheme
  redraws the map in it and returning to a scheme restores its cached pixels
  exactly; and the inset is present for Julia and absent for the Mandelbrot set
  and the Multibrot.
- Docs: the README's Julia Map bullet and its Project Structure (`JuliaMap.tsx`,
  `juliaMap.ts`), and a "Julia map" row in the Help overlay's Nearby places
  group.
- Tests: `src/lib/__tests__/juliaMap.test.ts` (the frame and its corners, the
  whole set inside it, every corner and named constant naming a constant, the
  inset's shape against the frame's, the clamp at both ends, a NaN pixel, an
  inset with no extent, the inverse and its round trip, the four named constants
  inside the map, the arrow step in both axes and at the edges), and
  `src/__tests__/julia-map-panel.test.ts` (sources: the map in the drawer and
  only for Julia, its place between the select and the boxes, the props, what a
  pick does and does not do, the canvas size and pipeline, the wait for the
  settle and the macrotask, the per-scheme cache and the absence of any state,
  the ring, the focus and the arrow keys, the pointer wiring and the one
  `onGestureStart`). `tour-mode-panel.test.ts` and `wander-hop-panel.test.ts`
  name `pictureSettled` where they named `tourSettled`. `make gate` is green.

### Wallpaper shapes: export the view as Desktop, Phone or Square (2026-10-10)

- fr-jux. Download PNG can save the picture in the shape of a real screen. The
  Settings drawer's Download card gained a **Shape** select above Export size,
  offering Screen (4:3), Desktop 16:9, Phone 9:19.5 and Square 1:1, and a
  wallpaper shape lists its own pixel sizes in the Export size select in place
  of the canvas multiples.
- **`src/lib/exportShape.ts`** is the new module. `EXPORT_SHAPES` is the
  catalogue the select renders (`{ id, label, slug, aspect, sizes }`): `screen`
  with no sizes of its own (its sizes are whole multiples of the canvas),
  `desktop` (1920 x 1080, 2560 x 1440, 3840 x 2160), `phone` (1170 x 2532,
  1290 x 2796) and `square` (1080 x 1080, 2160 x 2160) — 1.2 to 8.3
  megapixels, inside the 12-megapixel budget the canvas multiples are held to.
  `exportShapeFor(id)` looks one up and answers the screen for an id this build
  does not know, as `resolveFractalKind` does for a fractal.
- **Framing, which is where this landing departs from the bead's wording, and
  why.** `exportFrame(centerX, centerY, zoom, aspect)` returns the region a
  picture of that shape draws: the centre is the view's centre, and the frame
  contains the screen's 4:3 view — a shape wider than 4:3 keeps the view's
  height and widens about it, a taller one keeps its width and heightens about
  it, and the screen's own shape returns `calculateZoomBounds`'s bounds
  exactly. The bead's description has the anchoring the other way round ("for a
  landscape or square shape the horizontal span of the screen view is kept, for
  a portrait shape the vertical span is kept"), which crops: at 16:9 it would
  cut a quarter off the top and bottom of the view, and at 9:19.5 it would keep
  a 1.4-unit-wide sliver of a 4-unit view. That reading contradicts the goal
  stated in the same sentence — "what the visitor sees on screen is always
  inside the wallpaper and never cropped" — and the app's own precedent
  (`cardBounds` in `ogView.ts` keeps the height and widens to the card's
  1.91:1, noting that cropping the height "would cut off the top and bottom of
  what the link names"). So the frame was built to the goal. Square is the one
  shape both readings agree about: it keeps the width and gains room above and
  below.
- The frame's aspect is the published size's own rather than the shape's
  nominal one, so the pixels are square: a 1170 x 2532 phone is 9:19.52, and
  the shape's `aspect` is what the shape is called, not what it draws at.
  `exportFrame` also takes a zoom or an aspect it cannot use as the screen's
  own (`MIN_ZOOM`, 4:3), so a value from outside can never put a NaN or an
  infinity into the renderer.
- `src/lib/exportSize.ts` gained `appendToFileName(name, part)` — the
  insert-before-the-extension half `exportFileName` already had, now shared —
  and `wallpaperFileName(name, shape, width, height)` marks the shape and the
  size (`mandelbrot_-0.75_0_1x_16x9_3840x2160.png`). The screen shape's names
  are byte for byte what they were.
- **The page** (`src/app/FractalExplorer.tsx`). `exportSizeOptions` is now the
  options of one select for either shape, an `ExportSizeOption` union of
  `{ kind: "canvas" }` (a canvas multiple, with its scale) and
  `{ kind: "wallpaper" }` (a shape and a pixel size); the selection is one
  string key, so the existing fallback rule covers both a canvas that changed
  size and a shape that replaced every option, resetting to the list's first
  entry. `runExport` now takes an `ExportJob` — `{ width, height, bounds, name
  }` — instead of a size, so a canvas multiple and a wallpaper go through one
  detached-canvas path with the same progress, throttle, Cancel token, memory
  release and failure message as before. The screen-size save, and the screen
  shape's larger sizes, take exactly the path they took before: the frame is
  the page's own `bounds` and the name is `exportFileName`'s. What the button
  waits for is unchanged in effect — only the screen shape's own size waits for
  the render on screen.
- Tests: `src/lib/__tests__/exportShape.test.ts` (the catalogue and its guards,
  the 4:3 frame byte for byte against `calculateZoomBounds`, the
  wider/taller/square anchoring, the centre kept, the screen view inside the
  frame for seven aspects, the asked-for aspect out, every published size's own
  aspect, finiteness at `MAX_ZOOM`, a zoom or an aspect that cannot be used,
  and the file names), `appendToFileName` in `exportSize.test.ts`, and the
  Shape select, the per-shape size list, the framing call and the wallpaper
  naming in `export-panel.test.ts`. `make gate` is green.
- Docs: the README's Download PNG bullet, its Saving an Image paragraph, its
  Controls Stay Usable line and its Project Structure; the Help entry for
  Download PNG; the Export shape bullet in Project Architecture; and this note.

### Export size: Download PNG at 2x or 4x, drawn off-screen (2026-10-10)

- fr-xhr. Download PNG can now save a larger picture than the screen holds —
  wallpapers, prints — without disturbing what is on screen. It replaces fr-gqe,
  whose branch (`polecat/cantor/fr-gqe+mv15zrxa`, 83f3c345) was built against the
  page before the canvas-first redesign and could not land; the behaviour spec is
  the same and its pure helper is reused nearly verbatim. The bead was assigned
  against a tree that already had fr-3m5, fr-l62 and fr-3y2 landed.
- **`src/lib/exportSize.ts`** is the pure half, and the only new module.
  `exportSizes(canvasWidth, canvasHeight, maxPixels = EXPORT_MAX_PIXELS)` returns
  ascending `{ label, scale, width, height }` for the candidates `[1, 2, 4]`:
  the screen size always (the cap is about the larger options, and a canvas
  4000 x 3000 can afford nothing bigger), a larger candidate only when the whole
  image fits the cap (12,000,000 pixels, about 48 MB of ImageData), and — when
  the cap rules a candidate out — the largest whole multiple that fits, so the
  list never stops short of what the machine can draw. The boundary is a
  ceiling, not a strict bound: 1000 x 750 at 4x is exactly 12,000,000 and is
  offered, where 1000 x 751 is 12,016,000 and gets 3x instead. `exportFileName`
  marks the size before the extension (`mandelbrot_-0.75_0_1x_2x.png`) and
  returns the name unchanged at scale 1, so the screen-size save is byte for byte
  what it was. `exportProgressDue(now, last, 250)` is the throttle.
  `EXPORT_FAILED_MESSAGE` is "Could not create that size".
- **The page** (`src/app/FractalExplorer.tsx`) holds the rest. The old
  `handleDownload` body — the `toBlob`, the object URL, the anchor click, the
  `setTimeout(revokeObjectURL, 0)` — is now the module-level `saveCanvasPng(canvas,
  name, onSettled)`, which both saves go through; the screen-size branch of
  `handleDownload` calls it with `canvasRef.current` and the `downloadFileName`
  name, exactly as before. A larger size calls `runExport(...)` instead (the
  Wallpaper shapes note above turned that argument into an `ExportJob`).
- `exportSizeOptions` is `exportSizes(canvasWidth, canvasHeight)` memoized, and
  `exportScale` falls back to 1 during the render that sees a list without it,
  because a `<select>` whose value is not among its options paints blank and the
  canvas size is a control the user can move at any moment. _Superseded by the
  Wallpaper shapes note above: the list is now one select's options for either
  shape, chosen by the string `exportSizeKey`, and the fallback resets to the
  list's first entry._
- `runExport` captures the view *when it is called* — `bounds`,
  `effectiveMaxIterations`, `colorScheme`, `fractalKind`, and the centre/zoom/
  fractal the name is built from — into a `FractalConfig` (the Wallpaper shapes
  note above names that capture the `ExportJob`), builds a detached
  `document.createElement("canvas")` at the chosen size, and draws it with a
  `FractalRenderer` of its own. The canvas on screen is never referenced in that
  function (a test asserts it): it is neither read nor resized, so it keeps its
  size and its content and the two renders do not touch. Changing the view,
  fractal or colours while an export draws therefore does not alter it.
- Progress is throttled in the render's own callback: `exportReportedAtRef`
  holds the last time the text changed and `exportProgressDue` gates it, so a
  3200 x 2400 render reports hundreds of times and the button text changes at
  most twice a second. The button reads `` `Exporting... ${Math.round(progress *
  100)}%` `` and a Cancel button appears beside it while `exportState.kind ===
  "running"`; `downloadDisabled` is `exporting || (exportScale === 1 &&
  isRendering)` (now `exporting || (savesCanvas && isRendering)`, the same rule
  under the Wallpaper shapes note's names), so a screen-size save still waits
  for the render that may be half painting the canvas it reads while an export
  does not — the one place the old "Download PNG keeps the lock" rule narrows.
- Cancelling and racing are one token. `exportTokenRef` is bumped by
  `handleCancelExport` (which also calls `cancelRender()` on the export's
  renderer and releases it) and by the unmount effect, and checked twice in
  `runExport`: before `saveCanvasPng` (a picture that arrives after a cancel is
  dropped rather than saved) and inside the blob callback (a save cancelled
  while the browser was making the blob). `handleDownload` returns early when an
  export is running, so one export runs at a time.
- Memory. `releaseExport()` drops both refs and sets the detached canvas's
  `width` and `height` to 0 — the renderer's `ImageData` goes with the
  reference, the canvas's own copy with the resize — and it runs once the
  browser has taken the blob, never while it is still reading it. A failed
  canvas (`new FractalRenderer` throwing where the browser will not give an image
  buffer, or a `toBlob` that yields null) sets `exportState` to
  `{ kind: "error", text: EXPORT_FAILED_MESSAGE }`, which the card shows in a
  `role="status"` paragraph inside a `min-h-5` container; nothing is drawn,
  nothing is saved and the page carries on. Every failure path logs with
  `console.error`, as the page's other render paths do.
- The controls are in the Settings drawer's Download card only — an Export size
  `Select` above the button and the Cancel button beside it, with the status
  region under both. Nothing was added to the canvas, the top bar or the
  switcher (a test asserts each).
- Tests: `src/lib/__tests__/exportSize.test.ts` (the three sizes for 800 x 600,
  the 3x that stands in for a 1200 x 900 canvas's unaffordable 4x, 400 x 300
  stopping at 4x although 8x would fit, the cap as a ceiling at 1000 x 750 and
  751, a list that is whole scales in ascending order with the pixels on every
  label, the budget as an argument, the file names, the throttle) and
  `src/__tests__/export-panel.test.ts` (sources: the control in the drawer and
  nowhere else, the options from the canvas size, the selection fallback, the
  screen-size branch calling `saveCanvasPng` and never `exportFileName`, the
  detached canvas with no `canvasRef` in `runExport`, the token check before the
  save, the one-export guard, the memory handed back after the blob, the two
  catch sites and the status region).
- Docs: the README's Download PNG and Saving an Image bullets, its Controls Stay
  Usable line and its Project Structure (`exportSize.ts`), the Help entry for
  Download PNG, the Export size bullet in Project Architecture, and the two
  superseding clauses added to the `og` bounds note and the 2026-10-08
  "Controls stay usable during a render" note. `make gate` is green.

### The probe holds while the pointer is on the Math card (2026-10-10)

- fr-3m5. The orbit plot and its Play control live on the Math card, which is
  drawn over the picture, and the page cleared the probe on the canvas's
  `pointerleave` — so moving from the picture toward Play left the canvas, the
  probe went to null, the plot unmounted (the card's height jumped, which read
  as flashing) and Play was gone before the pointer arrived. Owner report: "the
  orbit box gets flaky when I move the cursor into the math box column".
- `shouldClearProbe(relatedTarget, holders)` in `src/lib/mathProbe.ts` is that
  decision as a pure function: a pointer that has gone into any holder keeps the
  probe (a holder contains itself, so arriving at the element counts as well as
  at something inside it), and anywhere else ends it — as does a pointer that
  left the window, which reports no target at all. The holders are passed in
  rather than looked up, so a Node suite hands it stand-ins with a `contains`.
- The page wires it twice. The canvas's `pointerleave` passes the card's panel
  as the holder, so a crossing onto the card holds the point; the card's own
  `pointerleave` passes the canvas, so a pointer going back onto the picture
  keeps the probe and resumes live probing on the next move, while one that
  leaves the card for the top bar or the strip ends it. `clearProbe()` — the ref
  forgotten, the frame dropped, the state nulled — is now one function both
  handlers call. The touch guard stays in both: a finger lifting is the touch
  ending and not a pointer moving away, so a lift keeps the point on the picture
  and on the card alike.
- `MathCard` publishes its panel element through a new optional `panelRef` prop,
  assigned by the same callback ref that fills its own `cardRef` (the `section`,
  which takes pointer events; the wrapper around it does not). The page holds
  `mathCardPanelRef` and attaches the card's listener to whatever it finds there
  when the probe effect runs — always a live element, since the card is rendered
  whenever the probe can be live. The effect's dependencies are unchanged: the
  panel is mounted before the card can be expanded, and a card that is not
  mounted has `probeLive` false anyway.
- Play needed no change: its state is keyed on the orbit's identity, and nothing
  on the canvas fires a move while the pointer is on the card, so the plot stays
  mounted through the crossing and a walk already running is not reset. What the
  probe computes, the orbit drawing, the card's size and position and the Tour
  are untouched.
- Tests: `shouldClearProbe` in `mathProbe.test.ts` (onto the card and onto the
  picture, anywhere else, no target at all, no holder at all, and a part of a
  holder), and `math-probe-panel.test.ts` (the picture's leave holding for the
  card and clearing elsewhere, the card's own leave listener and its cleanup,
  the one `clearProbe` and both touch guards, and `MathCard`'s `panelRef`).
  Docs: the README's Math card feature line, detail paragraph and Project
  Structure, and this note.

### Orbit plot: the path the point under the pointer takes (2026-10-10)

- Layer 3 of the math design (owner-approved 2026-10-10, fr-l62; layer 1 was the
  Math card, fr-1tk, and layer 2 the probe, fr-ycw). With the Math card expanded,
  the point under the pointer now has its path drawn under the probe's two rows:
  a 220 px square SVG with the axes and their unit ticks, the radius of 2 drawn
  faintly for every fractal that escapes, the orbit as dots joined by a line and
  coloured through the picture's own palette from the first dot to the last, the
  start ringed and the escaping point solid white, and the last three points
  written out as a + bi below. A point inside the set can be watched spiralling
  in and a point outside it flying off, which is what shows how the picture is
  made. Pinning several orbits, dragging the point, a 3D view and exporting the
  plot are out of scope.
- **`orbit(point, maxSteps)` on `FractalKind`** (`src/types/fractal.ts`):
  optional, as `escapeInfo` is, so a kind from outside this app still draws and
  is answered with the point alone by `orbitFor` (`src/lib/mathProbe.ts`), and
  implemented by all six kinds. It returns the points the orbit visited, the
  kind's true start first — 0 for every escape-time kind, the pixel itself for
  Julia and Newton — ending on the point that ended it (the one that left the
  radius of 2, or Newton's root) or after `maxSteps`. Mandelbrot and Julia both
  walk `escapeTimeOrbit(start, constant, maxSteps)` in `mandelbrot.ts`, which is
  `escapeTimeIterations`' loop with the points kept and the two roles swapped
  between them; the ship, the Tricorn, the Multibrot and Newton each walk their
  own loop beside their own `iterations`. The Mandelbrot kind's cardioid
  shortcut is a shortcut for the count and not for the path, so `orbit` ignores
  it and plots the real orbit of an interior point.
- **Two offsets worth knowing**, because the kinds count steps differently and
  the tests say so: `escapeInfo.steps` is the index of the step that escaped, so
  an ended escape-time orbit has `steps + 2` points (the start, the points before
  the escape, and the escaping point); Newton's `steps` counts the steps taken to
  arrive, so its path has `steps + 1`. An orbit that has not ended at `maxSteps`
  has `maxSteps + 1` points, except Newton's z = 0, which has no step at all and
  gives the one point. `orbit.test.ts` works out the paths by hand — Mandelbrot
  c = 1 is 0, 1, 2, 5; c = -1 alternates 0 and -1; Newton's -0.5 goes to the root
  1 in one step — and holds every kind's path length to its own `escapeInfo`.
- **`src/lib/orbitPlot.ts`** is the pure half and holds the constants:
  `ORBIT_PLOT_SIZE` (220), `ORBIT_PLAY_STEP_MS` (120), `ORBIT_ESCAPE_RADIUS` (2),
  `ORBIT_MAX_EXTENT_FACTOR` (2). `orbitToPlot(orbit, size, minExtent = 1)`
  returns `{ points, scale, origin, extent, size }`: the frame is the furthest
  point from the origin, never smaller than `minExtent` and never more than twice
  it, so the escape circle is always in view and a point that has blown up cannot
  shrink the rest of the path to a dot — it is pinned to the edge instead. The
  imaginary part goes up the page as the plane has it. Every coordinate out is a
  finite number inside the plot's margin box whatever arrived, because an orbit
  past the escape radius is full of values no scale can hold; a value that is not
  a number at all reads as the origin. `orbitMinExtent(fractalId)` is 2 (the
  escape circle) for every kind but Newton's, which gets 1: `hasEscapeCircle` is
  `fractalId !== "newton"`, since Newton's method is no escape-time set and the
  plot draws no untrue circle. `orbitStepColour(step, points, scheme)` paints a
  dot through `mapIterationsToColor`, spread over the number of *dots* and not of
  steps so the last one sits just short of the palette's end rather than exactly
  on the cap, which the mapping paints black. `describeOrbit(fractalId, info,
  steps)` is the `aria-label`: "Orbit of the point, 7 steps, escaped", "first 60
  steps, stays inside" when the walk stopped before the orbit it describes did
  (a deep view's cap can be hundreds), and Newton's own wording for a root or for
  never settling. `subscribeToReducedMotion`/`prefersReducedMotion` are the media
  query, as a store the component can hold with `useSyncExternalStore`.
- **`probePoint` now carries the path.** `PointProbe` has `orbit`, filled with
  `orbitFor(kind, point, ORBIT_MAX_STEPS)`, and `ORBIT_MAX_STEPS` (60) is in
  `mathProbe.ts` because that is where the walk is asked for. It is the plot's
  cap and not the render's: the same point's path is identical at an iteration
  cap of 100 and of 1000, so a deep view costs the probe no more than a shallow
  one. The probe is still computed once per frame at most, in the frame's
  callback, and not at all while the card is collapsed or hidden.
- **`src/components/ui/OrbitPlot.tsx`** is the markup and the one control. It
  takes the path, the info, the fractal id and the scheme, and draws the SVG with
  `data-orbit-axes`, `data-orbit-escape-circle`, `data-orbit-path`,
  `data-orbit-first` and `data-orbit-last` on its parts. The Play button walks
  the orbit a step at a time (`ORBIT_PLAY_STEP_MS`), is off until it is asked for,
  and is disabled under `prefers-reduced-motion` — the orbit is drawn whole
  without it and nothing in the plot is animated by CSS or SMIL. The animation is
  tied to the orbit it started on by identity: a pointer move re-reads the point
  and hands the plot a new orbit, which stops it, so the component adds no
  listener of its own and the probe's own lifecycle (no listener while collapsed
  or hidden, cleared on leave) is untouched.
- **The card** draws the plot inside the expanded block, right under the `Point`
  and `Orbit` rows, only when there is a probe — so a collapsed card, a hidden
  card and a pointer that has left the picture cost nothing.
- Docs: README's Math card feature line, detail bullet and Project Structure,
  the Help entry for Math, `docs/design/guided-exploration.md`'s As built, and
  this note.
- Tests: `orbit.test.ts` (every kind: the start, the known paths by hand, the
  length against `escapeInfo` for both endings, the cap, Julia's pixel start and
  shared walker, Newton's root and its z = 0, the fallback for a kind without
  `orbit`), `orbitPlot.test.ts` (the scaling, the up-the-page imaginary axis, the
  frame band and the runaway clamp, a value that is not a number, a size with no
  room, the extent for each fractal, the dot colours and the last dot's, the
  label's five wordings), the new cases in `mathProbe.test.ts` (the probe carries
  the kind's path, capped by the plot's cap and not the render's, and the point
  alone for a kind that cannot walk one), and `orbit-plot-panel.test.ts` (sources:
  the plot in the expanded card under the probe's rows, the labelled `role="img"`,
  the ends marked, the escape circle guarded, the axes and ticks, the Play control
  and its reduced-motion rule, no listener and no animation, the cap and the
  fallback).

### Math probe: the number under the pointer, its steps and whether it escapes (2026-10-10)

- Layer 2 of the math design (owner-approved 2026-10-10, fr-ycw; layer 1 was the
  Math card, fr-1tk, and the orbit plot is a later bead, fr-l62). With the Math
  card expanded, pointing at the picture adds a row for the complex number under
  the pointer, a row saying what its orbit did ("Escaped at step 7", "Inside the
  set", "Settles on root 2 after 6 steps", "Never settled in 400 steps"), and a
  small swatch of the colour the picture paints that pixel. The picture itself is
  unchanged, and the orbit plot, clicking to pin a point and a crosshair are out
  of scope.
- **`escapeInfo` on `FractalKind`** (`src/types/fractal.ts`): optional, so a kind
  from outside this app still draws and is probed off its count
  (`escapeInfoFor`, `src/lib/mathProbe.ts`), and implemented by all six kinds.
  It returns `{ steps, escaped, root? }`: `steps` is the whole-step count, which
  is exactly what `iterations(point, cap, false)` gives for every escape-time
  kind; `escaped` is "the orbit came to an end within the cap" — it left the
  radius, or (Newton) reached a root; `root` is Newton's root index, 0-based as
  `NEWTON_ROOTS` numbers them. Mandelbrot and the four others answer
  `{ steps, escaped: steps < cap }` from the same function their count comes
  from, so the two cannot drift; the Mandelbrot kind keeps its cardioid shortcut,
  which is the same answer (the cap) arrived at without the orbit. Newton answers
  from `newtonOrbit`, whose settle/no-settle is exactly what its packed count
  says (settled < cap; unsettled = cap, black).
- **`src/lib/mathProbe.ts`** is the whole of the probe and nothing else:
  `probePoint(kind, point, maxIterations, scheme)` returns `{ point, info,
  colour }`, where `info` comes from the whole-step path and `colour` from
  `mapIterationsToColor(kind.iterations(point, cap, true), cap, scheme)` — the
  smooth count, which is what a full render paints. Channels are clamped to
  0..255 the way an `Uint8ClampedArray` clamps them (a smooth count just under
  zero gives a negative channel; a `NaN` from the ocean scheme's `pow` of a
  negative is 0), because the swatch is painted from these numbers and must be
  the colour on screen. `describeProbe(fractalId, info, cap)` words it; the card
  counts Newton's roots from 1 where the kind counts from 0, and Newton's
  unsettled case says so rather than "Inside the set", since the Newton map has
  no set to be inside of. `colourCss`, `pointerToCanvasPixel` (CSS pixels to
  canvas pixels through the element's box, null for a box of no size) and
  `probeAtPointer` (the three calls in one) are the rest; `createFrameThrottle`
  is the one-run-per-frame rule, with the frame's functions injectable so a Node
  suite drives it.
- **The page** (`FractalExplorer.tsx`) owns the listeners and the state. The
  work is guarded on `probeLive = mathOpen && mathExpanded && !tourPlaying &&
  !tourOverlayOpen`: not live, the effect returns before it touches the canvas,
  so a collapsed or hidden card attaches nothing and computes nothing, and it
  drops the remembered pointer position. Live, it listens on the canvas for
  `pointermove`, `pointerdown` (both `passive`) and `pointerleave`; a handler
  only records where the pointer is in a ref and calls `throttle.request()`, so
  the computation — one point — happens in the frame's callback and never inside
  a pointer handler or between the renderer's rows. `pointerleave` clears the
  state, except for a touch pointer: a finger lifting is the touch ending rather
  than the pointer moving away, so a tap's point stays up to be read. The
  effect's dependencies are the view and the kind, so a picture that moves under
  a resting pointer (a wheel zoom, a preset, a walk step — no `pointermove` is
  sent for any of them) re-reads the same place in the new view rather than
  showing the last one's. The card is passed `probe={probeLive ? probe : null}`,
  so a card that has just been expanded again never shows the point from before
  it was collapsed.
- **The card** (`MathCard.tsx`) takes the probe as an optional prop and, in the
  expanded block only (before the Place row and the "Each point" rule), draws a
  `Point` row — the number through `formatComplex`, six significant digits, and
  the swatch, `aria-hidden` since the number beside it carries the meaning — and
  an `Orbit` row, the line `describeProbe` gives. With no probe the `Point` row
  says "Hover the picture" rather than leaving a hole.
- **Docs**: the README's Math card bullet and paragraph and Project Structure,
  the Help entry for Math (one clause), `docs/design/guided-exploration.md`'s As
  built, and this note.
- **Tests**: `escapeInfo.test.ts` (every kind: a point that runs the whole cap, a
  point whose end step is worked out by hand — c = 2 in one step for the
  escape-time kinds, a point already outside the radius in none for Julia,
  -0.5 to root 1 in one for Newton — and a 9x9 grid where the info agrees with
  `iterations(point, cap, false)` point by point, escaped exactly when the count
  is under the cap, and a root only where a kind has one; Newton's roots from
  their own coordinates, an unsettled z = 0, a `NaN` and an infinity returning
  the cap), `mathProbe.test.ts` (the pixel parity: a 16x12 view of every kind
  rendered through `renderRgba` with **every pixel** compared to the probe's
  colour byte for byte and its steps to the whole count, the swatch in four
  schemes, the fallback for a kind without `escapeInfo`, `describeProbe`'s four
  wordings and an id this build does not know, `colourCss`, the pointer scaling
  against a shrunk canvas and a box of no size, `probeAtPointer`, and the frame
  throttle on a fake scheduler: three requests, one run; a cancel; a run that
  asks for the next frame), and `math-probe-panel.test.ts` (sources: the live
  guard and the early return before any listener, the work in the frame's
  callback and not in the handler, the deps that re-read a view moving under a
  resting pointer, the listeners and their cleanup, the card's prop and rows,
  and the Help wording).

### Social card re-cut; the app's own words in one module (2026-10-10)

- fr-3y2. The card's tagline named three fractals ("Wander the Mandelbrot, Julia
  and Burning Ship sets") and the picker offers six, so the preview undersold
  the app and would drift again with every fractal added. The card is re-cut
  with a line that counts nothing and names none, and the words the head and the
  card use are now one module.
- `src/lib/siteText.ts`: `TITLE`, `CARD_TITLE_LINES`, `CARD_TAGLINE` ("Wander
  the fractals: zoom, switch and explore"), `FRACTAL_NAMES` (the `FRACTAL_TYPES`
  labels), `joinNames` ("a, b and c"), `DESCRIPTION`, `TWITTER_DESCRIPTION` and
  `CARD_ALT`. The description is built from those labels, so adding a fractal
  updates "Explore the Mandelbrot, Julia, Burning Ship, Tricorn, Multibrot and
  Newton fractals ..." with no second edit; `siteText.test.ts` fails if a
  `FRACTAL_TYPES` label is missing from it, and also if a label or a digit
  appears in the tagline, if the tagline is longer than 60 characters (the
  proxy a Node suite can hold for the card's two lines) or if `CARD_ALT` stops
  carrying the tagline.
- `pageMetadata.ts` imports `TITLE`, `DESCRIPTION`, `TWITTER_DESCRIPTION` and
  `CARD_ALT` from it and no longer defines them (which is why
  `pageMetadata.test.ts` imports the two from `../siteText`).
  `scripts/make-og-card.mjs` bundles it too — its Chrome entry imports
  `CARD_TITLE_LINES` and `CARD_TAGLINE` — so the picture and the head cannot
  say different things. The old `SUBTITLE`/`TITLE` constants in the script are
  gone.
- The card is `public/og-card-2.png`, drawn from `newton-junction` in its own
  (rainbow) scheme with the view shifted −0.35 view-heights, which puts the
  six-sector junction right of centre where the gradient leaves it bright and
  the title has the dark half. Picked by eye from a contact sheet of the six
  featured places (`scripts/make-og-card.mjs --sheet`) drawn at 400 px: the
  Julia spirals are busy, the ship's armada and the Tricorn are mostly one flat
  green, the Multibrot copy is small on a field, and Newton's pinwheel is the
  one that reads at a glance (contact sheets at 400 and then the card itself at
  1200x630). 149,648 bytes, under the 300 KB the script enforces. The name
  carries a 2 because a chat app that cached the old card will not ask for it
  again: `CARD_PATH` (`/og-card-2.png`), `CARD_FILE` in the script and `CARD`
  in the integration tier all name it, and `public/og-card.png` is deleted.
  `src/app/icon.png` and `apple-icon.png` are untouched (favicon work is out of
  scope here), so they are the fr-nd5 crop and not this render's.
- og:url is now the origin under its own slash. Next's metadata API cannot say
  it: `resolveAbsoluteUrlWithPathname` turns any url whose pathname is `/` with
  no query into `origin` (`new URL(...).pathname === '/' && searchParams.size
  === 0 ? result.origin : result.href`), whatever `metadataBase` says, and the
  only config that changes that is `trailingSlash: true` — measured against a
  standalone build, that one makes og:url `http://host/` but also sends
  `/api/health` and `/api/og?...` to 308 redirects, so it was rejected.
  `ogUrl(origin, searchParams)` in `pageMetadata.ts` builds the string
  (`<origin>/`, or `<origin>/?<fragment>` for a view) and
  `src/app/page.tsx` renders `<meta property="og:url" content={url} />` itself;
  React hoists it into the head (verified on the standalone build: one og:url
  tag, inside `<head>`, `http://127.0.0.1:4321/`), and `pageMetadata` leaves
  `openGraph.url` out so there is exactly one. `pageMetadata.test.ts` drives
  `ogUrl` and asserts the Metadata object has no `url`; the integration tier now
  requires `og:url` to be `<origin>/` rather than accepting either spelling.
- Docs: the README's integration list, its Project Structure (`siteText.ts`, the
  card's new name, the regenerating paragraph) and its Link preview section say
  all of it; this note is the CLAUDE.md record.
- Not changed: the icons, `/api/og`, the per-view preview, the layout, and
  `trailingSlash` (it stays off).

### Per-view previews: Copy link carries the view in the query (2026-10-10)

- The second half of per-view link previews (owner-approved 2026-10-10, fr-cr5;
  the first half is `/api/og`, fr-c4z). A crawler never sees the part of an
  address after `#`, so a shared link has to carry its view in the query. The
  address bar keeps the hash form exactly as before; only the clipboard gets the
  query form.
- **The file split.** Only a page is given `searchParams`, and a layout is not,
  so `src/app/page.tsx` is now a small server component (`generateMetadata` and
  `<FractalExplorer />`) and the old page moved, whole, to
  `src/app/FractalExplorer.tsx` (still `"use client"`). Every earlier Version Note that says `page.tsx` for the page's
  state, handlers or effects means `FractalExplorer.tsx` now, and the
  source-reading panel tests read that path. `src/app/requestOrigin.ts` reads
  the request's origin (`headers()` and `siteOrigin`) for both the layout and
  the page.
- **Copy link.** `copyLinkUrl(origin, pathname, link)` (`src/lib/viewQuery.ts`)
  is `<origin><pathname>?<link>`, the codec's `encodeView` text without the `#`.
  `handleCopyLink` still writes the hash form to the address bar first, then
  copies `copyLinkUrl(window.location.origin, window.location.pathname,
  currentLink)` (not `location.href`); the manual-copy field offers the same
  URL. Nothing else writes the query form.
- **Reading either form.** `readLocationLink(search, hash)` returns `{ fragment,
  dropQuery }`. A hash with anything past the `#` wins. Otherwise a query that is
  a view link, meaning `decodeView` reads at least one field of it or
  `decodeTour` says it asks for a tour (`?v=1&tour=1`), is taken as the fragment
  `#<query>`; `?v=1` alone, a query of another version and tracking parameters
  like `?utm_source=x` are not view links and are left in the bar. `dropQuery`
  is true whenever the query was a view link, including when a hash beat it (a
  bar naming one view in its query and another in its hash would preview as the
  first and open as the second). The mount effect in `FractalExplorer.tsx` calls
  it once, `history.replaceState(null, "", pathname + fragment)` when `dropQuery`
  (in try/catch; a refusal does not stop the view being read), then
  `journey.replace(fragment)` and `applyViewLink(fragment)`, the path a hash
  takes, so validation, field-by-field dropping, `tour=1` and the journey are
  unchanged. The `hashchange` listener does not read the query: only a load has
  one. The effect calls `replaceState` directly because `replaceAddressBar` is
  declared after it and would be in the dependency list's temporal dead zone.
- **Preview.** `previewFor(searchParams)` (`src/lib/viewPreview.ts`) turns the
  route's `searchParams` into a `{ fragment, line }` or null. It rebuilds the
  query with `URLSearchParams` (a repeated key counts by its first value, as the
  decoder reads it; Next has already decoded once, so a nested `%2566` stays
  `%66` and is no fractal), and previews only when `parseOgQuery` accepts it,
  the strictness `/api/og` has, so the card is one the route will draw. The
  fragment is `encodeView(viewLinkToUpdates(decodeView(query)))`: only known
  fields, the codec's order, Auto kept as `i=auto`, the canvas size filled in.
  The line, `describeViewLine`, is built from the decoded state alone: a noun per
  fractal (Mandelbrot set, Julia set, Burning Ship, Tricorn, Multibrot, Newton
  fractal), the variant's option label or, for a custom Julia constant, `c =` and
  `formatComplex`, and `formatZoom(zoom)` + `x`: "Julia set, Dendrite, 400x".
  No request text reaches the head.
- **Metadata.** `pageMetadata(origin, searchParams = {})`
  (`src/lib/pageMetadata.ts`) holds everything `layout.tsx` held (the title,
  description, keywords, robots, the card constants), so the layout and the page
  share it and cannot drift; the page's `openGraph` replaces the layout's whole
  (Next merges metadata one level deep), which is why the function builds the
  complete object. With a preview: og:image and twitter:image are
  `<origin>/api/og?<fragment>` (1200 x 630 declared, as the route draws), og:url
  `<origin>/?<fragment>`, the title `<line> - <TITLE>`, the descriptions
  `<line>. <description>`, the image alt `<line>, drawn by Fractal Explorer`.
  Without one, exactly what fr-nd5 left. `/` was already `ƒ` (dynamic) for
  `headers()`; `searchParams` adds nothing to that.
- Measured in headless Chrome against a standalone server (a DevTools session;
  the standalone folder needs `.next/static` and `public` copied in and the
  server restarted after, since it lists static files at start): a query link
  opens on its view and the bar settles to `/#v=1&...&w=800&h=600`; a query
  beside a different hash opens on the hash and loses the query; `?utm_source=x`
  keeps its query and gains the default view's hash; a query with `tour=1` starts
  the tour; a hash link is as before; Copy link wrote
  `http://host/?v=1&f=tricorn&x=0&y=0&z=1&s=classic&i=auto&w=800&h=600` with the
  bar still on `#v=1&...`.
- Tests: `viewQuery.test.ts` (the Copy link URL and its round trip through the
  codec, empty / hash / query / both, a hash that is no view still winning,
  tour, another version, `?v=1` alone, a repeated key, an unreadable value, a
  600-character value, garbage and unknown fields), `viewPreview.test.ts` (null
  for none and not-a-view, the re-encoded fragment, refusing what the route would
  refuse, known fields only, first of a repeated key, zoom clamp, 600-character
  values, nested encodings, script-looking text in every key, a custom
  constant, the line for every fractal), `pageMetadata.test.ts` (the static head
  unchanged for no, empty, tracking and `v=1`-only parameters; the view's image,
  url, title, descriptions and alt; hostile parameters falling back to the
  static head and no visitor text anywhere in the object), the new
  `share-link-panel.test.ts` cases (Copy link copies the query form and not
  `href`, the mount read goes through `readLocationLink`, the listener does not),
  and in the integration tier three checks (a valid query link's og:image is
  `<origin>/api/og?<fragment>` on the same origin and draws a PNG; the static card
  for none and for a list of garbage queries; the link Copy link writes
  round-trips through the codec). Run against a local standalone server, the
  integration tier passes except the social-card file check, which needs
  `public/` that only the image copies.
- Docs: the README's Sharing a View and Link preview sections and Project
  Structure, the Help entry for Copy link, and the design doc's As built.

### Math card is on by default, collapsed, and remembered (2026-10-10)

- The owner liked the Math card (fr-1tk) and wants it up from the first visit
  (fr-iln). A visitor with empty storage now sees it collapsed to its one line
  under the switcher, with the Math button `aria-pressed` true; More expands it,
  the Math button or Escape closes it, and both choices are remembered.
- One small versioned record in **localStorage** replaces fr-1tk's
  `sessionStorage` "expanded" flag and the page's `useState(false)` for "open":
  `fractals.mathCard.v1` = `{"v":1,"open":true,"expanded":false}`
  (`src/lib/mathCard.ts`). `DEFAULT_MATH_CARD_STATE` is `{ open: true, expanded:
  false }`. `parseMathCardState(raw)` returns null for text that is not JSON, not
  an object or not `v: 1`, and otherwise judges each field alone, so a missing or
  non-boolean field keeps its default. `loadMathCardState(local, legacySession?)`
  takes the versioned value if it parses, else reads the old
  `fractals.mathCard.expanded` ("1"/"0") from sessionStorage once as `expanded`
  (`LEGACY_EXPANDED_KEY`; nothing writes it any more), else the default; every
  read is in try/catch, so a storage that throws, is missing or holds junk is the
  default, and `saveMathCardState` swallows a failed write. A user who closes the
  card stays closed on later visits until they press Math; a fresh visit writes
  nothing.
- The store behind `useSyncExternalStore` is now `subscribeToMathCard` /
  `getMathCardSnapshot` / `getServerMathCardSnapshot` / `setMathCardOpen` /
  `setMathCardExpanded` (the old `*Expanded` names are gone). The snapshot is one
  object loaded once and replaced only by a change, so its identity is stable; a
  setter that changes nothing writes and notifies nothing; the server snapshot is
  the default, so the prerendered HTML already has the card and a returning
  visitor who closed it sees it leave on hydration, not a mismatch. Both
  `page.tsx` (for `mathOpen`, the Math button's `onMath = toggleMath`) and
  `MathCard` (for `expanded`) read the same store, so there is no second copy of
  the flag. The tour and the drawer/Help still hide the card without changing the
  choice, and it returns as it was.
- Escape. Now that the card is up by default, a window-wide Escape would close
  it from anywhere. It closes the card only when focus is inside the card or on
  the Math button (`active !== returnFocusRef.current` returns early), so Escape
  elsewhere does nothing here; dialogs already hide the card and keep Escape.
- Fit, measured in headless Chrome (a DevTools session, dev server restarted
  first, since it served stale classes) at 1280x800 (canvas 1003x752) and 375x667
  (375x281), for Mandelbrot, Julia (Classic and a custom constant) and
  Multibrot, collapsed and expanded, with and without the blank hint:
  - The collapsed card is 40 px tall and 158 to 285 px wide: 16 to 28% of the
    desktop picture, 76% at most at 375. Expanded it is 352 wide (35%).
  - Chip-row offset: `top-[5.25rem]` under `sm` and `sm:top-[5.75rem]` from
    `sm` (the chip row ends at 80 px of canvas on a phone and 88 on desktop), so
    at 375 the Julia card is 301 to 341 against the Auto-wander pill at 346 and
    the strip at 348, and clear of the switcher everywhere. `min-h-11` stays on
    the wrapper (it was the cause of fr-1tk's 9 px overlap with chips; the card
    itself is 40 px).
  - Phone: the collapsed line is `max-sm:truncate` (an ellipsis, never a second
    line) and the wrapper is `max-w-[calc(100%-1.5rem)]`. The `<p>` is plain
    inline flow with a space after the comma, not a flex row, because
    `text-overflow` does not apply to flex items.
  - Blank hint. At the same height as the card at the top centre, it would sit
    on it. `BlankHint` takes `mathCard: "hidden" | "collapsed" | "expanded"`:
    collapsed, it drops below the card's line (`top-[6.75rem]`, or
    `top-[8.75rem]` with chips); expanded, from `sm` it centres in the width to
    the right of the card (`sm:pl-[23rem]`). Under 640 px the canvas is 281 px
    tall and cannot hold the switcher, the card and a two-line hint above the
    strip, so there the card steps aside while the hint shows (`MathCard`'s
    `stepAside`, `max-sm:hidden`, fed by the page's `blankHintShown`, which is
    also the hint's `show`) and the hint keeps its old place (`max-sm:top-14` /
    `max-sm:top-24`). The card returns when the view moves.
- Docs: the README feature line and Math card paragraph, the Help entry for
  Math (the card starts shown; the button hides it; remembered), and
  `docs/design/guided-exploration.md`'s As built entry say the card starts open.
  The fr-1tk note below says "session" and "not kept" for these choices; this
  note supersedes those two sentences.
- Tests: `mathCard.test.ts` (the default, `parseMathCardState` over JSON junk,
  other shapes and versions and partly valid values, `loadMathCardState` with an
  empty, missing, corrupt, legacy and throwing storage and the versioned value
  winning, the single versioned key written and the old one never, the store's
  snapshot, stability, notifications and no-op setters, and blocked storage),
  `math-card-panel.test.ts` (sources: `aria-pressed` on the button and the
  toggle, the page reading the default from the store with no `useState(false)`
  left, Escape's focus rule, the phone's ellipsis and `stepAside`, the hint's
  `mathCard` prop and classes, the help entry's wording), and the two blank-hint
  source tests now name `blankHintShown`.

### Image route: /api/og draws a view as a 1200x630 PNG (2026-10-10)

_Superseded: `/api/og` no longer draws. See the note at the top of this section
(fr-5om): the route redirects to a pre-built picture, and the renderer, the
limits and the PNG encoder described below are removed._

- `GET /api/og?<view link>` is the first half of per-view link previews
  (owner-approved 2026-10-10, fr-c4z); the next bead (fr-cr5, done: see the note above) makes Copy link and
  the page's og:image use it. Nothing a visitor sees changed: no page code
  imports any of this. The query is exactly what the link codec writes after the
  `#` (`v`, `f`, `k`, `x`, `y`, `z`, `s`, `i`, `w`, `h`), read by `decodeView`,
  filled by `viewLinkToUpdates`, and drawn with `resolveFractalKind(f, k)`.
- `src/lib/renderRgba.ts` is the pipeline the canvas used to run inline, pulled
  out so the browser and the server cannot draw a view differently:
  `renderRgbaRows(out, firstRow, endRow, bounds, width, height, maxIterations,
  scheme, kind, smooth = true)` writes rows (row `y` at `(y - firstRow) * width *
  4`), `renderRgba(bounds, width, height, maxIterations, scheme, kind, smooth =
  true)` returns the whole `Uint8ClampedArray`. A pixel's point is its top-left
  corner (`pixelToComplex`, as ever), the count is `kind.iterations`, the colour
  `mapIterationsToColor`, alpha 255. It has no canvas, `window` or Node module.
  `FractalRenderer.renderFractal` now computes each row into a one-row buffer with
  `renderRgbaRows`, awaits (a newer render claims the canvas there), checks the
  run token, then copies the row into its `ImageData`; nothing reaches the image
  data before the check, as before. `renderRowChunk` (never actually parallel) and
  `setPixel` are gone, and so is the unused `RenderPoint` type. The parity is
  tested for every fractal and variant: `fractalRenderer.test.ts` fills a fake
  canvas through the renderer and compares it byte for byte with `renderRgba`
  (smooth, and whole counts as a preview draws them), and `renderRgba.test.ts`
  holds `renderRgba` to the old formula written out by hand. A smooth count just
  under 0 gives a negative colour channel, which an `ImageData` and a
  `Uint8ClampedArray` both clamp to 0.
- `src/lib/pngEncode.ts`: `encodePng(rgba, width, height)` on `node:zlib` alone
  (server only; no dependency, and its own CRC-32 table, since `zlib.crc32` is
  newer than the gate's Node 20.18). 8-bit truecolour with the alpha byte dropped
  (every picture is opaque), each row the smallest of the None, Sub and Up
  filters by sum of absolute residuals, one IDAT, deflate level 6; no time or text
  in it, so one picture is one file. It throws a `RangeError` for a size that is
  not a positive integer pair or a buffer of the wrong length.
- `src/lib/ogView.ts`, `parseOgQuery(search)`: the page is forgiving of a link (a
  field it cannot read keeps its default), the route is strict, because it is an
  unauthenticated CPU endpoint and a card showing another place than the link
  names is worse than a 400. It answers a 400 sentence, never echoing a value, for
  a query that is not version 1 (or is past `MAX_FRAGMENT_LENGTH`, 500), for
  `v=1` with no readable field, and for any of `f k x y z s i w h` that is present
  and refused (`Cannot read the value of "x".`; `w` and `h` are one pair; an
  unknown key and a `k` the fractal cannot use are ignored, a zoom past the range
  is clamped as the page clamps it). The view is built as the page builds it: the
  kind from `resolveFractalKind`, the iteration cap Auto's `autoIterations(zoom)`
  or the count named, then `Math.min(400, ...)` (`OG_MAX_ITERATIONS`, so a deep
  view's colours, being count over cap, differ a little from the page's).
- Bounds, which the bead asked to be documented. The page draws
  `calculateZoomBounds(centre, zoom)`, 4/zoom by 3/zoom of the plane, onto a canvas
  of that 4:3 shape, and Download PNG saves that canvas (a larger Export size
  draws the same 4:3 view at more pixels — see the Export size note above).
  A wallpaper shape draws a frame of its own rather than that 4:3 view (see the
  Wallpaper shapes note). The card is 1.91:1, so
  `cardBounds` keeps that rule's height (3/zoom) and centre and widens to 1200:630:
  square pixels, and the whole 4:3 view a visitor had is inside the card, centred,
  with more plane at the sides. Cropping the 4:3 view to the card's height would
  have cut off the top and bottom of what the link names. It is also what
  `scripts/make-og-card.mjs` does for the shipped static card.
- The canonical key is the codec's own `encodeView` of the resolved view, with
  Auto replaced by the count it picks (so `i=auto` at zoom 2 and `i=150` are one
  key) and the canvas size left out (`w`/`h` are checked, not drawn: the card is
  fixed), and the picture is drawn from what the key decodes to, so a key names
  its image exactly: ten significant digits, which is what the codec carries.
- Limits (`src/lib/ogLimits.ts`; an unauthenticated CPU endpoint on a
  scale-to-zero service, so each instance protects itself and nothing is shared
  or persistent): output is always 1200x630; iterations at most 400; an LRU of 40
  PNGs (`OG_CACHE_ENTRIES`, `LruCache`, a few hundred KB each, about 20 MB full,
  keyed by the canonical key); one render at a time with a queue of 2
  (`RenderGate`, `OG_QUEUE_LIMIT`; a fourth concurrent request is a 503 with
  `Retry-After: 2` and never starts); an 8 s budget per render
  (`OG_RENDER_BUDGET_MS`, `startBudget`, a 503 with no `Retry-After` since asking
  again would spend the same time); two concurrent requests for one view share one
  render and take no place in the line (the `inFlight` map in `ogRoute.ts`, not in
  the bead's list). A 200 carries `Cache-Control: public, max-age=31536000,
  immutable` (the URL names the picture); 400 and 503 carry `no-store`; any other
  failure is a 500 that says nothing of why. No new cloud resource, credential or
  always-on work.
- `src/lib/ogRoute.ts`, `createOgHandler({ cache, gate, now, yieldToEventLoop,
  budgetMs, render })`: the handler with the clock, the waiting, the cache, the
  gate and the renderer injectable (every part defaults to the real one), so the
  tests need no real waiting. `src/app/api/og/route.ts` is `runtime = "nodejs"`
  (the encoder is `node:zlib`), `dynamic = "force-dynamic"`, one handler built once
  for the process and a `GET` that calls it: a Next route file may export nothing
  else, so the policy lives in the lib. The real renderer (`renderOgPng`) draws 6
  rows at a time, looks at the budget and awaits a `setImmediate` between slices,
  so `/api/health` is served while a render runs (measured on a standalone server
  with a render and two queued: health answered in 11 and 57 ms).
- Cost, measured on this Mac (Node 25, warm, the whole handler: render plus PNG
  encode, 1200x630): a deep Mandelbrot view (Seahorse Valley, zoom 400, 400
  iterations) about 460 ms (378 ms drawing, 80 ms encoding, 486 KB); a Julia view
  (Classic, zoom 40, 370 iterations) about 350 ms (272 + 72, 542 KB); the other
  fractals' views 170 to 450 ms. A Cloud Run vCPU is slower, but the 8 s budget is
  more than ten times the worst of these.
- Standalone build: `npm run build` lists `ƒ /api/og`, and
  `.next/standalone/.next/server/app/api/og` is there; served from
  `.next/standalone/server.js` the route answered a view with 542332 bytes
  identical to the unit test's, a repeat in 5 ms from the cache, 400 for an empty
  or unreadable query, and 503 with `Retry-After: 2` for the fourth and fifth of
  five simultaneous views. It imports only `src/lib` modules and `node:zlib`, so
  nothing needs copying beside what the Dockerfile already copies. `/api/health`,
  the Dockerfile and the port are untouched.
- `viewLink.ts` now exports `VIEW_LINK_VERSION` (was the private `VERSION`) and
  `MAX_FRAGMENT_LENGTH`, so the route asks the codec's own limits rather than
  repeating them.
- Tests: `renderRgba.test.ts`, the parity block in `fractalRenderer.test.ts`,
  `pngEncode.test.ts` (a decoded round trip through an independent reader that
  also checks every chunk's CRC, rows wanting each filter, the 1200x630 header,
  determinism, alpha dropped, the refusals), `ogView.test.ts` (the key, bounds,
  iterations, and each key's refusal with hostile values),
  `ogLimits.test.ts` (LRU order and eviction, the gate's order, line and
  failure, the budget on a fake clock), `ogRoute.test.ts` (400 with no render,
  the 200 and its headers, the cache, eviction, the 503s, the single flight, the
  budget wired through the real renderer's clock checks, a 500, and one real
  render), `src/__tests__/og-route.test.ts` (the route module's exports and
  answers), and in the integration tier a check that a valid view is a 200
  `image/png` of 1200x630 with the immutable header and an invalid one is a 400
  (run against a local standalone server it passes; the social-card check beside
  it needs `public/`, which only the image copies).

### Math card: the rule, the settings and the view's numbers (2026-10-10)

- A Math button in the top bar (beside Help, `aria-pressed`) toggles a card (up
  from the first visit since fr-iln) over the left of the canvas that shows the mathematics of the picture: layer 1 of 3
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
  the canvas's wrapper after the switcher: `left-3`, `top-14`, or (fr-iln) a
  little higher, `top-[5.25rem]` / `sm:top-[5.75rem]`, while the switcher shows
  its chip row (`belowChips`), and
  `bottom-[9.75rem]`, 150 px of strip plus a gap, with `min-h-11` so the
  collapsed line always has room. The wrapper takes no pointer events (the canvas
  around the card still pans); the card scrolls (`max-h-full overflow-y-auto`)
  when the picture is too short to hold it. On a 375x667 phone the canvas is 281
  px tall: the Mandelbrot card expanded is 69 px of scrolling area clear of the
  strip, and with the chip row (Julia, Multibrot) the one-line card overlaps the
  strip's top 9 px, which is the price of `min-h-11` (fr-iln moved the chip-row
  offset up and it no longer does); at 1280x800 the expanded
  card is 352x460 and clear. Measured in headless Chrome with an iframe harness
  (so the viewport is the iframe's), not by eye.
- The numbers are throttled to the link writer's cadence (`MATH_CARD_UPDATE_MS =
  LINK_WRITE_INTERVAL_MS`, 500 ms; `mathCardDelayMs` is `linkWriteDelayMs`): a
  drag or a wheel burst redraws the card at most twice a second. The fractal and
  its setting are not throttled, and a change of either shows its own numbers at
  once (`Shown.key`), so the rule and the centre never disagree for a frame. The
  state changes only in the timer's callback, never in an effect body
  (`react-hooks/set-state-in-effect`).
- _Superseded by the note above (fr-iln):_ expanded or collapsed was kept for the
  session in `sessionStorage` under `fractals.mathCard.expanded` ("1"/"0"), and
  whether the card was open at all was page state, not kept, so a reload
  started with it closed. Both are now one localStorage record and the card
  starts open.
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
  reads may be half drawn. (Superseded in part by the Export size note above: the
  lock is the screen-size save's alone — a larger export, or a wallpaper, draws
  on a canvas of its own and is not held back by the render on screen.)
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
