"use client";

import React from "react";
import { FractalBounds, ColorScheme, TrapShape } from "../../types/fractal";
import {
  FractalPreset,
  saveCustomPreset,
  deleteCustomPreset,
  getCustomPresetsSnapshot,
  getServerCustomPresetsSnapshot,
  presetColorFields,
  presetFractalFields,
  presetsForFractal,
  subscribeToCustomPresets,
} from "../../lib/presets";
import { Button } from "./Button";
import { Input } from "./Input";

interface CustomPresetManagerProps {
  currentBounds: FractalBounds;
  currentMaxIterations: number;
  currentColorScheme: ColorScheme;
  /** Whether the palette on the canvas is walked backwards; saved with the view. */
  currentReverse: boolean;
  /** Fraction of a turn the colours start at; saved with the view. */
  currentShift: number;
  /** The orbit trap colouring the canvas, or null; saved with the view. */
  currentTrap: TrapShape | null;
  currentCanvasWidth: number;
  currentCanvasHeight: number;
  /** Id of the fractal on the canvas now, saved with the view. */
  currentFractal: string;
  /** Julia constant on the canvas now; saved only for a Julia view. */
  currentVariant: string;
  onPresetsChange: () => void;
  className?: string;
}

export const CustomPresetManager: React.FC<CustomPresetManagerProps> = ({
  currentBounds,
  currentMaxIterations,
  currentColorScheme,
  currentReverse,
  currentShift,
  currentTrap,
  currentCanvasWidth,
  currentCanvasHeight,
  currentFractal,
  currentVariant,
  onPresetsChange,
  className = "",
}) => {
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [presetName, setPresetName] = React.useState("");
  const [presetDescription, setPresetDescription] = React.useState("");
  // Saved presets come straight from localStorage. Saving or deleting writes
  // the store, which notifies this subscription and re-renders with the new list.
  const customPresets = React.useSyncExternalStore(
    subscribeToCustomPresets,
    getCustomPresetsSnapshot,
    getServerCustomPresetsSnapshot,
  );

  // The list shows the views saved for the fractal on the canvas, which is the
  // one the dropdown offers. A view for another fractal — or for
  // one this build does not know — is left in storage, so switching the Fractal
  // select brings it back rather than it being lost or deleted here.
  const savedForFractal = presetsForFractal(customPresets, currentFractal);

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      alert("Please enter a preset name");
      return;
    }

    const preset: FractalPreset = {
      id: `custom-${Date.now()}`,
      name: presetName.trim(),
      description: presetDescription.trim() || "Custom preset",
      bounds: { ...currentBounds },
      maxIterations: currentMaxIterations,
      colorScheme: currentColorScheme,
      canvasWidth: currentCanvasWidth,
      canvasHeight: currentCanvasHeight,
      ...presetFractalFields(currentFractal, currentVariant),
      ...presetColorFields(currentReverse, currentShift, currentTrap),
    };

    try {
      saveCustomPreset(preset);
      onPresetsChange();
      setShowSaveDialog(false);
      setPresetName("");
      setPresetDescription("");
    } catch (error) {
      console.error("Error saving preset:", error);
      alert("Error saving preset. Please try again.");
    }
  };

  const handleDeletePreset = (id: string) => {
    if (confirm("Are you sure you want to delete this preset?")) {
      try {
        deleteCustomPreset(id);
        onPresetsChange();
      } catch (error) {
        console.error("Error deleting preset:", error);
        alert("Error deleting preset. Please try again.");
      }
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Custom Presets</div>
        <Button
          onClick={() => setShowSaveDialog(true)}
          variant="outline"
          size="sm"
        >
          Save Current
        </Button>
      </div>

      {showSaveDialog && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <Input
            label="Preset Name"
            value={presetName}
            onChange={setPresetName}
          />
          <Input
            label="Description (optional)"
            value={presetDescription}
            onChange={setPresetDescription}
          />
          <div className="flex gap-2">
            <Button onClick={handleSavePreset} size="sm" className="flex-1">
              Save
            </Button>
            <Button
              onClick={() => {
                setShowSaveDialog(false);
                setPresetName("");
                setPresetDescription("");
              }}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {savedForFractal.length > 0 && (
        <div className="space-y-2">
          {savedForFractal.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center justify-between bg-gray-50 rounded p-2 border"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {preset.name}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {preset.description}
                </div>
              </div>
              <Button
                onClick={() => handleDeletePreset(preset.id)}
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-800 hover:bg-red-50"
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}

      {savedForFractal.length === 0 && (
        <div className="text-center text-sm text-gray-500 py-4">
          No saved views for this fractal yet
        </div>
      )}
    </div>
  );
};
