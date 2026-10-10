import type { ColorScheme } from "../types/fractal";
import { parseJuliaConstant } from "./julia";
import { BASE_WIDTH } from "./mandelbrot";

/**
 * An interesting view the explorer can send you to.
 *
 * A place is a view with a name: the fields a link or the page's own state
 * already carry (the fractal, for a Julia set its constant, the centre and the
 * zoom), so going to one is setting those and nothing else. Every number was
 * picked from a render of the picture it names.
 */
export interface Place {
  /** Stable identifier, unique across {@link PLACES}; also the tie-break. */
  id: string;
  /** Plain-language name, as a thumbnail or a caption would show it. */
  name: string;
  /** A `FRACTAL_TYPES` id. */
  fractal: string;
  /**
   * The Julia constant, as a name or a `custom:<re>,<im>` spelling
   * (`julia.ts`). Present for a Julia place and for no other.
   */
  juliaConstant?: string;
  /** Real part of the centre of the view. */
  centerX: number;
  /** Imaginary part of the centre of the view. */
  centerY: number;
  /** Magnification, as the page's zoom state and a link carry it. */
  zoom: number;
  /** The colours the place was picked in; absent leaves the page's own. */
  colorScheme?: ColorScheme;
}

/** Where the explorer is: the part of a {@link Place} that locates a view. */
export type PlaceView = Pick<
  Place,
  "fractal" | "juliaConstant" | "centerX" | "centerY" | "zoom"
>;

/**
 * The colours a place is shown in: its own when it names any, else the page's.
 *
 * One rule for both halves of a visit, so they cannot drift apart: a Nearby
 * tile is drawn in this scheme and a click on it applies this scheme. A place
 * that names its colours is therefore the same picture whatever scheme the
 * page happens to be in, and only a place that names none follows the page.
 *
 * @param place - The place being drawn or visited
 * @param current - The page's colour scheme at that moment
 * @returns The scheme the tile is drawn in and the click sets
 */
export function placeColorScheme(
  place: Pick<Place, "colorScheme">,
  current: ColorScheme,
): ColorScheme {
  return place.colorScheme ?? current;
}

// The catalogue. Every zoom is inside the explorer's range (`MAX_ZOOM`, the
// float64 wall the presets are held to), every Mandelbrot place is drawn at the
// count Auto picks for its zoom, and every centre is written with at most ten
// significant digits, which is what a link carries — so a place survives
// `encodeView`/`decodeView` as the same numbers. `places.test.ts` holds the
// catalogue to all of that and renders each one.
//
// The whole-set place of each fractal sits at that fractal's opening view
// (`defaultViewFor`), so a visitor who has not moved is already at a place and
// is not sent to the picture on screen.

const MANDELBROT_PLACES: readonly Place[] = [
  {
    id: "mandelbrot-whole",
    name: "The whole Mandelbrot set",
    fractal: "mandelbrot",
    centerX: -0.75,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-seahorse-valley",
    name: "Seahorse Valley",
    fractal: "mandelbrot",
    centerX: -0.7453,
    centerY: 0.1127,
    zoom: 400,
    colorScheme: "ocean",
  },
  {
    id: "mandelbrot-lightning",
    name: "Lightning",
    fractal: "mandelbrot",
    centerX: -1.2505,
    centerY: 0.0205,
    zoom: 2000,
    colorScheme: "fire",
  },
  {
    id: "mandelbrot-spiral-galaxy",
    name: "Spiral Galaxy",
    fractal: "mandelbrot",
    centerX: -0.16,
    centerY: 1.04,
    zoom: 200,
    colorScheme: "rainbow",
  },
  {
    id: "mandelbrot-elephant-valley",
    name: "Elephant Valley",
    fractal: "mandelbrot",
    centerX: 0.29,
    centerY: 0.01,
    zoom: 200,
    colorScheme: "fire",
  },
  {
    id: "mandelbrot-feather",
    name: "Feather",
    fractal: "mandelbrot",
    centerX: -0.235,
    centerY: 0.827,
    zoom: 2000,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-needle-copy",
    name: "A small copy of the whole set",
    fractal: "mandelbrot",
    centerX: -1.7549,
    centerY: 0,
    zoom: 45,
    colorScheme: "fire",
  },
  {
    id: "mandelbrot-spiky-copy",
    name: "Spiky little copy",
    fractal: "mandelbrot",
    centerX: -1.4786,
    centerY: 0,
    zoom: 60,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-needle-bulbs",
    name: "Bulbs strung along the needle",
    fractal: "mandelbrot",
    centerX: -1.4,
    centerY: 0,
    zoom: 8,
    colorScheme: "rainbow",
  },
  {
    id: "mandelbrot-double-spiral",
    name: "Double spiral",
    fractal: "mandelbrot",
    centerX: -0.7435,
    centerY: 0.1318,
    zoom: 600,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-seahorse-tail",
    name: "Seahorse tail",
    fractal: "mandelbrot",
    centerX: -0.7463,
    centerY: 0.1102,
    zoom: 3000,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-three-armed-star",
    name: "Three-armed star",
    fractal: "mandelbrot",
    centerX: -0.1010963638,
    centerY: 0.9562865108,
    zoom: 300,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-elephant-curl",
    name: "Elephant's curl",
    fractal: "mandelbrot",
    centerX: 0.2858,
    centerY: 0.0115,
    zoom: 1500,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-spiral-arm",
    name: "Spiral arm",
    fractal: "mandelbrot",
    centerX: -0.8,
    centerY: 0.18,
    zoom: 120,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-top-bulb",
    name: "The bulb on top",
    fractal: "mandelbrot",
    centerX: -0.1225,
    centerY: 0.7449,
    zoom: 8,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-long-antenna",
    name: "Bulb with a long antenna",
    fractal: "mandelbrot",
    centerX: 0,
    centerY: 0.9,
    zoom: 5,
    colorScheme: "classic",
  },
  {
    id: "mandelbrot-shoulder-bulb",
    name: "Bulb on the shoulder",
    fractal: "mandelbrot",
    centerX: 0.2822,
    centerY: 0.5301,
    zoom: 30,
    colorScheme: "fire",
  },
  {
    id: "mandelbrot-rainbow-bulb",
    name: "Rainbow bulb",
    fractal: "mandelbrot",
    centerX: -0.5043,
    centerY: 0.5628,
    zoom: 30,
    colorScheme: "rainbow",
  },
  {
    id: "mandelbrot-spiral-garden",
    name: "Spiral garden",
    fractal: "mandelbrot",
    centerX: -0.7778,
    centerY: 0.1273,
    zoom: 300,
    colorScheme: "fire",
  },
];

const JULIA_PLACES: readonly Place[] = [
  {
    id: "julia-classic-whole",
    name: "Classic: the whole set",
    fractal: "julia",
    juliaConstant: "Classic",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-classic-spirals",
    name: "Classic: spirals",
    fractal: "julia",
    juliaConstant: "Classic",
    centerX: 0,
    centerY: 0,
    zoom: 3,
    colorScheme: "classic",
  },
  {
    id: "julia-classic-deep-spiral",
    name: "Classic: deep spiral",
    fractal: "julia",
    juliaConstant: "Classic",
    centerX: 0.4,
    centerY: 0.05,
    zoom: 40,
    colorScheme: "rainbow",
  },
  {
    id: "julia-dendrite-whole",
    name: "Dendrite: the whole set",
    fractal: "julia",
    juliaConstant: "Dendrite",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-douady-rabbit-whole",
    name: "Douady rabbit: the whole set",
    fractal: "julia",
    juliaConstant: "Douady rabbit",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-siegel-disk-whole",
    name: "Siegel disk: the whole set",
    fractal: "julia",
    juliaConstant: "Siegel disk",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-coral",
    name: "Coral",
    fractal: "julia",
    juliaConstant: "custom:-0.70176,-0.3842",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "rainbow",
  },
  {
    id: "julia-basilica",
    name: "Basilica",
    fractal: "julia",
    juliaConstant: "custom:-1,0",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "rainbow",
  },
  {
    id: "julia-s-curve",
    name: "The S-curve",
    fractal: "julia",
    juliaConstant: "custom:0.37,0.1",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "fire",
  },
  {
    id: "julia-four-leaf-clover",
    name: "Four-leaf clover",
    fractal: "julia",
    juliaConstant: "custom:0.285,0.01",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "ocean",
  },
];

const BURNING_SHIP_PLACES: readonly Place[] = [
  {
    id: "burning-ship-whole",
    name: "The whole Burning Ship",
    fractal: "burning-ship",
    centerX: -0.45,
    centerY: -0.5,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "burning-ship-armada",
    name: "Armada of masts",
    fractal: "burning-ship",
    centerX: -1.755,
    centerY: -0.03,
    zoom: 40,
    colorScheme: "classic",
  },
  {
    id: "burning-ship-hull-edge",
    name: "The hull's edge",
    fractal: "burning-ship",
    centerX: -0.5,
    centerY: -0.5,
    zoom: 2.2,
    colorScheme: "rainbow",
  },
  {
    id: "burning-ship-hull-and-rigging",
    name: "Hull and rigging",
    fractal: "burning-ship",
    centerX: -1.7443,
    centerY: -0.0175,
    zoom: 60,
    colorScheme: "fire",
  },
  {
    id: "burning-ship-hull-close-up",
    name: "Hull close up",
    fractal: "burning-ship",
    centerX: -1.7443,
    centerY: -0.0135,
    zoom: 90,
    colorScheme: "classic",
  },
  {
    id: "burning-ship-among-the-masts",
    name: "A ship among the masts",
    fractal: "burning-ship",
    centerX: -1.62,
    centerY: -0.004,
    zoom: 80,
    colorScheme: "classic",
  },
  {
    id: "burning-ship-forest-of-masts",
    name: "Forest of masts",
    fractal: "burning-ship",
    centerX: -1.59,
    centerY: -0.01,
    zoom: 120,
    colorScheme: "classic",
  },
  {
    id: "burning-ship-arches",
    name: "The arches",
    fractal: "burning-ship",
    centerX: -1.7625,
    centerY: -0.0285,
    zoom: 160,
    colorScheme: "fire",
  },
  {
    id: "burning-ship-blue-water",
    name: "A small ship in blue water",
    fractal: "burning-ship",
    centerX: -1.76,
    centerY: -0.03,
    zoom: 20,
    colorScheme: "ocean",
  },
  {
    id: "burning-ship-far-out",
    name: "A ship far out",
    fractal: "burning-ship",
    centerX: -1.94,
    centerY: -0.002,
    zoom: 1000,
    colorScheme: "rainbow",
  },
];

/**
 * Every place the explorer knows, grouped by fractal and, inside a fractal, in
 * the order the picker lists it: the whole picture first, then the places
 * that go deeper.
 */
export const PLACES: readonly Place[] = [
  ...MANDELBROT_PLACES,
  ...JULIA_PLACES,
  ...BURNING_SHIP_PLACES,
];

/**
 * The places of one fractal, in catalogue order.
 *
 * @param fractal - A `FRACTAL_TYPES` id
 * @returns Its places; empty for an id the catalogue has none of
 */
export function placesForFractal(fractal: string): Place[] {
  return PLACES.filter((place) => place.fractal === fractal);
}

/**
 * How much deeper than the view the best next place is, in octaves of zoom.
 *
 * A click should usually be a step in, so a place two doublings of the zoom
 * further than the view scores as an exact depth match and one at the view's
 * own zoom, or a doubling shallower, scores as a miss.
 */
const PREFERRED_DEPTH_OCTAVES = 2;

/**
 * How far from the view a place may sit and still be the view, both as a share
 * of what the comparison is measured in: of the view's span for the centre, of
 * the view's zoom for the zoom.
 */
const SAME_VIEW_TOLERANCE = 0.01;

/** Whether two Julia constant names stand for the same point. */
function sameConstant(
  first: string | undefined,
  second: string | undefined,
): boolean {
  if (first === undefined || second === undefined) return false;

  const a = parseJuliaConstant(first);
  const b = parseJuliaConstant(second);

  // A spelling the build cannot read is only ever the same as itself.
  if (a === null || b === null) return first === second;

  return a.real === b.real && a.imaginary === b.imaginary;
}

/** Whether a place is the view itself: same picture, within the tolerance. */
function isCurrentView(view: PlaceView, place: Place, span: number): boolean {
  if (place.fractal === "julia") {
    if (!sameConstant(place.juliaConstant, view.juliaConstant)) return false;
  }

  return (
    Math.abs(place.centerX - view.centerX) <= SAME_VIEW_TOLERANCE * span &&
    Math.abs(place.centerY - view.centerY) <= SAME_VIEW_TOLERANCE * span &&
    Math.abs(Math.log(place.zoom / view.zoom)) <=
      Math.log1p(SAME_VIEW_TOLERANCE)
  );
}

/**
 * How far a place is from the view, lower being nearer.
 *
 * Two distances added: the centre's, measured in the view's own spans so that
 * "near" means near on the screen the user is looking at, and the zoom's, in
 * octaves from the depth a step in should have. A nearby place that is far
 * deeper or shallower than that costs as much as a place several screens away.
 */
function distanceFrom(view: PlaceView, place: Place, span: number): number {
  const centre =
    Math.hypot(place.centerX - view.centerX, place.centerY - view.centerY) /
    span;
  const octaves = Math.log2(place.zoom / view.zoom);

  return centre + Math.abs(octaves - PREFERRED_DEPTH_OCTAVES);
}

/**
 * What is worth looking at near a view.
 *
 * Pure and deterministic: the same view and catalogue always give the same
 * list. Only places of the view's own fractal are considered, and never the
 * place that is the view — the same fractal and constant with the centre
 * within 1% of the view's span and the zoom within 1%. The rest are ranked by
 * {@link distanceFrom}, nearest first, and a tie is broken by id so the order
 * does not change between calls. For a Julia view the places that share its
 * constant come first, each group ranked on its own: another constant's picture
 * is never a step from this one, however near its numbers are.
 *
 * A view that cannot be measured — a centre or zoom that is not a finite
 * number, or a zoom that is not positive — has nothing near it, and a count
 * that is not a positive whole number asks for nothing.
 *
 * @param view - Where the explorer is
 * @param places - The catalogue to choose from
 * @param count - How many to return at most; more than the catalogue holds
 *   returns what exists
 * @returns At most `count` places, best first
 */
export function suggest(
  view: PlaceView,
  places: readonly Place[],
  count: number,
): Place[] {
  if (!Number.isFinite(count) || count < 1) return [];
  if (
    !Number.isFinite(view.centerX) ||
    !Number.isFinite(view.centerY) ||
    !Number.isFinite(view.zoom) ||
    view.zoom <= 0
  ) {
    return [];
  }

  const span = BASE_WIDTH / view.zoom;
  const isJulia = view.fractal === "julia";

  return places
    .filter((place) => place.fractal === view.fractal)
    .filter((place) => !isCurrentView(view, place, span))
    .map((place) => ({
      place,
      // 0 for a place that shares a Julia view's constant, 1 for the others;
      // every other fractal has one group.
      group:
        isJulia && !sameConstant(place.juliaConstant, view.juliaConstant)
          ? 1
          : 0,
      distance: distanceFrom(view, place, span),
    }))
    .sort(
      (a, b) =>
        a.group - b.group ||
        a.distance - b.distance ||
        (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0),
    )
    .slice(0, Math.floor(count))
    .map((entry) => entry.place);
}
