"use client";

import React from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue = (v) => v.toString(),
  disabled = false,
}: SliderProps) {
  // useId gives each instance its own id, so the label points at this slider
  // and not at the last one that happened to print the same label text.
  const sliderId = React.useId();

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label htmlFor={sliderId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        <span className="text-sm text-gray-500 font-mono">
          {formatValue(value)}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed slider"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{formatValue(min)}</span>
        <span>{formatValue(max)}</span>
      </div>
    </div>
  );
}
