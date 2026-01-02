# Fractals Navigation Overhaul & Azure Migration

## Overview

Full navigation overhaul for the Mandelbrot Set Explorer, plus migration from Bitbucket Pipelines/GCP Cloud Run to GitHub Actions/Azure Container Apps.

## Goals

1. **Shareable URLs** - Any fractal view can be shared via URL
2. **Keyboard navigation** - Full keyboard control for power users
3. **Touch support** - Pinch-to-zoom and swipe panning on mobile
4. **Browser history** - Back/forward navigation through exploration
5. **Azure deployment** - Migrate to Azure Container Apps with GitHub Actions

---

## URL State Architecture

The URL is the single source of truth for the fractal view.

### URL Format

```
https://example.com/?x=-0.75&y=0.1&z=1000&i=500&c=ocean
```

| Param | Description                | Default |
| ----- | -------------------------- | ------- |
| `x`   | Center X (real axis)       | -0.5    |
| `y`   | Center Y (imaginary axis)  | 0       |
| `z`   | Zoom level (1 = full view) | 1       |
| `i`   | Max iterations             | 100     |
| `c`   | Color scheme               | classic |

### Implementation

Create `useUrlState` custom hook:

- Parses URL params on mount
- Derives `FractalBounds` from center + zoom
- Exposes `setView(x, y, zoom, iterations, colorScheme)`
- Updates URL via `history.replaceState` during rapid changes
- Uses `history.pushState` after 500ms debounce (creates history entry)
- Listens to `popstate` for browser back/forward

### Aspect Ratio Handling

- Zoom level defines width: `width = 4 / zoom`
- Height derived from canvas: `height = width * (canvasHeight / canvasWidth)`
- Center coordinates remain fixed regardless of canvas size

### Resolution

Canvas resolution (400x300, 800x600, 1200x900) remains a local preference, not part of the URL. Shared links render at the recipient's chosen quality.

---

## Keyboard Navigation

Global keyboard shortcuts, active when page is focused:

| Key         | Action                   |
| ----------- | ------------------------ |
| Arrow Up    | Pan up 10% of view       |
| Arrow Down  | Pan down 10% of view     |
| Arrow Left  | Pan left 10% of view     |
| Arrow Right | Pan right 10% of view    |
| `+` / `=`   | Zoom in 1.5x at center   |
| `-`         | Zoom out 0.67x at center |
| `0`         | Reset to overview        |
| `1`-`6`     | Load built-in preset     |
| `Escape`    | Cancel current render    |
| `?` or `h`  | Toggle help panel        |

### Implementation

Create `useKeyboardNavigation` hook:

```typescript
function useKeyboardNavigation(
  setView: (x, y, z, i, c) => void,
  currentView: ViewState,
  cancelRender: () => void,
);
```

- Registers `keydown` listener on `window`
- Calculates new view based on current state
- Calls `setView` which updates URL and triggers render

---

## Touch Navigation

| Gesture               | Action                     |
| --------------------- | -------------------------- |
| Single finger drag    | Pan                        |
| Pinch in/out          | Zoom at pinch center       |
| Double tap            | Zoom in 2x at tap location |
| Two-finger double tap | Zoom out 2x                |

### Implementation

The `ZoomPanManager` class already has touch handlers:

- `handleTouchStart`
- `handleTouchMove`
- `handleTouchEnd`

Changes needed:

1. Wire up touch events in `page.tsx` (currently only mouse events connected)
2. Add pinch-to-zoom logic (track two touch points, calculate distance delta)
3. Add double-tap detection with timer
4. Add CSS `touch-action: none` to canvas to prevent browser interference

---

## Browser History

### Debounced History Entries

Rapid navigation (scrolling, dragging) should not create many history entries.

Approach:

1. During active navigation, use `history.replaceState` (updates URL, no new entry)
2. After 500ms of inactivity, use `history.pushState` (creates entry)
3. Browser back/forward triggers `popstate` event
4. On `popstate`, read URL params and update view

This provides clean history for meaningful navigation points while avoiding clutter.

---

## Help Panel

Collapsible instructions panel in the UI:

```
+---------------------------------------------+
| Navigation Help                        [x]  |
+---------------------------------------------+
| Mouse                                       |
|   Scroll to zoom at cursor                  |
|   Click + drag to pan                       |
|                                             |
| Keyboard                                    |
|   Arrow keys: Pan                           |
|   +/- : Zoom in/out                         |
|   0: Reset view                             |
|   1-6: Load preset                          |
|   Esc: Cancel render                        |
|                                             |
| Touch                                       |
|   Drag to pan                               |
|   Pinch to zoom                             |
|   Double tap: Zoom in                       |
|                                             |
| Tip: Share your view via the URL!           |
+---------------------------------------------+
```

### Behavior

- Expanded on first visit (localStorage flag `helpDismissed`)
- Collapses to "?" button after dismissed
- Click "?" or press `h`/`?` to toggle
- Semi-transparent background, positioned in corner of canvas area

---

## Health Endpoint

New API route for container health probes:

**File:** `src/app/api/health/route.ts`

```typescript
export async function GET() {
  return Response.json({ status: "ok", timestamp: Date.now() });
}
```

Used by Azure Container Apps for:

- Startup probe (3s interval, 30 attempts)
- Readiness probe (10s interval)
- Liveness probe (30s interval)

---

## CI/CD Migration

### From

- Bitbucket Pipelines
- GCP Cloud Run
- devops-cloud-run repo

### To

- GitHub Actions
- Azure Container Apps
- devops-azure-container-apps repo (local: `/Users/sloan/code/devops-azure-container-apps`)

### Deploy Workflow

**File:** `.github/workflows/deploy.yml`

Triggers: Push to any branch

Steps:

1. Checkout code
2. Setup Node.js 20
3. Install dependencies (`npm ci`)
4. Build (`npm run build`)
5. Lint (`npm run lint`)
6. Type check (`npx tsc --noEmit`)
7. Authenticate to Azure via OIDC
8. Normalize branch name for resource naming
9. Build and push Docker image to ACR
10. Deploy Container App via Pulumi (`app/<appname>-<branch>` stack)

### Cleanup Workflow

**File:** `.github/workflows/cleanup.yml`

Triggers: Branch deletion

Steps:

1. Authenticate to Azure via OIDC
2. Run `pulumi destroy` on the branch's app stack
3. Remove the Pulumi stack

### Required GitHub Secrets

| Secret                     | Source                           |
| -------------------------- | -------------------------------- |
| `AZURE_CLIENT_ID`          | From infrastructure stack output |
| `AZURE_TENANT_ID`          | Azure Portal                     |
| `AZURE_SUBSCRIPTION_ID`    | Azure Portal                     |
| `AZURE_STORAGE_ACCOUNT`    | From bootstrap stack output      |
| `PULUMI_CONFIG_PASSPHRASE` | Chosen passphrase                |

### Required GitHub Variables

| Variable     | Value                |
| ------------ | -------------------- |
| `APP_NAME`   | `fractals-nextjs`    |
| `PULUMI_ORG` | Your Pulumi org name |

---

## File Changes

### New Files

| File                              | Purpose                              |
| --------------------------------- | ------------------------------------ |
| `src/app/api/health/route.ts`     | Health endpoint for container probes |
| `src/hooks/useUrlState.ts`        | URL state management hook            |
| `src/hooks/useKeyboardNav.ts`     | Keyboard navigation hook             |
| `src/components/ui/HelpPanel.tsx` | Collapsible instructions panel       |
| `.github/workflows/deploy.yml`    | Build and deploy workflow            |
| `.github/workflows/cleanup.yml`   | Branch cleanup workflow              |

### Modified Files

| File                  | Changes                                                     |
| --------------------- | ----------------------------------------------------------- |
| `src/app/page.tsx`    | Integrate URL state, keyboard nav, help panel, touch events |
| `src/lib/zoomPan.ts`  | Add pinch-to-zoom, double-tap detection                     |
| `src/lib/presets.ts`  | Add `getPresetByIndex(n)` helper                            |
| `src/app/globals.css` | Add `touch-action: none` for canvas                         |
| `CLAUDE.md`           | Update for Azure/GitHub Actions                             |
| `README.md`           | Update deployment docs, add navigation instructions         |

### Deleted Files

| File                      | Reason                     |
| ------------------------- | -------------------------- |
| `bitbucket-pipelines.yml` | Replaced by GitHub Actions |

### Unchanged Files

| File                         | Reason                                               |
| ---------------------------- | ---------------------------------------------------- |
| `src/lib/fractalRenderer.ts` | Rendering logic unchanged                            |
| `src/lib/mandelbrot.ts`      | Math calculations unchanged                          |
| `src/lib/colorMapping.ts`    | Color schemes unchanged                              |
| `Dockerfile`                 | Already configured correctly (port 8080, standalone) |

---

## Implementation Order

1. **URL state hook** - Foundation for all navigation
2. **Update page.tsx** - Integrate URL state, replace current state management
3. **Keyboard navigation** - Add hook and wire up
4. **Touch navigation** - Wire up existing handlers, add pinch/double-tap
5. **Help panel** - Add component and integrate
6. **Health endpoint** - Simple API route
7. **GitHub Actions** - Deploy and cleanup workflows
8. **Documentation** - Update CLAUDE.md and README.md
9. **Remove Bitbucket** - Delete old pipeline file
