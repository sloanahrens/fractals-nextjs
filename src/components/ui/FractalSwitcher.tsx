"use client";

import React from "react";

import {
  CUSTOM_OPTION_LABEL,
  isCustomJuliaConstant,
} from "../../lib/customConstantInput";
import { FRACTAL_TYPES } from "../../lib/fractalTypes";
import { JULIA_CONSTANTS } from "../../lib/julia";

interface FractalSwitcherProps {
  /** The `FRACTAL_TYPES` id on the canvas. */
  fractalType: string;
  /** The Julia constant on the canvas, as a name or a custom spelling. */
  juliaConstant: string;
  /** Goes to another fractal. Not called for the one that is already current. */
  onSelectFractal: (typeId: string) => void;
  /** Goes to a named Julia constant. */
  onSelectConstant: (name: string) => void;
  /** Chooses Custom and takes the user to the Real box in Settings. */
  onSelectCustom: () => void;
  /** True renders nothing: a tour, the drawer or the help has the screen. */
  hidden?: boolean;
}

const BUTTON_CLASSES =
  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-3 sm:text-sm";

const CHIP_CLASSES =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:text-sm";

const PRESSED = "bg-white text-gray-900";
const RESTING = "bg-white/10 text-white hover:bg-white/20";

/**
 * The one-click way to change fractal: Mandelbrot, Julia and Burning Ship as a
 * row of buttons over the top left of the canvas, the current one pressed, and
 * while Julia is current a second row of chips for its constants.
 *
 * It is drawn inside the canvas's own wrapper, so it sits under the top bar and
 * clear of the progress line, and below the blank-picture hint's row, which the
 * page moves down for it. Unlike the bar it never fades: a visitor who has lost
 * the picture needs it most. Only its buttons take pointer events, so the
 * canvas around them still pans, and the chip row scrolls sideways when it is
 * wider than the picture rather than wrapping across it.
 *
 * It holds no state. The page owns the fractal and the constant, so the
 * Settings selects and these buttons are two views of the same two values, and
 * the page decides where a click lands (`featuredPlace`, `wholeSetPlaceFor`).
 * The labels are the picker's own and are short enough for a 320 px screen, so
 * they are never abbreviated.
 */
export function FractalSwitcher({
  fractalType,
  juliaConstant,
  onSelectFractal,
  onSelectConstant,
  onSelectCustom,
  hidden = false,
}: FractalSwitcherProps) {
  if (hidden) return null;

  const customCurrent = isCustomJuliaConstant(juliaConstant);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2">
      <div
        role="group"
        aria-label="Fractal"
        className="pointer-events-auto flex rounded-lg bg-gray-900/80 p-0.5 backdrop-blur"
      >
        {FRACTAL_TYPES.map((type) => {
          const current = type.id === fractalType;

          return (
            <button
              key={type.id}
              type="button"
              aria-pressed={current}
              onClick={() => {
                if (!current) onSelectFractal(type.id);
              }}
              className={`${BUTTON_CLASSES} ${current ? PRESSED : "text-white hover:bg-white/20"}`}
            >
              {type.label}
            </button>
          );
        })}
      </div>

      {fractalType === "julia" && (
        <div
          role="group"
          aria-label="Julia constant"
          className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-gray-900/80 p-1 backdrop-blur"
        >
          {JULIA_CONSTANTS.map((constant) => {
            const current = constant.name === juliaConstant;

            return (
              <button
                key={constant.name}
                type="button"
                aria-pressed={current}
                onClick={() => {
                  if (!current) onSelectConstant(constant.name);
                }}
                className={`${CHIP_CLASSES} ${current ? PRESSED : RESTING}`}
              >
                {constant.name}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customCurrent}
            onClick={onSelectCustom}
            className={`${CHIP_CLASSES} ${customCurrent ? PRESSED : RESTING}`}
          >
            {CUSTOM_OPTION_LABEL}
          </button>
        </div>
      )}
    </div>
  );
}
