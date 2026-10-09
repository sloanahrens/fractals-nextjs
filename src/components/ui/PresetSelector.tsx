"use client";

import React from "react";
import {
  FractalPreset,
  BUILTIN_PRESETS,
  getCustomPresetsSnapshot,
  getServerCustomPresetsSnapshot,
  presetsForFractal,
  subscribeToCustomPresets,
} from "../../lib/presets";
import { Button } from "./Button";
import { Select } from "./Select";

interface PresetSelectorProps {
  currentPreset?: string;
  /**
   * Id of the fractal selected now. Only its views are offered: the built-in
   * presets belong to the Mandelbrot set, and a saved view belongs to the
   * fractal it was saved on.
   */
  fractal: string;
  onPresetSelect: (preset: FractalPreset) => void;
  className?: string;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  currentPreset,
  fractal,
  onPresetSelect,
  className = "",
}) => {
  // The saved presets live in localStorage; subscribe so the dropdown lists a
  // preset as soon as it is saved elsewhere in the app.
  const customPresets = React.useSyncExternalStore(
    subscribeToCustomPresets,
    getCustomPresetsSnapshot,
    getServerCustomPresetsSnapshot,
  );

  const builtins = presetsForFractal(BUILTIN_PRESETS, fractal);
  const saved = presetsForFractal(customPresets, fractal);

  const handlePresetChange = (presetId: string) => {
    const preset = [...builtins, ...saved].find((p) => p.id === presetId);
    if (preset) {
      onPresetSelect(preset);
    }
  };

  const presetOptions = [
    { value: "", label: "Select a preset..." },
    ...builtins.map((preset) => ({
      value: preset.id,
      label: preset.name,
    })),
    ...(saved.length > 0
      ? [{ value: "---", label: "--- Custom Presets ---", disabled: true }]
      : []),
    ...saved.map((preset) => ({
      value: preset.id,
      label: preset.name,
    })),
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Select
          label="Presets"
          options={presetOptions}
          value={currentPreset || ""}
          onChange={handlePresetChange}
        />
      </div>

      {/* Burning Ship and Julia ship no built-in views, so the grid is absent
          rather than an empty row above the list of saved ones. */}
      {builtins.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {builtins.map((preset) => (
            <Button
              key={preset.id}
              onClick={() => onPresetSelect(preset)}
              variant={currentPreset === preset.id ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
