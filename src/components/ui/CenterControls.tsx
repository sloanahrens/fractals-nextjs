"use client";

import React from "react";
import { FractalBounds } from "../../types/fractal";
import { calculateCenter } from "../../lib/presets";
import { formatCoordinate } from "../../lib/zoomScale";
import { Input } from "./Input";
import { Button } from "./Button";

interface CenterControlsProps {
  bounds: FractalBounds;
  onCenterChange: (centerX: number, centerY: number) => void;
  className?: string;
}

/** A field exists only once the user has typed in it; while it is absent the
 * box shows the current center. */
type CenterDraft = { x?: string; y?: string };

export const CenterControls: React.FC<CenterControlsProps> = ({
  bounds,
  onCenterChange,
  className = "",
}) => {
  const center = calculateCenter(bounds);
  // Only typed text lives here. Boxes the user has not touched read straight
  // off the view, which is what lets Apply reuse the full-precision center
  // while the text on screen stays down to six significant digits.
  const [draft, setDraft] = React.useState<CenterDraft>({});

  // The inputs show the current center until the user edits them, so a bounds
  // change (preset selection, zoom/pan) resyncs them. Comparing against the
  // render that produced them is the documented way to adjust state from a
  // changed prop: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [syncedBounds, setSyncedBounds] = React.useState(bounds);
  if (syncedBounds !== bounds) {
    setSyncedBounds(bounds);
    setDraft({});
  }

  const handleApply = () => {
    const newX = draft.x === undefined ? center.x : parseFloat(draft.x);
    const newY = draft.y === undefined ? center.y : parseFloat(draft.y);

    if (!isNaN(newX) && !isNaN(newY)) {
      onCenterChange(newX, newY);
    }
  };

  const handleReset = () => {
    const defaultX = -0.75;
    const defaultY = 0;
    setDraft({});
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
          value={draft.x ?? formatCoordinate(center.x)}
          type="number"
          onChange={(value) => setDraft((d) => ({ ...d, x: value }))}
        />
        <Input
          label="Imaginary (Y)"
          value={draft.y ?? formatCoordinate(center.y)}
          type="number"
          onChange={(value) => setDraft((d) => ({ ...d, y: value }))}
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
