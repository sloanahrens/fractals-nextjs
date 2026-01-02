"use client";

import React from "react";
import { FractalBounds } from "../../types/fractal";
import { calculateZoomLevel, calculateCenter } from "../../lib/presets";

interface ZoomDisplayProps {
  bounds: FractalBounds;
  className?: string;
}

export const ZoomDisplay: React.FC<ZoomDisplayProps> = ({
  bounds,
  className = "",
}) => {
  const zoomLevel = calculateZoomLevel(bounds);
  const center = calculateCenter(bounds);

  const formatCoordinate = (value: number): string => {
    if (Math.abs(value) < 0.001) {
      return value.toExponential(3);
    }
    return value.toFixed(6);
  };

  const formatZoom = (zoom: number): string => {
    if (zoom >= 1000000) {
      return `${(zoom / 1000000).toFixed(1)}M`;
    } else if (zoom >= 1000) {
      return `${(zoom / 1000).toFixed(1)}K`;
    }
    return zoom.toString();
  };

  return (
    <div className={`bg-gray-50 rounded-lg p-3 border ${className}`}>
      <div className="text-sm font-medium text-gray-700 mb-2">View Info</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-white rounded px-2 py-1 border">
          <div className="text-gray-500">Zoom Level</div>
          <div className="font-mono font-semibold">
            {formatZoom(zoomLevel)}×
          </div>
        </div>
        <div className="bg-white rounded px-2 py-1 border">
          <div className="text-gray-500">Center X</div>
          <div className="font-mono font-semibold">
            {formatCoordinate(center.x)}
          </div>
        </div>
        <div className="bg-white rounded px-2 py-1 border">
          <div className="text-gray-500">Center Y</div>
          <div className="font-mono font-semibold">
            {formatCoordinate(center.y)}
          </div>
        </div>
      </div>
    </div>
  );
};
