# Orbit traps: how colouring by closest approach is built

Status: design note (fr-8jc), written 2026-10-11 for the two beads that implement it. Owner approved the shape of it on 2026-10-11; where this note and the code differ later, the code is the truth. No source or test file changed to write it.

## What it is

Today a pixel's colour comes from how many steps its orbit took to escape. An orbit trap colours it by something else: the closest the orbit comes to a fixed shape in the plane the orbit lives in. Three shapes are offered: a point, a line and a circle. The result is the familiar look of rings, stalks and glowing bulbs, and it works for every fractal in the picker because every fractal has an orbit.

Approved by the owner: trap mode is an on/off colouring choice that feeds a stored per-pixel trap distance through the same palette, Shift and Reverse; recolouring stays instant; links carry it; the pre-built preview images do not change.

## What I read

`src/lib/fractalRenderer.ts` (counts kept as `Float64Array`, `recolour()`, the run token, the preview path); `src/lib/renderRgba.ts` (`countRgbaRows`, `colourRgbaRows`, `CountBuffer`); `src/lib/colorMapping.ts` (`mapIterationsToColor`: black first, then reverse, then shift, then the scheme); `src/types/fractal.ts` (`FractalKind`, optional `escapeInfo` and `orbit`, `FractalConfig`, `ColorOptions`); every kind (`mandelbrot.ts`, `julia.ts`, `burningShip.ts`, `tricorn.ts`, `celtic.ts`, `perpendicularShip.ts`, `multibrot.ts`, `phoenix.ts`, `newton.ts`, `nova.ts`, `magnet.ts`); `src/lib/viewLink.ts` and `viewLinkState.ts` (how `r` and `o` are written, read and kept out of the repaint test by `linkWithoutColour`); `src/lib/tourLink.ts` and `tourPlaylist.ts` (stop columns, `sameView`); `src/lib/exportSize.ts` and `exportShape.ts` (export sizes); `src/lib/fractalTypes.ts` (`resolveFractalKind`, `defaultViewFor`); `src/lib/blankView.ts` (`nearUniformShare`); and in `src/app/FractalExplorer.tsx` the colour controls, `drawCanvas` (the repaint decision), the cycling frame loop and `runExport`.

## 1. Where the trap distance is computed

### The two candidates

- **A. Walk the existing `orbit()` output.** `orbit(point, maxSteps)` already returns every point an orbit visits, for every kind, so a distance is the minimum over its points. No kind changes. It allocates an array of point objects for every pixel.
- **B. A new optional `FractalKind` method**, `trapDistance?(point, maxIterations, trap): number`, that runs the kind's own loop and keeps a running minimum. Optional, as `escapeInfo` and `orbit` are, so a kind from outside still draws; a helper `trapDistanceFor(kind, ...)` answers through option A for a kind without the method, the way `escapeInfoFor` and `orbitFor` do in `mathProbe.ts`.

### Measurements

Method: throwaway Node scripts (not kept; see the end of this item), 800x600, iteration cap 1000, Node 25 on the polecat host, warm, median of three runs (runs agree within 5%). "Count" is `kind.iterations(point, 1000, true)` over every pixel, which is what a render does today. The trap was a point at -0.5 (line and circle in the second table). A pixel's trap distance excludes the orbit's start point (see item 3).

Default views, Mandelbrot and Julia Classic:

| Render | Mandelbrot | Julia |
|---|---|---|
| Count render today | 0.04 s | 0.06 s |
| Point, via `orbit()` walk (A) | 1.15 s | 0.21 s |
| Line, via `orbit()` walk | 0.60 s | 0.11 s |
| Circle, via `orbit()` walk | 1.19 s | 0.21 s |
| Point, dedicated loop, generic trap code, full cap (B) | 0.76 s | 0.14 s |
| Line, dedicated loop, generic trap code | 0.39 s | 0.07 s |
| Circle, dedicated loop, generic trap code | 0.82 s | 0.15 s |
| Point, dedicated loop, cap 256 instead of 1000 | 0.20 s | 0.12 s |
| Count and point in one pass | 0.70 s | 0.16 s |

The "generic trap code" rows call `Math.hypot` and branch on the trap's shape every step. A loop written for one shape, comparing squared distances and taking one square root at the end, is three to four times faster again: Mandelbrot default view, point at -0.5, no early stop, **0.21 s**. A line needs no square root (`|Re z|`), and a circle needs one per step. So the engine should not use a generic closure per step.

What the Mandelbrot count render hides is the interior. Today the cardioid and period-2 bulb are answered in closed form without an orbit (`isInMainBulbs`), which is why 0.04 s. A trap needs the orbit of every interior pixel, because the answer is the closest approach over the whole orbit and not "the cap". So trap mode on Mandelbrot is 5 to 25 times the count render at the default view, and far more where the view is mostly interior. This cost is the same for A and B. It is the real cost of the feature, and it is what the next numbers are about.

Stopping an interior orbit early. An orbit that has settled onto a fixed point or a repeating cycle will only revisit points it has already visited, so the running minimum cannot change. Two checks, point trap at -0.5, Mandelbrot, cap 1000, loop specialised as above:

| View | No early stop | Stop when the step is under 1e-12 | Brent cycle check (stop when z is within 1e-12 of a saved z) |
|---|---|---|---|
| Default (-0.75, 0), 1x | 0.21 s | 0.09 s | 0.07 s |
| Seahorse Valley, 400x | 0.49 s | 0.52 s | 0.51 s |
| Inside the cardioid, 20x | 1.60 s | 0.03 s | 0.05 s |
| Inside the period-3 bulb, 30x | 2.06 s | 1.74 s | **0.30 s** |

(With the slower generic loop the cardioid case took 5.11 s and 0.09 s with the fixed-point stop; the view the project already had to special-case because it "took minutes".) The Brent check (save z at steps 1, 2, 4, 8, ... and stop when z returns within 1e-12 of the saved one) finds a cycle of any length for one comparison a step. The minimum it returns differs from the full-cap minimum by at most 2.3e-10 on any pixel of the period-3 view (2.3e-10 is the sum of the differences over all 480,000 pixels, and none is negative), which no palette can show. The walk in option A cannot do this: `orbit()` must keep the path the Math card plots, and shortening it would change that plot.

All eleven fractals at the default view, count against the `orbit()` walk (point trap):

| Fractal | Count | `orbit()` walk | Ratio |
|---|---|---|---|
| Mandelbrot | 0.04 s | 1.04 s | 24x |
| Julia (Classic) | 0.05 s | 0.19 s | 3.4x |
| Burning Ship | 0.29 s | 1.20 s | 4.2x |
| Tricorn | 0.12 s | 0.58 s | 4.7x |
| Multibrot (z^3) | 0.45 s | 1.32 s | 2.9x |
| Celtic | 0.23 s | 1.18 s | 5.2x |
| Perpendicular Ship | 0.28 s | 1.21 s | 4.3x |
| Phoenix (Classic) | 0.09 s | 0.32 s | 3.4x |
| Newton (z^3 - 1) | 0.12 s | 0.13 s | 1.1x |
| Nova | 0.32 s | 0.56 s | 1.7x |
| Magnet (Type I) | 4.34 s | 5.56 s | 1.3x |

Seahorse Valley at 400x, Mandelbrot: count 0.46 s, `orbit()` walk 2.44 s, dedicated generic loop 1.80 s.

### Decision

**B, a dedicated optional method, for the eight escape-time kinds; the `orbit()` walk as the fallback for Newton, Nova and Magnet.**

- The walk is only 1.1x to 1.7x the count for the three kinds that end by settling. Their orbits stop at a tolerance, so they are short, and a step costs enough arithmetic that an allocation does not matter. Writing three more loops there buys nothing. (Magnet's count render is already 4 s here; that is the kind's own cost and trap mode does not make it worse by more than a third.)
- For the escape-time kinds the dedicated loop is 1.35x to 1.5x faster than the walk with the generic trap code and about 5x with a specialised one, allocates nothing (the walk makes up to 1000 small objects per pixel, which is garbage-collection work on the main thread the renderer is trying to keep responsive), and is the only way to get the cycle check, which is worth 3x to 50x on the interior-heavy views that are the project's known bad case (3x at the default view, 7x in the period-3 bulb, 53x in the cardioid).
- It adds a fourth hand-written copy of each loop (beside `iterations`, `escapeInfo` and `orbit`). The repo's answer to that drift risk is already in place: `escapeInfo.test.ts` and `orbit.test.ts` hold the three to one another. The new method is held the same way, and the **`orbit()` walk is the test oracle**: for every kind and variant over a grid, `trapDistance` must equal the minimum over `orbit(point, cap)` points 1 onward, within 1e-9 (the cycle check's tolerance), for all three shapes.
- Where the loop is shared it is written once: `escapeTimeTrap(start, constant, cap, trap)` in `mandelbrot.ts` beside `escapeTimeOrbit`, used by the Mandelbrot and Julia kinds. The Burning Ship, Tricorn, Celtic, Perpendicular Ship, Multibrot and Phoenix kinds each get their own, as they each have their own loop.

What each kind does:

| Kind | `trapDistance` |
|---|---|
| Mandelbrot, Julia | `escapeTimeTrap`: the loop with a running minimum; **no cardioid shortcut**; stops on escape (`\|z\|^2 > 4`), on a cycle, or at the cap |
| Burning Ship, Tricorn, Celtic, Perp. Ship, Multibrot, Phoenix | the same, over each kind's own step; Phoenix's cycle check compares the pair (z, z_prev) |
| Newton, Nova, Magnet | no method; `trapDistanceFor` walks `orbit()`. The walk ends where the kind's own count ends: on arrival at a root (Newton), on settling or escaping (Nova), on settling on 1, leaving the radius 100 or hitting a pole (Magnet), or at the cap. The point that ended it is included, so the settled point counts |

**Rule for kinds that settle.** The distance is the minimum over every point the kind's own walk visits, the point that ended it included. Nothing is excluded or special-cased. The consequence worth knowing: a trap that passes through an attractor makes every orbit that settles there read distance near 0, so a whole basin goes one flat colour. That is a placement problem, not a rule problem, and item 3 solves it by placement, with measurements.

The scripts are not kept. They are three small files that time loops; the numbers and the method are above, and the engine bead's own tests carry the oracle. Nothing in `scripts/` is added.

## 2. The stored buffer

### One buffer at a time, not two

I recommend the renderer holds **either** the counts (`Float64Array`, as today) **or** the trap distances (`Float32Array`), according to the mode the last finished render was drawn in. Not a second array beside the counts.

Why:

- Toggling trap mode on can never be instant, whatever is stored. The trap distances come from walking the orbits again; today's count render has not done that. The only way for the toggle to be instant in both directions would be to compute both in every render, which on the default Mandelbrot view is 0.04 s against 0.70 s (above), paid by everyone who never opens the control.
- So "beside" would buy only an instant switch back off, at +50% memory, a combined pass whenever trap mode is on, and a buffer that is sometimes stale. Switching off is a render of the view, as changing the iteration count is.
- Everything that is meant to be instant stays instant, because it is a repaint: scheme, Reverse, Shift, and cycling, all in either mode.
- A pass that computed all three shapes at once (three `Float32Array`s) would make switching shape instant but costs three distance evaluations a step and 12 bytes a pixel. Not worth it for a control the owner may never touch twice. Left out.

### Memory

Bytes a pixel: counts 8, trap 4, canvas `ImageData` 4 (and the canvas's own backing store, about the same again).

| Picture | Pixels | Counts (`Float64`, today) | Trap (`Float32`) | `ImageData` |
|---|---|---|---|---|
| Canvas 800x600 | 480,000 | 3.84 MB | 1.92 MB | 1.92 MB |
| Canvas 1200x900 | 1,080,000 | 8.64 MB | 4.32 MB | 4.32 MB |
| 4x export of 800x600 (3200x2400) | 7,680,000 | 61.4 MB | 30.7 MB | 30.7 MB |
| Largest wallpaper, Desktop 3840x2160 | 8,294,400 | 66.4 MB | 33.2 MB | 33.2 MB |
| 3x export of 1200x900 (3600x2700) | 9,720,000 | 77.8 MB | 38.9 MB | 38.9 MB |
| `EXPORT_MAX_PIXELS` | 12,000,000 | 96.0 MB | 48.0 MB | 48.0 MB |

Trap mode takes half the stored memory of count mode. The "beside" alternative would be 12 bytes a pixel: 5.76 MB at 800x600 and 144 MB at the 12-megapixel cap, 50% more than today.

Why `Float32` is safe here and was not for counts (the note in `renderRgba.ts`): Newton packs a root and a speed into one number, so rounding it moved 0.68% of pixels by a ramp step. A trap distance is one smooth quantity, and it is rounded **once, when stored**; the full render and the repaint both colour from the stored rounded value, so they agree byte for byte. The renderer's row buffer for a trap render is a `Float32Array` too, so nothing is coloured from an unrounded value.

An observation, not a requirement: an export renderer keeps a counts buffer it never uses (the `kept` array is allocated for every smooth run), 96 MB at the cap. The engine bead may pass it a "keep nothing" flag; that is an easy saving and is not needed for correctness.

### How `recolour()` uses it

`FractalRenderer` replaces `private counts: Float64Array | null` with a small tagged value:

```
private kept:
  | { mode: "counts"; data: Float64Array }
  | { mode: "trap"; shape: TrapShape; data: Float32Array }
  | null
```

`recolour(scheme, maxIterations, options?, trap?)` gains an optional fourth argument, the shape the caller expects. It paints and answers true only when the held buffer is of that mode (and shape): no `trap` and a counts buffer is today's repaint; a shape and a trap buffer of that shape paints through `colourTrapRows`; any other pairing answers **false**, the page's cue to render. That makes a stale buffer harmless even if the page is wrong about it, and the cycling frame loop (which calls `recolour` with no knowledge of buffers) cannot paint the wrong picture. The length check against the canvas stays.

### What happens to it

- **View change, scheme-independent change, new render:** `renderFractal` sets the buffer to null when it starts, as it does the counts (so a repaint mid-render answers false and the page renders in full), and keeps its own only when the run finished and was smooth. In trap mode "smooth" only means "not a preview": a preview pass computes distances at a quarter of the size, colours from them, and keeps nothing.
- **`cancelRender`:** null, as today.
- **Resize:** the page builds a new renderer for a new canvas, and `renderFractal` resizes the canvas when the config differs; either way the buffer is gone before anything could repaint from it, and the length check refuses an old buffer regardless.
- **Export:** a detached renderer with its own buffer, from the config's trap, drawn at the export's own size and frame. Nothing is shared with the screen's buffer. It goes when the export's renderer does (`releaseExport`).
- **Toggle or shape change:** the link changes (item 5), so the page's existing repaint test sees two different pictures and renders. No new page logic.

## 3. The traps

All three live in the plane the orbit moves in (`z`), never in the picture's coordinates. For the Mandelbrot family the orbit is in the dynamical plane while the picture is the `c` plane, so a trap does not move when the view pans or zooms; it is a property of the colouring. Placement is fixed this wave and the owner cannot move it (recommended; see Decisions). Each is a constant in a new `src/lib/orbitTrap.ts`.

| Trap | Geometry | Distance from `z = x + iy` | Placement |
|---|---|---|---|
| Point | one point `P` | `\|z - P\|` | `P = -0.5 + 0i` |
| Line | the imaginary axis, `Re z = 0` | `\|x\|` | through the origin, direction `i` |
| Circle | centre `C`, radius `r` | `\| \|z - C\| - r \|` | `C = 0`, `r = 0.5` |

Which points count: every point the orbit **lands on**, not the one it starts from (`z_1`, `z_2`, ... to the last). Two reasons. A Mandelbrot orbit starts at 0, and a point trap near the origin would read 0 for every pixel. And for Julia, Newton and Phoenix the start is the pixel itself, so including it adds a plain gradient of the pixel's own position to every picture. This matches how `orbit()` is documented ("the start first"), so the oracle is "points 1 onward".

### How the placement was chosen, with numbers

One fixed placement has to work for eleven fractals whose orbits live in different places, and a placement that passes through an attractor flattens a whole basin. I drew every candidate for all eleven fractals at their default views (200x150, cap 100, through each kind's `orbit()`, classic scheme, distance mapped as below with K = 0.5) and measured the share of one colour with the repo's own `nearUniformShare` (the same measure the featured-place guard uses; its limit is 60%). Worst case over the eleven fractals:

| Candidate | Worst share, fractal | Verdict |
|---|---|---|
| Circle, centre 0, r = 1 | **100%**, Newton (also 34%, Magnet) | rejected: the roots of z^3 - 1 are on the unit circle, so every settled orbit ends at distance 0; Magnet's fixed point z = 1 is on it too |
| Line, the real axis | **39%**, Newton (also 38%, Magnet) | rejected: the root at 1 and Magnet's fixed point at 1 are on it |
| Point at 0 | 21%, Newton | works, but the worst of the points |
| Point at 0.25 | 16%, Newton | works |
| **Point at -0.5** | **13%**, Newton | **chosen**: 1% to 13% across the eleven |
| Line x = 0.5 (vertical) | 17%, Newton | works |
| Line at 45 degrees through the origin | 7%, Newton | the flattest-safe, but breaks the left-right mirror the Mandelbrot family has |
| **Line x = 0 (imaginary axis)** | **14%**, Newton | **chosen**: keeps symmetry; the classic "stalks" |
| Circle, centre 0, r = 1.5 | 13%, Newton | works |
| **Circle, centre 0, r = 0.5** | **11%**, Julia | **chosen**; Newton 8%, Magnet 5% |

Every chosen trap is far under the 60% guard on every fractal. I also looked at the contact sheets: the point gives rings round the set and glowing disks in the bulbs, the line gives stalks along the set, the circle gives nested contours; all three read as different pictures from one another and from the iteration-count picture, on all eleven fractals. The two rejected placements are what the engine bead's tests should keep rejected: a test that draws all eleven fractals' default views in each trap and fails above the 60% guard (and `blankView`'s blank test) is cheap and catches a future change of placement.

### Distance to palette position

```
t = d / (d + K)        K = 0.5, then held to [1e-6, 1 - 1e-6]
```

- It is a saturating curve of the distance alone, so it does not depend on the iteration cap, as Newton's shading (`s / (s + 6)`) does not. The distance is geometry in the plane, not a count. The cap changes only how many steps the minimum is taken over, and a deeper cap can only find a nearer point.
- It is bounded for every distance a kind can produce: Nova's orbits are allowed to reach 1e6 and Magnet's 100, and the curve takes both to just under 1 with no overflow.
- `K = 0.5` is the distance that lands mid-palette, close to the median distance of the three chosen traps (0.1 to 2.2 across the eleven fractals, most near 0.4 to 1.4). I measured 0.5, 1 and 2: the worst single share of one colour over all eleven fractals and the three chosen traps was 14% at K = 0.5, 25% at K = 1 and 20% at K = 2 (Newton or Magnet each time), so 0.5 stays.
- **An orbit that never comes near** has a large minimum, so `t` is near 1: the end of the palette. There is no special case and it is not black. A pixel with no points to measure (the cap is under 1, or the point is NaN so every comparison fails) has distance `Infinity`, and `Infinity / (Infinity + K)` is not a number, so `trapPosition` maps any non-finite distance to the upper end, `1 - 1e-6`.
- **The clamp is there for the rainbow scheme.** Its hue is exactly 360 at `t = 1`, where the conversion has no branch and paints black (the quirk recorded under fr-q7x). A distance of exactly 0 is common here (any orbit of a real `c` lands on the real axis, exactly on a line trap through it), and Reverse would send it to `t = 1`. Held to `[1e-6, 1 - 1e-6]`, `1 - t` and any Shift stay under 1, so no trap pixel is ever black by accident.
- **No pixel is black because it is inside the set.** The "at or past the cap is black" rule belongs to counts and does not apply: every pixel has a distance. Colouring the inside is the signature look of orbit traps (the bulbs light up). See Decisions for the option of keeping the inside black.

## 4. The colour path

The trap mode feeds `t` through the same palette code, so schemes, Reverse, Shift and cycling work unchanged. Three edits, none of which can change a plain picture:

1. **`colorMapping.ts`: split the function in two.** The part of `mapIterationsToColor` after its black test (reverse, then shift modulo a turn, then the scheme's switch) becomes `mapPositionToColor(t, scheme, options)`. `mapIterationsToColor` keeps its black check and its `iterations / maxIterations`, then calls it. A test holds the pair byte for byte: for every scheme and several option pairs, `mapIterationsToColor(n, cap, ...)` equals `mapPositionToColor(n / cap, ...)` for every non-black `n`.
2. **`orbitTrap.ts`: `trapPosition(distance)`**, the curve above.
3. **`renderRgba.ts`: a sibling of `colourRgbaRows`, not a branch inside it.** `colourTrapRows(out, distances, firstRow, endRow, width, scheme, options?)` is the same loop with `mapPositionToColor(trapPosition(distances[pixel]), scheme, options)` in place of the call. A sibling rather than a flag in `colourRgbaRows`, because it keeps that function's signature and its per-pixel work exactly as they are (the byte-for-byte guarantee is then trivially true for a plain picture, and no pixel pays for a branch), and because the choice is made **once per row**, not per pixel. `countTrapRows(distances, firstRow, endRow, bounds, width, height, maxIterations, kind, trap)` is the sibling of `countRgbaRows`. `renderRgbaRows` and `renderRgba` take an optional trailing `trap?: TrapShape`; given one they run the trap pair, otherwise the pair they run now.

The switch therefore lives in exactly three places, each a single `if (trap)` over rows: `renderRgbaRows` (so the whole-picture function and any caller of it get it), `FractalRenderer.renderFractal` (the row loop) and `FractalRenderer.recolour` (which paints whichever buffer it holds). Everything else (the Shift slider, Reverse, Cycle colours, the scheme select) calls `recolour` as now.

`FractalConfig` gains `trap?: TrapShape`, where `TrapShape` is `"point" | "line" | "circle"`. Absent is today's picture.

## 5. The link

- **Key `m`** (for colouring "method"), values `point`, `line`, `circle`. Absent means the iteration-count picture, which is exactly today's. The existing keys are `v f k x y z s r o i w h`; `t` is not used, because tour links are made of `t.`-prefixed columns and a view key named `t` would read as a mistake. The name is a Decision.
- **Written and read like `r` and `o`.** `encodeView` writes `m` only when a trap is on, in the colour group: after `o`, before `i`. A view not using it is byte for byte the link it was before the key existed. The decoder judges `m` on its own and leaves out a value it cannot read, so `m=spiral` or `m=` is no trap and the page keeps its own value, which for a pasted link is off. `ViewLinkState` and `ViewLinkUpdates` gain `trap` (`TrapShape | null`), defaulting to null in `DEFAULT_VIEW_LINK_UPDATES`. `MAX_FRAGMENT_LENGTH` stays 500: the longest link is about 105 characters and `&m=circle` adds 9.
- **`m` is not colour-only, deliberately.** `COLOUR_ONLY_KEYS` stays `s`, `r`, `o`. So `linkWithoutColour` keeps `m`, two links differing in `m` are different pictures, and the page's existing test (`linkWithoutColour(showing) === linkWithoutColour(link)`) sends a toggle or a change of shape to a render with no new page logic. A change of scheme, Reverse or Shift inside trap mode still compares equal and repaints from the trap buffer.
- **Copy link and the address bar** carry it through `viewLinkFor`, which is the one place the page builds the link; the query form (`copyLinkUrl`) and the share sheet follow.
- **Copy tour link and tour stops.** A stop is a view, so it carries `m`: `STOP_KEYS` gains `"m"` after `"o"`, giving a `t.m=point~~line` column that appears only when some stop has a trap (as `t.r` does). `VIEW_FIELDS` in `tourPlaylist.ts` gains `trap`, so `sameView` does not take a trap-on stop for the plain stop at the same place. A played stop applies its trap or, having none, turns the trap off, since a stop is a whole view.
- **A hop that was nobody's aim resets it.** The tour's own hops and Surprise me already pass `resetColour: true`, which puts Reverse and Shift back; trap mode goes back to off with them (the tour is a screensaver of curated pictures and a render with no interior shortcut would stretch its dwell). A Nearby tile, a fractal button, a preset and an Auto-wander hop keep the visitor's trap, as they keep Reverse and Shift.
- **Previews do not change.** `previewFor` and the pre-built `/og/*.jpg` set read a link into a view and pick the nearest place's picture; the picture is chosen from the fractal, variant, centre and zoom, so `m` does not reach it. A shared trap link therefore previews as the plain place picture (its og:url, re-encoded from the decoded view, still carries `m`). `parseOgQuery`'s strict list ignores unknown keys, so `/api/og` still redirects as before. `make-og-previews.mjs` calls `renderRgba` without a trap, so no committed image changes, and a test pins that.
- **Saved views** carry it as an optional `trap` field written only when set (as `reverse` and `shift` are), so stored JSON for every existing view is unchanged and an older build reads a newer view as a plain one.

## 6. The split into two beads

The engine has no UI and can land alone; nothing a visitor sees changes until the second bead.

### Bead 1: engine (distance, stored buffer, recolour; no UI, no link)

Files touched:

- **new** `src/lib/orbitTrap.ts`: `TrapShape`, the three traps' constants and geometry, `trapDistanceFor(kind, point, cap, shape)` (the method if the kind has it, else the `orbit()` walk), `trapPosition(d)`, `TRAP_K`, the clamp.
- `src/types/fractal.ts`: `TrapShape`, optional `FractalKind.trapDistance`, `FractalConfig.trap`.
- `src/lib/mandelbrot.ts` (`escapeTimeTrap`, `mandelbrotKind.trapDistance`), `julia.ts`, `burningShip.ts`, `tricorn.ts`, `celtic.ts`, `perpendicularShip.ts`, `multibrot.ts`, `phoenix.ts`: the dedicated loops with the cycle check. `newton.ts`, `nova.ts`, `magnet.ts` are **not** touched (they use the fallback).
- `src/lib/colorMapping.ts`: `mapPositionToColor`, `mapIterationsToColor` calling it.
- `src/lib/renderRgba.ts`: `countTrapRows`, `colourTrapRows`, the optional `trap` on `renderRgbaRows` and `renderRgba`.
- `src/lib/fractalRenderer.ts`: the tagged buffer, `renderFractal` and `recolour(..., trap?)`.

Tests:

- `orbitTrap.test.ts`: each shape's distance by hand (a point 3-4-5 away, a point on the line, one inside and one outside the circle, one on it); `trapPosition` monotone, in `[1e-6, 1 - 1e-6]`, the same at any cap, `Infinity` and `NaN` at the upper end; the start point is excluded.
- `trapDistance.test.ts` (the oracle): for every kind and variant (`FRACTAL_TYPES` with each variant), a grid of points including the inside, a NaN and an infinite point, each shape: `trapDistanceFor` equals the minimum over `orbit(point, cap)` points 1 onward within 1e-9. This is the test that holds a fourth copy of each loop to the other three.
- Kind cases: Mandelbrot's interior is **not** the cap's answer; a cycle of period 2 and 3 stops early and agrees with the full-cap walk; Newton, Nova and Magnet fall back and end where their own counts end.
- `colorMapping.test.ts` additions: `mapPositionToColor` against `mapIterationsToColor` for every scheme and several options; the existing tests untouched.
- `renderRgba.test.ts` additions: a call with no trap is byte for byte the picture it was (every existing assertion passes unchanged); the trap pair equals the one-pass picture for every kind; the three guard measures (below).
- `fractalRenderer.test.ts` additions: for every fractal and variant, each shape and each scheme, `recolour` after a trap render is the full render of that scheme byte for byte and counts no orbit; false after a cancel, from a preview, and while another render replaces the buffer; false for a mode or shape that is not the held one; the buffer dropped on a new render.
- Placement guard: every `FRACTAL_TYPES` fractal at its default view in each trap, drawn at 64x48 through the real pipeline, has a share of one colour under `FEATURED_MAX_UNIFORM_SHARE` and is not blank.
- A timing assertion is **not** added (hosts differ); the measured numbers are recorded in this note instead.

### Bead 2: UI and link (needs bead 1)

Files touched:

- `src/lib/viewLink.ts` (`m` encode and decode, `ViewLinkState.trap`, the doc comment's key list), `viewLinkState.ts` (`ViewLinkUpdates.trap`, `DEFAULT_VIEW_LINK_UPDATES`, the fill rule), `tourLink.ts` (`STOP_KEYS`, the stop's fields), `tourPlaylist.ts` (`VIEW_FIELDS`), `presets.ts` (optional `trap` on a saved view, the writer and reader).
- `src/app/FractalExplorer.tsx`: `trap` state, `viewLinkFor`, `drawCanvas` and `runExport` configs, a "Colouring" select in the Rendering Parameters card (Iteration count, Point trap, Line trap, Circle trap) beside the scheme, its handler (one history entry per change, like the Reverse checkbox, going through `handleParameterChange`), `handlePlaceSelect`'s `resetColour`, the `recolour` calls (they pass the trap), the saved-view save and load, the strip.
- `src/lib/placeThumbnails.ts` and `src/components/ui/NearbyStrip.tsx`: the store's key gains the trap exactly as it took the colour options, so a tile stays the picture a click shows (a 64x48 trap render costs about 3,000 orbits).
- `src/components/ui/CustomPresetManager.tsx`: the saved view's trap.
- `src/lib/mathProbe.ts` and `MathCard.tsx` (optional; see Decisions): the swatch in trap mode.
- `src/lib/helpEntries.ts`, the README (Color Mapping, Shareable Links, Custom Presets, Project Structure) and CLAUDE.md (Version Note and architecture bullet).

Tests:

- `viewLink.test.ts`: `m` round-trips for each shape; a view with no trap is byte for byte the old link; `m=spiral`, `m=` and a repeated key are dropped; key order (`... s r o m i w h`); the longest link under the length limit; `linkWithoutColour` keeps `m`.
- `viewLinkState.test.ts`: a link with `m` applies it, one without it turns the trap off.
- `tourLink.test.ts`: a stop's trap round-trips, the `t.m` column appears only when some stop has one, the eight-stop link stays under 900; `tourPlaylist.test.ts`: `sameView` tells a trap-on stop from the plain one.
- `presets.test.ts`: written only when set, read back, a view without it opens plain.
- A source-reading panel test (the repo's pattern, e.g. `colour-controls-panel.test.ts`): the select in the drawer and nowhere else; a change is one history entry and starts a render rather than a repaint; Reverse, Shift, scheme and cycling are unchanged in trap mode and still go through `recolour` with the trap; `resetColour` clears it on a tour hop and Surprise me and not on a tile; `previewFor` of a trap link is the plain place picture and `og-previews` is unchanged.
- `placeThumbnails.test.ts`: a tile in trap mode equals the click's picture (the existing mean-difference bound), and plain tiles are untouched.

## Decisions for the owner

1. **Is the inside of the set coloured in trap mode?** Recommended: yes, every pixel is coloured by its distance, which is the look orbit traps are known for. The option is to keep the cap's black for orbits that never escape; that needs counts as well, which costs the second buffer and the combined pass argued against above.
2. **The link key.** Recommended `m=point|line|circle` ("colouring method", leaving room for further modes). `t` is avoided because of the `t.` columns of tour links.
3. **Does Reset View, or Reset colours, turn the trap off?** Recommended no for both: trap mode is a mode like the scheme, and the scheme is not reset by either. Reset colours puts Reverse and Shift back and stays that.
4. **Do a Nearby tile, a fractal button, a preset and an Auto-wander hop keep trap mode?** Recommended yes (as Reverse and Shift do), with tour hops and Surprise me turning it off, and thumbnails drawn in trap mode so a tile is still the picture a click shows. The alternative, any hop turns it off, is simpler and loses the mode every click.
5. **Should the Math card's colour swatch follow trap mode?** Recommended yes in the UI bead: one pixel's trap distance on each pointer frame is nothing. The orbit plot's dots are coloured along the orbit and stay as they are.
6. **Fixed placement, no movable traps this wave.** Recommended (as the bead asked): point -0.5, the imaginary axis, circle of 0.5 about the origin. Every one was chosen for not passing through an attractor of any of the eleven fractals; a movable trap would let a visitor put it exactly there and see a flat field with no explanation.
7. **How many names for the select?** "Iteration count" (default), "Point trap", "Line trap", "Circle trap" are my wording; the owner may prefer others.
8. **Slow deep views in trap mode.** Trap mode has no interior shortcut, so Mandelbrot views that are mostly interior are the slowest case. At 800x600 and a cap of 1000 with the cycle check, the measured worst was a view of boundary points that never cycle (Seahorse Valley, 0.5 s, against 0.46 s for the count render there) and the period-3 bulb at 0.30 s; the deep cardioid, 0.00 s for the count render, is 0.05 s. Without the cycle check the same bulb is 2.06 s. It is a render with the progress bar like any other. Recommended to accept; the alternative is a lower iteration cap for trap renders (a cap of 256 was 3.8x faster at the default view with the generic loop and changes the picture slightly), which I advise against until the engine is measured on the real kinds.

## As built (fr-adc, the engine)

The engine landed as items 1 to 4 recommend, with no UI, link key, Help text or README feature text (fr-3h2 is the next bead). Where the code differs from the text above, this section says how and why; the code is the truth.

### What is in the tree

- **`src/lib/orbitTrap.ts`** (new): `TRAP_SHAPES`, the placements (`TRAP_POINT` -0.5, the imaginary axis, `TRAP_CIRCLE_CENTRE` 0 with `TRAP_CIRCLE_RADIUS` 0.5), `trapDistanceOf(shape, x, y)` (the plain geometry, used by tests and the walk), `trapKey`/`trapKeyToDistance` (what the loops keep the minimum of), `trapDistanceFor(kind, point, cap, shape)`, `trapPosition(d)` with `TRAP_K` 0.5 and the band `TRAP_POSITION_MIN`/`MAX` (1e-6, 1 - 1e-6), and `TRAP_CYCLE_TOLERANCE` (1e-12).
- **`FractalKind.trapDistance?`, `TrapShape`, `FractalConfig.trap?`** in `src/types/fractal.ts`.
- **Dedicated loops with the Brent cycle check** for the eight escape-time kinds: `escapeTimeTrap` in `mandelbrot.ts` (Mandelbrot and Julia, no cardioid shortcut), and one loop each in `burningShip.ts`, `tricorn.ts`, `celtic.ts`, `perpendicularShip.ts`, `multibrot.ts` and `phoenix.ts` (whose check compares the pair, z and the point before it). `newton.ts`, `nova.ts` and `magnet.ts` are untouched and use the `orbit()` walk, which ends where each kind's own count ends.
- **`colorMapping.ts`**: `mapPositionToColor(t, scheme, options)` is everything after the black test; `mapIterationsToColor` is the test, the division, then that call.
- **`renderRgba.ts`**: `countTrapRows`, `colourTrapRows` (siblings of the count pair, not branches inside it), `TrapBuffer` (`Float32Array`), and an optional trailing `trap` on `renderRgbaRows` and `renderRgba`. With `trap` absent the code path is the one it was.
- **`FractalRenderer`**: `counts` became `kept`, a tagged `{ mode: "counts", data: Float64Array } | { mode: "trap", shape, data: Float32Array } | null`; `renderFractal` reads `config.trap`; `recolour(scheme, cap, options?, trap?)` paints only when the held buffer is of the asked mode (and shape) and answers false otherwise.

### Where it matches the recommendation

- The decision of item 1 (B for the eight, the walk for Newton, Nova and Magnet), the rule for kinds that settle (the point that ended the walk counts), the start excluded, one buffer at a time, `Float32` distances rounded once when stored, the three placements, `t = d / (d + K)` with K = 0.5 held to the band, no black for the inside of the set, and the three-place switch (`renderRgbaRows`, `renderFractal`, `recolour`) are all as written.
- The buffer is dropped exactly where the counts are: when a render starts, on `cancelRender`, and (through the length check) for a canvas of another size. A preview pass (`useSmooth` false) draws the trap picture and keeps nothing. A detached export renderer holds its own buffer.
- `trapDistance.test.ts` carries the oracle the note asked for: for every kind and variant over a grid, every shape, and caps of 0, 1, 2, 3, 7, 200 and 1000, the dedicated loop equals the least distance over `orbit(point, cap)` from the second point on, within 1e-9 (a NaN or infinite point included). Breaking one step of one loop (checked by hand on the Tricorn's sign) fails it.

### Where it differs, and why

1. **One loop per kind, not one per kind per shape.** The note measured that a generic closure per step is 3 to 4 times slower than a loop written for one shape. The loops here call `trapKey(shape, x, y)`, a small function of two branches on the shape, which is not a closure or a polymorphic call, and keep the minimum of its result (the point trap's is the squared distance, so it takes one square root per pixel, and the line's is `|Re z|`). Three loops per kind would have been 24 copies of eight loops for a gain the cycle check already pays for. Measured, 800x600, cap 1000, Node 25 on the polecat host, median of three, default views (seconds): Mandelbrot count 0.06, trap 0.40 to 0.42; Julia 0.10, 0.23 to 0.24; Burning Ship 0.31, 0.68 to 0.70; Tricorn 0.14, 0.21 to 0.22; Multibrot (z^3) 0.46, 0.31 to 0.32 (the count has no early exit for its interior, the trap does); Celtic 0.22, 0.47 to 0.49; Perp. Ship 0.28, 0.58 to 0.59; Phoenix 0.11, 0.31; Newton 0.14, 0.13 to 0.16; Nova 0.34, 0.45 to 0.65; Magnet 2.9, 4.0 to 5.2. These are below the note's "dedicated loop, generic trap code" figures (Mandelbrot 0.76 to 0.82) because the cycle check is in, and above its 0.21 for a loop specialised to one shape. The three shapes cost the same to within noise except Nova and Magnet, which are the walk: their line trap (no `Math.hypot`) is the fast one.
2. **Count mode did not move.** The same script run on the tree before this bead gave the same count-render times within noise (Mandelbrot 0.06 against 0.06, Julia 0.10 against 0.10, Burning Ship 0.31, Magnet 3.1 against 2.9). `plainPicture.test.ts` pins the bytes: it holds FNV-1a checksums of every fractal's opening view (64x48, each in a different scheme and Reverse/Shift pair) taken from the tree before the engine landed.
3. **A pixel with nothing to measure reads Infinity and sits at the palette's far end.** The note says this for a cap under 1 and a NaN point; it also happens for Newton's exact origin (the map sends 0 to infinity, so the orbit is the one point and the start is excluded). A frame whose centre pixel is exactly 0 draws that pixel in the far colour. It is one pixel in a smooth field; left as it is rather than special-cased.
4. **The export renderer still keeps a buffer it does not need** (the note suggested a "keep nothing" flag for exports). Not done: it is a saving, not a correctness matter, and an export in trap mode keeps the smaller `Float32Array`. The page's `runExport` builds its `FractalConfig` from page state that has no `trap` yet; the UI bead adds the field there, and `fractalRendererTrap.test.ts` holds the renderer half of the export path (a detached renderer, its own size and frame, the screen's buffer untouched).
5. **The placement guard is wider than asked.** `renderRgbaTrap.test.ts` draws every fractal *and every variant* at its opening view in each trap (not only the eleven default variants) and holds the share of one colour under `FEATURED_MAX_UNIFORM_SHARE` and `isBlankImage` false. All pass with the note's placements.

### Facts the tests lean on

- The cycle check stops an orbit that has come back to within 1e-12 (each component) of a point saved at steps 1, 2, 4, 8, ... The tests give the Mandelbrot kind a cap of a billion at c = -1 and at the centre of the period-3 bulb, and every other escape-time kind (Phoenix included) one point that settles, and compare with the walk at a modest cap; a loop that lost the check would run for minutes and fail on the test's timeout, so no test asserts a time.
- Hand-worked values: c = 0 stays at 0 (point 0.5, line 0, circle 0.5); c = -1 alternates -1 and 0 (point 0.5, line 0, circle 0.5 at any cap from 2; the line is 1 at cap 1); c = 2 leaves on the first step at z = 2 (2.5, 2, 1.5); Newton's -0.5 reaches the root 1 in one step (1.5, 1, 0.5) at any cap from 1; Nova's c = 0 settles on 1 on a step of length 0 (1.5, 1, 0.5).
- `trapPosition(0)` is `TRAP_POSITION_MIN`, so with Reverse no pixel reaches the end where rainbow paints black; `renderRgbaTrap.test.ts` finds no black pixel in the Mandelbrot set's trap pictures in rainbow with every Reverse and Shift pair.

## As built (fr-3h2, the control and the link key)

The control and the link landed as item 5 and Bead 2 recommend, with the differences below. The code is the truth.

### What is in the tree

- **Link key `m`** (`point`, `line`, `circle`), written after `o` and before `i` and only when a shape is on; `ViewLinkState.trap?`, `ViewLinkUpdates.trap` (`TrapShape | null`, default null). `COLOUR_ONLY_KEYS` is unchanged, so `linkWithoutColour` keeps `m`.
- **Tour links:** `STOP_KEYS` has `"m"`, giving a `t.m` column that appears only when a stop has a trap; `VIEW_FIELDS` in `tourPlaylist.ts` has `trap`.
- **Saved views:** optional `trap` on `FractalPreset`, written by `presetColorFields(reverse, shift, trap)` only when set, read by `presetTrap`.
- **The control:** an "Orbit trap" `Select` (Off, Point, Line, Circle; `TRAP_CONTROL_OPTIONS`, `trapToControl`, `controlToTrap` in `paletteControls.ts`) in the Rendering Parameters card between Reverse and Shift, 44 px through `Select`'s new `selectClassName`. The design note's "Colouring" select with an "Iteration count" entry became "Orbit trap" with "Off", which reads as the state it is.
- **Page:** `trap` state; `viewLinkFor`, `applyViewLink`, `drawCanvas` (config and `recolour`), the cycling frame loop, `runExport`, the probe, `handlePresetSelect`, `handlePlaceSelect` (`resetColour` drops the trap), `showStop`, `handleResetColours`, `resetToDefault`.
- **Strip and probe:** `ThumbnailLook` (`ColorOptions & { trap }`) keys the thumbnail store and reaches the renderer, so a tile is the picture a click shows; `probePoint` takes a trailing `trap` and colours `Math.fround(trapDistanceFor(...))`, which is what the picture paints.

### Where it differs from the text above

1. **A trap choice adds no history entry.** The note (item "Page", Bead 2) said one entry per change, like the Reverse checkbox. The bead for this landing says none, so `handleTrapChange` goes through `handleParameterChange` and never `beginJump`. One line (`beginJump()` before it) would restore the entry.
2. **Reset colours turns the trap off, and Reset View does too.** Decision 3 recommended neither. The bead overrode the first; Reset View already puts the scheme, Reverse and Shift back, so it follows.
3. **The first choice of a shape is a render, not a repaint.** The bead says "repaints instantly through `recolour()`"; distances cannot be repainted before they exist (section 2, "Why"). Choosing, changing or clearing a trap is one render; the scheme, Reverse, Shift and cycling then repaint from the kept distances. This follows from `m` not being colour-only, as item 5 says.
4. **Decision 4 as recommended:** a tile, a fractal button, a preset and an Auto-wander hop keep the trap; a tour hop and Surprise me drop it. Thumbnails are drawn in it.
5. **Decision 5 as recommended:** the Math card's swatch follows the trap (one distance per pointer frame); the orbit plot's dots do not.
