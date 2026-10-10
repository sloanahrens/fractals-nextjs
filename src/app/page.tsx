"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
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
  presetJuliaConstant,
} from "../lib/presets";
import { downloadFileName } from "../lib/download";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  resolveFractalKind,
} from "../lib/fractalTypes";
import {
  CUSTOM_OPTION_LABEL,
  CUSTOM_OPTION_VALUE,
  isCustomJuliaConstant,
  parseCustomConstantInput,
} from "../lib/customConstantInput";
import {
  customConstantName,
  JULIA_CONSTANTS,
  parseJuliaConstant,
} from "../lib/julia";
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
import { encodeView } from "../lib/viewLink";
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
import { ZoomDisplay } from "../components/ui/ZoomDisplay";
import { CenterControls } from "../components/ui/CenterControls";
import { CustomPresetManager } from "../components/ui/CustomPresetManager";
import { VersionFooter } from "../components/ui/VersionFooter";
import { HelpDialog } from "../components/ui/HelpDialog";

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

  // Which fractal is drawn, and — when it is the Julia one — which named
  // constant it iterates against. The two are a single choice as far as the
  // renderer is concerned: it is rebuilt whenever either moves.
  const [fractalType, setFractalType] = useState(
    DEFAULT_VIEW_LINK_UPDATES.fractalType,
  );
  const [juliaConstant, setJuliaConstant] = useState(
    DEFAULT_VIEW_LINK_UPDATES.juliaConstant,
  );

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
  const [syncedJuliaConstant, setSyncedJuliaConstant] = useState(juliaConstant);
  if (syncedJuliaConstant !== juliaConstant) {
    setSyncedJuliaConstant(juliaConstant);
    const point = isCustomJuliaConstant(juliaConstant)
      ? parseJuliaConstant(juliaConstant)
      : null;
    if (point !== null) {
      setJuliaRealText(String(point.real));
      setJuliaImaginaryText(String(point.imaginary));
    }
    setJuliaInputError(null);
  }

  const fractalKind = useMemo(
    () => resolveFractalKind(fractalType, juliaConstant),
    [fractalType, juliaConstant],
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

  // Random walk. The controller owns the clock — when a step is due, and when
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
  const [wander] = useState(
    () => new WanderController({ onCountdown: setWanderCountdown }),
  );

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

  // What one step of the walk does: from the view on screen now, take a step
  // with the fractal on screen now, and put it up the way any other view change
  // does. It is handed to the controller after every render, because the
  // controller is built once and the kind and the view move under it.
  useEffect(() => {
    wander.setStepHandler(() => {
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

  // The walk counts down only while the tab is on screen: a background tab has
  // nobody watching the view move, and a browser throttles its timers anyway.
  // Leaving the page stops the walk, so a stray timer cannot outlive it.
  useEffect(() => {
    const handleVisibilityChange = () => wander.setHidden(document.hidden);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    wander.setHidden(document.hidden);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wander.stop();
    };
  }, [wander]);

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
      setJuliaConstant(updates.juliaConstant);
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
      wander.notifyActivity();
    },
    [wander],
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

    applyViewLink(window.location.hash);
  }, [applyViewLink]);

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
  // The address-bar follower cannot feed this: it moves the bar with
  // `history.replaceState`, which fires no `hashchange`, so the only events
  // here are the user's own.
  useEffect(() => {
    const handleHashChange = () => applyViewLink(window.location.hash);

    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [applyViewLink]);

  // The view as a link, rebuilt whenever anything a link carries moves. Both
  // halves of the feature read it: the effect below writes it to the address
  // bar and the Copy link button hands it over as the URL.
  const currentLink = useMemo(
    () =>
      encodeView({
        fractalType,
        juliaConstant,
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
      juliaConstant,
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

  const writeViewLink = useCallback((fragment: string, nowMs: number) => {
    // replaceState, not an assignment to location.hash: the address bar is
    // recording where the user already is, so it is not a place to go back to,
    // and a fragment assignment would reload the page.
    window.history.replaceState(null, "", fragment);
    lastLinkWriteRef.current = nowMs;
  }, []);

  // The address bar follows the view — a random walk step, a control, a wheel,
  // a preset, a link — but only once that view has been drawn, which is also
  // what keeps a drag from rewriting it while the gesture is still moving.
  useEffect(() => {
    if (currentLink !== renderedLink) return;

    const next = `#${currentLink}`;
    const now = Date.now();

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
  }, [currentLink, renderedLink, writeViewLink]);

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
    // happens to be, so the address bar is brought up to date first and then
    // read back: what is copied is the full URL, fragment and all.
    writeViewLink(`#${currentLink}`, Date.now());
    const url = window.location.href;

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

  const handleFractalTypeChange = (typeId: string) => {
    setFractalType(typeId);
    applyDefaultView(typeId);
  };

  // Another constant is another picture, framed the same way: a Julia set is
  // symmetric about the origin whatever its c.
  const handleJuliaConstantChange = (name: string) => {
    setJuliaConstant(name);
    applyDefaultView("julia");
  };

  // The select's Custom option. It starts from the point the picture is
  // already drawn with, so choosing it changes the controls and not the
  // picture: the constant is the same, only spelled as a custom name, and the
  // view stays where it was.
  const handleJuliaSelect = (value: string) => {
    if (value !== CUSTOM_OPTION_VALUE) {
      handleJuliaConstantChange(value);
      return;
    }
    if (isCustomJuliaConstant(juliaConstant)) return;

    const point = parseJuliaConstant(juliaConstant);
    const name = point && customConstantName(point.real, point.imaginary);
    if (name === null || name === undefined) return;

    setJuliaConstant(name);
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
    if (result.constant === juliaConstant) return;
    setSyncedJuliaConstant(result.constant);
    handleJuliaConstantChange(result.constant);
  };

  const resetToDefault = () => {
    applyDefaultView(fractalType);
    setMaxIterations(100);
    setAutoIterationsOn(true);
    setColorScheme("classic");
  };

  // Save what is on the canvas. The canvas holds the render at its full pixel
  // size, so this is the image the user is looking at rather than a screenshot
  // of the page around it.
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      // A canvas can decline to produce an image. There is nothing to save
      // then, and the page carries on as before.
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadFileName(
        centerX,
        centerY,
        zoomLevel,
        fractalType,
      );
      // Firefox only follows a click on an anchor that is in the document.
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The browser reads the blob off the URL as the download starts, so
      // releasing it in this same tick can cancel the save before it begins.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }, "image/png");
  }, [centerX, centerY, zoomLevel, fractalType]);

  // Preset handlers
  const handlePresetSelect = (preset: FractalPreset) => {
    // Calculate center and zoom from preset bounds
    const view = boundsToView(preset.bounds);

    // A view belongs to a fractal, and loading it puts the picker back on that
    // fractal — for a Julia view, on its constant too — before the view itself.
    // The bounds mean nothing without the picture they were framed on.
    const fractal = presetFractal(preset) ?? DEFAULT_PRESET_FRACTAL;
    setFractalType(fractal);
    if (fractal === "julia") setJuliaConstant(presetJuliaConstant(preset));

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

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Fractal Explorer</h1>
          <p className="text-lg text-gray-600">
            Scroll to zoom, drag to pan, or use the sliders. Focus the image to
            pan with the arrow keys and zoom with + and −.
          </p>
          <div className="mt-4">
            <Button
              onClick={() => setHelpOpen(true)}
              variant="outline"
              size="sm"
            >
              Help
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
          {/* Canvas Section */}
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={describeBounds(bounds, fractalLabel)}
              tabIndex={0}
              onKeyDown={handleCanvasKeyDown}
              className="fractal-canvas border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{ maxWidth: "100%", height: "auto" }}
            />

            {isRendering && (
              <div className="mt-4">
                <div className="bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-150"
                    style={{ width: `${progress * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  Rendering... {Math.round(progress * 100)}%
                </p>
              </div>
            )}

            <div className="mt-4 text-center">
              <Button
                onClick={handleDownload}
                disabled={isRendering}
                variant="secondary"
                size="sm"
              >
                Download PNG
              </Button>
            </div>
          </div>

          {/* Parameter Control Panel */}
          <div className="w-full lg:w-96 space-y-6">
            {/* Preset System */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Presets</h3>
              <PresetSelector
                currentPreset={currentPreset}
                fractal={fractalType}
                onPresetSelect={handlePresetSelect}
              />
            </div>

            {/* Navigation Sliders */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4">Navigation</h3>
              <div className="space-y-4">
                <Slider
                  label="Center X (Real)"
                  value={centerX}
                  min={-2.5}
                  max={1.5}
                  step={0.01}
                  onChange={(value) =>
                    handleViewChange(() => setCenterX(value))
                  }
                  formatValue={(v) => v.toFixed(3)}
                />
                <Slider
                  label="Center Y (Imaginary)"
                  value={centerY}
                  min={-1.5}
                  max={1.5}
                  step={0.01}
                  onChange={(value) =>
                    handleViewChange(() => setCenterY(value))
                  }
                  formatValue={(v) => v.toFixed(3)}
                />
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
                      handleViewChange(() =>
                        setZoomLevel(clampZoom(zoomLevel / 2)),
                      )
                    }
                    disabled={zoomLevel <= MIN_ZOOM}
                    variant="secondary"
                    size="sm"
                  >
                    Zoom Out
                  </Button>
                  <Button
                    onClick={() =>
                      handleViewChange(() =>
                        setZoomLevel(clampZoom(zoomLevel * 2)),
                      )
                    }
                    disabled={zoomLevel >= MAX_ZOOM}
                    variant="secondary"
                    size="sm"
                  >
                    Zoom In
                  </Button>
                  <Button
                    onClick={resetToDefault}
                    variant="secondary"
                    size="sm"
                  >
                    Reset View
                  </Button>
                </div>

                {/* Copy link sits under the buttons that move the view, since
                    what it copies is that view. The status line is in the page
                    when it is empty so a screen reader hears it fill in, and
                    the fallback field appears under it for a browser that will
                    not take a clipboard write. */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleCopyLink}
                    variant="secondary"
                    size="sm"
                  >
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

                <Checkbox
                  label="Random walk"
                  checked={wanderOn}
                  onChange={handleWanderChange}
                />
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

            {/* View Info and Center Controls */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4">View Info</h3>
              <div className="space-y-4">
                <ZoomDisplay bounds={bounds} />
                <CenterControls
                  bounds={bounds}
                  onCenterChange={handleCenterChange}
                />
              </div>
            </div>

            {/* Rendering Parameters */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h3 className="text-lg font-semibold mb-4">
                Rendering Parameters
              </h3>
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
                    which picture to draw; the Mandelbrot set has no such
                    parameter, and the picker offers nothing to choose. */}
                {fractalType === "julia" && (
                  <Select
                    label="Julia constant"
                    value={
                      isCustomJuliaConstant(juliaConstant)
                        ? CUSTOM_OPTION_VALUE
                        : juliaConstant
                    }
                    options={[
                      ...JULIA_CONSTANTS.map((constant) => ({
                        value: constant.name,
                        label: constant.name,
                      })),
                      {
                        value: CUSTOM_OPTION_VALUE,
                        label: CUSTOM_OPTION_LABEL,
                      },
                    ]}
                    onChange={handleJuliaSelect}
                  />
                )}

                {/* A custom constant is two numbers, so it gets two boxes. The
                    message has a box of its own, like the coordinates', so the
                    controls below do not move as it comes and goes. */}
                {fractalType === "julia" &&
                  isCustomJuliaConstant(juliaConstant) && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="Real"
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
                currentJuliaConstant={juliaConstant}
                onPresetsChange={handlePresetsChange}
              />
            </div>
          </div>
        </div>

        <VersionFooter />

        {/* Escape, the Close button and the backdrop all report through the
            same handler, so there is one place the overlay closes. */}
        <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </div>
  );
}
