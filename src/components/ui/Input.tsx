"use client";

import React from "react";

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  step?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
}

export function Input({
  label,
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
  disabled = false,
  placeholder,
  error,
}: InputProps) {
  // useId gives each instance its own id, so the label points at this input
  // and not at the last one that happened to print the same label text.
  const inputId = React.useId();

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? "border-red-300" : "border-gray-300"
        }`}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
