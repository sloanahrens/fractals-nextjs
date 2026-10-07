import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ColorScheme } from "../../types/fractal";
import {
  BUILTIN_PRESETS,
  calculateCenter,
  calculateZoomLevel,
  deleteCustomPreset,
  getAllPresets,
  getCustomPresets,
  getCustomPresetsSnapshot,
  getPresetById,
  getServerCustomPresetsSnapshot,
  saveCustomPreset,
  subscribeToCustomPresets,
  type FractalPreset,
} from "../presets";

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
    expect(calculateZoomLevel(getPresetById("overview")!.bounds)).toBe(1);
    expect(calculateZoomLevel(getPresetById("seahorse-valley")!.bounds)).toBe(200);
    expect(calculateZoomLevel(getPresetById("lightning")!.bounds)).toBe(2000);
  });

  it("rounds to the nearest whole level at deep zoom", () => {
    // 0.002 wide: 4 / 0.002 = 2000, and float error must not shift it.
    expect(
      calculateZoomLevel({
        minReal: -1.2515,
        maxReal: -1.2495,
        minImaginary: 0.0195,
        maxImaginary: 0.0215,
      }),
    ).toBe(2000);
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
