/**
 * Orbit traps: colouring a pixel by how close its orbit comes to a fixed shape
 * instead of by how long the orbit took to escape.
 *
 * The three shapes live in the plane the orbit moves in (`z`), never in the
 * picture's coordinates, so for the Mandelbrot family a trap does not move when
 * the view pans or zooms: it is a property of the colouring. Their placement is
 * fixed, and was chosen so that none passes through an attractor of any
 * fractal in the picker (a trap through an attractor makes every orbit that
 * settles there read distance near 0, and a whole basin goes one flat colour):
 * see docs/design/orbit-traps.md, item 3, for the measurements.
 *
 * A pixel's distance is the least distance from the shape to any point the
 * orbit **lands on**: `z_1`, `z_2`, ... to the last. The point the orbit
 * starts from is not counted. A Mandelbrot orbit starts at 0, where a trap near
 * the origin would read 0 for every pixel; and a Julia, Newton or Phoenix orbit
 * starts at the pixel itself, so counting it would add a plain gradient of the
 * pixel's own position to every picture.
 *
 * The distance goes to the palette through {@link trapPosition}, a saturating
 * curve of the distance alone, so a trap picture does not depend on the
 * iteration cap: the cap changes only how many steps the minimum is taken over.
 *
 * Nothing here touches the DOM, `window` or any Node module.
 */

import type { ComplexNumber, FractalKind, TrapShape } from "../types/fractal";

/** The shapes, in the order a control would list them. */
export const TRAP_SHAPES: readonly TrapShape[] = ["point", "line", "circle"];

/** The point trap's point: -0.5 on the real axis. */
export const TRAP_POINT: ComplexNumber = { real: -0.5, imaginary: 0 };

/** The line trap's line is the imaginary axis, `Re z = 0`. */
export const TRAP_LINE_REAL = 0;

/** The circle trap's centre: the origin. */
export const TRAP_CIRCLE_CENTRE: ComplexNumber = { real: 0, imaginary: 0 };

/** The circle trap's radius. */
export const TRAP_CIRCLE_RADIUS = 0.5;

/**
 * The distance that lands mid-palette, in `t = d / (d + K)`. Close to the
 * median distance of the three traps over the eleven fractals (0.1 to 2.2, most
 * of them 0.4 to 1.4); 0.5 gave the least share of one colour of 0.5, 1 and 2.
 */
export const TRAP_K = 0.5;

/**
 * The ends of the palette a trap picture may use. A distance of exactly 0 is
 * common (any orbit of a real `c` lands on the real axis), and the rainbow
 * scheme paints its hue-360 end black, which Reverse would send a 0 to: held
 * inside this band, `1 - t` and any Shift stay under 1, so no trap pixel is
 * black by accident.
 */
export const TRAP_POSITION_MIN = 1e-6;
export const TRAP_POSITION_MAX = 1 - 1e-6;

/**
 * How near a point must come to one the orbit visited a power-of-two number of
 * steps ago for the orbit to count as having closed on a cycle (or a fixed
 * point), after which the running minimum cannot change. Much smaller than
 * anything a palette can show: the minimum it returns differs from the full
 * cap's by at most a few 1e-10.
 */
export const TRAP_CYCLE_TOLERANCE = 1e-12;

/**
 * The distance from the shape to the point `x + iy`.
 *
 * @param shape - Which trap
 * @param x - Real part
 * @param y - Imaginary part
 * @returns The distance, NaN when either part is
 */
export function trapDistanceOf(shape: TrapShape, x: number, y: number): number {
  switch (shape) {
    case "point":
      return Math.hypot(x - TRAP_POINT.real, y - TRAP_POINT.imaginary);
    case "line":
      return Math.abs(x - TRAP_LINE_REAL);
    case "circle":
      return Math.abs(
        Math.hypot(
          x - TRAP_CIRCLE_CENTRE.real,
          y - TRAP_CIRCLE_CENTRE.imaginary,
        ) - TRAP_CIRCLE_RADIUS,
      );
  }
}

/**
 * A quantity that orders points as {@link trapDistanceOf} does, cheaper to
 * take: the point trap's is the squared distance (no square root in the loop),
 * the line's and the circle's are the distance itself. The kinds' loops keep
 * the least of these and hand it to {@link trapKeyToDistance} once at the end.
 *
 * Not a method on a shape object: a shape-polymorphic call in the innermost
 * loop of every pixel is what the design note measured to be 3 to 4 times
 * slower than this.
 */
export function trapKey(shape: TrapShape, x: number, y: number): number {
  if (shape === "point") {
    const dx = x - TRAP_POINT.real;
    const dy = y - TRAP_POINT.imaginary;

    return dx * dx + dy * dy;
  }
  if (shape === "line") return Math.abs(x - TRAP_LINE_REAL);

  return Math.abs(
    Math.sqrt(
      (x - TRAP_CIRCLE_CENTRE.real) * (x - TRAP_CIRCLE_CENTRE.real) +
        (y - TRAP_CIRCLE_CENTRE.imaginary) * (y - TRAP_CIRCLE_CENTRE.imaginary),
    ) - TRAP_CIRCLE_RADIUS,
  );
}

/**
 * The distance a least {@link trapKey} stands for. Infinity stays Infinity, and
 * so does a loop that never found a point to measure.
 */
export function trapKeyToDistance(shape: TrapShape, key: number): number {
  return shape === "point" ? Math.sqrt(key) : key;
}

/**
 * The trap distance of a point for any kind: the kind's own `trapDistance` if
 * it has one, else the least over the points of its `orbit` from the second on.
 * The walk is the oracle the dedicated loops are held to, and the answer for
 * the kinds that end by settling (Newton, Nova, Magnet), whose orbits are short.
 *
 * @param kind - The formula whose orbit is measured
 * @param point - Point of the plane, handed over as the renderer does
 * @param maxIterations - Most steps to walk
 * @param shape - Which trap
 * @returns The least distance reached, or Infinity when the orbit landed on
 *   nothing that could be measured (a cap under 1, a point that is not a number)
 */
export function trapDistanceFor(
  kind: FractalKind,
  point: ComplexNumber,
  maxIterations: number,
  shape: TrapShape,
): number {
  if (kind.trapDistance) return kind.trapDistance(point, maxIterations, shape);

  const path = kind.orbit?.(point, maxIterations) ?? [point];
  let least = Infinity;

  for (let index = 1; index < path.length; index++) {
    const distance = trapDistanceOf(
      shape,
      path[index].real,
      path[index].imaginary,
    );

    // A NaN fails the comparison and is skipped, as in the dedicated loops.
    if (distance < least) least = distance;
  }

  return least;
}

/**
 * Where on the palette a distance sits: `d / (d + K)`, held to
 * {@link TRAP_POSITION_MIN}..{@link TRAP_POSITION_MAX}.
 *
 * Increasing, bounded for every distance a kind can produce (Nova's orbits may
 * reach 1e6 and Magnet's 100), and a function of the distance alone. An orbit
 * that never comes near has a large minimum and sits at the palette's far end,
 * with no special case; a distance that is not a finite number (nothing to
 * measure) is put there too, since `Infinity / Infinity` is NaN.
 *
 * @param distance - The least distance an orbit reached
 * @returns A palette position inside the band
 */
export function trapPosition(distance: number): number {
  if (!Number.isFinite(distance)) return TRAP_POSITION_MAX;

  const t = Math.max(0, distance) / (Math.max(0, distance) + TRAP_K);

  return Math.min(TRAP_POSITION_MAX, Math.max(TRAP_POSITION_MIN, t));
}
