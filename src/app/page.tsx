"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { FractalRenderer } from "../lib/fractalRenderer";
import { calculateZoomBounds, boundsToView } from "../lib/mandelbrot";
import { ZoomPanManager } from "../lib/zoomPan";
import { attachCanvasNavigation } from "../lib/canvasNavigation";
import { FractalConfig, FractalBounds, ColorScheme } from "../types/fractal";
import { getAvailableColorSchemes } from "../lib/colorMapping";
import { FractalPreset } from "../lib/presets";
import { Slider } from "../components/ui/Slider";
import { Select } from "../components/ui/Select";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { PresetSelector } from "../components/ui/PresetSelector";
import { ZoomDisplay } from "../components/ui/ZoomDisplay";
import { CenterControls } from "../components/ui/CenterControls";
import { CustomPresetManager } from "../components/ui/CustomPresetManager";

// The zoom level runs from the full view to the deepest zoom the sliders offer
const MIN_ZOOM = 1;
const MAX_ZOOM = 10000;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FractalRenderer | null>(null);

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
  const [maxIterations, setMaxIterations] = useState(100);
  const [colorScheme, setColorScheme] = useState<ColorScheme>("classic");
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(600);

  // Preset system
  const [currentPreset, setCurrentPreset] = useState<string>("");

  // Manual coordinate inputs
  const [manualMinReal, setManualMinReal] = useState(bounds.minReal.toString());
  const [manualMaxReal, setManualMaxReal] = useState(bounds.maxReal.toString());
  const [manualMinImaginary, setManualMinImaginary] = useState(
    bounds.minImaginary.toString(),
  );
  const [manualMaxImaginary, setManualMaxImaginary] = useState(
    bounds.maxImaginary.toString(),
  );

  // The manual inputs mirror the current view until the user edits them, so
  // they resync whenever the view moves (zoom/pan, preset, reset). Adjusting
  // the state during the render that sees the new bounds is the documented
  // alternative to a sync effect:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [syncedBounds, setSyncedBounds] = useState(bounds);
  if (syncedBounds !== bounds) {
    setSyncedBounds(bounds);
    setManualMinReal(bounds.minReal.toString());
    setManualMaxReal(bounds.maxReal.toString());
    setManualMinImaginary(bounds.minImaginary.toString());
    setManualMaxImaginary(bounds.maxImaginary.toString());
  }

  const renderFractal = useCallback(async () => {
    if (!rendererRef.current || !canvasRef.current) return;

    setIsRendering(true);
    setProgress(0);

    const config: FractalConfig = {
      bounds,
      maxIterations,
      width: canvasRef.current.width,
      height: canvasRef.current.height,
      colorScheme,
    };

    try {
      await rendererRef.current.renderFractal(config, setProgress);
    } catch (error) {
      console.error("Error rendering fractal:", error);
    } finally {
      setIsRendering(false);
    }
  }, [bounds, maxIterations, colorScheme]);

  // Initialize canvas and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    rendererRef.current = new FractalRenderer(canvas);

    // Initial render
    renderFractal();
  }, [canvasWidth, canvasHeight, renderFractal]);

  // Wheel, drag and touch navigation on the canvas. The listeners are attached
  // once and read the live bounds through a ref, so a drag keeps working while
  // the view it drives re-renders.
  const boundsRef = useRef(bounds);
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

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
      (view) => {
        setCenterX(view.centerX);
        setCenterY(view.centerY);
        setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale)));
        setCurrentPreset("");
      },
    );
  }, [canvasWidth, canvasHeight]);

  // Re-render when parameters change (renderFractal already handles canvas dimensions)
  useEffect(() => {
    renderFractal();
  }, [renderFractal]);

  // Helper functions for manual coordinate input
  const applyManualCoordinates = () => {
    const minReal = parseFloat(manualMinReal);
    const maxReal = parseFloat(manualMaxReal);
    const minImaginary = parseFloat(manualMinImaginary);
    const maxImaginary = parseFloat(manualMaxImaginary);

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

  const resetToDefault = () => {
    setCenterX(-0.75);
    setCenterY(0);
    setZoomLevel(1);
    setMaxIterations(100);
    setColorScheme("classic");
    setCurrentPreset("");
  };

  // Preset handlers
  const handlePresetSelect = (preset: FractalPreset) => {
    // Calculate center and zoom from preset bounds
    const view = boundsToView(preset.bounds);

    setCenterX(view.centerX);
    setCenterY(view.centerY);
    setZoomLevel(view.scale);
    setMaxIterations(preset.maxIterations);
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

  const handleSaveCurrentPreset = () => {
    // Trigger the CustomPresetManager's save dialog
    const event = new CustomEvent("save-preset");
    window.dispatchEvent(event);
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

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Mandelbrot Set Explorer</h1>
          <p className="text-lg text-gray-600">
            Scroll to zoom, drag to pan, or use the sliders
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
          {/* Canvas Section */}
          <div className="bg-white p-4 rounded-lg shadow-lg">
            <canvas
              ref={canvasRef}
              className="fractal-canvas border border-gray-300"
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
              <p className="text-xs text-gray-500">
                <strong>Take a screenshot:</strong> macOS: Cmd+Shift+4 •
                Windows: Win+Shift+S • Linux: Print Screen
              </p>
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
                onSavePreset={handleSaveCurrentPreset}
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
                  disabled={isRendering}
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
                  disabled={isRendering}
                  formatValue={(v) => v.toFixed(3)}
                />
                <Slider
                  label="Zoom Level"
                  value={zoomLevel}
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={1}
                  onChange={(value) => {
                    setZoomLevel(value);
                    setCurrentPreset("");
                  }}
                  disabled={isRendering}
                  formatValue={(v) => `${v.toFixed(0)}x`}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      setZoomLevel(Math.max(MIN_ZOOM, zoomLevel / 2))
                    }
                    disabled={isRendering || zoomLevel <= MIN_ZOOM}
                    variant="secondary"
                    size="sm"
                  >
                    Zoom Out
                  </Button>
                  <Button
                    onClick={() =>
                      setZoomLevel(Math.min(MAX_ZOOM, zoomLevel * 2))
                    }
                    disabled={isRendering || zoomLevel >= MAX_ZOOM}
                    variant="secondary"
                    size="sm"
                  >
                    Zoom In
                  </Button>
                  <Button
                    onClick={resetToDefault}
                    disabled={isRendering}
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
                <Slider
                  label="Maximum Iterations"
                  value={maxIterations}
                  min={50}
                  max={1000}
                  step={10}
                  onChange={(value) =>
                    handleParameterChange(() => setMaxIterations(value))
                  }
                  disabled={isRendering}
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
                  disabled={isRendering}
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
                    disabled={isRendering}
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
                    disabled={isRendering}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setCanvasWidth(400);
                      setCanvasHeight(300);
                      setCurrentPreset("");
                    }}
                    disabled={isRendering}
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
                    disabled={isRendering}
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
                    disabled={isRendering}
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
                    value={manualMinReal}
                    type="number"
                    step="any"
                    onChange={(value) => {
                      setManualMinReal(value);
                      setCurrentPreset("");
                    }}
                    disabled={isRendering}
                  />
                  <Input
                    label="Max Real"
                    value={manualMaxReal}
                    type="number"
                    step="any"
                    onChange={(value) => {
                      setManualMaxReal(value);
                      setCurrentPreset("");
                    }}
                    disabled={isRendering}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Min Imaginary"
                    value={manualMinImaginary}
                    type="number"
                    step="any"
                    onChange={(value) => {
                      setManualMinImaginary(value);
                      setCurrentPreset("");
                    }}
                    disabled={isRendering}
                  />
                  <Input
                    label="Max Imaginary"
                    value={manualMaxImaginary}
                    type="number"
                    step="any"
                    onChange={(value) => {
                      setManualMaxImaginary(value);
                      setCurrentPreset("");
                    }}
                    disabled={isRendering}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={applyManualCoordinates}
                    disabled={isRendering}
                  >
                    Apply Coordinates
                  </Button>
                  <Button
                    onClick={resetToDefault}
                    disabled={isRendering}
                    variant="secondary"
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>
            </div>

            {/* Phase 5: Custom Preset Manager */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <CustomPresetManager
                currentBounds={bounds}
                currentMaxIterations={maxIterations}
                currentColorScheme={colorScheme}
                currentCanvasWidth={canvasWidth}
                currentCanvasHeight={canvasHeight}
                onPresetsChange={handlePresetsChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
