"use client";

import React, { useEffect, useRef, useState } from "react";

import type { ColorScheme } from "../../types/fractal";
import { placeColorScheme, type Place } from "../../lib/places";
import {
  DEFAULT_THUMBNAIL_HEIGHT,
  DEFAULT_THUMBNAIL_WIDTH,
  createCanvasThumbnailRender,
  createThumbnailStore,
  type ThumbnailEntry,
  type ThumbnailLook,
  type ThumbnailStore,
} from "../../lib/placeThumbnails";

/** The strip's heading, which also names the region for a screen reader. */
export const NEARBY_LABEL = "Nearby, worth a look";

interface NearbyStripProps {
  /** The places to show, best first. An empty list shows no strip. */
  places: readonly Place[];
  /**
   * The page's current scheme, which draws the tiles whose place names no
   * scheme of its own; the others keep theirs (`placeColorScheme`).
   */
  colorScheme: ColorScheme;
  /**
   * That scheme's reversal and shift, and the orbit trap when one is on, which
   * a click applies too: a tile is drawn with them so it is the picture the
   * click shows.
   */
  colorOptions?: ThumbnailLook;
  /** True while the main render runs, which holds the thumbnails back. */
  paused: boolean;
  /** A tile was chosen: go there. */
  onSelect: (place: Place) => void;
  /** Rotates in the next suggestions. Absent when there are no others to show. */
  onMore?: () => void;
  /**
   * True while something else owns the screen (a tour): the strip renders
   * nothing and asks the store for no pictures. Defaults to false.
   */
  hidden?: boolean;
}

const TILE_CLASSES =
  "group relative h-[4.5rem] w-24 flex-none overflow-hidden rounded-md bg-gray-700 shadow ring-1 ring-white/30 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

/** Put a stored thumbnail on a canvas: its pixels, or the flat placeholder. */
function drawEntry(canvas: HTMLCanvasElement, entry: ThumbnailEntry): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  if (entry.status === "ready") {
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(entry.image.data),
        entry.image.width,
        entry.image.height,
      ),
      0,
      0,
    );
    return;
  }

  const { color, width, height } = entry.placeholder;
  context.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
  context.fillRect(0, 0, width, height);
}

interface TileProps {
  place: Place;
  colorScheme: ColorScheme;
  colorOptions: ThumbnailLook | undefined;
  store: ThumbnailStore;
  onSelect: (place: Place) => void;
}

/**
 * One place: a button named for it, with its picture on a small canvas and its
 * name over the picture while the pointer or focus is on it.
 *
 * The picture is asked of the store when the tile mounts and drawn straight
 * onto the canvas when it is ready, so a cached one appears at once and a slow
 * one fills in without a re-render. The strip remounts its tiles when the list
 * changes, which is what asks again.
 *
 * It is drawn in `placeColorScheme(place, colorScheme)`, the scheme a click on
 * it applies, through the page's own palette settings (`colorOptions`), which a
 * click applies as well. A place that names its colours keeps them when the
 * page's scheme changes, so its effect has nothing new to ask for and its
 * picture is not repainted; only a place that names none follows the page. A
 * change to the palette settings moves every tile, since they colour every
 * scheme.
 */
function Tile({
  place,
  colorScheme,
  colorOptions,
  store,
  onSelect,
}: TileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scheme = placeColorScheme(place, colorScheme);

  useEffect(() => {
    let mounted = true;

    store.request(
      place,
      scheme,
      (entry) => {
        const canvas = canvasRef.current;
        if (mounted && canvas) drawEntry(canvas, entry);
      },
      colorOptions,
    );

    return () => {
      mounted = false;
    };
  }, [store, place, scheme, colorOptions]);

  return (
    <button
      type="button"
      aria-label={place.name}
      onClick={() => onSelect(place)}
      className={TILE_CLASSES}
    >
      <canvas
        ref={canvasRef}
        width={DEFAULT_THUMBNAIL_WIDTH}
        height={DEFAULT_THUMBNAIL_HEIGHT}
        aria-hidden="true"
        className="h-full w-full"
      />
      {/* The caption is for the eye; the button's name comes from aria-label.
          A screen with no hover shows it all the time. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-left text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        {place.name}
      </span>
    </button>
  );
}

/**
 * The strip over the bottom of the canvas: thumbnails of places worth a look
 * near the current view, a More tile that rotates in others, and a click on a
 * tile to go there.
 *
 * The pictures come from a thumbnail store this component owns. It is paused
 * while the main render runs (`paused`), so the strip never competes with the
 * picture the user is waiting for, and anything still queued is dropped when
 * the list changes or the strip goes away. A picture that could not be drawn
 * is a flat grey tile; the place is still a button that works.
 *
 * It does not fade. The top bar goes after a quiet two seconds, but the strip
 * is the page's main way of moving and is most needed when the visitor is lost,
 * so it stays up (`hidden` is the only thing that takes it away). The row
 * scrolls sideways when it is wider than the canvas. Only the tiles take
 * pointer events, so the canvas under the gaps still pans.
 */
export function NearbyStrip({
  places,
  colorScheme,
  colorOptions,
  paused,
  onSelect,
  onMore,
  hidden = false,
}: NearbyStripProps) {
  const [store] = useState(() =>
    createThumbnailStore({ render: createCanvasThumbnailRender() }),
  );

  // What the tiles are asked for is the list. Changing it drops whatever is
  // queued for the old one before the new tiles ask; React runs every cleanup
  // of a commit ahead of its new effects. The page's colours are not part of
  // it: a colour change must not cancel the renders of tiles that keep their
  // own scheme, and a tile that follows the page asks again by itself.
  const listKey = places.map((place) => place.id).join(",");

  useEffect(() => {
    if (paused) store.pause();
    else store.resume();
  }, [paused, store]);

  // Hiding the strip unmounts its tiles; this also drops what they had queued.
  useEffect(() => () => store.cancelAll(), [store, listKey, hidden]);

  if (hidden || places.length === 0) return null;

  return (
    <section
      aria-labelledby="nearby-strip-label"
      data-visible="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-3 pt-10"
    >
      <h2
        id="nearby-strip-label"
        className="mb-1.5 text-xs font-medium text-white/80"
      >
        {NEARBY_LABEL}
      </h2>
      <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
        {places.map((place) => (
          <Tile
            key={`${listKey}|${place.id}`}
            place={place}
            colorScheme={colorScheme}
            colorOptions={colorOptions}
            store={store}
            onSelect={onSelect}
          />
        ))}
        {onMore && (
          <button
            type="button"
            onClick={onMore}
            className={`${TILE_CLASSES} flex items-center justify-center bg-white/15 text-sm font-medium text-white hover:bg-white/25`}
          >
            More
          </button>
        )}
      </div>
    </section>
  );
}
