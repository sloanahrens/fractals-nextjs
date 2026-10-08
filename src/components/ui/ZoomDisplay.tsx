"use client";

import React from "react";
import { FractalBounds } from "../../types/fractal";
import {
  calculateZoomLevel,
  calculateCenter,
  formatZoom,
} from "../../lib/presets";
import { formatCoordinate } from "../../lib/zoomScale";

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
