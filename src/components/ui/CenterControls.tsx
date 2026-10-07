"use client";

import React from "react";
import { FractalBounds } from "../../types/fractal";
import { calculateCenter } from "../../lib/presets";
import { Input } from "./Input";
import { Button } from "./Button";

interface CenterControlsProps {
  bounds: FractalBounds;
  onCenterChange: (centerX: number, centerY: number) => void;
  className?: string;
}

export const CenterControls: React.FC<CenterControlsProps> = ({
  bounds,
  onCenterChange,
  className = "",
}) => {
  const center = calculateCenter(bounds);
  const [inputX, setInputX] = React.useState(center.x.toString());
  const [inputY, setInputY] = React.useState(center.y.toString());

  // The inputs show the current center until the user edits them, so a bounds
  // change (preset selection, zoom/pan) resyncs them. Comparing against the
  // render that produced them is the documented way to adjust state from a
  // changed prop: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [syncedBounds, setSyncedBounds] = React.useState(bounds);
  if (syncedBounds !== bounds) {
    setSyncedBounds(bounds);
    setInputX(center.x.toString());
    setInputY(center.y.toString());
  }

  const handleApply = () => {
    const newX = parseFloat(inputX);
    const newY = parseFloat(inputY);

    if (!isNaN(newX) && !isNaN(newY)) {
      onCenterChange(newX, newY);
    }
  };

  // const handleKeyPress = (e: React.KeyboardEvent) => {
  //   if (e.key === 'Enter') {
  //     handleApply();
  //   }
  // };

  const handleReset = () => {
    const defaultX = -0.75;
    const defaultY = 0;
    setInputX(defaultX.toString());
    setInputY(defaultY.toString());
    onCenterChange(defaultX, defaultY);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-sm font-medium text-gray-700">
        Center Coordinates
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Real (X)"
          value={inputX}
          type="number"
          onChange={setInputX}
        />
        <Input
          label="Imaginary (Y)"
          value={inputY}
          type="number"
          onChange={setInputY}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleApply} size="sm" className="flex-1">
          Apply
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          Reset
        </Button>
      </div>
    </div>
  );
};
