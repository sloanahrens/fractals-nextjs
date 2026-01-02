"use client";

import React from "react";

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  step?: string;
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
  disabled = false,
  placeholder,
  error,
}: InputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
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
