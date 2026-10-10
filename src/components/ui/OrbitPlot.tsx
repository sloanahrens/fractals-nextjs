"use client";

import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type {
  ColorScheme,
  ComplexNumber,
  EscapeInfo,
} from "../../types/fractal";
import { formatComplex } from "../../lib/fractalMath";
import {
  ORBIT_ESCAPE_RADIUS,
  ORBIT_PLAY_STEP_MS,
  ORBIT_PLOT_SIZE,
  describeOrbit,
  hasEscapeCircle,
  orbitMinExtent,
  orbitStepColour,
  orbitSteps,
  orbitToPlot,
  prefersReducedMotion,
  subscribeToReducedMotion,
} from "../../lib/orbitPlot";

interface OrbitPlotProps {
  /** The `FRACTAL_TYPES` id on the canvas. */
  fractalType: string;
  /** The path the point under the pointer took, start first. */
  orbit: ComplexNumber[];
  /** What that orbit did over the whole iteration cap. */
  info: EscapeInfo;
  /** The colour scheme the picture is drawn in, which the dots are painted in. */
  scheme: ColorScheme;
}

/** The ink the plot's furniture is drawn in: axes, ticks, the escape circle. */
const FURNITURE = "rgba(255,255,255,0.22)";
const PATH = "rgba(255,255,255,0.4)";

/** How many of the orbit's points are listed as plain numbers. */
const LISTED_POINTS = 3;

/**
 * The path the point under the pointer takes, drawn.
 *
 * A point of the plane is iterated and its next value drawn from the last, so
 * the point is not an answer but a journey: inside the set it spirals for ever,
 * outside it flies off within a few steps, and this is that journey on a small
 * square. The axes and their unit ticks say where the plane's origin is, the
 * faint circle is the radius of 2 past which every escape-time kind counts a
 * point as gone, and the dots are the orbit, running through the picture's own
 * palette from the first step to the last. The start is ringed and the head —
 * the escaping point, or the last step drawn — is a solid white dot, so the two
 * ends are told apart from the middle.
 *
 * Play walks the orbit a step at a time, off until it is asked for and disabled
 * for a reader who has asked for less motion; the orbit is drawn whole without
 * it. Moving the pointer re-reads the point, which hands the plot a new orbit,
 * and the animation is tied to the orbit it started on, so a move stops it
 * without a listener of its own. The plot is read-only and its numbers — the
 * last few points written as a + bi — sit under it, so the picture has a text
 * form beside it as the probe's rows have.
 */
export function OrbitPlot({
  fractalType,
  orbit,
  info,
  scheme,
}: OrbitPlotProps) {
  const size = ORBIT_PLOT_SIZE;
  const geometry = useMemo(
    () => orbitToPlot(orbit, size, orbitMinExtent(fractalType)),
    [orbit, size, fractalType],
  );
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false,
  );

  // Which orbit is being walked and how much of it has been drawn. The orbit
  // itself is the identity: a re-read of the point is a new one, so an
  // animation cannot outlive the orbit it belongs to, and the walk is over
  // when its last step has been drawn.
  const [play, setPlay] = useState<{
    orbit: readonly ComplexNumber[];
    step: number;
  } | null>(null);
  const walking =
    play !== null && play.orbit === orbit && play.step < orbit.length
      ? play
      : null;
  const animating = walking !== null;
  const shown = walking ? walking.step : orbit.length;

  useEffect(() => {
    if (!animating) return;

    const timer = window.setInterval(() => {
      setPlay((current) =>
        current === null || current.step >= current.orbit.length
          ? current
          : { orbit: current.orbit, step: current.step + 1 },
      );
    }, ORBIT_PLAY_STEP_MS);

    return () => window.clearInterval(timer);
  }, [animating]);

  const steps = orbitSteps(orbit);
  const label = describeOrbit(fractalType, info, steps);
  const points = geometry.points.slice(0, shown);
  const listed = orbit.slice(Math.max(shown - LISTED_POINTS, 0), shown);
  const ticks = unitTicks(geometry.extent);

  return (
    <div className="mt-1" data-orbit-plot="true">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className="block rounded-md bg-black/30 ring-1 ring-white/10"
      >
        {/* The axes and their unit ticks: where the plane's origin is, and how
            far one unit of it is. */}
        <g data-orbit-axes="true">
          <line
            x1={geometry.origin.x}
            y1={geometry.origin.y - geometry.scale * geometry.extent}
            x2={geometry.origin.x}
            y2={geometry.origin.y + geometry.scale * geometry.extent}
            stroke={FURNITURE}
            strokeWidth={1}
          />
          <line
            x1={geometry.origin.x - geometry.scale * geometry.extent}
            y1={geometry.origin.y}
            x2={geometry.origin.x + geometry.scale * geometry.extent}
            y2={geometry.origin.y}
            stroke={FURNITURE}
            strokeWidth={1}
          />
          {ticks.flatMap((value) => {
            const offset = value * geometry.scale;

            return [
              <line
                key={`x+${value}`}
                x1={geometry.origin.x + offset}
                y1={geometry.origin.y - 4}
                x2={geometry.origin.x + offset}
                y2={geometry.origin.y + 4}
                stroke={FURNITURE}
                strokeWidth={1}
              />,
              <line
                key={`x-${value}`}
                x1={geometry.origin.x - offset}
                y1={geometry.origin.y - 4}
                x2={geometry.origin.x - offset}
                y2={geometry.origin.y + 4}
                stroke={FURNITURE}
                strokeWidth={1}
              />,
              <line
                key={`y+${value}`}
                x1={geometry.origin.x - 4}
                y1={geometry.origin.y - offset}
                x2={geometry.origin.x + 4}
                y2={geometry.origin.y - offset}
                stroke={FURNITURE}
                strokeWidth={1}
              />,
              <line
                key={`y-${value}`}
                x1={geometry.origin.x - 4}
                y1={geometry.origin.y + offset}
                x2={geometry.origin.x + 4}
                y2={geometry.origin.y + offset}
                stroke={FURNITURE}
                strokeWidth={1}
              />,
            ];
          })}
        </g>

        {/* The radius of 2: the circle an escape-time orbit has left when it is
            counted as gone. */}
        {hasEscapeCircle(fractalType) && (
          <circle
            data-orbit-escape-circle="true"
            cx={geometry.origin.x}
            cy={geometry.origin.y}
            r={ORBIT_ESCAPE_RADIUS * geometry.scale}
            fill="none"
            stroke={FURNITURE}
            strokeDasharray="3 3"
          />
        )}

        <polyline
          data-orbit-path="true"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={PATH}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {points.map((point, step) => (
          <circle
            key={`${step}:${point.x}:${point.y}`}
            cx={point.x}
            cy={point.y}
            r={3}
            fill={orbitStepColour(step, orbit.length, scheme)}
          />
        ))}

        {/* The start, ringed, and the head — the escaping point or the last
            step drawn — solid, so the ends are not lost among the dots. */}
        {points.length > 0 && (
          <>
            <circle
              data-orbit-first="true"
              cx={points[0].x}
              cy={points[0].y}
              r={6}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <circle
              data-orbit-last="true"
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={4}
              fill="#ffffff"
            />
          </>
        )}
      </svg>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label={animating ? "Stop the orbit" : "Play the orbit"}
          disabled={reducedMotion}
          onClick={() => setPlay(animating ? null : { orbit, step: 1 })}
          className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
        >
          {animating ? "Stop" : "Play"}
        </button>
        {reducedMotion && (
          <span className="text-[11px] text-white/50">
            Off: your system asks for less motion
          </span>
        )}
      </div>

      {/* The last few points as plain numbers, so the picture has a text form
          as well as a name. */}
      <ul className="mt-1 text-[11px] tabular-nums text-white/60">
        {listed.map((point, index) => (
          <li key={`${shown - listed.length + index}`}>
            {`z${shown - listed.length + index} = ${formatComplex(point.real, point.imaginary)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The unit marks the axes carry: 1, 2, ... as far as the frame reaches. */
function unitTicks(extent: number): number[] {
  const ticks: number[] = [];

  for (let value = 1; value <= Math.floor(extent + 1e-9); value++) {
    ticks.push(value);
  }

  return ticks;
}
