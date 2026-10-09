import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ColorScheme } from "../../types/fractal";
import {
  BASE_HEIGHT,
  BASE_WIDTH,
  MAX_ZOOM,
  MIN_ZOOM,
  mandelbrotKind,
} from "../mandelbrot";
import {
  BUILTIN_PRESETS,
  calculateCenter,
  calculateZoomLevel,
  deleteCustomPreset,
  formatZoom,
  getAllPresets,
  getCustomPresets,
  getCustomPresetsSnapshot,
  getPresetById,
  getServerCustomPresetsSnapshot,
  presetFractal,
  presetFractalFields,
  presetJuliaConstant,
  presetsForFractal,
  saveCustomPreset,
  subscribeToCustomPresets,
  type FractalPreset,
} from "../presets";
import { FRACTAL_TYPES } from "../fractalTypes";
import { JULIA_CONSTANTS } from "../julia";

const STORAGE_KEY = "fractal-custom-presets";

const SCHEMES: ColorScheme[] = [
  "classic",
  "fire",
  "ocean",
  "rainbow",
  "grayscale",
];

const CUSTOM_PRESET: FractalPreset = {
  id: "custom-1",
  name: "My View",
  description: "Saved by hand",
  bounds: {
    minReal: -0.8,
    maxReal: -0.7,
    minImaginary: 0.05,
    maxImaginary: 0.15,
  },
  maxIterations: 500,
  colorScheme: "ocean",
  canvasWidth: 800,
  canvasHeight: 600,
};

/** The same view, saved while the Julia "Dendrite" was selected. */
const JULIA_PRESET: FractalPreset = {
  ...CUSTOM_PRESET,
  id: "custom-julia",
  name: "Dendrite View",
  fractal: "julia",
  juliaConstant: "Dendrite",
};

/** A view saved for the Burning Ship, which has no constant of its own. */
const SHIP_PRESET: FractalPreset = {
  ...CUSTOM_PRESET,
  id: "custom-ship",
  name: "Ship View",
  fractal: "burning-ship",
};

/** A view saved for a fractal a later build knows and this one does not. */
const UNKNOWN_FRACTAL_PRESET: FractalPreset & { palette: string } = {
  ...CUSTOM_PRESET,
  id: "custom-unknown",
  name: "Some Other Picture",
  fractal: "koch-snowflake",
  // A field this build has never heard of, which a read must carry through.
  palette: "solarized",
};

/**
 * What storage held before the format had a fractal field: the shape today's
 * entries still have, written without `fractal` and `juliaConstant`.
 */
const LEGACY_PRESETS_JSON = JSON.stringify([
  {
    id: "custom-legacy",
    name: "Old View",
    description: "Saved before presets knew about fractals",
    bounds: {
      minReal: -0.8,
      maxReal: -0.7,
      minImaginary: 0.05,
      maxImaginary: 0.15,
    },
    maxIterations: 500,
    colorScheme: "ocean",
    canvasWidth: 800,
    canvasHeight: 600,
  },
]);

/** In-memory stand-in for the browser's localStorage, which Node lacks. */
function createStorageStub() {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const GRID_WIDTH = 64;
const GRID_HEIGHT = 48;

/**
 * What a preset's own frame holds, measured with the app's Mandelbrot orbit on
 * a coarse grid of the preset's bounds at the preset's own iteration cap:
 *
 * - `inside`: share of points the orbit never escaped. The set's interior,
 *   which the renderer paints as one flat colour.
 * - `early`: share of points that escaped within the first quarter of the cap.
 *   An orbit that dies at once says little about where the point sits.
 * - `distinct`: how many different iteration counts the grid produced, which is
 *   the detail a colour scheme has to work with.
 *
 * A frame the set fills is a nearly blank button, and one with a handful of
 * counts is banded rather than detailed.
 */
function measurePreset(preset: FractalPreset): {
  inside: number;
  early: number;
  distinct: number;
} {
  const counts: number[] = [];

  for (let row = 0; row < GRID_HEIGHT; row++) {
    for (let column = 0; column < GRID_WIDTH; column++) {
      // Cell centres, so the grid samples the frame rather than its corners.
      const point = {
        real:
          preset.bounds.minReal +
          ((column + 0.5) / GRID_WIDTH) *
            (preset.bounds.maxReal - preset.bounds.minReal),
        imaginary:
          preset.bounds.minImaginary +
          ((row + 0.5) / GRID_HEIGHT) *
            (preset.bounds.maxImaginary - preset.bounds.minImaginary),
      };

      counts.push(
        mandelbrotKind.iterations(point, preset.maxIterations, false),
      );
    }
  }

  return {
    inside:
      counts.filter((count) => count >= preset.maxIterations).length /
      counts.length,
    early:
      counts.filter((count) => count < preset.maxIterations / 4).length /
      counts.length,
    distinct: new Set(counts).size,
  };
}

/**
 * The magnified built-in presets with their measurements, taken once: the grid
 * is 3072 orbits per preset and every guard below reads the same numbers.
 *
 * Magnified is where a frame can be wrong. At zoom 1 the set leaves the frame
 * on its own, so the overview preset is not one of these.
 */
const MAGNIFIED_PRESETS = BUILTIN_PRESETS.filter(
  (preset) => calculateZoomLevel(preset.bounds) >= 100,
).map((preset) => ({ preset, measurement: measurePreset(preset) }));

describe("built-in preset framing", () => {
  it("has magnified presets to measure, so the guards below cannot pass vacuously", () => {
    expect(MAGNIFIED_PRESETS.length).toBeGreaterThan(0);
  });

  it("frames no magnified preset on the set's interior", () => {
    for (const { preset, measurement } of MAGNIFIED_PRESETS) {
      expect(measurement.inside, preset.id).toBeLessThanOrEqual(0.6);
    }
  });

  it("gives every magnified preset detail to colour", () => {
    for (const { preset, measurement } of MAGNIFIED_PRESETS) {
      expect(measurement.distinct, preset.id).toBeGreaterThanOrEqual(60);
    }
  });

  it("lets the seahorse spiral have its valley", () => {
    // The frame this preset replaced was mostly escape-early: two thirds of the
    // grid escaped inside the first quarter of the cap, the left half was one
    // flat colour, and the seahorses sat against the right edge.
    const seahorse = getPresetById("seahorse-valley")!;
    expect(measurePreset(seahorse).early).toBeLessThanOrEqual(0.5);
  });

  it("keeps the reframed presets at the base view's shape", () => {
    // The canvas is 4:3 and the renderer maps each axis of the bounds onto its
    // own side of it, so a frame of any other shape is stretched to fill.
    for (const id of ["elephant-valley", "seahorse-valley"]) {
      const { bounds } = getPresetById(id)!;
      const width = bounds.maxReal - bounds.minReal;
      const height = bounds.maxImaginary - bounds.minImaginary;
      expect(width / height, id).toBeCloseTo(BASE_WIDTH / BASE_HEIGHT, 6);
    }
  });
});

describe("BUILTIN_PRESETS", () => {
  it("ships six presets with unique ids", () => {
    expect(BUILTIN_PRESETS).toHaveLength(6);
    const ids = BUILTIN_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every preset renderable", () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(preset.bounds.minReal).toBeLessThan(preset.bounds.maxReal);
      expect(preset.bounds.minImaginary).toBeLessThan(preset.bounds.maxImaginary);
      expect(preset.maxIterations).toBeGreaterThan(0);
      expect(preset.canvasWidth).toBeGreaterThan(0);
      expect(preset.canvasHeight).toBeGreaterThan(0);
      expect(SCHEMES).toContain(preset.colorScheme);
      expect(preset.name).not.toBe("");
      expect(preset.description).not.toBe("");
    }
  });

});

describe("getPresetById", () => {
  it("finds a built-in preset by id", () => {
    expect(getPresetById("seahorse-valley")?.name).toBe("Seahorse Valley");
  });

  it("returns undefined for an unknown id", () => {
    expect(getPresetById("no-such-preset")).toBeUndefined();
  });
});

describe("calculateZoomLevel", () => {
  it("counts how many times the 4-unit-wide base view was divided", () => {
    expect(
      calculateZoomLevel({
        minReal: -2,
        maxReal: 2,
        minImaginary: -1,
        maxImaginary: 1,
      }),
    ).toBe(1);
  });

  it("matches the depth each built-in preset was framed at", () => {
    expect(calculateZoomLevel(getPresetById("overview")!.bounds)).toBeCloseTo(
      1,
      9,
    );
    expect(
      calculateZoomLevel(getPresetById("seahorse-valley")!.bounds),
    ).toBeCloseTo(400, 9);
    expect(calculateZoomLevel(getPresetById("lightning")!.bounds)).toBeCloseTo(
      2000,
      9,
    );
  });

  it("measures every built-in preset against the one base view", () => {
    // The same width ratio the wheel and drag code work in, so a readout and
    // the view it describes cannot end up on two different scales.
    for (const preset of BUILTIN_PRESETS) {
      const width = preset.bounds.maxReal - preset.bounds.minReal;
      expect(calculateZoomLevel(preset.bounds)).toBeCloseTo(
        BASE_WIDTH / width,
        9,
      );
    }
  });

  it("frames every built-in preset at a zoom the controls accept", () => {
    // The page clamps a gesture's zoom into the range its controls offer. A
    // preset framed outside that range is one whose view a wheel notch can
    // no longer move, because the clamp undoes the step.
    for (const preset of BUILTIN_PRESETS) {
      const zoom = calculateZoomLevel(preset.bounds);
      expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });
});

describe("formatZoom", () => {
  it("shows the notch that moved the view", () => {
    expect(formatZoom(1)).toBe("1");
    expect(formatZoom(1.1)).toBe("1.1");
    expect(formatZoom(1.21)).toBe("1.21");
  });

  it("keeps the float error of a view's bounds out of the readout", () => {
    // 4 / 0.002 is 2000 with a last-place error in the divide; the readout is
    // where the rounding happens, not in the zoom it is given.
    expect(
      formatZoom(calculateZoomLevel(getPresetById("lightning")!.bounds)),
    ).toBe("2.0K");
    expect(
      formatZoom(calculateZoomLevel(getPresetById("seahorse-valley")!.bounds)),
    ).toBe("400");
  });
});

describe("calculateCenter", () => {
  it("averages the bounds on both axes", () => {
    expect(
      calculateCenter({
        minReal: -2.5,
        maxReal: 1.5,
        minImaginary: -1.5,
        maxImaginary: 1.5,
      }),
    ).toEqual({ x: -0.5, y: 0 });
  });
});

describe("the fractal a saved view belongs to", () => {
  it("reads an entry with no fractal field as a Mandelbrot view", () => {
    expect(presetFractal(CUSTOM_PRESET)).toBe("mandelbrot");
  });

  it("names each fractal the picker offers", () => {
    for (const type of FRACTAL_TYPES) {
      expect(presetFractal({ ...CUSTOM_PRESET, fractal: type.id })).toBe(
        type.id,
      );
    }
  });

  it("answers null for a fractal id this build does not know", () => {
    // Null rather than the Mandelbrot fallback the kind resolver gives: this
    // view cannot be drawn or listed here, and it must not be shown as some
    // other fractal's picture either.
    expect(
      presetFractal({ ...CUSTOM_PRESET, fractal: "koch-snowflake" }),
    ).toBeNull();
  });

  it("lists one fractal's views and no others", () => {
    const views = [
      CUSTOM_PRESET,
      JULIA_PRESET,
      SHIP_PRESET,
      UNKNOWN_FRACTAL_PRESET,
    ];

    expect(presetsForFractal(views, "mandelbrot")).toEqual([CUSTOM_PRESET]);
    expect(presetsForFractal(views, "julia")).toEqual([JULIA_PRESET]);
    expect(presetsForFractal(views, "burning-ship")).toEqual([SHIP_PRESET]);
  });

  it("lists a view for an unknown fractal under no fractal at all", () => {
    const views = [CUSTOM_PRESET, UNKNOWN_FRACTAL_PRESET];

    for (const type of FRACTAL_TYPES) {
      expect(presetsForFractal(views, type.id), type.id).not.toContain(
        UNKNOWN_FRACTAL_PRESET,
      );
    }
  });

  it("returns a fresh list a caller may build on", () => {
    const views = [CUSTOM_PRESET];

    const listed = presetsForFractal(views, "mandelbrot");
    listed.push(JULIA_PRESET);

    expect(presetsForFractal(views, "mandelbrot")).toEqual([CUSTOM_PRESET]);
  });
});

describe("the fractal fields a view is saved with", () => {
  it("names the fractal that is on the canvas", () => {
    for (const type of FRACTAL_TYPES) {
      expect(presetFractalFields(type.id, "Classic").fractal).toBe(type.id);
    }
  });

  it("writes the Julia constant only for a Julia view", () => {
    expect(presetFractalFields("julia", "Dendrite")).toEqual({
      fractal: "julia",
      juliaConstant: "Dendrite",
    });

    // No key at all, rather than a key holding undefined: a Mandelbrot or
    // Burning Ship entry keeps the stored shape it had before this field.
    expect(presetFractalFields("mandelbrot", "Dendrite")).toEqual({
      fractal: "mandelbrot",
    });
    expect(presetFractalFields("burning-ship", "Dendrite")).toEqual({
      fractal: "burning-ship",
    });
  });
});

describe("the Julia constant a saved view names", () => {
  it("names the constant the view was saved against", () => {
    expect(presetJuliaConstant(JULIA_PRESET)).toBe("Dendrite");
  });

  it("falls back to the first constant for a name this build does not know", () => {
    // The renderer draws the first constant for a name it cannot resolve, so
    // the picker has to sit on the same one or the select and the canvas
    // describe different pictures.
    expect(
      presetJuliaConstant({ ...JULIA_PRESET, juliaConstant: "Newton" }),
    ).toBe(JULIA_CONSTANTS[0].name);
  });

  it("falls back for a Julia view that names no constant at all", () => {
    expect(
      presetJuliaConstant({ ...JULIA_PRESET, juliaConstant: undefined }),
    ).toBe(JULIA_CONSTANTS[0].name);
  });

  it("only ever names a constant the picker offers", () => {
    const names = JULIA_CONSTANTS.map((constant) => constant.name);

    for (const named of ["Dendrite", "Newton", undefined]) {
      expect(names).toContain(
        presetJuliaConstant({ ...JULIA_PRESET, juliaConstant: named }),
      );
    }
  });
});

describe("reading views out of storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a legacy entry unchanged, as a Mandelbrot view", () => {
    localStorage.setItem(STORAGE_KEY, LEGACY_PRESETS_JSON);

    const [legacy] = getCustomPresets();
    expect(legacy).toEqual(JSON.parse(LEGACY_PRESETS_JSON)[0]);
    expect(presetFractal(legacy)).toBe("mandelbrot");
    expect(presetsForFractal(getCustomPresets(), "mandelbrot")).toEqual([
      legacy,
    ]);
  });

  it("round-trips a Julia view saved now back to its fractal and constant", () => {
    saveCustomPreset({
      ...CUSTOM_PRESET,
      ...presetFractalFields("julia", "Dendrite"),
    });

    const [stored] = getCustomPresets();

    expect(presetFractal(stored)).toBe("julia");
    expect(presetJuliaConstant(stored)).toBe("Dendrite");
    expect(presetsForFractal(getCustomPresets(), "julia")).toEqual([stored]);
    expect(presetsForFractal(getCustomPresets(), "mandelbrot")).toEqual([]);
  });

  it("carries unknown fields through a read and writes nothing back", () => {
    const stored = JSON.stringify([
      CUSTOM_PRESET,
      JULIA_PRESET,
      SHIP_PRESET,
      UNKNOWN_FRACTAL_PRESET,
    ]);
    localStorage.setItem(STORAGE_KEY, stored);

    const read = getCustomPresets();

    // The field this build never heard of survives, in the order it was
    // stored...
    expect(read).toEqual([
      CUSTOM_PRESET,
      JULIA_PRESET,
      SHIP_PRESET,
      UNKNOWN_FRACTAL_PRESET,
    ]);
    // ...and reading them back is not a write: the bytes are what they were.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored);
    expect(getCustomPresetsSnapshot()).toEqual(read);
  });

  it("lists stored views under their own fractal and the unknown one nowhere", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        CUSTOM_PRESET,
        JULIA_PRESET,
        SHIP_PRESET,
        UNKNOWN_FRACTAL_PRESET,
      ]),
    );

    const stored = getCustomPresets();
    expect(presetsForFractal(stored, "julia")).toEqual([JULIA_PRESET]);

    for (const type of FRACTAL_TYPES) {
      expect(
        presetsForFractal(stored, type.id).map((preset) => preset.id),
        type.id,
      ).not.toContain("custom-unknown");
    }

    // Never listed here, and never dropped either: a build that knows the
    // fractal still finds it.
    expect(getCustomPresets().map((preset) => preset.id)).toContain(
      "custom-unknown",
    );
  });

  it("drops only a stored value that could not be a preset", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([null, "nope", 7, CUSTOM_PRESET]),
    );

    expect(getCustomPresets()).toEqual([CUSTOM_PRESET]);
  });

  it("reads a stored value that is not a list as no views at all", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ presets: [CUSTOM_PRESET] }),
    );

    expect(getCustomPresets()).toEqual([]);
  });
});

describe("custom presets", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with no saved presets", () => {
    expect(getCustomPresets()).toEqual([]);
  });

  it("round-trips a saved preset through storage", () => {
    saveCustomPreset(CUSTOM_PRESET);
    expect(getCustomPresets()).toEqual([CUSTOM_PRESET]);
  });

  it("replaces a preset saved under an id that already exists", () => {
    saveCustomPreset(CUSTOM_PRESET);
    saveCustomPreset({ ...CUSTOM_PRESET, name: "Renamed" });

    const stored = getCustomPresets();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Renamed");
  });

  it("deletes only the requested preset", () => {
    saveCustomPreset(CUSTOM_PRESET);
    saveCustomPreset({ ...CUSTOM_PRESET, id: "custom-2" });

    deleteCustomPreset("custom-1");

    expect(getCustomPresets().map((preset) => preset.id)).toEqual(["custom-2"]);
  });

  it("lists the built-ins first, then the saved presets", () => {
    saveCustomPreset(CUSTOM_PRESET);

    const all = getAllPresets();
    expect(all).toHaveLength(BUILTIN_PRESETS.length + 1);
    expect(all.slice(0, BUILTIN_PRESETS.length)).toEqual(BUILTIN_PRESETS);
    expect(all[all.length - 1]).toEqual(CUSTOM_PRESET);
  });

  it("falls back to an empty list when stored data is not valid JSON", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(STORAGE_KEY, "{not json");

    expect(getCustomPresets()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("falls back to an empty list when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(getCustomPresets()).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

describe("custom preset store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the snapshot's identity until storage changes", () => {
    const empty = getCustomPresetsSnapshot();
    expect(getCustomPresetsSnapshot()).toBe(empty);

    saveCustomPreset(CUSTOM_PRESET);

    // useSyncExternalStore loops forever on a snapshot that changes identity
    // every call, so the same stored bytes must yield the same array.
    const saved = getCustomPresetsSnapshot();
    expect(saved).not.toBe(empty);
    expect(saved).toEqual([CUSTOM_PRESET]);
    expect(getCustomPresetsSnapshot()).toBe(saved);
  });

  it("tracks a save and a delete", () => {
    saveCustomPreset(CUSTOM_PRESET);
    expect(getCustomPresetsSnapshot()).toEqual([CUSTOM_PRESET]);

    deleteCustomPreset(CUSTOM_PRESET.id);
    expect(getCustomPresetsSnapshot()).toEqual([]);
  });

  it("hands the server an empty snapshot, since it has no storage", () => {
    saveCustomPreset(CUSTOM_PRESET);
    expect(getServerCustomPresetsSnapshot()).toEqual([]);
  });

  it("notifies subscribers on save and delete", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCustomPresets(listener);

    saveCustomPreset(CUSTOM_PRESET);
    expect(listener).toHaveBeenCalledTimes(1);

    deleteCustomPreset(CUSTOM_PRESET.id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("stops notifying a listener that unsubscribed", () => {
    const listener = vi.fn();
    subscribeToCustomPresets(listener)();

    saveCustomPreset(CUSTOM_PRESET);

    expect(listener).not.toHaveBeenCalled();
  });

  it("freezes its snapshots so a stray edit cannot poison every render", () => {
    expect(Object.isFrozen(getCustomPresetsSnapshot())).toBe(true);

    saveCustomPreset(CUSTOM_PRESET);

    expect(Object.isFrozen(getCustomPresetsSnapshot())).toBe(true);
    expect(getServerCustomPresetsSnapshot()).toEqual([]);
  });

  it("returns a fresh list to callers that build on it", () => {
    const listed = getCustomPresets();
    listed.push(CUSTOM_PRESET);

    expect(getCustomPresets()).toEqual([]);
    expect(getCustomPresetsSnapshot()).toEqual([]);
  });
});
