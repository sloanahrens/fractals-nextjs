# Next Fractals - Interactive Fractal Explorer

A modern, interactive web application for exploring the infinite beauty of the Mandelbrot set, Julia sets and the Burning Ship, built with Next.js 16, React 19 and TypeScript.

![Next Fractals Preview](public/fractal-preview.png)

**Deployment:** A landing on `main` redeploys the staging service by itself.
Production changes only when the human tags a release, through the devops
system. The workflows under `.forgejo/workflows/` are described under
[Deployment](#deployment).

## Live app

- **Production** — https://fractals-nextjs-prod-robymk5mfq-uc.a.run.app — updated when the human tags a release (`v*`).
- **Staging** — https://fractals-nextjs-staging-robymk5mfq-uc.a.run.app — redeployed from `main` after every landing.

## Overview

Next Fractals is a real-time fractal generator that allows users to explore the Mandelbrot set, Julia sets and the Burning Ship with smooth zoom controls, customizable parameters, and preset configurations. The application uses optimized Canvas API rendering with progressive calculation techniques for smooth performance and provides an intuitive interface for mathematical visualization.

## Features

### 🎨 Interactive Visualization

- **Fractal Types**: Draw the Mandelbrot set, the Burning Ship or a Julia set, and pick the Julia constant from four named ones or choose Custom and type your own Real and Imaginary parts (each from -2 to 2, written as plain decimals like `-0.8` and `0.156`); an entry that is empty, not a number or out of range shows a message under the boxes and leaves the picture as it was, and a view link carries the point as `k=custom:<re>,<im>`
- **Fractal Switcher**: Three buttons over the top left of the picture — Mandelbrot, Julia and Burning Ship, the current one lit — change fractal in one click and fly to that fractal's showpiece place (Seahorse Valley, the Classic set's spirals, the Burning Ship's armada); Back returns to where you were. While Julia is current a row of chips offers its four named constants and Custom
- **Real-time Rendering**: Smooth fractal generation with optimized performance
- **Zoom Controls**: Zoom with the mouse wheel, a two-finger pinch on a touch screen, the Zoom In/Out buttons and the Zoom Level slider, which is logarithmic — equal slider steps are equal zoom ratios from 1x to 10000x
- **Pan Navigation**: Click and drag to explore different regions, or drag with one finger on a touch screen
- **Keyboard Navigation**: Focus the image, then pan with the arrow keys and zoom with `+` and `-`
- **Help Overlay**: A Help button in the top bar, or the `?` key from anywhere on the page, opens a dialog listing every way to drive the explorer — mouse and touch, keyboard, nearby places and Surprise me, Auto-wander, and the views and links
- **Center Controls**: Precise positioning with coordinate input under a line that reads the zoom and centre of the view on screen ("Zoom 400x at -0.7453, 0.1127"), and four boxes under Manual Coordinates that apply a view you type in: Apply says so when a box cannot be read or runs the wrong way, and notes when a box of another shape is fitted around its centre to the view's 4:3
- **Surprise me**: A button in the middle of the top bar flies to one of the nearby places at random, the way a Nearby tile does — the same crossfade and a single history entry — and never to the place you are already looking at. Press it again for another; it is disabled when no place is near enough to offer
- **Auto-wander**: Tick Auto-wander in the Auto-wander card of the Settings drawer and the view moves every few seconds: three small steps to a nearby interesting view, then a hop to a place from the catalogue (about one hop in six changes fractal; the steps in between stay on the fractal on screen)
- **Tour**: A screensaver. Leave the page alone for about 20 seconds (15 once a tour has played and been stopped), press Tour in the top bar, or open it with `#tour` on the address, and every control hides while the picture hops from place to place, about 8 seconds at each, crossfading between them. Any key, touch, click or mouse movement stops it and brings everything back on the place it was showing
- **Nearby Strip**: A strip along the bottom of the picture, headed "Nearby, worth a look", shows small pictures of up to six named places near the view — click one, or Tab to it and press Enter, and the picture flies there with a short crossfade. A More tile rotates in the next suggestions
- **Back and Forward**: Buttons in the top bar retrace the places you jumped to, and are disabled at the ends of the trail
- **Download PNG**: In the Settings drawer, save the canvas at its full resolution, named from the fractal and the view it shows
- **Shareable Links**: The address bar follows the view once a render settles, and the Copy link button in the Navigation card of the Settings drawer puts that URL — fractal, Julia constant, centre, zoom, colour scheme, iterations and canvas size — on the clipboard

### ⚙️ Customizable Parameters

- **Iteration Control**: Adjust detail level with iteration sliders
- **Auto Iterations**: Iterations follow the zoom level; unticking the checkbox takes manual control, and loading a preset turns it off because that preset was framed at its own count
- **Color Mapping**: Dynamic color schemes for enhanced visualization
- **Parameter Presets**: Quick access to interesting fractal configurations from the Presets dropdown in the Settings drawer, listing the built-in and saved views for the fractal selected now
- **Custom Presets**: Save and manage your own configurations; a saved view remembers its fractal and, for a Julia set, its constant

### 🚀 Technical Features

- **Canvas API Rendering**: Direct pixel manipulation for optimal performance
- **Progressive Rendering**: Rows are computed in chunks with a yield to the event loop between them, so the UI stays responsive
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **TypeScript**: Full type safety and enhanced developer experience
- **Controls Stay Usable**: Every control but Download PNG works while a render is running, and using one cancels the render in flight and starts the new one

### 🔧 Build, Test and Deploy

- **Containerized Deployment**: Docker-based deployment with multi-stage builds
- **Deploy Contract**: Root `Dockerfile`, server on `$PORT` (8080), `/api/health` route for probes
- **Quality Gate**: `make gate` runs install, lint, typecheck, build and the test suite
- **Integration Tier**: `make integration STAGING_URL=<url>` checks a deployment that is already up (see [Integration Tests](#integration-tests))
- **ESLint + TypeScript**: `make check` runs ESLint and `tsc --noEmit`

## Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Tests**: [Vitest](https://vitest.dev/) (`make test`), plus an integration tier against a deployed app (`make integration STAGING_URL=<url>`)
- **Performance**: Optimized Canvas API rendering

## Getting Started

### Prerequisites

- Node.js 20 or later — the `Dockerfile` and the landing gate image both build on Node 20
- npm (the repo commits a `package-lock.json`)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd fractals-nextjs
```

2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to start exploring!

## Docker Commands

For testing and deployment, you can use these Docker commands:

```bash
# Run the gate's checks in a container, the way the landing gate does
# (`make test-docker` runs this same command)
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Build production Docker image (`make docker-build`)
docker build --platform linux/amd64 -t fractals-nextjs:latest -f Dockerfile .

# Run production container locally (`make docker-run`)
docker run --rm -p 8080:8080 fractals-nextjs:latest
```

The production container will be available at [http://localhost:8080](http://localhost:8080).

## Integration Tests

`make test` is the unit suite: it covers the pure logic in `src/lib` and the
routes, and it never leaves this machine. The integration tier is the other
half. It calls a deployment that is already up — staging, or a container on
`localhost` — over the network, so it is deliberately not part of `make gate` or
`npm test`, which have to keep passing with no network at all.

`make integration` installs the dependencies it needs (`ci-install`) before it
runs them. The staging workflow checks the repository out fresh and runs this
one command, and a fresh checkout has no `node_modules` for `vitest` to be found
in. It checks `STAGING_URL` before that install rather than after, so a run that
forgot it says so in a second, not at the end of an `npm ci`.

```bash
# By hand, against staging:
make integration STAGING_URL=https://fractals-nextjs-staging-robymk5mfq-uc.a.run.app

# Or with npm, which is the command the `make` target ends with:
STAGING_URL=https://... npm run test:integration

# Against a container of your own, or a check of a specific commit:
docker run --rm -p 8080:8080 fractals-nextjs:latest
make integration STAGING_URL=http://localhost:8080 EXPECT_SHA=abc1234
```

Two environment variables, and no others:

- **`STAGING_URL`** (required) — the deployment to test. There is no default:
  the tier has nothing to call without it, and a run without it fails with the
  command to type. A trailing slash is fine.
- **`EXPECT_SHA`** (optional) — the commit the deployment should be serving.
  When it is set, `/api/version` must report exactly it, which is what makes the
  tier evidence that the commit just built is the commit live. Without it, the
  check only asks that the endpoint answers with a `commit` field at all.

Four checks, one `GET` each, read-only, 15 s per request and one retry:

- `GET /api/health` is 200 and `{"status":"healthy"}`.
- `GET /` is 200 and carries the `<h1>Fractal Explorer</h1>` and the document
  title `Next Fractals - Interactive Fractal Explorer`.
- `GET /api/version` is 200 JSON with a `commit` field, equal to `EXPECT_SHA`
  when that is set.
- `GET /fractal-preview.png` is 200 and a PNG. It is the social preview
  `src/app/layout.tsx` points its metadata at, so it is a static asset the page
  needs, and it is served out of `public/` by the `Dockerfile`.

What no check here asserts is anything that changes between deployments: not
what the canvas draws, not the fractal list, not the version footer's wording.
The tier answers "is the commit we just built the app that is answering, and are
its four endpoints up", and a browser smoke test is a later tier of its own.

The staging workflow runs `make integration STAGING_URL=<url> EXPECT_SHA=<commit>`
after it rolls staging onto a landing's commit. Its runner checks the repository
out fresh and holds no cloud credential, so the target installs its own
dependencies and needs nothing else.

## Usage

### Basic Navigation

- **The Page**: The picture fills the window, with a slim bar over it holding the title, Surprise me, Tour, Back, Forward, Help and Settings. The bar fades after two seconds without a pointer move, key press or touch and comes back on any of them, and it stays up while Settings is open or one of its buttons has keyboard focus. Settings opens a drawer down the right-hand side — a bottom sheet on a narrow screen — holding every control the page has: Presets, Navigation, Auto-wander, Coordinates, Rendering Parameters, Canvas Resolution, Manual Coordinates, saved views and Download PNG. Escape, its Close button and a click outside it close it, and opening it does not interrupt a render
- **Fractal switcher**: Over the top left of the picture, under the top bar, are three buttons — Mandelbrot, Julia and Burning Ship — with the fractal on screen lit (`aria-pressed`). One click goes to another fractal and lands on its featured place: Seahorse Valley for the Mandelbrot set, the spirals of the Classic Julia set, and the armada of the Burning Ship, each in its own colour scheme and at the iteration count Auto picks. It is a jump like a Nearby tile, with the same crossfade, and adds one history entry, so Back returns to the previous fractal and view. Pressing the fractal already shown does nothing. While Julia is current a second row of chips, Classic, Dendrite, Douady rabbit, Siegel disk and Custom, picks the constant: a named chip goes to the whole of that constant's set, and Custom opens Settings with the cursor in the Real box (the picture does not change until you type). The chip row scrolls sideways on a narrow screen. Unlike the top bar the switcher never fades; it is hidden while a tour plays and while Settings or Help is open. The Fractal and Julia constant selects in Settings stay, showing the same two values
- **Nearby strip**: Along the bottom of the picture, "Nearby, worth a look" shows up to six places near the view for the fractal you are on, each a small picture of what a click will show, in the place's own colour scheme (or your current one for a place that names none). Hover or Tab to a tile to read its name, and click it (or press Enter) to fly there: the old picture fades into the new one over about 0.4 s (no fade if your system asks for reduced motion), the place is drawn at the iteration count Auto picks for its zoom and in its own colours, and the move adds one history entry. More swaps in the next six, wrapping back to the first. The suggestions are worked out again once the picture has been drawn after a jump — a preset, applying coordinates, picking another fractal or Julia constant, a tile, a pasted link, Back or Forward — and not while you drag, wheel or key about, so the strip does not shuffle under your pointer. The thumbnails wait while the main picture renders. Unlike the top bar, the strip never fades: it stays on screen however long the page is left alone, so there is always a place to click
- **Back and Forward**: The top bar's Back and Forward buttons are the browser's own, moving along the places you jumped to; each is disabled when there is nothing in that direction, which is always so on a freshly opened page until the first jump
- **Zoom In/Out**: Use the mouse wheel, the Zoom In/Out buttons, or the Zoom Level slider. On a touch screen, pinch with two fingers: moving them apart zooms in and bringing them together zooms out, about the point between them, within the same 1x to 10000x range. Moving both fingers together pans as well, and lifting one finger carries on as a one-finger pan. A pinch, like a wheel or a drag, rewrites the current history entry and adds none
- **Pan**: Click and drag to move around the fractal, or drag with one finger on a touch screen
- **Keyboard**: Focus the image, then pan with the arrow keys and zoom with `+` and `-`
- **Reset View**: Return to the default view with the Reset View button

### Advanced Features

- **Custom Presets**: A view belongs to the fractal it was framed on, so each fractal in the Fractal select offers its own built-in views — six for the Mandelbrot set, five for Julia (the four named constants, and a second view of the Classic set's spirals) and two for the Burning Ship — in the Presets dropdown. Create and save your own fractal configurations (stored in browser localStorage). A saved view remembers the fractal it was saved on and, for a Julia set, its constant; loading it puts the Fractal and Julia constant selects back on that picture. The preset dropdown shows the built-in and saved views for the fractal selected now, and views saved for another fractal are kept and appear when that fractal is selected
- **Parameter Adjustment**: Fine-tune iterations and other settings; the Auto iterations checkbox lets the zoom pick the count, and unticking it hands that count to the slider
- **Saving an Image**: The Download PNG button in the Settings drawer saves the canvas at its full resolution, under the fractal's name and the view's centre and zoom
- **Controls During a Render**: Controls stay usable while a render runs; using one cancels that render and draws the new view instead
- **Sharing a View**: Once a render finishes the address bar carries the view, so it can be bookmarked or copied from the browser itself. Copy link in the Settings drawer's Navigation card copies the current URL and says "Link copied" for two seconds; a browser that will not take a clipboard write shows the URL in a read-only field with the text already selected. A link shows the view it names — the fields it carries applied together, the page's defaults left standing for the rest — whether it is opened as the page loads or pasted into the address bar of a page already open, where it changes that page's view without a reload; either way the fields the link could not be read for are the page's defaults rather than a refusal, so the URL is the view and the address bar is rewritten to match it. A link names no preset
  The browser's Back and Forward buttons, and the top bar's, retrace jumps: choosing a preset, applying coordinates, picking another fractal or Julia constant from its select or from the fractal switcher, or choosing a Nearby tile adds a history entry, while dragging, zooming, the keys, the sliders and Auto-wander only update the current one.
- **Blank-picture hint**: A deep zoom can land somewhere with nothing to see, a field of one colour. When a full render has settled on a picture that is nearly one colour (98% of an evenly spaced sample within a small colour distance of the commonest one) and has stood for 0.6 s, a small pill appears at the top centre of the picture: "Nothing to see here. Try a nearby place, or go back." with a Back button that does what the top bar's Back does. It only says so, never moves the view, and takes no pointer events outside its own box; the Back button is left out when there is nowhere to go back to. It goes as soon as the view changes or a render starts. No default view or catalogue place shows it
- **Surprise me**: The top bar's centre button picks one place at random from the six the Nearby strip would lead with and goes there exactly as a tile click does, so the transition is the same and the jump is one history entry. It never picks the place the view already is, so pressing it again right away always goes somewhere new, and it is disabled when no place is near enough to offer
- **Auto-wander**: Tick Auto-wander in the Auto-wander card of the Settings drawer (it was the Random walk checkbox in the Navigation card) and set the seconds between steps (1 to 120, 5 by default). Once each render finishes, the view waits that long and then moves one step; the line under the controls counts the wait down. Every fourth step is a hop to a place from the catalogue, chosen as a Tour chooses (never the place on screen, not one visited lately, and about one hop in six moves to another fractal) and reached the way a Nearby tile is, with its crossfade, scheme and Julia constant, but rewriting the current history entry instead of adding one. The other three steps are small drifts, as before, on the fractal on screen. A drift that leaves a nearly one-colour picture is replaced at once by a hop. Untick the box to stop, and move the view by hand — drag, wheel, key, button or preset — to start the interval again. Auto-wander pauses while the tab is in the background
- **Tour**: A tour plays on its own, hiding the top bar, the Nearby strip, the progress line and the pointer, and hopping to a place from the catalogue every 8 seconds with a 1.5 s crossfade (a plain cut if your system asks for reduced motion; the 8 seconds stay). Most hops stay on the fractal on screen, and about one in six moves to another fractal. It starts three ways: after about 20 seconds without a key, touch, click or pointer move (counted only while this window has focus; once a tour has played and been stopped, 15 seconds), by pressing Tour in the top bar, or at once from a link — `#tour` on its own opens the default Mandelbrot view and tours from it, and `tour=1` added to a view link (`#v=1&…&tour=1`) tours from the view that link describes. The address bar goes back to following the view as soon as the tour has started; `tour=1` is never written by the page. A tour never starts while the Settings drawer or Help is open or a text box has focus, never in a background tab, and never over a render still in flight (it waits for the picture to be drawn). Any key, touch, click, mouse movement or wheel stops it at once and everything comes back as it was, on the place the tour was showing, so a Nearby tile can be clicked straight away. While it plays the address bar is left alone, so a long tour adds no history entries; stopping adds one for the place on screen, and Back returns to the view you had before the tour. Auto-wander is held while a tour plays and starts a fresh interval after it. Where the browser has a screen wake lock, one is held while the tour plays

## Project Structure

```
├── .forgejo/workflows/     # gate.yml (landing gate, `make gate` on land/**);
│                           #   staging.yml (main to staging on a landing),
│                           #   deploy.yml and teardown.yml (release and teardown)
├── deploy/                 # Pulumi program that deploys the app to Cloud Run
├── docs/                   # Design notes
│   ├── design/             # guided-exploration.md: the design the page was rebuilt to, and where the build differs
│   └── plans/              # Earlier design plans
├── public/                 # Static assets
├── scripts/release/        # Release scripts a release runs
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout with meta tags
│   │   ├── page.tsx        # Main fractal viewer page
│   │   ├── globals.css     # Global styles
│   │   └── api/
│   │       ├── health/route.ts  # Health check endpoint
│   │       └── version/route.ts # Build, deploy time, commit and revision as JSON
│   ├── components/ui/      # UI components
│   │   ├── __tests__/              # Tests for the form controls' labels
│   │   ├── BlankHint.tsx           # The "Nothing to see here" pill with a Back button
│   │   ├── Button.tsx              # Button
│   │   ├── CenterControls.tsx      # The Real (X) and Imaginary (Y) centre boxes with Apply and Reset
│   │   ├── Checkbox.tsx            # Checkbox
│   │   ├── CustomPresetManager.tsx # Saved views: Save Current, the list, Delete
│   │   ├── FractalSwitcher.tsx     # The Mandelbrot / Julia / Burning Ship buttons and Julia's constant chips over the canvas
│   │   ├── HelpDialog.tsx          # The Help overlay, a modal <dialog>
│   │   ├── Input.tsx               # Text and number box
│   │   ├── NearbyStrip.tsx         # The "Nearby, worth a look" thumbnails over the bottom of the canvas
│   │   ├── PresetSelector.tsx      # The Presets dropdown
│   │   ├── Select.tsx              # Select
│   │   ├── SettingsDrawer.tsx      # The Settings <dialog>: right-hand panel, bottom sheet under 768 px
│   │   ├── Slider.tsx              # Slider
│   │   ├── TopBar.tsx              # Title, Surprise me, Tour, Back, Forward, Help and Settings
│   │   ├── useIdleVisibility.ts    # The top bar's idle fade
│   │   └── VersionFooter.tsx       # Which build is being served, from /api/version
│   ├── lib/                # Core logic and utilities
│   │   ├── __tests__/              # Unit tests for the modules below
│   │   ├── blankView.ts            # Whether a settled picture is nearly one colour
│   │   ├── burningShip.ts          # Burning Ship iteration
│   │   ├── canvasNavigation.ts     # Wheel, drag, touch and key listeners
│   │   ├── colorMapping.ts         # Color schemes
│   │   ├── customConstantInput.ts  # Real and Imaginary boxes to a custom Julia constant
│   │   ├── download.ts             # Filename a saved canvas is written under
│   │   ├── fractalKinds.ts         # Registry of drawable fractals, looked up by id
│   │   ├── fractalRenderer.ts      # Canvas rendering engine
│   │   ├── fractalTypes.ts         # The Fractal select's list, and choice to kind and default view
│   │   ├── helpEntries.ts          # Help overlay text and the rule behind the ? key
│   │   ├── integrationTarget.ts    # STAGING_URL and EXPECT_SHA for the integration tier
│   │   ├── idleFade.ts             # The top bar's idle clock and its timing constants
│   │   ├── journey.ts              # The page's record of its history entries (jumps)
│   │   ├── julia.ts                # Julia sets, named constants and custom:<re>,<im> names
│   │   ├── mandelbrot.ts           # Mandelbrot iteration and coordinates
│   │   ├── manualBounds.ts         # Checks the Manual Coordinates boxes
│   │   ├── nearbyStrip.ts          # When the Nearby suggestions refresh, which show, the crossfade time
│   │   ├── pinch.ts                # Pinch helpers: finger distance, midpoint, scale about a point
│   │   ├── placeThumbnails.ts      # Off-screen place pictures: LRU cache, queue, cancel and pause
│   │   ├── places.ts               # Catalogue of named places, suggest() for the ones near a view, and each fractal's featured place
│   │   ├── presets.ts              # Built-in and saved presets
│   │   ├── renderQuality.ts        # Preview vs full-resolution decisions
│   │   ├── surprise.ts             # Where Surprise me goes: one of the six nearest suggestions, picked at random
│   │   ├── tour.ts                 # Where an unattended tour goes next (seeded, with a recent window)
│   │   ├── tourMode.ts             # The tour's clock: idle start, #tour and button starts, hops, and when it gives way
│   │   ├── version.ts              # Build and deploy facts, and the footer wording
│   │   ├── viewReadout.ts          # The "Zoom 400x at -0.7453, 0.1127" line above the coordinate boxes
│   │   ├── viewLink.ts             # A view as a URL fragment, and back
│   │   ├── viewLinkState.ts        # What a link means for the page, and the address-bar throttle
│   │   ├── wakeLock.ts             # Best-effort screen wake lock held while a tour plays
│   │   ├── wander.ts               # One Auto-wander step
│   │   ├── wanderController.ts     # The walk's countdown, what suspends it, and which steps are hops
│   │   ├── wheelZoom.ts            # The zoom factor one wheel event asks for, from how far it scrolled
│   │   ├── zoomPan.ts              # Zoom and pan manager
│   │   └── zoomScale.ts            # Logarithmic zoom slider mapping, coordinate formatting
│   ├── __tests__/          # Route tests, and tests that read page.tsx and the Makefile
│   └── types/              # TypeScript type definitions (fractal.ts: FractalKind, bounds)
├── tests/integration/      # Integration tier: checks against a deployed app
│                           #   (deployed.test.ts is the checks, http.ts the request helper)
├── Dockerfile              # Multi-stage container build
├── Makefile                # install, dev, build, start, lint, format, typecheck, check, test, presubmit, gate, integration, deploy-check, docker-*, test-docker, clean
├── next.config.js          # Next.js configuration
├── package.json            # Scripts and dependencies
├── tsconfig.json           # TypeScript configuration
├── eslint.config.mjs       # ESLint flat config
├── vitest.config.mts       # Vitest configuration (the unit suite)
├── vitest.integration.config.mts # Vitest configuration (the integration tier)
└── tailwind.config.js      # Tailwind configuration
```

(`.beads/`, `.claude/`, `.runtime/` and `CLAUDE.local.md` are local agent state,
not part of the project.)

## Mathematics Behind the Magic

All three fractals share one escape-time loop: iterate, and count the steps
until `|z|² > 4`. A point that has not escaped after the maximum number of
iterations is drawn black. They differ in where the orbit starts and what each
step does.

The Mandelbrot set is defined by the iterative formula:

```
z₀ = 0
z_{n+1} = z_n² + c
```

Where `c` is a complex number representing each pixel's coordinate.

A Julia set swaps the roles: the pixel is where the orbit starts, and `c` is
one fixed point for the whole picture.

```
z₀ = the pixel
z_{n+1} = z_n² + c      (c fixed)
```

`c` is one of four named points (Classic −0.8 + 0.156i, Dendrite i,
Douady rabbit −0.123 + 0.745i, Siegel disk −0.391 − 0.587i) or, with Custom, any
point whose real and imaginary parts are each from −2 to 2.

The Burning Ship is the Mandelbrot loop with both parts of `z` folded onto the
positive side before squaring:

```
z₀ = 0
z_{n+1} = (|Re z_n| + i|Im z_n|)² + c
```

An orbit that escapes is counted with the same smoothing for all three,
`n + 1 − log₂(log₂|z|)`, so a colour scheme looks alike on each.

## Performance Optimization

- **Canvas API Rendering**: Direct pixel manipulation for optimal performance
- **Progressive Rendering**: Rows are computed in chunks with a yield to the event loop between them, so the UI stays responsive
- **Cancellable Operations**: Rendering can abort when parameters change mid-calculation
- **Preview Passes**: A gesture redraws at low resolution and the full-resolution render is deferred to the end of the gesture

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Acknowledgments

- Inspired by the mathematical beauty of Benoit Mandelbrot's work
- Built with modern web technologies for optimal performance
- Designed for both mathematical exploration and visual enjoyment

## Deployment

This repo holds no cloud credential, and nothing here updates production.
Staging follows `main` by itself; a release is done only by the human, through
the devops system. Four workflows live in `.forgejo/workflows/`:

- **`gate.yml`** — the landing gate. A push to a `land/**` branch starts it, and
  it runs `make gate`.
- **`staging.yml`** — a push to `main` starts it. The landing worker is the only
  account that pushes `main`, so it runs once per landing: it builds that commit
  and rolls the staging service onto it, and never touches production.
- **`deploy.yml`** — the release flow. A protected `v*` tag pushed by the human
  starts it; it builds and pushes the image, deploys it to staging, and promotes
  that same digest to prod.
- **`teardown.yml`** — destroys the app's two stacks. A protected `teardown-v*`
  tag pushed by the human starts it.

The image contract the deploy system relies on is a root `Dockerfile`, a server
that listens on `$PORT` (8080), the `/api/health` route, and no baked secrets.
The program that deploys the app is `deploy/` (`deploy/README.md`), and the
scripts a release runs are in `scripts/release/` (`scripts/release/README.md`).

### Local Docker

```bash
# Build and run locally
docker build -t fractals-nextjs .
docker run -p 8080:8080 fractals-nextjs
```

---

**Explore the infinite complexity of mathematics through interactive visualization.**
