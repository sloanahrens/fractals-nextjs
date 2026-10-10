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
   * Id of the fractal selected now. Only its views are offered: each built-in
   * view is framed on a fractal, and a saved view belongs to the fractal it was
   * saved on.
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

      {/* The column count follows the card, not the viewport: from `lg` up the
          card is the fixed w-96 beside the canvas, so six columns left each
          button a few characters of text width and clipped "Julia: Classic" to
          "Classi". Two columns fit the longest name, and a name that does not
          fit wraps onto a second line. */}
      {/* Every fractal the picker offers has built-in views, but a fractal a
          preset names and this build does not know lists none, and the grid is
          absent then rather than an empty row above the list of saved ones. */}
      {builtins.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
          {builtins.map((preset) => (
            <Button
              key={preset.id}
              onClick={() => onPresetSelect(preset)}
              variant={currentPreset === preset.id ? "primary" : "secondary"}
              size="sm"
              className="min-w-0 break-words text-xs"
            >
              {preset.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};
