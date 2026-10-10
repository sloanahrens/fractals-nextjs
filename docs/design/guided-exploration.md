# Guided exploration UX for the fractal explorer

Status: implemented; this file is the design as approved on 2026-10-09 and the code is the truth where they differ.

## Problem

The page is a control panel with a picture beside it. About five stacked cards (Presets, Navigation, View Info, Rendering Parameters) hold duplicate controls: position is a pair of sliders, a readout and two number boxes; presets are a dropdown and a row of buttons; zoom is a slider, buttons and the wheel. Nothing connects one interesting view to the next, there is no way to retrace a path, and the one guided feature (Random walk) is a checkbox. Preset button labels are also clipped (fr-wtk).

## Goals

- A casual visitor is delighted within seconds with almost no controls (owner pick: casual wanderer first).
- The picture is the interface: it fills the page and is driven by drag, wheel, pinch and keys.
- "What is interesting near here" is always visible, and clicking it takes you there.
- You can retrace your steps (Back, Forward) and the browser's own Back works.
- Every existing capability stays reachable. Nothing is removed, only moved.

## Non-goals

Accounts, shared galleries, server storage, new cloud services, new fractal types, a guided tour with captions, a gallery-first home page.

## Design

### Screen

- The canvas fills the viewport in a 4:3 frame that keeps its aspect ratio.
- A slim top bar floats over it: Back and Forward (left), Surprise me (centre), Settings and Help (right). It fades after about two seconds without input and returns on pointer movement or touch.
- A bottom strip, "Nearby, worth a look", shows 5 or 6 thumbnails (about 64 px wide) in the current colour scheme, plus a "more" tile.
- Settings is one drawer (a bottom sheet on narrow screens) holding what exists today: fractal, Julia constant with Custom, colour scheme, iterations and Auto iterations, centre and bounds coordinates, Download PNG (and export sizes if fr-gqe lands), saved views, Copy link, Auto-wander. The position sliders and the View Info card are dropped; their information lives in the coordinate boxes.

### Interactions

- Drag, wheel, pinch, arrow keys, `+` and `-` behave as today.
- Clicking a thumbnail flies the canvas to that place. First version is a crossfade between the old and new picture; a rendered smooth zoom is a later bead.
- Every move (a click, a Surprise, a preset, a manual jump) is a history entry. Back and Forward step through them. Browser Back works because the view is already in the URL hash (view links, fr-14o).
- Surprise me flies to a random suggestion. It replaces the Random walk checkbox; Auto-wander (the old walk) moves into Settings.
- Narrow screens: the strip is a horizontally scrolling row; Settings is a bottom sheet.

### Places

A place is `{ id, name, fractal, juliaConstant?, centre, zoom, scheme? }`. It is a built-in preset by another name, so presets, saved views and the link codec are reused rather than replaced.

### Suggestions

`suggest(view, catalogue, n)` is a pure function. It ranks places by closeness (centre distance scaled by zoom), prefers slightly deeper zooms so each click is a step in, never returns the current place, and returns the top n. Surprise me picks one at random from the result. Step 1 is a curated catalogue: roughly 15 to 25 places for the Mandelbrot set and 8 to 12 each for Julia and Burning Ship, chosen from live contact sheets and measured, as the current presets were. Step 2 (later) adds computed suggestions behind the same function: probe a grid of candidate views at tiny resolution, score by edge or detail density, keep a few that differ from each other and from the curated ones. The UI does not change when step 2 lands.

### Thumbnails

Each tile renders on demand into a small off-screen canvas (64x48) with the existing renderer at low iterations, cached by place and colour scheme. They start only after the main picture settles and cancel on navigation like any render. A failed or cancelled thumbnail shows a flat colour placeholder and stays clickable.

### Failure handling

- Storage or history disabled: the strip works and Back and Forward use in-memory history.
- Garbage link: default view, as today.
- A place that fails validation is rejected by the catalogue guard test, never at run time.

## Testing

- Node-only vitest for the pure parts: `suggest` (ordering, ties, empty catalogue, a view far from every place), history (push, back, forward, forward list truncated by a new move), place validation (each place resolves with `resolveFractalKind` and is within the precision limit).
- A catalogue guard test renders each place at low resolution and fails if the picture is nearly blank.
- UI behaviour by source-walk tests in the existing style; each landing is checked live on staging in the browser.

## Work breakdown (one landing each)

1. Places catalogue and `suggest`, with tests, no UI. (independent)
2. Journey history on top of link state and browser history, no UI change. (independent)
3. New shell: canvas-first layout, floating top bar, Settings drawer; old panels move into it whole. Depends on nothing but is the largest; the old layout works until 4 and 5 land.
4. Nearby strip: thumbnails, caching, click-to-fly with crossfade. Depends on 1, 2, 3.
5. Surprise me replaces the Random walk checkbox; mobile bottom sheet polish. Depends on 1, 3.
6. Docs refresh (README, CLAUDE.md, Help overlay entries).
7. Later: computed suggestions; smooth-zoom flights.

Folds in fr-wtk (clipped preset buttons) as the preset UI is replaced. fr-gqe (export sizes) lands independently and its control moves into Settings.

## Release

No feature flag. Beads 1 and 2 are invisible; 3 changes the layout without losing a control; 4 and 5 add the strip and Surprise. The release tag stays the owner's call.

## As built

Where the build differs from the text above. The code is the truth.

- **Top bar order.** The bar holds the title on the left, Surprise me and Tour in the centre, and Back, Forward, Help and Settings together on the right (`src/components/ui/TopBar.tsx`). The design put Back and Forward on the left. Under `sm` (640 px) the title is drawn for a screen reader only, to leave the width to the six buttons.
- **Pinch.** Built after the first landing (fr-5p9). Two fingers on the canvas zoom by the ratio of their distance to the last step's, about the point between them, and moving both together pans (`src/lib/pinch.ts`, `ZoomPanManager` in `src/lib/zoomPan.ts`). The zoom is held to 1x to 10000x before the anchor is worked out, so a pinch against a limit keeps its point under the fingers. `canvasNavigation.ts` cancels `touchmove` while two fingers are down, so the page neither zooms nor scrolls. A touch is one gesture from the first finger down to the last up: lifting one finger of a pinch carries on as a one-finger pan from where that finger is, and the full-resolution render is deferred until the last finger lifts. A pinch only rewrites the current history entry, as the wheel does. The wheel, `+` and `-`, and the Zoom In, Zoom Out and Zoom Level controls in Settings zoom as before.
- **Place fields.** A place is `{ id, name, fractal, variant?, centerX, centerY, zoom, colorScheme? }` (`src/lib/places.ts`): the centre is two numbers and the scheme is `colorScheme`. The catalogue is 19 Mandelbrot, 10 Julia, 10 Burning Ship, 9 Tricorn and 12 Multibrot places; `variant` is the Julia constant or the Multibrot power ("3", "4" or "5"), and `suggest` lists the places of the view's own variant first for either.
- **The strip does not fade.** The design had only the bar fading, and the first build faded the strip with it, which hid the page's main way of moving from a visitor lost in an empty field. Only the bar fades now (fr-s8f); the strip is always shown. `NearbyStrip` takes an optional `hidden` prop that renders nothing and requests no thumbnails, which Tour mode uses (see **Tour** below).
- **Strip size.** The strip shows six tiles at a time from a pool of 18, and the More tile rotates to the next six, wrapping (`src/lib/nearbyStrip.ts`). The design said 5 or 6. The suggestions are worked out again only after a deliberate move (a preset, typed coordinates, a fractal or Julia constant pick, a tile, Surprise me, a link, Back or Forward), not while dragging, wheeling or keying.
- **Thumbnail timing.** Thumbnails do not wait for the picture to settle by starting late. They are asked for as the tiles mount and the store is paused while a full render is in flight (`paused={isRendering}`), so a picture already running is never slowed. The one render in flight when the pause starts is allowed to finish. A thumbnail draws at the main picture's Auto iteration count, not half of it as first built, because a pixel's colour is its iteration count over the maximum and half the count shifts the whole palette.
- **Thumbnail colours.** The design said thumbnails are drawn in the current colour scheme. A click applies the place's own scheme, so a tile drawn in the page's colours did not match its destination. A tile is drawn in `placeColorScheme(place, current)` (`src/lib/places.ts`), the same call the click makes: the place's scheme when it names one, else the page's. The cache is keyed by place and that scheme, so changing the page's scheme repaints only the tiles whose place names none (today every catalogue place names one). A test renders each place's thumbnail beside the picture its click draws at 64x48 and holds them to a mean difference of 1 per channel (`placeThumbnails.test.ts`).
- **Surprise me.** It picks at random from the first six suggestions (`SURPRISE_CANDIDATES` in `src/lib/surprise.ts`), not from a longer list, and goes through the Nearby tile's own click handler, so it has the tile's crossfade and its single history entry. The button is disabled when no place is near enough to offer.
- **History.** `src/lib/journey.ts` is the page's record of its entries; the browser holds the entries themselves, and Back and Forward call `history.back()` and `history.forward()`. If `pushState` throws (a sandboxed frame, a browser cap) the page writes the fragment with `replaceState` instead and keeps the step in its record. The design's in-memory history for a browser with history disabled was not built; Back and Forward always go through the browser's.
- **Moves that make an entry.** A preset, Apply Coordinates, a pick from the Fractal select, a pick from the Julia constant select, a fractal button or named Julia chip in the switcher, and a Nearby tile or Surprise me. Typing in the Real and Imaginary boxes of a custom constant does not, and neither does a drag, wheel, key, slider or Auto-wander step; those rewrite the current entry.
- **Settings contents.** The drawer holds, in order, the cards Presets, Navigation (Zoom Level, Zoom Out, Zoom In, Reset View, Copy link), Auto-wander, Coordinates (a read-out line over the Real (X) and Imaginary (Y) boxes), Rendering Parameters (Fractal, Julia constant with Custom, Auto iterations, Maximum Iterations, Color Scheme), Canvas Resolution, Manual Coordinates, saved views (Custom Presets) and Download PNG. Copy link sits in the Navigation card. There are no export sizes: the Canvas Resolution card has Width and Height boxes and three size buttons.
- **Auto-wander** is its own card, headed "Auto-wander", directly after Navigation, rather than a line among the others.
- **Presets.** The Presets card is the dropdown alone, listing the built-in and saved views for the fractal on the canvas (six Mandelbrot, five Julia, two Burning Ship, two Tricorn and three Multibrot built-ins). The row of preset buttons, and the clipped labels of fr-wtk with it, are gone.
- **Failure handling.** The catalogue guard test (`src/lib/__tests__/places.test.ts`) holds every place to the link round trip and a 64x48 render of at least 5% non-corner pixels, as designed. A thumbnail that fails to render caches a flat grey placeholder for the life of the store and its tile stays clickable.
- **Tour.** A screensaver tour (owner-approved 2026-10-10, fr-w3p) that the design's non-goals ("a guided tour with captions") left room for: no captions, no sound. It starts after about 20 s with no input while the window has focus (15 s once a tour has played and been stopped, `TOUR_RESUME_MS`), when the address is `#tour` (or a view link carries `tour=1`), or when the top bar's Tour button is pressed, and it never starts over the Settings drawer, Help, a focused text field, a background tab or a render in flight. While it plays the page hides the top bar, the strip, the progress line and the pointer, and hops through the catalogue every 8 s with a 1.5 s crossfade (a cut under reduced motion; the dwell is the same), choosing with `nextTourStop` (`src/lib/tour.ts`). Any key, touch, click, pointer move or wheel stops it at once and the controls come back on the place it was showing. The clock is `src/lib/tourMode.ts`. The address bar is not written while a tour plays, so the history entry the tour began in keeps the view before it and a long tour adds nothing; stopping adds one entry for the place on screen, so Back returns to the view before the tour (the first draft of the bead had each hop replace the entry, which would have lost that view). A best-effort screen wake lock is held while it plays (`src/lib/wakeLock.ts`). Auto-wander is held for the same time. The Tour button sits beside Surprise me, so the bar's order is the title, then Surprise me and Tour, then Back, Forward, Help and Settings.
- **Auto-wander hops; a stopped Tour resumes sooner.** Owner-approved 2026-10-10 (fr-75l), because Auto-wander's small random steps stayed on one fractal and drifted into dull areas. Every `WANDER_HOP_EVERY`th step (4, in `src/lib/wanderController.ts`) is a hop: the controller calls the step handler with `{ hop: true }` and the page asks `nextTourStop` for the next place, from a state of its own (not the tour's) and the walk's seeded generator, so the Tour's rules apply (never the place on screen, a recent window, about one hop in six changes fractal). A hop goes through `handlePlaceSelect(place, { replace: true })`, the tile's handler with the tile's 400 ms crossfade, the place's scheme and Julia constant, and the current history entry rewritten instead of a new one (a drift does the same; the tour's `tour` option implies `replace`). The other three steps are `nextWanderView` as before; `wander.ts` is unchanged. A drift whose picture has settled blank (`canvasIsBlank`, the fr-2oa detector, handed to the controller with `setBlankDetector` and asked from the page's effect on the settled render, `notifySettled`) is replaced at once by a hop, which also restarts the count of drifts; a view moved by hand first is not judged. In `src/lib/tourMode.ts`, `TOUR_RESUME_MS` (15 s) replaces `TOUR_IDLE_START_MS` (20 s) as the idle wait once a tour has played in the page session (`hasPlayed`), whether the phase is `stopped` or an ask has since made it `armed`; a cold page still waits 20 s, and every condition that holds a start back is as it was.
- **Fractal switcher.** Added after the design (owner-approved 2026-10-10, fr-rab) because changing fractal took Settings, Rendering Parameters and a dropdown. `src/components/ui/FractalSwitcher.tsx` draws Mandelbrot, Julia, Burning Ship, Tricorn and Multibrot as buttons over the top left of the canvas, the current one `aria-pressed`, and a row of chips for Julia's four named constants and Custom while Julia is current (and, since fr-abq, a Power row of z^3, z^4 and z^5 while the Multibrot is). It never fades and is hidden during a tour and while Settings or Help is open. A fractal button is a jump to that fractal's featured place (`FEATURED_PLACE_IDS` and `featuredPlace` in `src/lib/places.ts`: Seahorse Valley, the Classic spirals, the armada, the Tricorn's left arm) through the Nearby tile's handler, so it has the crossfade, the place's own colours and one history entry. A named chip goes to the whole set of that constant (`wholeSetPlaceFor`); Custom picks Custom as the Settings select does and opens Settings with focus in the Real box. The Settings selects stay and show the same state. The blank-picture hint moved down a row (two with the chips) to clear it.
- **Tricorn.** A fourth fractal, added after the design (owner-approved 2026-10-10, fr-vpv): the Mandelbrot loop with z conjugated first, z -> conj(z)^2 + c (`src/lib/tricorn.ts`). It joins the switcher as a fourth button, the Fractal select, two built-in views, nine catalogue places (`TRICORN_PLACES`) and `FEATURED_PLACE_IDS` (along the left arm), with no special case in the Nearby strip, Surprise me, Tour or Auto-wander. Its opening view is the origin at zoom 1, and it takes no variant, so the switcher draws no second row for it.
- **Multibrot.** A fifth fractal, added after the design (owner-approved 2026-10-10, fr-abq): the Mandelbrot loop with a higher power, z -> z^d + c for d = 3, 4, 5 (`src/lib/multibrot.ts`: `createMultibrotKind`, and `parseMultibrotPower`, which reads only the plain spellings "3", "4" and "5"). It is the first fractal after Julia to use the variant mechanism: `fractalVariants("multibrot")` is a row captioned "Power" with chips z^3, z^4, z^5 and no Custom, so the switcher and the Settings select draw it with no new control; a link carries the power as `k=3|4|5`, and a saved view stores it as `variant` (Julia keeps `juliaConstant`; both are read). The page keeps one variant across fractals, so going to a fractal that takes one brings a value it can draw (`variantOn`). Its opening view is the origin at zoom 1, which holds all three whole sets; the switcher's fifth button lands on a small copy of the z^3 set (`FEATURED_PLACE_IDS`), the chips on the whole set of their power, there are three built-in views and twelve catalogue places, four per power, and Surprise me, Tour and Auto-wander pick them up with no further code.
- **Auto-wander pill.** Owner-approved 2026-10-10 (fr-q9t), because the only switch for Auto-wander was a checkbox inside Settings and a first-time visitor had no way to find it or to turn it back on. `WanderControl` (`src/components/ui/WanderControl.tsx`) is a compact pill drawn after the Nearby strip in the canvas's wrapper, bottom right, an `aria-pressed` button whose accessible name is "Auto-wander" in both states: off it shows a play glyph and "Auto-wander", on a pause glyph and "Wandering", with " · N s" while the controller's countdown runs and no render is in flight. It calls `handleWanderChange`, the Settings checkbox's own handler, so the two are one state; Settings keeps the checkbox and the seconds box, and says the same switch is on the picture. It never fades and is hidden for a tour and while Settings or Help is open, as the switcher is. Placement (`wanderPlacement`, `src/lib/wanderControl.ts`): the pill measures the wrapper with a `ResizeObserver` and sits in the corner, level with the tiles, when the wrapper is wide enough for the strip's longest row (6 tiles and More) and the pill together, and otherwise stacks above the strip's right end, 114 px from the bottom edge, so it is never over a tile; before it has measured it stacks. The first-run nudge (`useWanderNudge`, `decideNudge`): once per browser, the first time the page has been open 15 s with no wander and no tour started, the pill pulses twice (a CSS animation that `prefers-reduced-motion` switches off, leaving the tooltip) and shows "Let it wander for you" until any press or key or 6 s. The flag is written to localStorage when the tooltip appears, behind try/catch; with storage unavailable the page works and nudges on every visit. An open drawer or Help defers the nudge rather than cancelling it. The interval box did not move.
- **Not built.** Computed suggestions (step 2 of Suggestions) and the smooth-zoom flight are still later work; a flight is the crossfade, and it is skipped when the system asks for reduced motion.
