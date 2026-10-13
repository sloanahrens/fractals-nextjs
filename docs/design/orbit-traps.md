# Orbit traps: colouring by closest approach

Status: the design note written 2026-10-11, trimmed to a decision record once
the feature had landed. The code is the truth where this and the code differ.

## What it is

An orbit trap colours a pixel by the closest its orbit comes to a fixed shape in
the plane the orbit lives in — a point, a line or a circle — rather than by how
many steps the orbit took to escape. That gives the rings, stalks and glowing
bulbs for every fractal in the picker: it feeds a per-pixel distance through the
same palette, Shift and Reverse, so recolouring from a kept buffer is instant,
links carry it, and the pre-built previews do not change.

## 1. Where the distance is computed

Walk `orbit()` and take the least distance, or add an optional
`FractalKind.trapDistance` running the kind's own loop with a running minimum.

**Decision: the dedicated method for the escape-time kinds; the `orbit()` walk
for Newton, Nova and Magnet.** The walk is little slower than the count for the
kinds that settle, whose orbits are short; the dedicated loop is several times
faster, allocates nothing, and is the only way to get the cycle check, which
pays for itself many times over on interior-heavy views. It stops an orbit that
has settled, because such an orbit only revisits points and the running minimum
cannot change: a loop saves `z` at steps 1, 2, 4, 8, ... and stops when `z`
returns within `TRAP_CYCLE_TOLERANCE` of the saved point.

The least is over every point the kind's own walk visits, the point that ended
it included, so a trap through an attractor flattens a whole basin — solved by
placement in item 3, not by a rule. `trapDistance.test.ts` holds this fourth
copy of each loop to the `orbit()` walk, over every kind and variant.

## 2. The stored buffer

**One buffer at a time, not two**: the renderer holds either the counts
(`Float64Array`) or the trap distances (`Float32Array`), matching the last
finished render. Toggling the trap on cannot be instant whatever is stored, as
the distances come from walking the orbits again; holding both would buy an
instant switch back off alone, at half again the memory and a stale buffer.
Scheme, Reverse, Shift and cycling stay instant in either mode, being repaints.

`FractalRenderer.counts` becomes `kept`, a tagged
`{ mode: "counts", data } | { mode: "trap", shape, data } | null`, dropped where
the counts were (a new render, `cancelRender`, a canvas of another size).
`Float32` suffices here where it did not for counts (the note in `renderRgba.ts`):
a distance is rounded once when stored and every painter colours from that value.
`recolour(scheme, cap, options?, trap?)` answers true only when the held buffer
is of the asked mode and shape, so a stale buffer is harmless and the cycling
frame loop cannot paint the wrong picture.

## 3. The traps and their placement

All three live in the plane the orbit moves in (`z`), never the picture's own
coordinates, so a trap does not move when the view pans or zooms. It is fixed.

| Trap | Geometry | Distance from `z = x + iy` | Placement |
|---|---|---|---|
| Point | one point `P` | `\|z - P\|` | `TRAP_POINT`, -0.5 |
| Line | the imaginary axis | `\|x\|` | through 0, direction `i` |
| Circle | centre `C`, radius `r` | `\|\|z - C\| - r\|` | centre 0, radius 0.5 |

Every point the orbit **lands on** counts, not the one it starts from (`z_1`
onward): a Mandelbrot orbit starts at 0, where a point trap near the origin
would read 0 for every pixel, and the others start at the pixel itself, which
would add a gradient of its own position.

Every candidate placement was drawn for every fractal and held to the repo's
`nearUniformShare`, the featured-place guard's measure, whose limit is 60%. A
circle of radius 1 about 0 and the real axis both read far above it and were
rejected. **Chosen: the point at -0.5, the imaginary axis (keeping the
Mandelbrot family's left-right mirror and giving the classic stalks) and a
circle of radius 0.5 about 0**, at 13%, 14% and 11% worst case.

The distance goes to the palette through `t = d / (d + TRAP_K)`, `TRAP_K` 0.5,
held to `[TRAP_POSITION_MIN, TRAP_POSITION_MAX]`, 1e-6 to 1 - 1e-6. It saturates
on the distance alone, so it does not depend on the iteration cap, and the clamp
guards the rainbow scheme, whose hue is exactly 360 at `t = 1`, where the
conversion paints black. **No pixel is black for being inside the set**:
colouring the interior is the signature look of orbit traps.

## 4. The colour path

The trap feeds `t` through the same palette code, so schemes, Shift and Reverse
work unchanged. `colorMapping.ts` gained `mapPositionToColor`, `orbitTrap.ts`
`trapPosition(distance)` and `renderRgba.ts` a trap pair beside the count pair,
not a branch inside it; the switch is one check over rows, in `renderRgbaRows`,
`renderFractal` and `recolour`.

## 5. The link

- **Key `m`** ("colouring method": `point`, `line`, `circle`; absent is the
  count picture), written and read like `r` and `o`, only when a trap is on.
  `t` is not used, because tour links are made of `t.`-prefixed columns.
- **`m` is not colour-only, deliberately**: `COLOUR_ONLY_KEYS` stays `s`, `r`
  and `o`, so `linkWithoutColour` keeps `m` and the page's repaint test sends a
  toggle or a change of shape to a render, while a change of scheme, Reverse or
  Shift repaints from the kept distances.
- **Tour links** gain an `m` stop column, and `sameView` tells a trap-on stop
  from the plain stop at that place. Saved views carry the trap only when set; a
  hop that was nobody's aim (a tour hop, Surprise me) resets it, while a tile, a
  preset and an Auto-wander hop keep the visitor's.

## As built

The engine and then the control landed as items 1 to 5 recommend, except:

1. **One loop per kind, not one per kind per shape**, because a generic closure
   per step is several times slower than a loop for one shape. These loops call
   `trapKey(shape, x, y)`, a two-branch function rather than a closure.
2. **A trap choice adds no history entry**: it rewrites the current entry, as
   the other colour controls do. The design had said one entry per change.
3. **Reset colours and Reset View both turn the trap off**, where the design had
   recommended that neither reset it; Reset View already puts the scheme,
   Reverse and Shift back, so the trap follows.
4. **The first choice of a shape is a render, not a repaint**, because distances
   cannot be repainted before they exist; scheme, Reverse, Shift and cycling
   then repaint from the kept distances.
5. **The names.** The control is an "Orbit trap" select in the Rendering
   Parameters card, and the visible names settled on **Orbit Trap: Point**,
   **Line** and **Circle** in the Look menu, Settings and the Help; the values
   and the `m` key are untouched by the naming.
6. **The placement guard is wider than the note asked** (every fractal and
   variant, each trap at 64x48), and the export renderer still keeps a buffer it
   does not need — a saving, not a correctness matter.
