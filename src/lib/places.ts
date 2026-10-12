import type { ColorScheme } from "../types/fractal";
import { defaultViewFor, fractalVariants } from "./fractalTypes";
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
   * The fractal's variant: for Julia the constant, as a name or a
   * `custom:<re>,<im>` spelling (`julia.ts`); for the Multibrot its power, "3",
   * "4" or "5". Present for a place of a fractal that takes one and for no
   * other.
   */
  variant?: string;
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
  "fractal" | "variant" | "centerX" | "centerY" | "zoom"
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
    variant: "Classic",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-classic-spirals",
    name: "Classic: spirals",
    fractal: "julia",
    variant: "Classic",
    centerX: 0,
    centerY: 0,
    zoom: 3,
    colorScheme: "classic",
  },
  {
    id: "julia-classic-deep-spiral",
    name: "Classic: deep spiral",
    fractal: "julia",
    variant: "Classic",
    centerX: 0.4,
    centerY: 0.05,
    zoom: 40,
    colorScheme: "rainbow",
  },
  {
    id: "julia-dendrite-whole",
    name: "Dendrite: the whole set",
    fractal: "julia",
    variant: "Dendrite",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-douady-rabbit-whole",
    name: "Douady rabbit: the whole set",
    fractal: "julia",
    variant: "Douady rabbit",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-siegel-disk-whole",
    name: "Siegel disk: the whole set",
    fractal: "julia",
    variant: "Siegel disk",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "julia-coral",
    name: "Coral",
    fractal: "julia",
    variant: "custom:-0.70176,-0.3842",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "rainbow",
  },
  {
    id: "julia-basilica",
    name: "Basilica",
    fractal: "julia",
    variant: "custom:-1,0",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "rainbow",
  },
  {
    id: "julia-s-curve",
    name: "The S-curve",
    fractal: "julia",
    variant: "custom:0.37,0.1",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "fire",
  },
  {
    id: "julia-four-leaf-clover",
    name: "Four-leaf clover",
    fractal: "julia",
    variant: "custom:0.285,0.01",
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

// Drawn headless at low resolution onto contact sheets in several schemes, the
// striking ones kept and their centre and zoom written in as the render had
// them. The set has three arms turned 120 degrees apart, so the same feature
// turns up on the left arm (along the negative real axis, as the Mandelbrot set
// has it) and on the two others, rotated: the places below take both, which is
// why some frames run diagonally.
const TRICORN_PLACES: readonly Place[] = [
  {
    id: "tricorn-whole",
    name: "The whole Tricorn",
    fractal: "tricorn",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "tricorn-two-bulbs",
    name: "Two bulbs on an arm",
    fractal: "tricorn",
    centerX: 0.55,
    centerY: 1,
    zoom: 8,
    colorScheme: "ocean",
  },
  {
    id: "tricorn-frayed-edge",
    name: "The body's frayed edge",
    fractal: "tricorn",
    centerX: 0.28,
    centerY: 0.5,
    zoom: 8,
    colorScheme: "rainbow",
  },
  {
    id: "tricorn-left-arm-bulb",
    name: "The left arm's bulb",
    fractal: "tricorn",
    centerX: -1.25,
    centerY: 0,
    zoom: 12,
    colorScheme: "ocean",
  },
  {
    id: "tricorn-along-the-arm",
    name: "Along the left arm",
    fractal: "tricorn",
    centerX: -1.4,
    centerY: 0,
    zoom: 20,
    colorScheme: "rainbow",
  },
  {
    id: "tricorn-body-meets-arm",
    name: "Where the body meets an arm",
    fractal: "tricorn",
    centerX: -0.75,
    centerY: 0.1,
    zoom: 20,
    colorScheme: "fire",
  },
  {
    id: "tricorn-small-tricorn",
    name: "A small Tricorn",
    fractal: "tricorn",
    centerX: -1.768,
    centerY: 0,
    zoom: 60,
    colorScheme: "classic",
  },
  {
    id: "tricorn-upper-arm-bulb",
    name: "A bulb on the upper arm",
    fractal: "tricorn",
    centerX: 0.7,
    centerY: 1.2,
    zoom: 60,
    colorScheme: "ocean",
  },
  {
    id: "tricorn-star",
    name: "A star on an antenna",
    fractal: "tricorn",
    centerX: 0.872,
    centerY: 1.51,
    zoom: 50,
    colorScheme: "classic",
  },
];

// Twelve places over the three powers, four each, picked from contact sheets
// drawn headless at low resolution in several schemes. Each carries its power
// as its variant ("3", "4" or "5"), the way a Julia place carries its constant.
// The sets are the Mandelbrot set with more lobes (two for z^3, three for z^4,
// four for z^5), and each repeats its own bulbs and small copies of itself, so
// the places below are the whole set of each power and three views of what
// grows on its edge. The whole-set place of each power is at the Multibrot
// default view (`defaultViewFor`), which is the frame the chips go to.
const MULTIBROT_PLACES: readonly Place[] = [
  {
    id: "multibrot-3-whole",
    name: "z^3: the whole set",
    fractal: "multibrot",
    variant: "3",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "multibrot-3-heart",
    name: "z^3: a heart on the top lobe",
    fractal: "multibrot",
    variant: "3",
    centerX: 0,
    centerY: 1.1,
    zoom: 6,
    colorScheme: "rainbow",
  },
  {
    id: "multibrot-3-small-copy",
    name: "z^3: a small copy of the set",
    fractal: "multibrot",
    variant: "3",
    centerX: 0.267,
    centerY: 1.26,
    zoom: 50,
    colorScheme: "classic",
  },
  {
    id: "multibrot-3-cusp",
    name: "z^3: a cusp between two bulbs",
    fractal: "multibrot",
    variant: "3",
    centerX: 0.4,
    centerY: 0.85,
    zoom: 5,
    colorScheme: "classic",
  },
  {
    id: "multibrot-4-whole",
    name: "z^4: the whole set",
    fractal: "multibrot",
    variant: "4",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "multibrot-4-antenna",
    name: "z^4: a chain of copies on the antenna",
    fractal: "multibrot",
    variant: "4",
    centerX: -1.2,
    centerY: 0,
    zoom: 30,
    colorScheme: "classic",
  },
  {
    id: "multibrot-4-cleft",
    name: "z^4: the cleft between two lobes",
    fractal: "multibrot",
    variant: "4",
    centerX: 0.3,
    centerY: 0.9,
    zoom: 5,
    colorScheme: "ocean",
  },
  {
    id: "multibrot-4-junction",
    name: "z^4: where two lobes touch",
    fractal: "multibrot",
    variant: "4",
    centerX: 0.45,
    centerY: 0.65,
    zoom: 8,
    colorScheme: "rainbow",
  },
  {
    id: "multibrot-5-whole",
    name: "z^5: the whole set",
    fractal: "multibrot",
    variant: "5",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "multibrot-5-notch",
    name: "z^5: a bulb in the notch between lobes",
    fractal: "multibrot",
    variant: "5",
    centerX: 0.65,
    centerY: 0.65,
    zoom: 6,
    colorScheme: "classic",
  },
  {
    id: "multibrot-5-ringed-bulb",
    name: "z^5: a bulb ringed with smaller ones",
    fractal: "multibrot",
    variant: "5",
    centerX: 0.3,
    centerY: 0.8,
    zoom: 10,
    colorScheme: "classic",
  },
  {
    id: "multibrot-5-twin-bulbs",
    name: "z^5: twin bulbs on the edge",
    fractal: "multibrot",
    variant: "5",
    centerX: 0,
    centerY: 0.9,
    zoom: 5,
    colorScheme: "classic",
  },
];

// Nine places on the Newton fractal of z^3 - 1, from contact sheets drawn
// headless in all five schemes at 240x180 with whole counts (what a tile
// shows). Rainbow separates the three roots best, three hues with rings of
// shade inside each; fire and grayscale give three clear levels (red, orange,
// white; dark, mid, light); classic is busy over a wide view and works on the
// pinwheels and chains, where the colours repeat between roots; ocean is three
// blues and the weakest. Each place has the scheme it read best in, then
// re-measured at 64x48 for the largest share one colour holds (the numbers are
// in the Newton note of CLAUDE.md): a place that has a wide empty basin on one side
// (the bulb chain, the root at 1) names the scheme that leaves the least of it,
// since fire and grayscale put 56 to 67% of those two in one colour. The
// picture is three basins and the boundary where they all meet, so the places
// are the whole thing and the boundary's own features, and a place needs two
// basins in the frame: a deep view inside one basin is a flat field, however
// well chosen. Several numbers are exact, not picked by eye. The map sends z = 0
// to infinity and its three preimages -2^(-1/3) = -0.793701 and 0.396850 +-
// 0.687401i are the points where the boundary's six-sector junction reappears
// (z^3 = -1/2 is where 2z + 1/z^2 vanishes), so the origin and each of those are
// the same pinwheel at any zoom. A centre of -0.5 is a preimage of the root 1
// (2(-0.5) + 1/0.25 = 3, divided by 3), which is the dark dot a basin shows at
// each such point. The whole-basins place is at the Newton default view.
const NEWTON_PLACES: readonly Place[] = [
  {
    id: "newton-whole",
    name: "The three basins",
    fractal: "newton",
    centerX: 0,
    centerY: 0,
    zoom: 1,
    colorScheme: "rainbow",
  },
  {
    id: "newton-junction",
    name: "Where all three basins meet",
    fractal: "newton",
    centerX: 0,
    centerY: 0,
    zoom: 8,
    colorScheme: "rainbow",
  },
  {
    id: "newton-junction-1000x",
    name: "The same junction at 1000x",
    fractal: "newton",
    centerX: 0,
    centerY: 0,
    zoom: 1000,
    colorScheme: "classic",
  },
  {
    id: "newton-junction-copy",
    name: "A second junction at -0.7937",
    fractal: "newton",
    centerX: -0.793701,
    centerY: 0,
    zoom: 150,
    colorScheme: "fire",
  },
  {
    id: "newton-lens",
    name: "A basin pinched into a lens",
    fractal: "newton",
    centerX: -0.5,
    centerY: 0,
    zoom: 4,
    colorScheme: "grayscale",
  },
  {
    id: "newton-two-junctions",
    name: "Two junctions on one boundary",
    fractal: "newton",
    centerX: 0.2,
    centerY: 0.55,
    zoom: 12,
    colorScheme: "classic",
  },
  {
    id: "newton-junction-chain",
    name: "A chain of junctions",
    fractal: "newton",
    centerX: 0.4,
    centerY: 0.3,
    zoom: 10,
    colorScheme: "ocean",
  },
  {
    id: "newton-bulb-chain",
    name: "A chain of bulbs on a straight boundary",
    fractal: "newton",
    centerX: 0.1208,
    centerY: 0.525,
    zoom: 100,
    colorScheme: "classic",
  },
  {
    id: "newton-root-and-boundary",
    name: "The root at 1 beside the boundary",
    fractal: "newton",
    centerX: 0.7,
    centerY: 0,
    zoom: 3,
    colorScheme: "rainbow",
  },
];

// Drawn headless on contact sheets at 400x300 in several schemes, the readable
// ones kept and their centre and zoom written in as the render had them. The
// set is the Mandelbrot set's on the real axis (the fold changes nothing while
// the imaginary part is 0) and has its mirror symmetry, so the interesting
// frames sit off the axis: the body's flat left edge (the fold line), the
// arcs under it, and the dust of small copies to its left.
const CELTIC_PLACES: readonly Place[] = [
  {
    id: "celtic-whole",
    name: "The whole Celtic set",
    fractal: "celtic",
    centerX: -0.8,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "celtic-nose",
    name: "Two bulbs on the nose",
    fractal: "celtic",
    centerX: 0.15,
    centerY: 0.15,
    zoom: 4,
    colorScheme: "classic",
  },
  {
    id: "celtic-lace",
    name: "Lace and small copies",
    fractal: "celtic",
    centerX: -1.3,
    centerY: 0.7,
    zoom: 4,
    colorScheme: "classic",
  },
  {
    id: "celtic-arrowhead",
    name: "An arrowhead among the lace",
    fractal: "celtic",
    centerX: -1.2,
    centerY: 0.05,
    zoom: 6,
    colorScheme: "classic",
  },
  {
    id: "celtic-fold-line",
    name: "The fold line and its arcs",
    fractal: "celtic",
    centerX: -0.75,
    centerY: 0.6,
    zoom: 3,
    colorScheme: "classic",
  },
  {
    id: "celtic-branching-dust",
    name: "Branching dust",
    fractal: "celtic",
    centerX: -1.75,
    centerY: 0.15,
    zoom: 10,
    colorScheme: "classic",
  },
];

// Drawn through the app's own pipeline in the five schemes at 480x360, and
// then measured the way a tile is drawn (64x48, whole counts) with
// `nearUniformShare`: every one of these is under 60% one colour and shows
// something at a thumbnail's size. The set is mirrored about the real axis
// (conjugating c conjugates the orbit), so only the upper half's places are
// named -- the lower half is the same pictures the other way up -- and the
// real axis itself is left alone, since the fold has nothing to do there and
// counts the Mandelbrot set.
const PERPENDICULAR_SHIP_PLACES: readonly Place[] = [
  {
    id: "perpendicular-ship-whole",
    name: "The whole Perpendicular Ship",
    fractal: "perpendicular-ship",
    centerX: -0.55,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "perpendicular-ship-bow",
    name: "The bow and its neck",
    fractal: "perpendicular-ship",
    centerX: -1.05,
    centerY: 0,
    zoom: 6,
    colorScheme: "classic",
  },
  {
    id: "perpendicular-ship-masts",
    name: "Masts along the deck",
    fractal: "perpendicular-ship",
    centerX: -0.2,
    centerY: 0.85,
    zoom: 6,
    colorScheme: "rainbow",
  },
  {
    id: "perpendicular-ship-tendrils",
    name: "Tendrils off the hull",
    fractal: "perpendicular-ship",
    centerX: -0.36,
    centerY: 0.85,
    zoom: 12,
    colorScheme: "classic",
  },
  {
    id: "perpendicular-ship-shredded-sail",
    name: "A shredded sail",
    fractal: "perpendicular-ship",
    centerX: 0.44,
    centerY: 0.55,
    zoom: 40,
    colorScheme: "rainbow",
  },
];

const MAGNET_PLACES: readonly Place[] = [
  {
    id: "magnet-1-whole",
    name: "The whole Magnet set (Type I)",
    fractal: "magnet",
    variant: "1",
    centerX: 1.3,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "magnet-1-curtain",
    name: "The curtain of disks",
    fractal: "magnet",
    variant: "1",
    centerX: 1.3,
    centerY: 0,
    zoom: 4,
    colorScheme: "classic",
  },
  {
    id: "magnet-1-drift",
    name: "A drift of disks",
    fractal: "magnet",
    variant: "1",
    centerX: 1.6,
    centerY: 0,
    zoom: 8,
    colorScheme: "classic",
  },
  {
    id: "magnet-1-dust",
    name: "Dust over the waist",
    fractal: "magnet",
    variant: "1",
    centerX: 0,
    centerY: 1.2,
    zoom: 16,
    colorScheme: "classic",
  },
  {
    id: "magnet-2-whole",
    name: "The whole Magnet set (Type II)",
    fractal: "magnet",
    variant: "2",
    centerX: 1.3,
    centerY: 0,
    zoom: 1,
    colorScheme: "classic",
  },
  {
    id: "magnet-2-lobe",
    name: "The bright lobe",
    fractal: "magnet",
    variant: "2",
    centerX: 1.6,
    centerY: 1.05,
    zoom: 8,
    colorScheme: "classic",
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
  ...TRICORN_PLACES,
  ...MULTIBROT_PLACES,
  ...NEWTON_PLACES,
  ...CELTIC_PLACES,
  ...PERPENDICULAR_SHIP_PLACES,
  ...MAGNET_PLACES,
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
 * The one place each fractal's switcher button lands on, by catalogue id.
 *
 * Picked from a contact sheet of the whole catalogue, every place drawn at
 * 200x150 in its own scheme: the place a visitor should see after one click on
 * a fractal's name, so it has to read as that fractal at a glance and be full
 * of detail. A fractal's "whole" place is left out on purpose, since that is
 * the view the page opens on and a switch should go somewhere.
 *
 * - Mandelbrot: Seahorse Valley. The set's best-known place, deep blue
 *   filigree with the seahorse spirals filling the frame. Elephant Valley and
 *   the top bulb are washes of one colour and the seahorse tail is too dense
 *   to read.
 * - Julia: Classic spirals. The Classic constant at zoom 3 shows two spirals
 *   and the set's lobes in full colour; the "whole set" views are a small shape
 *   in a field of one colour, which is what the constant chips are for.
 * - Burning Ship: the Armada. Masts standing on the hull's silhouette, the one
 *   view that reads as a ship; the closer views are textures.
 * - Tricorn: the whole Tricorn (fr-hbe). Along the left arm, the pick of
 *   fr-6oi, is zoomed in on the real axis, where the Tricorn is exactly the
 *   Mandelbrot set (conjugating a real z changes nothing): at 800x600 it is a
 *   needle with bulbs on a red field, the same picture as
 *   `mandelbrot-needle-bulbs`. The star on an antenna (fr-gxr's pick) is off
 *   the axis, but at 800x600 in classic it is a flat green field with one
 *   black arm: the picture fr-6oi was filed against. The whole set sits on
 *   the axis too, and that is fine: the axis only shows the Mandelbrot set
 *   once the view is zoomed in until the axis fills it, and at whole-set zoom
 *   the three-fold form is the picture. Drawn at 800x600 beside the Mandelbrot
 *   set's whole view, the whole set in classic, rainbow, fire and ocean, and
 *   the same frame at zooms 1.1, 1.25, 1.5, 2 and 2.5: classic reads best, a
 *   black three-armed body with a green-to-magenta band round its edge and the
 *   arm tips running off the frame; rainbow is a flat red field and fire and
 *   ocean are dark fields with a thin edge. Zooming in only loses the arms
 *   (1.1 already clips more of the upper and lower tips; 1.5 and up is a black
 *   wedge between two green fields). The place is also the view the Fractal
 *   select opens the Tricorn on, so nothing but a switch from another fractal
 *   shows it, and the test that a featured place is not the opening view
 *   exempts it (`FEATURED_IS_OPENING_VIEW`). The guard keeps a fractal whose
 *   real axis is the Mandelbrot set's (`REAL_AXIS_MATCHES_MANDELBROT`) from
 *   featuring a place zoomed in past `REAL_AXIS_GUARD_MIN_ZOOM` on the axis,
 *   and `places.test.ts` names the place and its zoom when one does.
 * - Multibrot: the small copy of the z^3 set. A two-lobed set, one disc above
 *   the other, riding on the big set's edge among filaments in full colour; it
 *   reads as the Multibrot rather than the Mandelbrot set, which the
 *   one-lobed bulbs of the other places do not, and it lands on power 3, the
 *   chip row's first. First picked in the rainbow scheme from contact sheets
 *   drawn with smooth counts, but the guard (and a tile) draw whole counts, and
 *   there rainbow is a red field, 74% one colour; classic is 36%, so the place
 *   names classic. The Multibrot's other places were measured the same way and
 *   given the scheme with the least flat field of their own (the whole sets and
 *   the notch 46-57% in classic, the rest 31-40% except the junction, 73%: two
 *   big black bulbs, which is not the featured place).
 * - Newton: where all three basins meet. The origin drawn at zoom 8 is a
 *   pinwheel of six sectors in the three colour families of the roots with
 *   bulbs strung along the boundaries, which reads as nothing but this
 *   fractal and has no flat field (22% one colour in rainbow, 32 to 35% in
 *   fire, grayscale and ocean, 8% in classic). The whole-basins place is the
 *   opening view, so a switch should not repeat it; the rest of the Newton
 *   places were compared on the same sheet and are a basin pinched into a lens
 *   (a dark dot at its centre), two chains of junctions, a chain of bulbs
 *   and the root at 1 beside the boundary, each a variation on what the
 *   pinwheel already shows.
 * - Celtic: the whole set, which is also the view the Fractal select opens it
 *   on (`FEATURED_IS_OPENING_VIEW` in the test). The set's real axis is the
 *   Mandelbrot set's, so a deep view on the axis would repeat that button, and
 *   the whole set is the picture that says what is different: a flat-edged
 *   black body with a pointed nose, arcs of colour under the fold line and a
 *   dust of small copies to its left. 25% one colour in classic at 64x48.
 * - Perpendicular Ship: the whole ship, which is also the view the Fractal
 *   select opens it on (`FEATURED_IS_OPENING_VIEW` in the test). One click on
 *   the button has to say what this fractal is, and what it is is the
 *   silhouette: a black hull with a bowed sail, a small bow lobe on a thin neck
 *   and a spike running out to the left, with rows of masts along the deck.
 *   Drawn at 400x300 in all five schemes, classic reads best (16% one colour
 *   at 64x48; rainbow is 16% too, fire and ocean are dark fields), and the
 *   deeper places are all lace and leave the shape out.
 * - Magnet: a drifted field of disks, NOT a whole-set view, and the deviation
 *   is deliberate. The Magnet set is the c whose orbit settles on the fixed
 *   point z = 1, and that is nearly the whole plane: at the frame the fractal
 *   opens on, which is the widest view there is, the picture is 70% one colour,
 *   and no frame that reads as the whole set is under 65%, which the featured
 *   guard below forbids. So the button leads with the structure the picture is
 *   made of instead -- the drift where the escaping island meets the settled
 *   black. Measured at the count Auto draws it at, it is 39% one colour at
 *   64x48 and 41% of a 96x72 grid inside the settled set, and that grid holds
 *   82 different counts, so it is a picture rather than a flat field.
 *
 * The others were redrawn and kept: each is at most 21% one colour (the
 * guard in `places.test.ts` holds every one under 60%).
 */
export const FEATURED_PLACE_IDS: Readonly<Record<string, string>> = {
  mandelbrot: "mandelbrot-seahorse-valley",
  julia: "julia-classic-spirals",
  "burning-ship": "burning-ship-armada",
  tricorn: "tricorn-whole",
  multibrot: "multibrot-3-small-copy",
  newton: "newton-junction",
  celtic: "celtic-whole",
  "perpendicular-ship": "perpendicular-ship-whole",
  magnet: "magnet-1-drift",
};

/**
 * The fractals whose real axis is the Mandelbrot set's own.
 *
 * Conjugating a real z changes nothing, so the Tricorn's orbit of a real c is
 * the Mandelbrot orbit and a view zoomed in on the axis shows what the
 * Mandelbrot button already shows. The Celtic set and the Perpendicular Ship
 * fold a part of z by an absolute value (the real part of the square, and the
 * size of x in the imaginary step), and on the axis there is nothing negative
 * for either fold to flip, so their real orbits are the Mandelbrot set's as
 * well. The Multibrot's powers of 3 and up differ on the axis, so it is not
 * listed. `places.test.ts` keeps the featured place of every fractal listed
 * here from being zoomed in past `REAL_AXIS_GUARD_MIN_ZOOM` on the axis.
 */
export const REAL_AXIS_MATCHES_MANDELBROT: Readonly<Record<string, boolean>> = {
  tricorn: true,
  celtic: true,
  "perpendicular-ship": true,
};

/**
 * The zoom above which a view centred on the real axis is the axis's picture.
 *
 * Out at the whole set the three-fold form is what shows, however the view is
 * centred; only once the view is zoomed in until the axis fills it is it a
 * needle that looks like the Mandelbrot set's.
 */
export const REAL_AXIS_GUARD_MIN_ZOOM = 4;

/**
 * The place a fractal's switcher button goes to.
 *
 * @param fractal - A `FRACTAL_TYPES` id
 * @returns That fractal's featured place; the Mandelbrot set's for an id the
 *   catalogue has none for, as every other lookup here falls back
 */
export function featuredPlace(fractal: string): Place {
  const id = FEATURED_PLACE_IDS[fractal] ?? FEATURED_PLACE_IDS.mandelbrot;
  const found = PLACES.find((place) => place.id === id);
  if (found === undefined) throw new Error(`no featured place ${id}`);

  return found;
}

/**
 * Where a variant chip goes: the whole of that variant's set.
 *
 * A Julia set is symmetric about the origin whatever its constant, so its whole
 * set is the Julia default view, and a place counts as one when it is that view
 * of that constant. Constants are compared as points, so a custom spelling of a
 * named constant finds the same place. A Multibrot's whole set is likewise the
 * Multibrot default view, one frame for the three powers.
 *
 * @param variant - A named Julia constant or a `custom:<re>,<im>` name, or a Multibrot power
 * @param fractal - The fractal the chip belongs to; Julia unless said
 * @returns The catalogue's whole-set place for it, or null when it has none
 */
export function wholeSetPlaceFor(
  variant: string,
  fractal: string = "julia",
): Place | null {
  const whole = defaultViewFor(fractal);

  return (
    PLACES.find(
      (place) =>
        place.fractal === fractal &&
        sameVariant(fractal, place.variant, variant) &&
        place.centerX === whole.centerX &&
        place.centerY === whole.centerY &&
        place.zoom === whole.zoom,
    ) ?? null
  );
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

/**
 * Whether two variants of one fractal are the same picture: Julia constants as
 * points, any other variant (a Multibrot power) as text.
 */
function sameVariant(
  fractal: string,
  first: string | undefined,
  second: string | undefined,
): boolean {
  return fractal === "julia"
    ? sameConstant(first, second)
    : first !== undefined && first === second;
}

/** Whether a place is the view itself: same picture, within the tolerance. */
function isCurrentView(view: PlaceView, place: Place, span: number): boolean {
  if (fractalVariants(place.fractal) !== null) {
    if (!sameVariant(place.fractal, place.variant, view.variant)) return false;
  }

  return (
    Math.abs(place.centerX - view.centerX) <= SAME_VIEW_TOLERANCE * span &&
    Math.abs(place.centerY - view.centerY) <= SAME_VIEW_TOLERANCE * span &&
    Math.abs(Math.log(place.zoom / view.zoom)) <=
      Math.log1p(SAME_VIEW_TOLERANCE)
  );
}

/**
 * How far a place's centre is from the view, in the view's own spans, lower
 * being nearer. "Near" therefore means near on the screen the user is looking
 * at, whatever the zoom.
 */
function centreDistanceFrom(
  view: PlaceView,
  place: Place,
  span: number,
): number {
  return (
    Math.hypot(place.centerX - view.centerX, place.centerY - view.centerY) /
    span
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
  const octaves = Math.log2(place.zoom / view.zoom);

  return (
    centreDistanceFrom(view, place, span) +
    Math.abs(octaves - PREFERRED_DEPTH_OCTAVES)
  );
}

/**
 * The catalogue place a view is nearest to, or null for a view that has none.
 *
 * The one place that stands for a view when a picture has to be picked without
 * a visitor to ask. The view's own fractal is the first cut, and for a fractal
 * whose variants change the picture (a Julia constant, a Multibrot power) the
 * places that share the view's variant are preferred over the rest, so a
 * custom Julia constant still previews as some Julia set rather than as another
 * constant's picture, which is a different fractal's shape.
 *
 * Within those, a view that *is* a place — the same picture within
 * {@link placeAtView}'s tolerance, which is 1% of the view's span in the centre
 * and 1% in zoom — names that place, and any other view names the place whose
 * centre is nearest on the screen the link was made at
 * ({@link centreDistanceFrom}). The zoom is otherwise not part of the measure:
 * this answers "which of our pictures is this one", and `distanceFrom`'s depth
 * term answers "which place is a good next step", which sends the whole-set
 * view to a place it is not on.
 *
 * @param view - Where the explorer is
 * @param places - The catalogue to look in
 * @returns The nearest such place; null when the view cannot be measured, when
 *   its fractal has no place in the catalogue, or when the catalogue is empty
 */
export function nearestPlace(
  view: PlaceView,
  places: readonly Place[],
): Place | null {
  if (
    !Number.isFinite(view.centerX) ||
    !Number.isFinite(view.centerY) ||
    !Number.isFinite(view.zoom) ||
    view.zoom <= 0
  ) {
    return null;
  }

  const ofFractal = places.filter((place) => place.fractal === view.fractal);
  if (ofFractal.length === 0) return null;

  const sharingVariant =
    fractalVariants(view.fractal) === null
      ? ofFractal
      : ofFractal.filter((place) =>
          sameVariant(view.fractal, place.variant, view.variant),
        );
  const pool = sharingVariant.length > 0 ? sharingVariant : ofFractal;

  // A view on a place is that place. Two places can share a centre and differ
  // in zoom (the whole Classic Julia set and its spirals), and this is what
  // tells them apart; the search below could not, since the centre is equal.
  const on = placeAtView(view, pool);
  if (on !== null) return on;

  const span = BASE_WIDTH / view.zoom;

  // A tie is broken by id, so the same view always names the same place.
  return pool.reduce((best, place) => {
    const distance = centreDistanceFrom(view, place, span);
    const bestDistance = centreDistanceFrom(view, best, span);

    if (distance < bestDistance) return place;
    if (distance > bestDistance) return best;
    return place.id < best.id ? place : best;
  });
}

/**
 * The catalogue place a view is on, if any.
 *
 * A view is on a place when it is the same picture within 1% of the view's
 * span in the centre and 1% in zoom (the rule `suggest` uses to leave the
 * place you are on out of its list), so a view panned a hair off a place still
 * names it. A view that cannot be measured is on none.
 *
 * @param view - Where the explorer is
 * @param places - The catalogue to look in
 * @returns The first place that is the view, in catalogue order, or null
 */
export function placeAtView(
  view: PlaceView,
  places: readonly Place[],
): Place | null {
  if (
    !Number.isFinite(view.centerX) ||
    !Number.isFinite(view.centerY) ||
    !Number.isFinite(view.zoom) ||
    view.zoom <= 0
  ) {
    return null;
  }

  const span = BASE_WIDTH / view.zoom;

  return (
    places.find(
      (place) =>
        place.fractal === view.fractal && isCurrentView(view, place, span),
    ) ?? null
  );
}

/**
 * What is worth looking at near a view.
 *
 * Pure and deterministic: the same view and catalogue always give the same
 * list. Only places of the view's own fractal are considered, and never the
 * place that is the view — the same fractal and constant with the centre
 * within 1% of the view's span and the zoom within 1%. The rest are ranked by
 * {@link distanceFrom}, nearest first, and a tie is broken by id so the order
 * does not change between calls. For a view of a fractal with a variant the
 * places that share its variant come first (a Julia constant, a Multibrot
 * power), each group ranked on its own: another constant's picture is never a
 * step from this one, however near its numbers are.
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
  const takesVariant = fractalVariants(view.fractal) !== null;

  return places
    .filter((place) => place.fractal === view.fractal)
    .filter((place) => !isCurrentView(view, place, span))
    .map((place) => ({
      place,
      // 0 for a place that shares the view's variant (a Julia constant, a
      // Multibrot power), 1 for the others; a fractal with no variant has one
      // group.
      group:
        takesVariant && !sameVariant(view.fractal, place.variant, view.variant)
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
