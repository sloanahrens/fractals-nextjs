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
import { Select } from "./Select";

interface PresetSelectorProps {
  currentPreset?: string;
  /**
   * Id of the fractal selected now. Only its views are offered: each built-in
   * view is framed on a fractal, and a saved view belongs to the fractal it was
   * saved on.
   */
  fractal: string;
  onPresetSelect: (preset: FractalPreset) => void;
  className?: string;
}

/**
 * The preset dropdown: the built-in views of the selected fractal, then the
 * user's saved ones. The Nearby strip over the canvas is how a visitor finds
 * places at a glance, so the dropdown is the only way in here and the row of
 * buttons that used to sit under it is gone.
 */
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
    </div>
  );
};
