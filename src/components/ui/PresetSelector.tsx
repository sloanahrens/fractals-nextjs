"use client";

import React from "react";
import {
  FractalPreset,
  BUILTIN_PRESETS,
  getCustomPresetsSnapshot,
  getServerCustomPresetsSnapshot,
  subscribeToCustomPresets,
} from "../../lib/presets";
import { Button } from "./Button";
import { Select } from "./Select";

interface PresetSelectorProps {
  currentPreset?: string;
  onPresetSelect: (preset: FractalPreset) => void;
  onSavePreset: () => void;
  className?: string;
}

export const PresetSelector: React.FC<PresetSelectorProps> = ({
  currentPreset,
  onPresetSelect,
  onSavePreset,
  className = "",
}) => {
  // The saved presets live in localStorage; subscribe so the dropdown lists a
  // preset as soon as it is saved elsewhere in the app.
  const customPresets = React.useSyncExternalStore(
    subscribeToCustomPresets,
    getCustomPresetsSnapshot,
    getServerCustomPresetsSnapshot,
  );

  const handlePresetChange = (presetId: string) => {
    const preset = [...BUILTIN_PRESETS, ...customPresets].find(
      (p) => p.id === presetId,
    );
    if (preset) {
      onPresetSelect(preset);
    }
  };

  const presetOptions = [
    { value: "", label: "Select a preset..." },
    ...BUILTIN_PRESETS.map((preset) => ({
      value: preset.id,
      label: preset.name,
    })),
    ...(customPresets.length > 0
      ? [{ value: "---", label: "--- Custom Presets ---", disabled: true }]
      : []),
    ...customPresets.map((preset) => ({
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
        <Button
          onClick={onSavePreset}
          variant="secondary"
          size="sm"
          className="min-w-fit"
        >
          Save Current
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {BUILTIN_PRESETS.map((preset) => (
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
    </div>
  );
};
