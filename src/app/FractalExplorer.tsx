"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { FractalRenderer } from "../lib/fractalRenderer";
import {
  ITERATION_STEP,
  MAX_ITERATIONS,
  MAX_ZOOM,
  MIN_ITERATIONS,
  MIN_ZOOM,
  autoIterations,
  calculateZoomBounds,
  boundsToView,
  clampZoom,
} from "../lib/mandelbrot";
import { ZoomPanManager } from "../lib/zoomPan";
import {
  attachCanvasNavigation,
  describeBounds,
  keyNavigationBounds,
} from "../lib/canvasNavigation";
import { RenderQuality, RenderQualityDecider } from "../lib/renderQuality";
import {
  ZOOM_SLIDER_STEP,
  formatCoordinate,
  sliderToZoom,
  zoomToSlider,
} from "../lib/zoomScale";
import {
  FractalConfig,
  FractalBounds,
  ColorScheme,
  ZoomState,
} from "../types/fractal";
import { getAvailableColorSchemes } from "../lib/colorMapping";
import {
  DEFAULT_PRESET_FRACTAL,
  FractalPreset,
  formatZoom,
  presetFractal,
  presetVariant,
} from "../lib/presets";
import { downloadFileName } from "../lib/download";
import {
  EXPORT_FAILED_MESSAGE,
  exportFileName,
  exportProgressDue,
  exportSizes,
} from "../lib/exportSize";
import {
  EXPORT_SHAPES,
  SCREEN_SHAPE_ID,
  exportFrame,
  exportShapeFor,
  wallpaperFileName,
  type ExportShape,
} from "../lib/exportShape";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  fractalVariants,
  isCustomVariant,
  resolveFractalKind,
  variantOn,
} from "../lib/fractalTypes";
import {
  CUSTOM_OPTION_LABEL,
  CUSTOM_OPTION_VALUE,
  isCustomJuliaConstant,
  parseCustomConstantInput,
} from "../lib/customConstantInput";
import { customConstantName, parseJuliaConstant } from "../lib/julia";
import { BLANK_HINT_DELAY_MS, canvasIsBlank } from "../lib/blankView";
import { createRng, nextWanderView } from "../lib/wander";
import {
  DEFAULT_WANDER_INTERVAL_SECONDS,
  MAX_WANDER_INTERVAL_SECONDS,
  MIN_WANDER_INTERVAL_SECONDS,
  WanderController,
} from "../lib/wanderController";
import {
  MANUAL_FITTED_MESSAGE,
  checkManualBounds,
  hasBaseAspect,
  readManualCoordinate,
} from "../lib/manualBounds";
import { opensHelpShortcut } from "../lib/helpEntries";
import { Journey, historyButtons } from "../lib/journey";
import {
  PLACES,
  featuredPlace,
  placeColorScheme,
  suggest,
  wholeSetPlaceFor,
  type Place,
} from "../lib/places";
import { surpriseTarget } from "../lib/surprise";
import {
  CROSSFADE_MS,
  NEARBY_POOL_SIZE,
  hasMoreNearby,
  nearbyRefreshDue,
  nearbyWindow,
  nextNearbyOffset,
} from "../lib/nearbyStrip";
import { decodeTour, encodeView } from "../lib/viewLink";
import { copyLinkUrl, readLocationLink } from "../lib/viewQuery";
import {
  TOUR_CROSSFADE_MS,
  initialTourState,
  nextTourStop,
  type TourState,
} from "../lib/tour";
import {
  TOUR_ACTIVITY_EVENTS,
  TourMode,
  isTextEntry,
  pointerMoved,
  type TourModeState,
} from "../lib/tourMode";
import { holdScreenAwake } from "../lib/wakeLock";
import {
  DEFAULT_VIEW_LINK_UPDATES,
  linkWriteDelayMs,
  shouldWriteLink,
  viewLinkUpdatesFrom,
} from "../lib/viewLinkState";
import { Slider } from "../components/ui/Slider";
import { Checkbox } from "../components/ui/Checkbox";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { PresetSelector } from "../components/ui/PresetSelector";
import { CenterControls } from "../components/ui/CenterControls";
import { describeView } from "../lib/viewReadout";
import { CustomPresetManager } from "../components/ui/CustomPresetManager";
import { VersionFooter } from "../components/ui/VersionFooter";
import { HelpDialog } from "../components/ui/HelpDialog";
import { FractalSwitcher } from "../components/ui/FractalSwitcher";
import { MathCard } from "../components/ui/MathCard";
import {
  getMathCardSnapshot,
  getServerMathCardSnapshot,
  setMathCardOpen,
  subscribeToMathCard,
} from "../lib/mathCard";
import {
  type PointProbe,
  createFrameThrottle,
  probeAtPointer,
  shouldClearProbe,
} from "../lib/mathProbe";
import { SettingsDrawer } from "../components/ui/SettingsDrawer";
import { TopBar } from "../components/ui/TopBar";
import { BlankHint } from "../components/ui/BlankHint";
import { NearbyStrip } from "../components/ui/NearbyStrip";
import { WanderControl } from "../components/ui/WanderControl";
import { useWanderNudge } from "../components/ui/useWanderNudge";

// The four manual coordinate boxes. A field is present only once the user has
// typed in it; while it is absent the box shows the current view.
type ManualField = "minReal" | "maxReal" | "minImaginary" | "maxImaginary";

// What the coordinate panel has to say after an Apply: why it could not run, or
// what it did with a box of another shape than the view.
type ManualMessage = { kind: "error" | "note"; text: string };

// What the Copy link button has to say. Idle is empty rather than absent, so
// the status region is in the page before it speaks — a screen reader announces
// a region that goes from empty to text, and misses one that arrives with the
// text already in it.
const COPY_MESSAGES = {
  idle: "",
  copied: "Link copied",
  manual: "Press Ctrl+C to copy",
} as const;

// What the Copy link button last did, and — for the manual case, where the
// clipboard would not take the URL — the URL to copy by hand and the view it
// is of, so a view that moves on takes the offer away with it.
type CopyState =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "manual"; link: string; url: string };

/** How long the "Link copied" confirmation stays up, in milliseconds. */
const LINK_COPIED_MS = 2000;

/**
 * Hand a canvas to the browser as a PNG download.
 *
 * Both saves go through here: the screen-size one reads the canvas on screen,
 * an export reads a canvas of its own. `onSettled` is called once the browser
 * has taken the blob — or has declined to make one — which is the moment the
 * caller may let the canvas go.
 *
 * @param canvas - The canvas holding the picture to save
 * @param name - The filename the browser is asked to write
 * @param onSettled - Called once the blob exists, with whether there was one
 */
function saveCanvasPng(
  canvas: HTMLCanvasElement,
  name: string,
  onSettled: (saved: boolean) => void,
): void {
  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      // Firefox only follows a click on an anchor that is in the document.
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The browser reads the blob off the URL as the download starts, so
      // releasing it in this same tick can cancel the save before it begins.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    onSettled(blob !== null);
  }, "image/png");
}

/**
 * One choice of the Export size select: a whole multiple of the canvas, which
 * is the screen shape's sizes, or one of a wallpaper shape's own pixel sizes.
 * The page tells them apart by `kind`, so the download path never has to work
 * out which list the choice came from.
 */
type ExportSizeOption =
  | {
      kind: "canvas";
      /** The select's value. */
      key: string;
      label: string;
      /** Multiple of the canvas this size draws. */
      scale: number;
      width: number;
      height: number;
    }
  | {
      kind: "wallpaper";
      key: string;
      label: string;
      /** The shape being saved, which names the file. */
      shape: ExportShape;
      width: number;
      height: number;
    };

/**
 * One picture to draw off-screen and save: the size to draw it at, the region
 * of the plane to draw there, and the name to save it under. A screen size
 * larger than the canvas and a wallpaper alike come through here.
 */
interface ExportJob {
  width: number;
  height: number;
  bounds: FractalBounds;
  name: string;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FractalRenderer | null>(null);

  // Decides whether a redraw is a cheap preview or a full-resolution render,
  // and whether the end of a gesture still owes the canvas a full one.
  const [renderPolicy] = useState(() => new RenderQualityDecider());
  // Bumped when a finished gesture owes a full render, so the draw effect runs
  // once more for the view the gesture settled on.
  const [fullRenderNonce, setFullRenderNonce] = useState(0);
  const previewInFlightRef = useRef<Promise<void> | null>(null);
  // Which full-quality draw is the current one, so an overtaken draw cannot
  // report progress or clear the rendering flag on its behalf.
  const drawTokenRef = useRef(0);

  // Navigation state - sliders control these directly. Every field a link can
  // carry opens on DEFAULT_VIEW_LINK_UPDATES, which is the same object a link's
  // missing fields are filled from: what the page shows before anything is
  // touched and what a link leaves alone are one view, not two.
  // Center of the classic Mandelbrot view, which is where the app opens.
  const [centerX, setCenterX] = useState(DEFAULT_VIEW_LINK_UPDATES.centerX);
  const [centerY, setCenterY] = useState(DEFAULT_VIEW_LINK_UPDATES.centerY);
  const [zoomLevel, setZoomLevel] = useState(
    DEFAULT_VIEW_LINK_UPDATES.zoomLevel,
  );

  // Derive bounds from navigation state
  const bounds = useMemo<FractalBounds>(() => {
    return calculateZoomBounds(centerX, centerY, zoomLevel);
  }, [centerX, centerY, zoomLevel]);

  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);

  // Parameter controls
  // The iterations are two values, not one. `maxIterations` is the count
  // somebody set by hand; with auto on, the zoom picks the count instead and
  // the slider follows it. Everything downstream draws and reports the
  // effective one, so the slider, the canvas and a saved preset agree.
  const [maxIterations, setMaxIterations] = useState(
    DEFAULT_VIEW_LINK_UPDATES.maxIterations,
  );
  const [autoIterationsOn, setAutoIterationsOn] = useState(
    DEFAULT_VIEW_LINK_UPDATES.autoIterationsOn,
  );
  const [colorScheme, setColorScheme] = useState<ColorScheme>(
    DEFAULT_VIEW_LINK_UPDATES.colorScheme,
  );
  const [canvasWidth, setCanvasWidth] = useState(
    DEFAULT_VIEW_LINK_UPDATES.canvasWidth,
  );
  const [canvasHeight, setCanvasHeight] = useState(
    DEFAULT_VIEW_LINK_UPDATES.canvasHeight,
  );

  // Which fractal is drawn, and — for a fractal that takes one — its variant:
  // the Julia constant it iterates against, or the Multibrot's power. The two
  // are a single choice as far as the renderer is concerned: it is rebuilt
  // whenever either moves.
  const [fractalType, setFractalType] = useState(
    DEFAULT_VIEW_LINK_UPDATES.fractalType,
  );
  const [variant, setVariant] = useState(DEFAULT_VIEW_LINK_UPDATES.variant);

  // The Real and Imaginary boxes of a custom constant hold what the user typed,
  // so a half-typed "0." is not rewritten under their fingers. They follow the
  // constant when it moves for any other reason — a link, a saved view, the
  // select — by adjusting during the render that sees a new name, the way the
  // coordinate boxes follow the bounds. A name the boxes themselves produced is
  // recorded as synced where it is set, which is what keeps them from being
  // rewritten to its canonical spelling.
  const [juliaRealText, setJuliaRealText] = useState("");
  const [juliaImaginaryText, setJuliaImaginaryText] = useState("");
  const [juliaInputError, setJuliaInputError] = useState<string | null>(null);
  const [syncedVariant, setSyncedVariant] = useState(variant);
  if (syncedVariant !== variant) {
    setSyncedVariant(variant);
    const point = isCustomJuliaConstant(variant)
      ? parseJuliaConstant(variant)
      : null;
    if (point !== null) {
      setJuliaRealText(String(point.real));
      setJuliaImaginaryText(String(point.imaginary));
    }
    setJuliaInputError(null);
  }

  const fractalKind = useMemo(
    () => resolveFractalKind(fractalType, variant),
    [fractalType, variant],
  );

  // What to call that fractal out loud. The picker's label is the one the user
  // read to choose it; the id the choice is keyed by is not a word a listener
  // wants to hear, and the canvas label is the only description of the picture
  // a screen reader gets.
  const fractalLabel = useMemo(
    () =>
      FRACTAL_TYPES.find((type) => type.id === fractalType)?.label ??
      "Mandelbrot",
    [fractalType],
  );

  const effectiveMaxIterations = autoIterationsOn
    ? autoIterations(zoomLevel)
    : maxIterations;

  // Preset system
  const [currentPreset, setCurrentPreset] = useState<string>("");

  // Auto-wander. The controller owns the clock — when a step is due, and when
  // it must wait — and this page owns what a step does and tells the controller
  // when a render starts and finishes. The mode is deliberately not remembered
  // between visits.
  const [wanderOn, setWanderOn] = useState(false);
  const [wanderCountdown, setWanderCountdown] = useState<number | null>(null);
  const [wanderInterval, setWanderInterval] = useState(
    DEFAULT_WANDER_INTERVAL_SECONDS,
  );
  // Only text the user typed is held here, so an untouched box shows the
  // interval in force while an out-of-range entry can be shown without being
  // used. Same draft pattern as the manual coordinate inputs.
  const [wanderIntervalDraft, setWanderIntervalDraft] = useState<string | null>(
    null,
  );
  const [rng] = useState(() => createRng(Date.now()));
  // The walk's hops (every `WANDER_HOP_EVERY`th step) are the tour engine's
  // choices, with a memory of their own: what a walk has visited is not what a
  // tour has. A drift that settles on a blank picture is replaced by a hop, and
  // the controller asks the canvas whether it is blank.
  const wanderHopRef = useRef<TourState | null>(null);
  const [wander] = useState(
    () => new WanderController({ onCountdown: setWanderCountdown }),
  );
  useEffect(() => {
    wander.setBlankDetector(() => {
      const canvas = canvasRef.current;
      return canvas ? canvasIsBlank(canvas) === true : false;
    });
  }, [wander]);

  // Tour mode. `TourMode` owns the clock and the rules — when a tour starts,
  // when it hops, when it gives way — and this page owns what a hop does and
  // tells it what it can see. `tourPlaying` is the one flag the shell reads to
  // hide every control. The engine's own state (what it has visited) lives in a
  // ref because only a hop reads it; the first hop of a tour starts it afresh.
  const [tourState, setTourState] = useState<TourModeState>("idle");
  const tourEngineRef = useRef<TourState | null>(null);
  const [tourMode] = useState(
    () => new TourMode({ onChange: (next) => setTourState(next) }),
  );
  const tourPlaying = tourState === "playing";

  // Manual coordinate inputs. Only text the user typed is held here, so a box
  // that has not been touched reads straight off the view and Apply reuses the
  // view's own float64 rather than the rounded text on screen.
  const [manualDraft, setManualDraft] = useState<
    Partial<Record<ManualField, string>>
  >({});
  // The message belongs to a draft: typing in a box replaces what the last
  // Apply said, and Apply itself always says something, so there is no third
  // event to clear it on. A view that moves underneath an untouched panel
  // leaves the text alone until the next Apply, which is the earliest moment
  // the message can describe the boxes again.
  const [manualMessage, setManualMessage] = useState<ManualMessage | null>(
    null,
  );

  // The boxes mirror the current view until the user edits them, so they
  // resync whenever the view moves (zoom/pan, preset, reset). Adjusting the
  // state during the render that sees the new bounds is the documented
  // alternative to a sync effect:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [syncedBounds, setSyncedBounds] = useState(bounds);
  if (syncedBounds !== bounds) {
    setSyncedBounds(bounds);
    setManualDraft({});
  }

  const manualText = (field: ManualField, value: number): string =>
    manualDraft[field] ?? formatCoordinate(value);

  // What Apply should use for a box: exactly what was typed, or the view's own
  // value when the box still shows the view.
  const manualValue = (field: ManualField, fallback: number): number => {
    const typed = manualDraft[field];
    return typed === undefined ? fallback : readManualCoordinate(typed);
  };

  const editManualCoordinate = (field: ManualField, value: string) => {
    setManualDraft((draft) => ({ ...draft, [field]: value }));
    setManualMessage(null);
    setCurrentPreset("");
  };

  /**
   * The link of the view the last finished full render left on the canvas,
   * empty until there has been one.
   *
   * A fragment describes a picture, so the address bar may only name a view the
   * canvas has actually been drawn on. The blank start is what makes a fresh
   * page write nothing until its first render finishes: the view in state is
   * not one that has been drawn yet, and the link a load applied is the address
   * bar's own text, which the writer below will not write again.
   */
  const [renderedLink, setRenderedLink] = useState("");

  // Draw the canvas at the quality the render policy asks for: the cheap
  // low-resolution pass while a gesture is moving the view, the full image
  // otherwise. A preview leaves the progress bar alone so that a drag does not
  // flash "Rendering..." at every pointer move.
  //
  // The view as a link comes in with the quality, because a finished full
  // render is what makes a view the one the address bar may name. It is a
  // parameter rather than something read here so that the link this draw
  // settles is the link of the view it was asked to draw.
  const drawCanvas = useCallback(
    async (quality: RenderQuality, link: string) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;

      const config: FractalConfig = {
        bounds,
        maxIterations: effectiveMaxIterations,
        width: canvas.width,
        height: canvas.height,
        colorScheme,
      };

      if (quality === "preview") {
        // Previews are cheap but not free and cannot be cancelled once they
        // start, so drop a step while one is still running instead of letting
        // a fast drag stack them up. The next step draws the view that is
        // current by then, and the gesture's own final render replaces
        // whatever is left on the canvas.
        if (previewInFlightRef.current) return;

        previewInFlightRef.current = renderer
          .renderPreview(config)
          .catch((error) => {
            console.error("Error rendering preview:", error);
          });
        try {
          await previewInFlightRef.current;
        } finally {
          previewInFlightRef.current = null;
        }
        return;
      }

      // Let a preview that is still painting land before drawing over it. The
      // other order would leave the blocky preview on top of the finished
      // image until something else redrew the canvas.
      await previewInFlightRef.current;

      // Which draw owns the rendering flag and the progress bar. A draw that
      // has been overtaken — a control used again while this one was still
      // running — keeps rendering, but its reports and its finishing must not
      // touch state the newer draw now owns. The renderer keeps the same
      // promise for the canvas itself.
      const token = ++drawTokenRef.current;

      // The renderer owns the run: it paints the canvas and reports how far
      // along it is, so the bar follows those reports. Reporting from its
      // callback rather than from the draw itself keeps this draw free of a
      // setState in the calling effect's own body, which would be a second
      // render stacked on the one that scheduled the draw.
      const onProgress = (value: number) => {
        if (token !== drawTokenRef.current) return;
        setIsRendering(true);
        setProgress(value);
      };

      // A full render suspends the walk for its whole length, whatever asked
      // for it, so a step is never issued at a canvas that is still drawing.
      // The walk then waits out its interval from the finished picture.
      wander.notifyRenderStart();

      await renderer
        .renderFractal(config, onProgress)
        .catch((error) => {
          console.error("Error rendering fractal:", error);
        })
        .finally(() => {
          // Only the newest draw clears the flag; an older one clearing it
          // would hide the bar while the drawing it has handed over to is
          // still running. A superseded draw is not the one that settled the
          // canvas either, so it does not say which view the address bar may
          // name.
          if (token === drawTokenRef.current) {
            setIsRendering(false);
            setRenderedLink(link);
            wander.notifyRenderDone();
          }
        });
    },
    [bounds, effectiveMaxIterations, colorScheme, wander],
  );

  // Initialize canvas and renderer. The renderer is rebuilt when the canvas is
  // resized, because it owns the image buffer that goes with those dimensions,
  // and when the kind changes, because the formula is fixed at construction.
  // The draw effect below paints the canvas either way.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A render still running belongs to the renderer being replaced and paints
    // the same canvas: the old kind draws a different picture, and the old
    // image buffer has the old dimensions. Two renderers share no run token, so
    // neither case is caught anywhere else. The resolution controls are usable
    // during a render, which is what makes the resize case reachable.
    rendererRef.current?.cancelRender();

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    rendererRef.current = new FractalRenderer(canvas, fractalKind);
  }, [canvasWidth, canvasHeight, fractalKind]);

  // Wheel, drag and touch navigation on the canvas. The listeners are attached
  // once and read the live bounds through a ref, so a drag keeps working while
  // the view it drives re-renders.
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  // Put a view the canvas produced into the state the sliders and the renderer
  // read. Both sources of a view (a pointer gesture, a keypress) go through
  // here, so neither can leave the sliders showing a view the canvas is not on.
  // The zoom is clamped because both can ask to go past the sliders' range.
  const applyView = useCallback(
    (view: ZoomState) => {
      const zoom = clampZoom(view.scale);

      // Hand the next step of the gesture the view this one produced, rather
      // than leaving it to the ref the render below would set: a burst of wheel
      // notches arrives faster than React commits, and a step that reads the
      // pre-burst bounds again is a notch the gesture loses.
      boundsRef.current = calculateZoomBounds(view.centerX, view.centerY, zoom);

      setCenterX(view.centerX);
      setCenterY(view.centerY);
      setZoomLevel(zoom);
      setCurrentPreset("");

      // Every view the canvas moves to by hand goes through here — a wheel, a
      // drag, a touch, an arrow key — so each of those restarts the walk's
      // countdown. The walk's own steps come through here too, which is what
      // keeps the cadence going even if a step lands on the view it is already
      // on and draws nothing new.
      wander.notifyActivity();
    },
    [wander],
  );

  // The walk counts down only while the tab is on screen: a background tab has
  // nobody watching the view move, and a browser throttles its timers anyway.
  // Leaving the page stops the walk, so a stray timer cannot outlive it.
  // It is held the same way while a tour plays, since two things choosing the
  // next view would fight; the tour ending gives the walk a fresh interval.
  const tourPlayingRef = useRef(false);
  useEffect(() => {
    const handleVisibilityChange = () =>
      wander.setHidden(document.hidden || tourPlayingRef.current);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    wander.setHidden(document.hidden || tourPlayingRef.current);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wander.stop();
    };
  }, [wander]);

  useEffect(() => {
    tourPlayingRef.current = tourPlaying;
    wander.setHidden(document.hidden || tourPlaying);
  }, [wander, tourPlaying]);

  // What the page believes the browser's history entries for this document are:
  // the fragment each holds, and which one the page is on. The browser keeps
  // the entries; this is the record, so what a jump and a Back did can be read
  // without a browser (see `Journey`).
  const [journey] = useState(() => new Journey());

  // Whether the journey has a step either side, for the top bar's Back and
  // Forward. The journey is a plain object the page mutates, so a render does
  // not follow it by itself: every place that moves it says so here.
  const [historyState, setHistoryState] = useState(() =>
    historyButtons(journey),
  );
  const syncHistoryButtons = useCallback(() => {
    const next = historyButtons(journey);

    setHistoryState((previous) =>
      previous.canGoBack === next.canGoBack &&
      previous.canGoForward === next.canGoForward
        ? previous
        : next,
    );
  }, [journey]);

  // How many links have been put into effect: the one a load carried, a pasted
  // one, and the entries Back and Forward land on. Each is a deliberate move as
  // far as the Nearby strip is concerned, and none is a jump the follower
  // pushes an entry for, so it is counted apart from `jumpSerial`.
  const [linkArrivals, setLinkArrivals] = useState(0);

  // Putting a fragment into effect is one path, taken by both the read at mount
  // and the read on every later change of the fragment. It moves the view
  // through the same setters every control uses, so the canvas, the sliders and
  // the manual coordinate boxes move to the link's view together. The
  // coordinate boxes need no attention here: they resync on the bounds the
  // setters produce, like they do for a preset or a Reset View.
  const applyViewLink = useCallback(
    (fragment: string) => {
      const updates = viewLinkUpdatesFrom(fragment);

      setFractalType(updates.fractalType);
      setVariant(updates.variant);
      setCenterX(updates.centerX);
      setCenterY(updates.centerY);
      setZoomLevel(updates.zoomLevel);
      setColorScheme(updates.colorScheme);
      setAutoIterationsOn(updates.autoIterationsOn);
      setMaxIterations(updates.maxIterations);
      setCanvasWidth(updates.canvasWidth);
      setCanvasHeight(updates.canvasHeight);
      // Settings, not views, are what a preset names: a link is a view, so no
      // preset is selected in the page it opens.
      setCurrentPreset("");
      setLinkArrivals((count) => count + 1);
      wander.notifyActivity();

      // A link can also ask for a tour from the view it describes (`#tour`
      // names none, so it is the opening view). The tour waits for the view to
      // be drawn, and the address bar goes back to following the view.
      if (decodeTour(fragment)) tourMode.hashTour();
    },
    [wander, tourMode],
  );

  // A link is read once, after mount. It is read from the fragment in an effect
  // rather than during render because the first markup is the server's and has
  // no fragment in it; reading `window` while rendering would be a difference
  // between the two that React reports as a hydration mismatch. The guard ref
  // is what makes it *once*: the deps below cannot change, and the ref says so
  // rather than depending on that.
  const linkAppliedRef = useRef(false);
  useEffect(() => {
    if (linkAppliedRef.current) return;
    linkAppliedRef.current = true;

    // The entry the page opened on is the journey's first, whatever it says —
    // an empty fragment included: it is the place Back returns to when the
    // first jump is taken before any render has written the address bar.
    //
    // The address may hold the view in its query instead (a link Copy link
    // wrote: the form a crawler can preview). A hash beats it; otherwise the
    // query's text is read as the fragment, and the bar is rewritten to the hash
    // form at once, so the follower and every later write find the form they
    // have always found. The query is dropped in both cases, since a bar naming
    // one view in its query and another in its hash would preview as the first.
    const link = readLocationLink(window.location.search, window.location.hash);
    if (link.dropQuery) {
      try {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${link.fragment}`,
        );
      } catch {
        // A browser that refuses the write leaves the query in the bar; the
        // view is still read below and the follower writes the hash later.
      }
    }
    journey.replace(link.fragment);
    applyViewLink(link.fragment);
  }, [applyViewLink, journey]);

  // A fragment can also arrive at a page that is already open — a link pasted
  // into the address bar, or a same-document link followed to a different
  // fragment — and neither reloads the document, so the mount effect above
  // never sees it. This event is the only notice, and without it the page keeps
  // the view it has and the next settled render writes that view back over the
  // fragment that was pasted.
  //
  // The fragment is read exactly as a load reads one, `viewLinkUpdatesFrom`,
  // which is the documented answer for a fragment this build cannot read in
  // full: what it carries is applied and the page's opening view stands for the
  // rest, rather than the fragment being ignored and the bar left describing a
  // picture that is not on screen.
  //
  // The browser's Back and Forward arrive here too: they land on an entry a
  // jump made with `pushState` and change the fragment to that entry's, so
  // retracing the journey is the same apply path as a paste and not a second
  // one. The journey is told first, so its record of where the page is stands
  // before the view moves.
  //
  // Nothing the page writes can feed this: `replaceState` and `pushState` fire
  // no `hashchange`, so the only events here are the user's own.
  useEffect(() => {
    const handleHashChange = () => {
      // A navigation is someone being here, even when the browser's own Back
      // button made it and the page saw no input: it ends a tour, and a tour
      // the link asks for is started again below.
      tourMode.stop();
      journey.arrive(window.location.hash);
      syncHistoryButtons();
      applyViewLink(window.location.hash);
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [applyViewLink, journey, syncHistoryButtons, tourMode]);

  // The view as a link, rebuilt whenever anything a link carries moves. Both
  // halves of the feature read it: the effect below writes it to the address
  // bar and the Copy link button hands it over as the URL.
  const currentLink = useMemo(
    () =>
      encodeView({
        fractalType,
        variant,
        centerX,
        centerY,
        zoomLevel,
        colorScheme,
        autoIterationsOn,
        maxIterations,
        canvasWidth,
        canvasHeight,
      }),
    [
      fractalType,
      variant,
      centerX,
      centerY,
      zoomLevel,
      colorScheme,
      autoIterationsOn,
      maxIterations,
      canvasWidth,
      canvasHeight,
    ],
  );

  // When this page last wrote the address bar, in the clock linkWriteDelayMs
  // reads. Zero is "never", which is a first write nothing holds back.
  const lastLinkWriteRef = useRef(0);

  // replaceState, not an assignment to location.hash: the address bar is
  // recording where the user already is, so it is not a place to go back to,
  // and a fragment assignment would reload the page.
  const replaceAddressBar = useCallback((fragment: string) => {
    try {
      window.history.replaceState(null, "", fragment);
    } catch {
      // A browser that refuses the write leaves the address bar behind the
      // view. The link is a convenience; the page does not stop for it.
    }
  }, []);

  // The entry this rewrites is the one the journey is on.
  const writeViewLink = useCallback(
    (fragment: string, nowMs: number) => {
      replaceAddressBar(fragment);
      journey.replace(fragment);
      lastLinkWriteRef.current = nowMs;
    },
    [journey, replaceAddressBar],
  );

  // A jump is a deliberate move to a view the user would want to come back
  // from: a preset, typed coordinates, another fractal or Julia constant. The
  // handlers that make one call `beginJump`, which only counts it. The count is
  // state because the view a jump lands on is not known until the render its
  // setters cause, and a jump that lands on the view already shown causes none:
  // the follower below compares the count with the last one it handled, in the
  // render that follows either way.
  const [jumpSerial, setJumpSerial] = useState(0);
  const handledJumpRef = useRef(0);

  // The entry a jump pushes is the view it lands on, so the entry before it has
  // to hold the view being left. The follower may be holding that write back
  // for the throttle, and the jump's render would cancel it, so the view on
  // screen is written into the current entry before the jump moves anything.
  // A view still being drawn is not on the canvas and is not written.
  const writeLeavingView = () => {
    if (renderedLink !== "" && renderedLink === currentLink) {
      const leaving = `#${currentLink}`;

      if (window.location.hash !== leaving) writeViewLink(leaving, Date.now());
    }
  };

  const beginJump = () => {
    writeLeavingView();
    setJumpSerial((serial) => serial + 1);
  };

  // A tour is one jump that ends where it stops. While it plays the address bar
  // is left alone (the follower below stands down), so the entry the tour began
  // in keeps the view it began on; the end counts as the jump, which makes the
  // one entry for the place on screen then and leaves Back on the view before
  // the tour. Counting it in the render that sees the tour end is the
  // documented alternative to an effect:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [seenTourState, setSeenTourState] = useState(tourState);
  if (seenTourState !== tourState) {
    setSeenTourState(tourState);
    if (seenTourState === "playing") setJumpSerial((serial) => serial + 1);
  }

  // Make a jump's view a history entry of its own.
  const pushViewLink = useCallback(
    (fragment: string, nowMs: number) => {
      if (window.location.hash === fragment) return;

      try {
        window.history.pushState(null, "", fragment);
      } catch {
        // pushState throws in a sandboxed frame or when the browser caps the
        // entries. The view still has to reach the address bar, so it is
        // written over the current entry instead.
        replaceAddressBar(fragment);
      }
      // The journey keeps the step either way: it is the page's own record and
      // works without the browser.
      journey.push(fragment);
      syncHistoryButtons();
      lastLinkWriteRef.current = nowMs;
    },
    [journey, replaceAddressBar, syncHistoryButtons],
  );

  // The Nearby strip's suggestions. They are worked out when a render settles
  // after a deliberate move — a jump or a link arriving — and not on every
  // frame of a drag, which would reshuffle the strip under the pointer; the
  // policy is `nearbyRefreshDue`. The pool is three pages of the strip, and
  // `offset` is the page the More tile has rotated to. Adjusting this state
  // during the render that sees the settle is the documented alternative to an
  // effect that copies one value into another:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [nearby, setNearby] = useState<{
    pool: Place[];
    offset: number;
    refreshedAt: number | null;
  }>({ pool: [], offset: 0, refreshedAt: null });
  const deliberateMoves = jumpSerial + linkArrivals;
  if (
    nearbyRefreshDue({
      settled: renderedLink !== "" && renderedLink === currentLink,
      deliberateMoves,
      refreshedAt: nearby.refreshedAt,
    })
  ) {
    setNearby({
      pool: suggest(
        {
          fractal: fractalType,
          variant,
          centerX,
          centerY,
          zoom: zoomLevel,
        },
        PLACES,
        NEARBY_POOL_SIZE,
      ),
      offset: 0,
      refreshedAt: deliberateMoves,
    });
  }

  // The old picture, held in a second canvas over the first while a flight to
  // a place draws. It is copied from the canvas the moment a tile is chosen and
  // faded out when the new view's full render has been drawn, or when the user
  // moves on from it first. The link the flight is waiting for is what ends it;
  // it is a ref because nothing renders from it, and the overlay's opacity is
  // set on the element for the same reason.
  const crossfadeRef = useRef<HTMLCanvasElement>(null);
  const crossfadeTargetRef = useRef<string | null>(null);
  // How long the fade being waited for takes: a tile's, or the slower tour's.
  const crossfadeMsRef = useRef(CROSSFADE_MS);

  const startCrossfade = (targetLink: string, durationMs = CROSSFADE_MS) => {
    const overlay = crossfadeRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    overlay.width = canvas.width;
    overlay.height = canvas.height;
    overlay.getContext("2d")?.drawImage(canvas, 0, 0);
    overlay.style.transition = "none";
    overlay.style.opacity = "1";
    crossfadeTargetRef.current = targetLink;
    crossfadeMsRef.current = durationMs;
  };

  useEffect(() => {
    const target = crossfadeTargetRef.current;
    if (target === null) return;
    // Still waiting: the flight's view is the one on the way and has not been
    // drawn. Anything else — it has been, or the view moved off it — ends it.
    if (currentLink === target && renderedLink !== target) return;

    crossfadeTargetRef.current = null;
    const overlay = crossfadeRef.current;
    if (!overlay) return;

    overlay.style.transition = `opacity ${crossfadeMsRef.current}ms ease-out`;
    overlay.style.opacity = "0";
  }, [currentLink, renderedLink]);

  // Whether the picture the canvas holds is nearly one colour, as the link of
  // the view it was found blank on. Held as a link rather than a flag so a view
  // that has moved on never shows the hint of the one it left. It is asked only
  // of a full render that has settled on the view, and only after the picture
  // has stood for BLANK_HINT_DELAY_MS, so the end of a crossfade or a flicker
  // between two renders never shows it. The cleanup clears it the moment a
  // gesture or a render starts, and the delay starts over when the next one
  // settles.
  const [blankLink, setBlankLink] = useState<string | null>(null);

  useEffect(() => {
    if (isRendering || renderedLink === "" || renderedLink !== currentLink) {
      return;
    }

    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      const blank = canvas ? canvasIsBlank(canvas) : null;
      setBlankLink(blank ? currentLink : null);
    }, BLANK_HINT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      setBlankLink(null);
    };
  }, [isRendering, renderedLink, currentLink]);

  // The address bar follows the view — an auto-wander step, a control, a wheel,
  // a preset, a link — but only once that view has been drawn, which is also
  // what keeps a drag from rewriting it while the gesture is still moving.
  //
  // A playing tour leaves the address bar alone: it hops between places nobody
  // chose, and the entry the tour began in has to keep the view before it.
  useEffect(() => {
    if (tourPlaying) return;
    if (currentLink !== renderedLink) return;

    const next = `#${currentLink}`;
    const now = Date.now();

    // A jump is written the moment its view has been drawn, as a new entry and
    // without waiting out the throttle: it is one write per deliberate move,
    // and held back it would take in the gesture that follows.
    if (jumpSerial !== handledJumpRef.current) {
      handledJumpRef.current = jumpSerial;
      pushViewLink(next, now);
      return;
    }

    if (
      shouldWriteLink(window.location.hash, next, now, lastLinkWriteRef.current)
    ) {
      writeViewLink(next, now);
      return;
    }

    // Held back by the interval rather than having nothing to say, so the write
    // waits: a view that moves again first clears this timer and starts a new
    // one, which is what leaves a gesture's own view in the address bar.
    if (window.location.hash !== next) {
      const timer = window.setTimeout(
        () => {
          const at = Date.now();

          // The address bar may have caught up by itself by now — Copy link
          // writes it the moment it is clicked — so the question is asked again.
          if (
            shouldWriteLink(
              window.location.hash,
              next,
              at,
              lastLinkWriteRef.current,
            )
          ) {
            writeViewLink(next, at);
          }
        },
        linkWriteDelayMs(now, lastLinkWriteRef.current),
      );

      return () => window.clearTimeout(timer);
    }
  }, [
    currentLink,
    renderedLink,
    jumpSerial,
    pushViewLink,
    writeViewLink,
    tourPlaying,
  ]);

  // What the Copy link button last did: the confirmation a clipboard gave, or
  // the field a browser without one gets instead. The manual half carries the
  // URL it offers along with the view that URL is of.
  const [copy, setCopy] = useState<CopyState>({ kind: "idle" });
  const copyFieldRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  // The offer belongs to the view it names. The address bar moves on while the
  // field sits there — a wheel, a drag, a step of the walk — and a URL left
  // behind by a view that is no longer on screen is a link to the wrong place.
  // Taking it away in the render that sees the new view is the documented
  // alternative to a sync effect:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (copy.kind === "manual" && copy.link !== currentLink) {
    setCopy({ kind: "idle" });
  }

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  // A field that appears because somebody asked to copy is no use unless the
  // URL is already selected, so it selects itself as it arrives. Selecting an
  // input focuses it.
  useEffect(() => {
    if (copy.kind === "manual") copyFieldRef.current?.select();
  }, [copy]);

  const handleCopyLink = useCallback(() => {
    // The link is the view on screen, however far behind it the follower above
    // happens to be, so the address bar is brought up to date first. What is
    // copied is not the bar, though: it is the same text as a query on this
    // origin and path, because a crawler sees a query and never a fragment, so
    // only that form previews as the view. The page reads either form.
    writeViewLink(`#${currentLink}`, Date.now());
    const url = copyLinkUrl(
      window.location.origin,
      window.location.pathname,
      currentLink,
    );

    // Nothing selected by hand is needed when the clipboard takes the URL; a
    // browser without the API, or one that refuses the write, gets the URL in a
    // field to copy from instead of a button that did nothing.
    const offerToSelect = () =>
      setCopy({ kind: "manual", link: currentLink, url });

    const clipboard = navigator.clipboard;
    if (!clipboard) {
      offerToSelect();
      return;
    }

    clipboard.writeText(url).then(() => {
      setCopy({ kind: "copied" });
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(
        () => setCopy({ kind: "idle" }),
        LINK_COPIED_MS,
      );
    }, offerToSelect);
  }, [currentLink, writeViewLink]);

  // Whether the help overlay is up. The Help button and the `?` key both set
  // it, so the two ways in are one piece of state rather than two.
  const [helpOpen, setHelpOpen] = useState(false);

  // Whether the Settings drawer is up, and the button that opens it, which the
  // drawer hands focus back to on close. Opening it touches no view state and
  // starts no render, so a draw in flight carries on behind it.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);

  // Whether the Math card is up, and the top bar button that toggles it. The
  // card reads the fractal, the variant and the view the renderer draws, and
  // holds nothing of its own but whether it is shown and expanded, which the
  // mathCard store keeps in localStorage. It starts shown, collapsed.
  const { open: mathOpen, expanded: mathExpanded } = useSyncExternalStore(
    subscribeToMathCard,
    getMathCardSnapshot,
    getServerMathCardSnapshot,
  );
  const mathButtonRef = useRef<HTMLButtonElement>(null);
  // The Math card's panel, which the probe watches for the pointer leaving the
  // picture onto it. The card puts the element here as it mounts.
  const mathCardPanelRef = useRef<HTMLElement | null>(null);
  const closeMath = useCallback(() => setMathCardOpen(false), []);
  const toggleMath = useCallback(
    () => setMathCardOpen(!getMathCardSnapshot().open),
    [],
  );

  // `?` opens the help from anywhere on the page, not only from the canvas,
  // which is what the canvas-local arrow handlers cannot do. The decision is
  // `opensHelpShortcut`'s so it can be tested without a browser: a `?` typed
  // into a field belongs to the field, and a modifier means another command.
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const opens = opensHelpShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTagName: target?.tagName ?? "",
        targetIsContentEditable: target?.isContentEditable ?? false,
      });
      if (!opens) return;

      // Chrome's quick-find opens on `?` by default and would cover the page.
      event.preventDefault();
      setHelpOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Arrow keys pan the view and `+`/`-` zoom it, for a user who cannot use a
  // pointer. The keys are read off the canvas itself, so they only move the
  // view while the canvas has focus and Tab still reaches every control.
  const handleCanvasKeyDown = (
    event: ReactKeyboardEvent<HTMLCanvasElement>,
  ) => {
    const next = keyNavigationBounds(event.key, bounds);
    if (!next) return;

    // An arrow key would otherwise scroll the page under the focused canvas,
    // moving the view out of sight.
    event.preventDefault();

    applyView(boundsToView(next));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const manager = new ZoomPanManager(
      canvasWidth,
      canvasHeight,
      boundsRef.current,
    );

    return attachCanvasNavigation(
      canvas,
      manager,
      () => boundsRef.current,
      applyView,
      {
        onGestureStart: () => {
          renderPolicy.beginGesture();

          // A full-resolution pass that is already running is drawing the view
          // the user is leaving. Stop it, or it keeps painting stale rows over
          // the previews, and remember that the canvas now owes a full render
          // in case this gesture ends without moving anything.
          const renderer = rendererRef.current;
          if (renderer?.isCurrentlyRendering()) {
            renderer.cancelRender();
            renderPolicy.invalidate();
          }
        },
        onGestureEnd: () => {
          if (renderPolicy.endGesture()) {
            setFullRenderNonce((nonce) => nonce + 1);
          }
        },
      },
    );
  }, [canvasWidth, canvasHeight, renderPolicy, applyView]);

  // Redraw whenever the view, the rendering parameters, the fractal or the
  // canvas size change, at whatever quality the policy decides. A gesture's
  // steps come back as previews, so dragging or wheeling never runs a
  // full-resolution pass per pointer move; the nonce brings back one
  // full-quality render of the view the gesture settled on.
  useEffect(() => {
    drawCanvas(renderPolicy.requestRender(), currentLink);
    // fullRenderNonce is the trigger for the render a finished gesture owes,
    // and fractalKind for the render a new kind needs, not values the draw
    // itself reads: the draw reaches the renderer the effect above rebuilt.
    // currentLink is the view spelled as a link, which the draw hands back when
    // it finishes; a view whose link has moved on since is one this draw is no
    // longer about.
  }, [
    drawCanvas,
    renderPolicy,
    canvasWidth,
    canvasHeight,
    fullRenderNonce,
    fractalKind,
    currentLink,
  ]);

  // Helper functions for manual coordinate input
  const applyManualCoordinates = () => {
    const checked = checkManualBounds({
      minReal: manualValue("minReal", bounds.minReal),
      maxReal: manualValue("maxReal", bounds.maxReal),
      minImaginary: manualValue("minImaginary", bounds.minImaginary),
      maxImaginary: manualValue("maxImaginary", bounds.maxImaginary),
    });

    if (!checked.ok) {
      setManualMessage({ kind: "error", text: checked.messages.join(" ") });
      return;
    }

    // Calculate center and zoom from manual bounds
    const view = boundsToView(checked.bounds);

    beginJump();
    setCenterX(view.centerX);
    setCenterY(view.centerY);
    setZoomLevel(view.scale);
    setCurrentPreset("");
    // A box of another shape is fitted to the view rather than refused — the
    // width is what survives, around the box's own centre — and the panel says
    // so, because nothing on screen would show what happened to the rest.
    setManualMessage(
      hasBaseAspect(checked.bounds)
        ? null
        : { kind: "note", text: MANUAL_FITTED_MESSAGE },
    );
    wander.notifyActivity();
  };

  // Put a view on screen without touching anything else. Both ways of choosing
  // a fractal go through here, so neither can leave the sliders showing a view
  // the canvas is not on.
  const applyDefaultView = (typeId: string) => {
    const view = defaultViewFor(typeId);

    setCenterX(view.centerX);
    setCenterY(view.centerY);
    setZoomLevel(view.zoom);
    setCurrentPreset("");

    // Choosing another fractal is also a manual move: the walk carries on from
    // the new fractal's own default view rather than stopping.
    wander.notifyActivity();
  };

  // The page holds one variant across fractals, so going to a fractal that
  // takes one (Julia, the Multibrot) brings a value it can draw: the one held
  // if that fits, else the fractal's own default.
  const handleFractalTypeChange = (typeId: string) => {
    beginJump();
    setFractalType(typeId);
    setVariant(variantOn(typeId, variant));
    applyDefaultView(typeId);
  };

  // Another variant is another picture, framed the same way: a Julia set is
  // symmetric about the origin whatever its c, and one frame holds all three
  // Multibrot powers.
  const handleVariantChange = (name: string) => {
    setVariant(name);
    applyDefaultView(fractalType);
  };

  // The select is the deliberate act, so picking a constant from it is a jump;
  // typing a point into the Real and Imaginary boxes is not. That edit fires on
  // every readable keystroke and goes to `handleVariantChange` directly,
  // refining the view the way a drag does instead of leaving an entry behind
  // for each digit.
  //
  // The select's Custom option. It starts from the point the picture is
  // already drawn with, so choosing it changes the controls and not the
  // picture: the constant is the same, only spelled as a custom name, and the
  // view stays where it was.
  const handleVariantSelect = (value: string) => {
    if (value !== CUSTOM_OPTION_VALUE) {
      beginJump();
      handleVariantChange(value);
      return;
    }
    if (isCustomJuliaConstant(variant)) return;

    const point = parseJuliaConstant(variant);
    const name = point && customConstantName(point.real, point.imaginary);
    if (name === null || name === undefined) return;

    setVariant(name);
    wander.notifyActivity();
  };

  // Typing in either box. A readable pair goes to the same handler the select
  // uses; anything else says why and leaves the constant, and so the picture,
  // as it was.
  const editJuliaInput = (field: "real" | "imaginary", text: string) => {
    const realText = field === "real" ? text : juliaRealText;
    const imaginaryText = field === "imaginary" ? text : juliaImaginaryText;

    if (field === "real") setJuliaRealText(text);
    else setJuliaImaginaryText(text);

    const result = parseCustomConstantInput(realText, imaginaryText);
    if ("error" in result) {
      setJuliaInputError(result.error);
      return;
    }

    setJuliaInputError(null);
    // The same point written another way ("0.50" for "0.5") is not a new
    // constant, and a new constant would reframe the view.
    if (result.constant === variant) return;
    setSyncedVariant(result.constant);
    handleVariantChange(result.constant);
  };

  const resetToDefault = () => {
    applyDefaultView(fractalType);
    setMaxIterations(100);
    setAutoIterationsOn(true);
    setColorScheme("classic");
  };

  // Export sizes: the screen size saves the canvas on screen, and a larger one
  // draws the same view again on a canvas of its own. The Shape select says
  // what the picture is shaped like: the screen's own 4:3, whose sizes follow
  // the canvas, or a wallpaper shape at one of its published pixel sizes.
  const [exportShapeId, setExportShapeId] = useState(SCREEN_SHAPE_ID);
  const exportShape = exportShapeFor(exportShapeId);

  // The list the Export size select shows. It follows the canvas size for the
  // screen and the shape for a wallpaper, and the selection falls back to the
  // list's first entry in the render that sees a new list — because a <select>
  // whose value is not among its options paints blank, and switching shape
  // changes every option there is.
  const exportSizeOptions = useMemo<ExportSizeOption[]>(() => {
    if (exportShape.id !== SCREEN_SHAPE_ID) {
      return exportShape.sizes.map((size) => ({
        kind: "wallpaper",
        key: `${size.width}x${size.height}`,
        label: `${size.width} x ${size.height}`,
        shape: exportShape,
        width: size.width,
        height: size.height,
      }));
    }

    return exportSizes(canvasWidth, canvasHeight).map((size) => ({
      kind: "canvas",
      key: String(size.scale),
      label: size.label,
      scale: size.scale,
      width: size.width,
      height: size.height,
    }));
  }, [exportShape, canvasWidth, canvasHeight]);

  const [exportSizeKey, setExportSizeKey] = useState("1");
  if (!exportSizeOptions.some((option) => option.key === exportSizeKey)) {
    setExportSizeKey(exportSizeOptions[0].key);
  }
  const exportSize =
    exportSizeOptions.find((option) => option.key === exportSizeKey) ??
    exportSizeOptions[0];

  // What the export panel is doing: nothing, a picture still being drawn, or a
  // short message about one that could not be.
  const [exportState, setExportState] = useState<
    | { kind: "idle" }
    | { kind: "running"; progress: number }
    | { kind: "error"; text: string }
  >({ kind: "idle" });

  // The export's own renderer and canvas, held so Cancel has something to stop
  // and the memory can be handed back once the picture is done with.
  const exportRendererRef = useRef<FractalRenderer | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Which export is the current one. Cancel moves it on, so a render that
  // finishes afterwards is a picture nobody is waiting for.
  const exportTokenRef = useRef(0);
  // When the button's text last changed, for the progress throttle.
  const exportReportedAtRef = useRef(0);

  const releaseExport = useCallback(() => {
    const canvas = exportCanvasRef.current;

    exportRendererRef.current = null;
    exportCanvasRef.current = null;

    // Dropping the last reference frees the renderer's image buffer; shrinking
    // the canvas is what frees the canvas's own copy of it.
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }, []);

  // Draw a picture on a canvas of its own and save it: a size larger than the
  // canvas on screen, or a wallpaper at a shape of its own. The canvas on
  // screen is neither read nor resized, so it keeps its size and its content,
  // and the page goes on responding while this draws — the two renders are
  // separate renderers, and the view, the fractal and the settings are the
  // ones captured in the job, when the export was asked for.
  const runExport = useCallback(
    async (job: ExportJob) => {
      const config: FractalConfig = {
        bounds: job.bounds,
        maxIterations: effectiveMaxIterations,
        width: job.width,
        height: job.height,
        colorScheme,
      };

      const token = ++exportTokenRef.current;
      const canvas = document.createElement("canvas");

      let renderer: FractalRenderer;
      try {
        canvas.width = job.width;
        canvas.height = job.height;
        renderer = new FractalRenderer(canvas, fractalKind);
      } catch (error) {
        // A canvas that big can be refused: no drawing context, or no memory
        // for the image buffer behind it. Nothing has been drawn or saved, so
        // the page stays exactly as it is and says why.
        console.error("Error creating export canvas:", error);
        setExportState({ kind: "error", text: EXPORT_FAILED_MESSAGE });
        return;
      }

      exportRendererRef.current = renderer;
      exportCanvasRef.current = canvas;
      exportReportedAtRef.current = 0;
      setExportState({ kind: "running", progress: 0 });

      const onProgress = (value: number) => {
        if (token !== exportTokenRef.current) return;

        const now = Date.now();
        if (!exportProgressDue(now, exportReportedAtRef.current)) return;

        exportReportedAtRef.current = now;
        setExportState({ kind: "running", progress: value });
      };

      try {
        await renderer.renderFractal(config, onProgress);
      } catch (error) {
        console.error("Error rendering export:", error);
        releaseExport();
        setExportState({ kind: "error", text: EXPORT_FAILED_MESSAGE });
        return;
      }

      // Cancel has already moved the token on and put the panel back to idle.
      // A picture that arrives after that is one nobody asked for: it is
      // dropped rather than saved.
      if (token !== exportTokenRef.current) return;

      saveCanvasPng(canvas, job.name, (saved) => {
        // A save cancelled while the browser was making the blob is one
        // nobody is waiting for, and the canvas has gone back already.
        if (token !== exportTokenRef.current) return;

        releaseExport();
        setExportState(
          saved
            ? { kind: "idle" }
            : { kind: "error", text: EXPORT_FAILED_MESSAGE },
        );
      });
    },
    [effectiveMaxIterations, colorScheme, fractalKind, releaseExport],
  );

  const handleCancelExport = useCallback(() => {
    // Take the token first. The render is between checkpoints, and the
    // progress it would otherwise report — or the picture it would otherwise
    // hand over — belongs to nobody once the user has said stop.
    exportTokenRef.current++;
    exportRendererRef.current?.cancelRender();
    releaseExport();
    setExportState({ kind: "idle" });
  }, [releaseExport]);

  // Save what is on the canvas, or draw and save a version of it elsewhere: a
  // larger multiple of the canvas, or a shape of its own. The canvas holds the
  // render at its full pixel size, so a screen-size save is the image the user
  // is looking at rather than a screenshot of the page around it, named
  // exactly as this button has always named it.
  const handleDownload = useCallback(() => {
    if (exportState.kind === "running") return;

    const baseName = downloadFileName(centerX, centerY, zoomLevel, fractalType);

    if (exportSize.kind === "canvas" && exportSize.scale === 1) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Whatever the last export had to say is about that export, not this
      // save.
      setExportState({ kind: "idle" });

      // A canvas can decline to produce an image. There is nothing to save
      // then, and the page carries on as before.
      saveCanvasPng(canvas, baseName, () => {});
      return;
    }

    // A canvas multiple draws the view the canvas has, to the pixel; a
    // wallpaper draws the frame its shape asks for, which contains that view
    // and is drawn at the same iteration count and in the same colours.
    void runExport({
      width: exportSize.width,
      height: exportSize.height,
      bounds:
        exportSize.kind === "canvas"
          ? bounds
          : exportFrame(
              centerX,
              centerY,
              zoomLevel,
              exportSize.width / exportSize.height,
            ),
      name:
        exportSize.kind === "canvas"
          ? exportFileName(baseName, exportSize.scale)
          : wallpaperFileName(
              baseName,
              exportSize.shape,
              exportSize.width,
              exportSize.height,
            ),
    });
  }, [
    exportState.kind,
    exportSize,
    bounds,
    centerX,
    centerY,
    zoomLevel,
    fractalType,
    runExport,
  ]);

  // The screen-size save reads the canvas on screen, so it waits for the render
  // drawing there; an export draws a canvas of its own and is not held back by
  // one. Both wait for an export already running, because there is one button
  // and one export at a time.
  const exporting = exportState.kind === "running";
  const savesCanvas = exportSize.kind === "canvas" && exportSize.scale === 1;
  const downloadDisabled = exporting || (savesCanvas && isRendering);

  // An export left running when the page goes away has nobody to hand its
  // picture to, so it is stopped along with the rest of the page's work.
  useEffect(
    () => () => {
      exportTokenRef.current++;
      exportRendererRef.current?.cancelRender();
    },
    [],
  );

  // Preset handlers
  const handlePresetSelect = (preset: FractalPreset) => {
    // Calculate center and zoom from preset bounds
    const view = boundsToView(preset.bounds);

    beginJump();

    // A view belongs to a fractal, and loading it puts the picker back on that
    // fractal — for a view of a fractal that takes one, on its variant too —
    // before the view itself. The bounds mean nothing without the picture they
    // were framed on.
    const fractal = presetFractal(preset) ?? DEFAULT_PRESET_FRACTAL;
    setFractalType(fractal);
    if (fractalVariants(fractal) !== null) setVariant(presetVariant(preset));

    setCenterX(view.centerX);
    setCenterY(view.centerY);
    setZoomLevel(view.scale);
    setMaxIterations(preset.maxIterations);
    // The preset was framed at its own iteration count, so it renders the way
    // its author saved it rather than at whatever the zoom would pick.
    setAutoIterationsOn(false);
    setColorScheme(preset.colorScheme);
    setCanvasWidth(preset.canvasWidth);
    setCanvasHeight(preset.canvasHeight);
    setCurrentPreset(preset.id);
    wander.notifyActivity();
  };

  // A tile in the Nearby strip: go to the place. It is a deliberate move like a
  // preset, through the same setters, so the sliders, the manual coordinates
  // and the address bar follow it. The place is drawn at the iteration count
  // Auto picks for its zoom, which is the count its catalogue entry was chosen
  // at, and in the scheme `placeColorScheme` gives, the one its tile was drawn
  // in. The link it will settle on is
  // worked out first: a place that is already the view changes nothing, and a
  // crossfade waiting for a render that never comes would hold the old picture
  // on screen.
  //
  // A tour's hop is the same flight with two differences: the fade takes
  // `TOUR_CROSSFADE_MS`, and it is no jump — it counts nothing and writes
  // nothing, because the tour's end is the jump (see `seenTourState`).
  //
  // An Auto-wander hop is the tile's flight with the tile's crossfade and the
  // entry rewritten instead of added (`replace`), since the walk, like a drift,
  // is not a place the visitor went.
  const handlePlaceSelect = (
    place: Place,
    {
      tour = false,
      replace = tour,
    }: { tour?: boolean; replace?: boolean } = {},
  ) => {
    const zoom = clampZoom(place.zoom);
    const scheme = placeColorScheme(place, colorScheme);
    // A place of a fractal with a variant names its own; one that names none
    // (a hand-built Julia place) keeps the page's, or the fractal's default
    // when the page holds a variant of another fractal.
    const placeVariant = variantOn(place.fractal, place.variant ?? variant);
    const target = encodeView({
      fractalType: place.fractal,
      variant: placeVariant,
      centerX: place.centerX,
      centerY: place.centerY,
      zoomLevel: zoom,
      colorScheme: scheme,
      autoIterationsOn: true,
      maxIterations,
      canvasWidth,
      canvasHeight,
    });
    if (target === currentLink) return;

    startCrossfade(target, tour ? TOUR_CROSSFADE_MS : CROSSFADE_MS);
    if (!replace) beginJump();

    setFractalType(place.fractal);
    if (fractalVariants(place.fractal) !== null) setVariant(placeVariant);
    setCenterX(place.centerX);
    setCenterY(place.centerY);
    setZoomLevel(zoom);
    setColorScheme(scheme);
    setAutoIterationsOn(true);
    setCurrentPreset("");
    wander.notifyActivity();
  };

  // Surprise me: a place picked at random from the ones the strip would lead
  // with, reached the way a tile is — `handlePlaceSelect` — so it has the same
  // crossfade and makes one history entry. The view is read at the press, so a
  // second press right after the first starts from the place the first chose
  // and cancels its render the way any other move does. The button is disabled
  // when nothing is near enough to offer.
  const placeView = {
    fractal: fractalType,
    variant,
    centerX,
    centerY,
    zoom: zoomLevel,
  };
  const canSurprise = surpriseTarget(placeView, PLACES, () => 0) !== null;

  const handleSurprise = () => {
    const target = surpriseTarget(placeView, PLACES);
    if (target) handlePlaceSelect(target);
  };

  // The fractal switcher's buttons. A switch ends in the same state as the
  // Fractal select's — the new fractal, its view, its colours — but it goes
  // there as a place, through the tile's handler, so it has the crossfade, the
  // place's own scheme and constant, and the one history entry that lets Back
  // return to where the click was made. The fractal already shown is a no-op.
  const handleSwitchFractal = (typeId: string) => {
    if (typeId === fractalType) return;
    handlePlaceSelect(featuredPlace(typeId));
  };

  // A named chip (a Julia constant, a Multibrot power) goes to the whole of that
  // variant's set when the catalogue has it (every chip does) and otherwise only
  // changes the variant, leaving the view where it is.
  const handleSwitchVariant = (name: string) => {
    if (name === variant) return;

    const whole = wholeSetPlaceFor(name, fractalType);
    if (whole) {
      handlePlaceSelect(whole);
      return;
    }

    beginJump();
    setVariant(name);
    wander.notifyActivity();
  };

  // Custom is the Settings select's own pick, then the drawer, with focus to go
  // to the Real box once it is open (`focusJuliaRealRef`, read by the effect
  // below). Choosing Custom moves no view and starts no render.
  const juliaRealInputRef = useRef<HTMLInputElement>(null);
  const focusJuliaRealRef = useRef(false);
  const handleSwitchCustom = () => {
    handleVariantSelect(CUSTOM_OPTION_VALUE);
    focusJuliaRealRef.current = true;
    setSettingsOpen(true);
  };

  // The drawer's own effect has already shown the dialog and focused its Close
  // button by now (a child's effects run before its parent's), and the Real box
  // is in the same commit, so this is the last word on where focus lands.
  useEffect(() => {
    if (!settingsOpen || !focusJuliaRealRef.current) return;

    focusJuliaRealRef.current = false;
    juliaRealInputRef.current?.focus();
  }, [settingsOpen]);

  // What a hop of the tour does: ask the engine for the next place, from where
  // the tour is, and go there the way a tile does. The first hop of a tour also
  // writes the view being left into the address bar, which is what lets `#tour`
  // (and `tour=1`) leave the bar, and what keeps Back on the view before the
  // tour. Handed to the clock after every render, because the clock is built
  // once and the view moves under it.
  useEffect(() => {
    tourMode.setHopHandler((first) => {
      if (first || tourEngineRef.current === null) {
        writeLeavingView();
        tourEngineRef.current = initialTourState(placeView);
      }

      const { place, state } = nextTourStop(
        tourEngineRef.current,
        PLACES,
        Math.random,
      );
      tourEngineRef.current = state;
      handlePlaceSelect(place, { tour: true });
    });
  });

  // What the clock needs to know about the page. A tour starts over a settled
  // picture only — a full render has drawn the view on screen — and never over
  // the drawer or the help.
  const tourSettled =
    !isRendering && renderedLink !== "" && renderedLink === currentLink;
  useEffect(() => {
    tourMode.setConditions({ settled: tourSettled });
  }, [tourMode, tourSettled]);

  // What one step of Auto-wander does. A drift takes a small step from the view
  // on screen with the fractal on screen and puts it up the way any other view
  // change does. A hop asks the tour engine for the next place, from where the
  // walk is now, and goes there the way a tile does, but rewriting the history
  // entry rather than adding one. Handed to the controller after every render,
  // because the controller is built once and the kind and the view move under
  // it. It is declared before the effect that reports a settled picture, so the
  // controller's blank-picture hop runs the handler of the render it sees.
  useEffect(() => {
    wander.setStepHandler(({ hop }) => {
      if (hop) {
        const { place, state } = nextTourStop(
          {
            ...(wanderHopRef.current ?? initialTourState(placeView)),
            view: placeView,
          },
          PLACES,
          rng,
        );
        wanderHopRef.current = state;
        handlePlaceSelect(place, { replace: true });
        // A hop onto the view already shown draws nothing, and the next
        // countdown is armed by a render; arm it here as a drift does.
        wander.notifyActivity();
        return;
      }

      const view = boundsToView(boundsRef.current);
      const next = nextWanderView(
        { centerX: view.centerX, centerY: view.centerY, zoom: view.scale },
        fractalKind,
        fractalType,
        rng,
      );

      applyView({
        centerX: next.centerX,
        centerY: next.centerY,
        scale: next.zoom,
      });
    });
  });

  // A drift that has settled on a blank picture is replaced at once by a hop.
  useEffect(() => {
    if (tourSettled) wander.notifySettled();
  }, [wander, tourSettled]);

  const tourOverlayOpen = settingsOpen || helpOpen;
  useEffect(() => {
    tourMode.setConditions({ overlayOpen: tourOverlayOpen });
  }, [tourMode, tourOverlayOpen]);

  // The Math probe: the number under the pointer, what its orbit did and the
  // colour the picture paints it, which the expanded card shows. It runs only
  // while that card is on screen — collapsed, hidden by a tour or a dialog, or
  // closed, nothing is listened for and nothing is computed — and it works out
  // one point per animation frame at most, so a pointer flooding events is
  // never inside a pointer handler and never sits between the renderer's rows.
  const probeLive =
    mathOpen && mathExpanded && !tourPlaying && !tourOverlayOpen;
  const [probe, setProbe] = useState<PointProbe | null>(null);
  // Where the pointer last was, in CSS pixels. Kept across a change of view so
  // that a picture moving under a resting pointer re-reads the same place, and
  // dropped when the pointer leaves the picture or the probe stops.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!probeLive) {
      pointerRef.current = null;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const run = () => {
      const at = pointerRef.current;
      if (!at) return;

      const next = probeAtPointer(
        fractalKind,
        at.x,
        at.y,
        canvas.getBoundingClientRect(),
        canvas.width,
        canvas.height,
        bounds,
        effectiveMaxIterations,
        colorScheme,
      );
      if (next) setProbe(next);
    };

    const throttle = createFrameThrottle(run);

    // The one way the probe ends: the point is forgotten so nothing re-reads
    // it, the frame it was waiting for is dropped, and the card loses it.
    const clearProbe = () => {
      pointerRef.current = null;
      throttle.cancel();
      setProbe(null);
    };
    const handleMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      throttle.request();
    };
    const handleLeave = (event: PointerEvent) => {
      // A finger lifting is the touch ending, not a pointer moving away: the
      // point it was on stays up to be read. A mouse or a pen leaving the
      // picture clears the probe, unless it has moved onto the Math card,
      // where the plot and its Play control are — the probe holds there so
      // they can be reached.
      if (event.pointerType === "touch") return;
      if (!shouldClearProbe(event.relatedTarget, [mathCardPanelRef.current])) {
        return;
      }

      clearProbe();
    };
    // The other half of the crossing: a pointer that goes from the card back
    // onto the picture keeps the probe and resumes live probing on the next
    // move; one that leaves the card for anywhere else ends it.
    const handleCardLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!shouldClearProbe(event.relatedTarget, [canvas])) return;

      clearProbe();
    };

    const panel = mathCardPanelRef.current;
    canvas.addEventListener("pointermove", handleMove, { passive: true });
    canvas.addEventListener("pointerdown", handleMove, { passive: true });
    canvas.addEventListener("pointerleave", handleLeave);
    panel?.addEventListener("pointerleave", handleCardLeave);

    // A view that has moved under a resting pointer reports no move of its
    // own, and the ref still holds where the pointer was, so read that place
    // in the new view rather than waiting for the pointer to stir.
    if (pointerRef.current) throttle.request();

    return () => {
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointerdown", handleMove);
      canvas.removeEventListener("pointerleave", handleLeave);
      panel?.removeEventListener("pointerleave", handleCardLeave);
      throttle.cancel();
    };
  }, [probeLive, fractalKind, bounds, effectiveMaxIterations, colorScheme]);

  // The Auto-wander pill's one-time offer to a visitor who has not found it.
  const wanderNudge = useWanderNudge({
    wanderOn,
    tourPlaying,
    overlayOpen: tourOverlayOpen,
  });

  // What only the browser knows: whether the tab is showing, whether the window
  // has focus, whether a field has it, and whether anyone is here. Input on the
  // window, in the capture phase, so nothing on the page can keep it from being
  // seen. The first report also starts the idle wait.
  useEffect(() => {
    let lastPointer: { x: number; y: number } | null = null;

    const handleActivity = (event: Event) => {
      if (event.type === "pointermove") {
        const { clientX, clientY } = event as PointerEvent;
        const moved = pointerMoved(lastPointer, clientX, clientY);

        lastPointer = { x: clientX, y: clientY };
        // The page under a resting pointer changing is not someone.
        if (!moved) return;
      }
      // A key held down before the tour began repeats into it.
      if ((event as KeyboardEvent).repeat && tourMode.state === "playing") {
        return;
      }

      tourMode.activity();
    };

    const reportTab = () =>
      tourMode.setConditions({
        tabHidden: document.visibilityState !== "visible",
      });
    const reportFocus = (focused: boolean) =>
      tourMode.setConditions({ windowFocused: focused });
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;

      tourMode.setConditions({
        inputFocused: isTextEntry(
          target?.tagName ?? "",
          target?.isContentEditable ?? false,
        ),
      });
    };
    const handleFocusOut = () =>
      tourMode.setConditions({ inputFocused: false });
    const handleWindowFocus = () => reportFocus(true);
    const handleWindowBlur = () => reportFocus(false);

    for (const name of TOUR_ACTIVITY_EVENTS) {
      window.addEventListener(name, handleActivity, {
        capture: true,
        passive: true,
      });
    }
    document.addEventListener("visibilitychange", reportTab);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);

    reportTab();
    reportFocus(document.hasFocus());
    const active = document.activeElement as HTMLElement | null;
    tourMode.setConditions({
      inputFocused: isTextEntry(
        active?.tagName ?? "",
        active?.isContentEditable ?? false,
      ),
    });

    return () => {
      for (const name of TOUR_ACTIVITY_EVENTS) {
        window.removeEventListener(name, handleActivity, { capture: true });
      }
      document.removeEventListener("visibilitychange", reportTab);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      tourMode.dispose();
    };
  }, [tourMode]);

  // Keep the screen on while a tour plays, as best the browser allows.
  useEffect(() => {
    if (!tourPlaying) return;

    return holdScreenAwake(
      "wakeLock" in navigator ? navigator.wakeLock : undefined,
      document,
    );
  }, [tourPlaying]);

  const handleNearbyMore = () => {
    setNearby((previous) => ({
      ...previous,
      offset: nextNearbyOffset(previous.pool.length, previous.offset),
    }));
  };

  // Back and Forward are the browser's own. The change of fragment they cause
  // arrives at the `hashchange` listener, which is the one path that puts a
  // link into effect, so there is nothing more to do here.
  const handleBack = () => window.history.back();
  const handleForward = () => window.history.forward();

  const handleCenterChange = (newCenterX: number, newCenterY: number) => {
    setCenterX(newCenterX);
    setCenterY(newCenterY);
    setCurrentPreset(""); // Clear preset when manually adjusting
    wander.notifyActivity();
  };

  const handlePresetsChange = () => {
    // Force re-render when presets change
    setCurrentPreset((prev) => prev);
  };

  // Clear preset when manually adjusting parameters
  const handleParameterChange = (updateFn: () => void) => {
    updateFn();
    setCurrentPreset("");
  };

  // A control that moves the view by hand. It does what a gesture does — the
  // preset goes, the walk gets a fresh interval — so a magnified view reached
  // with the buttons behaves like one reached with the wheel.
  const handleViewChange = (updateFn: () => void) => {
    updateFn();
    setCurrentPreset("");
    wander.notifyActivity();
  };

  const handleWanderChange = (enabled: boolean) => {
    setWanderOn(enabled);
    if (enabled) {
      wander.start();
    } else {
      wander.stop();
    }
  };

  // An entry the walk cannot use — empty, fractional, outside the range — is
  // shown as typed and ignored, so the last good interval stays in force.
  const handleWanderIntervalChange = (text: string) => {
    setWanderIntervalDraft(text);

    const seconds = Number(text);
    if (
      Number.isInteger(seconds) &&
      seconds >= MIN_WANDER_INTERVAL_SECONDS &&
      seconds <= MAX_WANDER_INTERVAL_SECONDS
    ) {
      setWanderInterval(seconds);
      wander.setIntervalSeconds(seconds);
    }
  };

  // Unticking auto hands the slider the count auto was showing, so taking
  // manual control of the iterations does not change the view by itself.
  // Ticking it back on needs nothing: the slider follows the zoom again, and
  // the count that was set by hand is still there for the next untick.
  const handleAutoIterationsChange = (enabled: boolean) => {
    handleParameterChange(() => {
      setAutoIterationsOn(enabled);
      if (!enabled) setMaxIterations(effectiveMaxIterations);
    });
  };

  // The setting the fractal takes, if any (the Julia constant for Julia, the
  // power for the Multibrot): the switcher's second row and the Settings select
  // are both drawn from it.
  const variants = fractalVariants(fractalType);
  const blankHintShown =
    !tourPlaying && blankLink !== null && blankLink === currentLink;

  return (
    <div className="fractal-stage bg-gray-950" data-tour={tourPlaying}>
      {/* A tour shows the picture and nothing else: the bar, the strip, the
          progress line and the hint are all keyed on `tourPlaying`, and the
          drawer and the help are closed dialogs. Any input ends the tour and
          they all come back as they were. */}
      {!tourPlaying && (
        <TopBar
          onBack={handleBack}
          onForward={handleForward}
          canGoBack={historyState.canGoBack}
          canGoForward={historyState.canGoForward}
          onSurprise={handleSurprise}
          canSurprise={canSurprise}
          onTour={() => tourMode.buttonStart()}
          onMath={toggleMath}
          mathOpen={mathOpen}
          mathButtonRef={mathButtonRef}
          onHelp={() => setHelpOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          settingsOpen={settingsOpen}
          settingsButtonRef={settingsButtonRef}
        />
      )}

      <main className="flex h-full items-center justify-center">
        {/* The canvas is the page: as large as fits under the bar, in the
            shape of its own resolution (4:3 unless the size boxes say
            otherwise). The progress line sits on its top edge, inside the
            wrapper that is exactly the canvas's size. */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={describeBounds(bounds, fractalLabel)}
            tabIndex={0}
            onKeyDown={handleCanvasKeyDown}
            className="fractal-canvas block focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-400"
            style={
              {
                "--canvas-aspect": canvasWidth / canvasHeight,
              } as CSSProperties
            }
          />

          {/* The picture being left, held here while a flight to a place
              draws. It takes no pointer events and says nothing to a screen
              reader; the page sets its opacity directly. */}
          <canvas
            ref={crossfadeRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />

          {isRendering && !tourPlaying && (
            <div className="absolute inset-x-0 top-0 h-1 bg-black/30">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress * 100}%` }}
              ></div>
            </div>
          )}
          <p role="status" className="sr-only">
            {tourPlaying
              ? "Tour playing. Press any key to stop."
              : isRendering && `Rendering... ${Math.round(progress * 100)}%`}
          </p>

          {/* Said when the settled picture has nothing in it, with the way
              back; it takes no pointer events outside its own box. */}
          <BlankHint
            show={blankHintShown}
            onBack={handleBack}
            canGoBack={historyState.canGoBack}
            belowChips={variants !== null}
            mathCard={
              mathOpen && !tourOverlayOpen
                ? mathExpanded
                  ? "expanded"
                  : "collapsed"
                : "hidden"
            }
          />

          {/* One click to another fractal, and for Julia one to another
              constant. Hidden with the rest of the controls while a tour plays
              and while the drawer or the help is up. */}
          <FractalSwitcher
            fractalType={fractalType}
            variant={variant}
            onSelectFractal={handleSwitchFractal}
            onSelectVariant={handleSwitchVariant}
            onSelectCustom={handleSwitchCustom}
            hidden={tourPlaying || tourOverlayOpen}
          />

          {/* The maths of the picture, under the switcher. Not rendered at
              all while a tour plays or the drawer or the help is up, so it is
              never over a dialog and its Escape listener is only live while
              it is on screen. */}
          {mathOpen && !tourPlaying && !tourOverlayOpen && (
            <MathCard
              fractalType={fractalType}
              variant={variant}
              view={{
                centerX,
                centerY,
                zoom: zoomLevel,
                iterations: effectiveMaxIterations,
                autoIterations: autoIterationsOn,
                colorScheme,
              }}
              belowChips={variants !== null}
              // Held only while the probe runs, so a card that has just been
              // expanded again never shows the point from before it was
              // collapsed.
              probe={probeLive ? probe : null}
              stepAside={blankHintShown}
              panelRef={mathCardPanelRef}
              onClose={closeMath}
              returnFocusRef={mathButtonRef}
            />
          )}

          {/* Places worth a look near this view. The thumbnails wait for a
              render in flight, so the strip never slows the picture the user
              is waiting for. */}
          <NearbyStrip
            places={nearbyWindow(nearby.pool, nearby.offset)}
            colorScheme={colorScheme}
            paused={isRendering}
            hidden={tourPlaying}
            onSelect={handlePlaceSelect}
            onMore={
              hasMoreNearby(nearby.pool.length) ? handleNearbyMore : undefined
            }
          />

          {/* The Auto-wander switch, after the strip so it paints over the
              strip's gradient when it stacks above it. It shares
              handleWanderChange with the Settings checkbox. */}
          <WanderControl
            on={wanderOn}
            countdown={wanderCountdown}
            rendering={isRendering}
            onToggle={handleWanderChange}
            nudge={wanderNudge}
            hidden={tourPlaying || tourOverlayOpen}
          />
        </div>
      </main>

      {/* Every control the page has. Escape, the Close button and the backdrop
          all report through the same handler, so there is one place the
          drawer closes. */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        returnFocusRef={settingsButtonRef}
      >
        {/* Preset System */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Presets</h3>
          <PresetSelector
            currentPreset={currentPreset}
            fractal={fractalType}
            onPresetSelect={handlePresetSelect}
          />
        </div>

        {/* Navigation */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Navigation</h3>
          <div className="space-y-4">
            <Slider
              label="Zoom Level"
              value={zoomToSlider(zoomLevel)}
              min={0}
              max={1}
              step={ZOOM_SLIDER_STEP}
              onChange={(position) =>
                handleViewChange(() => setZoomLevel(sliderToZoom(position)))
              }
              formatValue={(position) =>
                `${formatZoom(sliderToZoom(position))}x`
              }
            />
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  handleViewChange(() => setZoomLevel(clampZoom(zoomLevel / 2)))
                }
                disabled={zoomLevel <= MIN_ZOOM}
                variant="secondary"
                size="sm"
              >
                Zoom Out
              </Button>
              <Button
                onClick={() =>
                  handleViewChange(() => setZoomLevel(clampZoom(zoomLevel * 2)))
                }
                disabled={zoomLevel >= MAX_ZOOM}
                variant="secondary"
                size="sm"
              >
                Zoom In
              </Button>
              <Button onClick={resetToDefault} variant="secondary" size="sm">
                Reset View
              </Button>
            </div>

            {/* Copy link sits under the buttons that move the view, since
                    what it copies is that view. The status line is in the page
                    when it is empty so a screen reader hears it fill in, and
                    the fallback field appears under it for a browser that will
                    not take a clipboard write. */}
            <div className="flex items-center gap-2">
              <Button onClick={handleCopyLink} variant="secondary" size="sm">
                Copy link
              </Button>
              <p role="status" className="text-xs text-gray-600">
                {COPY_MESSAGES[copy.kind]}
              </p>
            </div>
            {copy.kind === "manual" && (
              <input
                ref={copyFieldRef}
                readOnly
                aria-label="View link"
                value={copy.url}
                className="w-full px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-lg bg-gray-50"
              />
            )}
          </div>
        </div>

        {/* Auto-wander: the view moves to a nearby interesting view every few
            seconds. The clock and the step are the wander controller's. */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Auto-wander</h3>
          <div className="space-y-4">
            <Checkbox
              label="Auto-wander"
              checked={wanderOn}
              onChange={handleWanderChange}
            />
            <p className="text-sm text-gray-600">
              The same switch is on the picture, at the bottom right.
            </p>
            <Input
              label="Seconds between steps"
              value={wanderIntervalDraft ?? String(wanderInterval)}
              type="number"
              step="1"
              min={MIN_WANDER_INTERVAL_SECONDS}
              max={MAX_WANDER_INTERVAL_SECONDS}
              onChange={handleWanderIntervalChange}
            />
            {wanderOn && (
              <p className="text-sm text-gray-600">
                {wanderCountdown === null
                  ? "Waiting for the render to finish"
                  : `Next step in about ${wanderCountdown} s`}
              </p>
            )}
          </div>
        </div>

        {/* Where the view is, and the boxes that set its centre */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Coordinates</h3>
          <div className="space-y-4">
            <p role="status" className="text-sm font-mono text-gray-700">
              {describeView(bounds)}
            </p>
            <CenterControls
              bounds={bounds}
              onCenterChange={handleCenterChange}
            />
          </div>
        </div>

        {/* Rendering Parameters */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Rendering Parameters</h3>
          <div className="space-y-4">
            <Select
              label="Fractal"
              value={fractalType}
              options={FRACTAL_TYPES.map((type) => ({
                value: type.id,
                label: type.label,
              }))}
              onChange={handleFractalTypeChange}
            />

            {/* A Julia set is a family, so the kind alone does not say
                    which picture to draw. The select is drawn from the
                    fractal's variant descriptor, so a fractal with no such
                    setting (the Mandelbrot set) offers nothing to choose. */}
            {variants !== null && (
              <Select
                label={variants.label}
                value={
                  isCustomVariant(fractalType, variant)
                    ? CUSTOM_OPTION_VALUE
                    : variant
                }
                options={[
                  ...variants.options,
                  ...(variants.allowsCustom
                    ? [
                        {
                          value: CUSTOM_OPTION_VALUE,
                          label: CUSTOM_OPTION_LABEL,
                        },
                      ]
                    : []),
                ]}
                onChange={handleVariantSelect}
              />
            )}

            {/* A custom constant is two numbers, so it gets two boxes. The
                    message has a box of its own, like the coordinates', so the
                    controls below do not move as it comes and goes. */}
            {isCustomVariant(fractalType, variant) && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Real"
                    inputRef={juliaRealInputRef}
                    value={juliaRealText}
                    inputMode="decimal"
                    onChange={(text) => editJuliaInput("real", text)}
                  />
                  <Input
                    label="Imaginary"
                    value={juliaImaginaryText}
                    inputMode="decimal"
                    onChange={(text) => editJuliaInput("imaginary", text)}
                  />
                </div>
                <div className="min-h-5">
                  {juliaInputError !== null && (
                    <p role="status" className="text-xs text-red-600">
                      {juliaInputError}
                    </p>
                  )}
                </div>
              </div>
            )}

            <Checkbox
              label="Auto iterations"
              checked={autoIterationsOn}
              onChange={handleAutoIterationsChange}
            />
            <Slider
              label="Maximum Iterations"
              value={effectiveMaxIterations}
              min={MIN_ITERATIONS}
              max={MAX_ITERATIONS}
              step={ITERATION_STEP}
              onChange={(value) =>
                handleParameterChange(() => setMaxIterations(value))
              }
              disabled={autoIterationsOn}
              formatValue={(v) => v.toString()}
            />

            <Select
              label="Color Scheme"
              value={colorScheme}
              options={getAvailableColorSchemes()}
              onChange={(value) =>
                handleParameterChange(() =>
                  setColorScheme(value as ColorScheme),
                )
              }
            />
          </div>
        </div>

        {/* Canvas Resolution */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Canvas Resolution</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Width"
                value={canvasWidth.toString()}
                type="number"
                onChange={(value) => {
                  const num = parseInt(value);
                  if (!isNaN(num) && num > 0 && num <= 2000) {
                    handleParameterChange(() => setCanvasWidth(num));
                  }
                }}
              />
              <Input
                label="Height"
                value={canvasHeight.toString()}
                type="number"
                onChange={(value) => {
                  const num = parseInt(value);
                  if (!isNaN(num) && num > 0 && num <= 2000) {
                    handleParameterChange(() => setCanvasHeight(num));
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setCanvasWidth(400);
                  setCanvasHeight(300);
                  setCurrentPreset("");
                }}
                variant="secondary"
                size="sm"
              >
                400×300
              </Button>
              <Button
                onClick={() => {
                  setCanvasWidth(800);
                  setCanvasHeight(600);
                  setCurrentPreset("");
                }}
                variant="secondary"
                size="sm"
              >
                800×600
              </Button>
              <Button
                onClick={() => {
                  setCanvasWidth(1200);
                  setCanvasHeight(900);
                  setCurrentPreset("");
                }}
                variant="secondary"
                size="sm"
              >
                1200×900
              </Button>
            </div>
          </div>
        </div>

        {/* Manual Coordinates */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Manual Coordinates</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Min Real"
                value={manualText("minReal", bounds.minReal)}
                type="number"
                step="any"
                onChange={(value) => editManualCoordinate("minReal", value)}
              />
              <Input
                label="Max Real"
                value={manualText("maxReal", bounds.maxReal)}
                type="number"
                step="any"
                onChange={(value) => editManualCoordinate("maxReal", value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Min Imaginary"
                value={manualText("minImaginary", bounds.minImaginary)}
                type="number"
                step="any"
                onChange={(value) =>
                  editManualCoordinate("minImaginary", value)
                }
              />
              <Input
                label="Max Imaginary"
                value={manualText("maxImaginary", bounds.maxImaginary)}
                type="number"
                step="any"
                onChange={(value) =>
                  editManualCoordinate("maxImaginary", value)
                }
              />
            </div>
            {/* Under the four boxes, in a box of its own so the row below
                    does not move as a message comes and goes. An error is
                    announced as it appears; a fitted note is only reported. */}
            <div className="min-h-5">
              {manualMessage?.kind === "error" && (
                <p role="alert" className="text-xs text-red-600">
                  {manualMessage.text}
                </p>
              )}
              {manualMessage?.kind === "note" && (
                <p role="status" className="text-xs text-gray-600">
                  {manualMessage.text}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={applyManualCoordinates}>
                Apply Coordinates
              </Button>
              <Button onClick={resetToDefault} variant="secondary">
                Reset to Default
              </Button>
            </div>
          </div>
        </div>

        {/* Phase 5: Custom Preset Manager */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <CustomPresetManager
            currentBounds={bounds}
            currentMaxIterations={effectiveMaxIterations}
            currentColorScheme={colorScheme}
            currentCanvasWidth={canvasWidth}
            currentCanvasHeight={canvasHeight}
            currentFractal={fractalType}
            currentVariant={variant}
            onPresetsChange={handlePresetsChange}
          />
        </div>

        {/* Download PNG keeps its lock while the render it reads is drawing,
            because the canvas on screen may be half drawn; a larger export
            draws a canvas of its own and has nothing to wait for. */}
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="space-y-4">
            <Select
              label="Shape"
              value={exportShapeId}
              options={EXPORT_SHAPES.map((shape) => ({
                value: shape.id,
                label: shape.label,
              }))}
              onChange={(value) => setExportShapeId(value)}
            />
            <Select
              label="Export size"
              value={exportSizeKey}
              options={exportSizeOptions.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
              onChange={(value) => setExportSizeKey(value)}
            />
            <div className="text-center">
              <Button
                onClick={handleDownload}
                disabled={downloadDisabled}
                variant="secondary"
                size="sm"
              >
                {exportState.kind === "running"
                  ? `Exporting... ${Math.round(exportState.progress * 100)}%`
                  : "Download PNG"}
              </Button>
              {exporting && (
                <Button
                  onClick={handleCancelExport}
                  variant="outline"
                  size="sm"
                  className="ml-2"
                >
                  Cancel
                </Button>
              )}
            </div>
            <div className="min-h-5 text-center">
              {exportState.kind === "error" && (
                <p role="status" className="text-xs text-red-600">
                  {exportState.text}
                </p>
              )}
            </div>
          </div>
        </div>

        <VersionFooter />
      </SettingsDrawer>

      {/* Escape, the Close button and the backdrop all report through the
          same handler, so there is one place the overlay closes. */}
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
