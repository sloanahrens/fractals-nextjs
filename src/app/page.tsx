"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  type KeyboardEvent,
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
import { FractalPreset, formatZoom } from "../lib/presets";
import { downloadFileName } from "../lib/download";
import {
  FRACTAL_TYPES,
  defaultViewFor,
  resolveFractalKind,
} from "../lib/fractalTypes";
import { JULIA_CONSTANTS } from "../lib/julia";
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

// The four manual coordinate boxes. A field is present only once the user has
// typed in it; while it is absent the box shows the current view.
type ManualField = "minReal" | "maxReal" | "minImaginary" | "maxImaginary";

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

  // Navigation state - sliders control these directly
  const [centerX, setCenterX] = useState(-0.75); // Center of classic Mandelbrot view
  const [centerY, setCenterY] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);

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
  const [maxIterations, setMaxIterations] = useState(100);
  const [autoIterationsOn, setAutoIterationsOn] = useState(true);
  const [colorScheme, setColorScheme] = useState<ColorScheme>("classic");
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(600);

  // Which fractal is drawn, and — when it is the Julia one — which named
  // constant it iterates against. The two are a single choice as far as the
  // renderer is concerned: it is rebuilt whenever either moves.
  const [fractalType, setFractalType] = useState("mandelbrot");
  const [juliaConstant, setJuliaConstant] = useState(JULIA_CONSTANTS[0].name);

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

  // Manual coordinate inputs. Only text the user typed is held here, so a box
  // that has not been touched reads straight off the view and Apply reuses the
  // view's own float64 rather than the rounded text on screen.
  const [manualDraft, setManualDraft] = useState<
    Partial<Record<ManualField, string>>
  >({});

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
    return typed === undefined ? fallback : parseFloat(typed);
  };

  const editManualCoordinate = (field: ManualField, value: string) => {
    setManualDraft((draft) => ({ ...draft, [field]: value }));
    setCurrentPreset("");
  };

  // Draw the canvas at the quality the render policy asks for: the cheap
  // low-resolution pass while a gesture is moving the view, the full image
  // otherwise. A preview leaves the progress bar alone so that a drag does not
  // flash "Rendering..." at every pointer move.
  const drawCanvas = useCallback(
    async (quality: RenderQuality) => {
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

      await renderer
        .renderFractal(config, onProgress)
        .catch((error) => {
          console.error("Error rendering fractal:", error);
        })
        .finally(() => {
          // Only the newest draw clears the flag; an older one clearing it
          // would hide the bar while the drawing it has handed over to is
          // still running.
          if (token === drawTokenRef.current) setIsRendering(false);
        });
    },
    [bounds, effectiveMaxIterations, colorScheme],
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
  const applyView = useCallback((view: ZoomState) => {
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
  }, []);

  // Arrow keys pan the view and `+`/`-` zoom it, for a user who cannot use a
  // pointer. The keys are read off the canvas itself, so they only move the
  // view while the canvas has focus and Tab still reaches every control.
  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
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
    drawCanvas(renderPolicy.requestRender());
    // fullRenderNonce is the trigger for the render a finished gesture owes,
    // and fractalKind for the render a new kind needs, not values the draw
    // itself reads: the draw reaches the renderer the effect above rebuilt.
  }, [
    drawCanvas,
    renderPolicy,
    canvasWidth,
    canvasHeight,
    fullRenderNonce,
    fractalKind,
  ]);

  // Helper functions for manual coordinate input
  const applyManualCoordinates = () => {
    const minReal = manualValue("minReal", bounds.minReal);
    const maxReal = manualValue("maxReal", bounds.maxReal);
    const minImaginary = manualValue("minImaginary", bounds.minImaginary);
    const maxImaginary = manualValue("maxImaginary", bounds.maxImaginary);

    // Validate bounds
    if (
      !isNaN(minReal) &&
      !isNaN(maxReal) &&
      !isNaN(minImaginary) &&
      !isNaN(maxImaginary) &&
      minReal < maxReal &&
      minImaginary < maxImaginary
    ) {
      // Calculate center and zoom from manual bounds
      const view = boundsToView({
        minReal,
        maxReal,
        minImaginary,
        maxImaginary,
      });

      setCenterX(view.centerX);
      setCenterY(view.centerY);
      setZoomLevel(view.scale);
      setCurrentPreset("");
    }
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
      link.download = downloadFileName(centerX, centerY, zoomLevel, fractalType);
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

    // A preset is a Mandelbrot view: the saved format has no field for the
    // fractal, so loading one puts the picker back where its bounds belong.
    setFractalType("mandelbrot");
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
  };

  const handleCenterChange = (newCenterX: number, newCenterY: number) => {
    setCenterX(newCenterX);
    setCenterY(newCenterY);
    setCurrentPreset(""); // Clear preset when manually adjusting
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
                  onChange={(value) => {
                    setCenterX(value);
                    setCurrentPreset("");
                  }}
                  formatValue={(v) => v.toFixed(3)}
                />
                <Slider
                  label="Center Y (Imaginary)"
                  value={centerY}
                  min={-1.5}
                  max={1.5}
                  step={0.01}
                  onChange={(value) => {
                    setCenterY(value);
                    setCurrentPreset("");
                  }}
                  formatValue={(v) => v.toFixed(3)}
                />
                <Slider
                  label="Zoom Level"
                  value={zoomToSlider(zoomLevel)}
                  min={0}
                  max={1}
                  step={ZOOM_SLIDER_STEP}
                  onChange={(position) => {
                    setZoomLevel(sliderToZoom(position));
                    setCurrentPreset("");
                  }}
                  formatValue={(position) =>
                    `${formatZoom(sliderToZoom(position))}x`
                  }
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => setZoomLevel(clampZoom(zoomLevel / 2))}
                    disabled={zoomLevel <= MIN_ZOOM}
                    variant="secondary"
                    size="sm"
                  >
                    Zoom Out
                  </Button>
                  <Button
                    onClick={() => setZoomLevel(clampZoom(zoomLevel * 2))}
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
                    value={juliaConstant}
                    options={JULIA_CONSTANTS.map((constant) => ({
                      value: constant.name,
                      label: constant.name,
                    }))}
                    onChange={handleJuliaConstantChange}
                  />
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
                onPresetsChange={handlePresetsChange}
                saveDisabledReason={
                  fractalType !== "mandelbrot"
                    ? "Saving is available for Mandelbrot views"
                    : undefined
                }
              />
            </div>
          </div>
        </div>

        <VersionFooter />
      </div>
    </div>
  );
}
