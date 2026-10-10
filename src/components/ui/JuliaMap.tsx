"use client";

import React, { useEffect, useRef } from "react";

import type { ColorScheme, ComplexNumber } from "../../types/fractal";
import {
  JULIA_MAP_HEIGHT,
  JULIA_MAP_ITERATIONS,
  JULIA_MAP_LABEL,
  JULIA_MAP_WIDTH,
  complexToInsetPoint,
  insetPointToComplex,
  juliaMapBounds,
  stepJuliaMapPoint,
} from "../../lib/juliaMap";
import { mandelbrotKind } from "../../lib/mandelbrot";
import { renderRgba } from "../../lib/renderRgba";

/** The ring is drawn at this radius in inset pixels. */
const RING_RADIUS = 4.5;

/**
 * The four arrow keys, as the step each one asks for.
 *
 * Up the picture is a smaller row, and a smaller row is a smaller imaginary
 * part: this app draws the plane with its imaginary part growing down the
 * canvas, which is `pixelToComplex`'s rule and so the rule every picture here —
 * and the ring on this map — is drawn by. The picture is the Mandelbrot set, so
 * it is symmetric and reads the same way round either way; what the convention
 * buys is that the ring sits exactly where the constant is drawn.
 */
const ARROW_STEPS: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface JuliaMapProps {
  /** The constant the picture is drawn with, as the point the ring marks. */
  point: ComplexNumber;
  /** The colour scheme the map is drawn in. */
  colorScheme: ColorScheme;
  /**
   * Whether the main picture has settled. The map is drawn once it has, so the
   * chart of the parameter plane never competes with the picture it is a chart
   * of.
   */
  settled: boolean;
  /**
   * A pick has begun. One call per gesture, so the deliberate move the pick is
   * leaves one entry in the browser's history rather than one per pointer move.
   */
  onGestureStart: () => void;
  /** The point under the pointer, or one arrow key away: set the constant. */
  onPick: (point: ComplexNumber) => void;
}

/**
 * The Julia map: the Mandelbrot set small, with a ring on the current constant
 *
 * A Julia set is one picture out of a family of pictures, and which one is drawn
 * is a single point of the plane — the plane the Mandelbrot set is drawn in. So
 * the set makes a chart of Julia constants: point at a place and that is the
 * constant, and the picture on the canvas becomes the Julia set of the point
 * under the pointer. The four named constants, the Custom pair of boxes and the
 * link are all the same one value, so a pick is spelled, stored and shared
 * exactly as a typed constant is.
 *
 * Pressing or dragging picks; the ring follows the constant the page holds, not
 * the pointer, so what is rung is what is drawn. The inset is focusable and the
 * arrow keys move the constant, because a picture is not a control a keyboard
 * can drive by itself.
 *
 * The map itself is one picture — the Mandelbrot set in a given colour scheme —
 * so each scheme's is drawn once, on a macrotask of its own after the main
 * picture has settled, and kept. Nothing here holds state: the picture is drawn
 * straight onto the canvas from the render, as the strip's thumbnails are.
 */
export function JuliaMap({
  point,
  colorScheme,
  settled,
  onGestureStart,
  onPick,
}: JuliaMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef(new Map<ColorScheme, ImageData>());
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!settled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const held = cacheRef.current.get(colorScheme);
    if (held) {
      canvas.getContext("2d")?.putImageData(held, 0, 0);
      return;
    }

    // The picture the visitor is waiting for has been drawn, so this is the
    // next thing on the page rather than a competitor: one macrotask of its own
    // lets the browser finish the frame it just painted first.
    const timer = window.setTimeout(() => {
      // The pixels are copied into the ImageData the way the strip's tiles copy
      // a thumbnail's: the render's buffer is the renderer's own view of them,
      // and this one is kept for the life of the page.
      const image = new ImageData(
        new Uint8ClampedArray(
          renderRgba(
            juliaMapBounds(),
            JULIA_MAP_WIDTH,
            JULIA_MAP_HEIGHT,
            JULIA_MAP_ITERATIONS,
            colorScheme,
            mandelbrotKind,
            false,
          ),
        ),
        JULIA_MAP_WIDTH,
        JULIA_MAP_HEIGHT,
      );

      cacheRef.current.set(colorScheme, image);
      canvas.getContext("2d")?.putImageData(image, 0, 0);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [settled, colorScheme]);

  // The point a pointer event is over, in the plane, or null when the canvas
  // has no box to measure against (a drawer that has not been laid out).
  const pointAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    return insetPointToComplex(
      ((event.clientX - rect.left) / rect.width) * JULIA_MAP_WIDTH,
      ((event.clientY - rect.top) / rect.height) * JULIA_MAP_HEIGHT,
      JULIA_MAP_WIDTH,
      JULIA_MAP_HEIGHT,
      juliaMapBounds(),
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const picked = pointAt(event);
    if (picked === null) return;

    // The whole gesture is one deliberate move: the jump begins here, so the
    // entry it makes already holds the view the visitor was on, and the drag
    // below only rewrites the constant inside that one entry. Back returns to
    // the view before the pick, not to a point along the drag.
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    onGestureStart();
    onPick(picked);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;

    const picked = pointAt(event);
    if (picked !== null) onPick(picked);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;

    event.preventDefault();
    onPick(
      stepJuliaMapPoint(
        point,
        step[0],
        step[1],
        JULIA_MAP_WIDTH,
        JULIA_MAP_HEIGHT,
        juliaMapBounds(),
      ),
    );
  };

  const ring = complexToInsetPoint(
    point,
    JULIA_MAP_WIDTH,
    JULIA_MAP_HEIGHT,
    juliaMapBounds(),
  );

  return (
    <div className="space-y-2">
      {/* A two-axis control has no role that carries both axes — `slider` is
          one axis — so this is a focusable element with its own arrow keys and
          its accessible name says what pointing at it does. */}
      <div
        data-julia-map
        tabIndex={0}
        aria-label={JULIA_MAP_LABEL}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        className="relative h-[7.5rem] w-40 cursor-crosshair touch-none rounded-md ring-1 ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <canvas
          ref={canvasRef}
          data-julia-map-canvas
          width={JULIA_MAP_WIDTH}
          height={JULIA_MAP_HEIGHT}
          aria-hidden="true"
          className="h-full w-full rounded-md bg-gray-100"
        />
        {/* The ring is markup rather than pixels so that moving it costs no
            drawing; two circles, because one stroke cannot be seen on every
            colour scheme. */}
        <svg
          data-julia-map-ring
          viewBox={`0 0 ${JULIA_MAP_WIDTH} ${JULIA_MAP_HEIGHT}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <circle
            cx={ring.x}
            cy={ring.y}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(0, 0, 0, 0.65)"
            strokeWidth={3}
          />
          <circle
            cx={ring.x}
            cy={ring.y}
            r={RING_RADIUS}
            fill="none"
            stroke="#fff"
            strokeWidth={1.5}
          />
        </svg>
      </div>
      <p className="text-xs text-gray-600">
        Point at the Mandelbrot map to set the constant c, or focus it and use
        the arrow keys.
      </p>
    </div>
  );
}
