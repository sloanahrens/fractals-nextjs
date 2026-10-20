# Guided exploration UX for the fractal explorer

Status: the design as approved on 2026-10-09, kept as a decision record.

## Problem

The page was a control panel with a picture beside it: stacked cards of
duplicate controls, no path between interesting views, and a lone checkbox.

## Goals

- A casual visitor is delighted within seconds, with almost no controls.
- The picture is the interface: filled, and driven by drag, wheel, pinch, keys.
- What is interesting near here is always visible, and one click goes there.
- Back and Forward retrace your steps; the browser's own Back works too.
- Every existing capability stays reachable. Nothing is removed, only moved.

## Non-goals

Accounts, shared galleries, server storage, new cloud services, new fractal
types, a captioned tour, a gallery-first home page.

## Design

- **Screen.** The canvas fills a 4:3 frame, a slim top bar over it (Back,
  Forward, Surprise me, Settings, Help) fading after two seconds without input,
  a bottom strip, "Nearby, worth a look", of thumbnails, and one Settings
  drawer; the position sliders and the View Info card are dropped.
- **Interactions.** Drag, wheel, pinch, arrow keys, `+` and `-` as before, and
  a thumbnail click flies there with a crossfade. Every move — a click, a
  Surprise, a preset, a manual jump — is one history entry stepped through by
  Back and Forward; the browser's own Back works because the view travels in
  the URL hash. Surprise me replaces Random walk; Auto-wander moves to Settings.
- **Places.** A place is a built-in preset by another name, so presets, saved
  views and the link codec are reused (`src/lib/places.ts`).
- **Suggestions.** `suggest(view, catalogue, n)` ranks places by closeness
  (centre distance over zoom), preferring deeper zooms and never the current
  place, and returns the top n; Surprise me takes one at random. The catalogue
  is curated from contact sheets and measured.
- **Failure handling.** With storage or history disabled the strip still works;
  a garbage link gives the default view, and an invalid place fails a test.

## As built

The deviations worth knowing; the code is the truth.

- **Top bar order**: title left, Surprise me and Tour centre, the rest right.
  The strip did not fade at first — a fading strip hid the page's way out of an
  empty field. Since then every control over the picture fades together after
  3 s without input (`data-chrome`, one clock in `useIdleVisibility`), and
  returns on any input; a dialog, an open Look menu or expanded Math card, or
  keyboard focus on a control holds them up.
- **A tile is drawn in the scheme its click applies** (`placeColorScheme`), and
  **Surprise me** goes through the tile's own click handler, so both match the
  picture a click shows (`src/lib/places.ts`, `src/lib/surprise.ts`).
- **History.** `src/lib/journey.ts` is the page's record; the entries live in
  the browser, and its in-memory fallback was not built.
- **Added after the design**, each a module plus its picker and catalogue
  entries: **Tour** (`src/lib/tour.ts`, `tourMode.ts`), **Auto-wander hops**
  (`src/lib/wanderController.ts`), the **fractal switcher**, the **Math card**
  (`src/lib/fractalMath.ts`), and every later fractal in `FRACTAL_TYPES`.
- **Not built**: computed suggestions and the smooth-zoom flight (the
  crossfade, skipped under reduced motion).
