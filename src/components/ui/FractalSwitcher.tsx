"use client";

import React, { useEffect, useRef } from "react";

import { CUSTOM_OPTION_LABEL } from "../../lib/customConstantInput";
import {
  FRACTAL_TYPES,
  fractalVariants,
  isCustomVariant,
} from "../../lib/fractalTypes";

interface FractalSwitcherProps {
  /** The `FRACTAL_TYPES` id on the canvas. */
  fractalType: string;
  /** The fractal's variant on the canvas; for Julia a constant name or a custom spelling. */
  variant: string;
  /** Goes to another fractal. Not called for the one that is already current. */
  onSelectFractal: (typeId: string) => void;
  /** Goes to a named choice of the fractal's variant. */
  onSelectVariant: (name: string) => void;
  /** Chooses Custom and takes the user to the Real box in Settings. */
  onSelectCustom: () => void;
  /** True renders nothing: a tour, the drawer or the help has the screen. */
  hidden?: boolean;
}

const BUTTON_CLASSES =
  "shrink-0 whitespace-nowrap rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:px-3 sm:text-sm";

const CHIP_CLASSES =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:text-sm";

const PRESSED = "bg-white text-gray-900";
const RESTING = "bg-white/10 text-white hover:bg-white/20";

/**
 * The one-click way to change fractal: Mandelbrot, Julia, Burning Ship,
 * Tricorn, Multibrot, Newton and Celtic as a row of buttons over the top left of the
 * canvas, the current one pressed, and while the current fractal takes a
 * setting (`fractalVariants`; Julia's constant, the Multibrot's power) a second
 * row of chips for it, with the setting's name as a quiet caption before them.
 * A fractal with none gets no second row. The first six buttons were 375 px
 * wide (measured in headless Chrome), already more than the 351 px a 375 px
 * screen leaves inside the gutters, and Celtic makes the row wider still, so it
 * scrolls sideways there and on a 320 px screen, as the chip row does, with the
 * lit button kept in view.
 *
 * It is drawn inside the canvas's own wrapper, so it sits under the top bar and
 * clear of the progress line, and below the blank-picture hint's row, which the
 * page moves down for it. Unlike the bar it never fades: a visitor who has lost
 * the picture needs it most. Only its buttons take pointer events, so the
 * canvas around them still pans, and the chip row scrolls sideways when it is
 * wider than the picture rather than wrapping across it.
 *
 * It holds no state. The page owns the fractal and its variant, so the
 * Settings selects and these buttons are two views of the same two values, and
 * the page decides where a click lands (`featuredPlace`, `wholeSetPlaceFor`).
 * The labels are the picker's own and are never abbreviated; a screen too narrow
 * for the row scrolls it instead.
 */
export function FractalSwitcher({
  fractalType,
  variant,
  onSelectFractal,
  onSelectVariant,
  onSelectCustom,
  hidden = false,
}: FractalSwitcherProps) {
  // The row scrolls sideways when the picture is narrower than it is, which
  // five buttons are on a 320 px screen, so the lit one can be out of view:
  // bring it into view when the fractal changes and when the switcher comes
  // back from being hidden.
  const currentButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentButton.current?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [fractalType, hidden]);

  if (hidden) return null;

  const variants = fractalVariants(fractalType);
  const customCurrent = isCustomVariant(fractalType, variant);

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-start gap-2">
      <div
        role="group"
        aria-label="Fractal"
        className="pointer-events-auto flex max-w-full overflow-x-auto rounded-lg bg-gray-900/80 p-0.5 backdrop-blur"
      >
        {FRACTAL_TYPES.map((type) => {
          const current = type.id === fractalType;

          return (
            <button
              key={type.id}
              ref={current ? currentButton : undefined}
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

      {variants !== null && (
        <div
          role="group"
          aria-label={variants.label}
          className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-gray-900/80 p-1 backdrop-blur"
        >
          <span
            aria-hidden="true"
            className="shrink-0 self-center whitespace-nowrap pl-2 pr-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60"
          >
            {variants.label}
          </span>
          {variants.options.map((option) => {
            const current = option.value === variant;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={current}
                onClick={() => {
                  if (!current) onSelectVariant(option.value);
                }}
                className={`${CHIP_CLASSES} ${current ? PRESSED : RESTING}`}
              >
                {option.label}
              </button>
            );
          })}
          {variants.allowsCustom && (
            <button
              type="button"
              aria-pressed={customCurrent}
              onClick={onSelectCustom}
              className={`${CHIP_CLASSES} ${customCurrent ? PRESSED : RESTING}`}
            >
              {CUSTOM_OPTION_LABEL}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
