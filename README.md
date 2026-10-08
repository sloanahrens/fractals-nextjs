# Next Fractals - Interactive Mandelbrot Set Generator

A modern, interactive web application for exploring the infinite beauty of the Mandelbrot set, built with Next.js 16, React 19 and TypeScript.

![Next Fractals Preview](public/fractal-preview.png)

**Deployment:** No push to this repo deploys anything. The workflows under
`.forgejo/workflows/` are described under [Deployment](#deployment); an actual
release is done only by the human, through the devops system.

## Overview

Next Fractals is a real-time fractal generator that allows users to explore the Mandelbrot set with smooth zoom controls, customizable parameters, and preset configurations. The application uses optimized Canvas API rendering with progressive calculation techniques for smooth performance and provides an intuitive interface for mathematical visualization.

## Features

### 🎨 Interactive Visualization

- **Real-time Rendering**: Smooth fractal generation with optimized performance
- **Zoom Controls**: Zoom with the mouse wheel, the Zoom In/Out buttons and the Zoom Level slider
- **Pan Navigation**: Click and drag to explore different regions, or drag with one finger on a touch screen
- **Center Controls**: Precise positioning with coordinate input

### ⚙️ Customizable Parameters

- **Iteration Control**: Adjust detail level with iteration sliders
- **Color Mapping**: Dynamic color schemes for enhanced visualization
- **Parameter Presets**: Quick access to interesting fractal configurations
- **Custom Presets**: Save and manage your own configurations

### 🚀 Technical Features

- **Canvas API Rendering**: Direct pixel manipulation for optimal performance
- **Progressive Rendering**: Rows are computed in chunks with a yield to the event loop between them, so the UI stays responsive
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **TypeScript**: Full type safety and enhanced developer experience

### 🔧 Build, Test and Deploy

- **Containerized Deployment**: Docker-based deployment with multi-stage builds
- **Deploy Contract**: Root `Dockerfile`, server on `$PORT` (8080), `/api/health` route for probes
- **Quality Gate**: `make gate` runs install, lint, typecheck, build and the test suite
- **ESLint + TypeScript**: `make check` runs ESLint and `tsc --noEmit`

## Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with App Router
- **UI**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Tests**: [Vitest](https://vitest.dev/) (`make test`)
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

## Usage

### Basic Navigation

- **Zoom In/Out**: Use the mouse wheel, the Zoom In/Out buttons, or the Zoom Level slider
- **Pan**: Click and drag to move around the fractal, or drag with one finger on a touch screen
- **Reset View**: Return to the default view with the Reset View button

### Advanced Features

- **Custom Presets**: Create and save your own fractal configurations (stored in browser localStorage)
- **Parameter Adjustment**: Fine-tune iterations and other settings

## Project Structure

```
├── .forgejo/workflows/     # gate.yml (landing gate, `make gate` on land/**);
│                           #   deploy.yml and teardown.yml (release and teardown)
├── deploy/                 # Pulumi program that deploys the app to Cloud Run
├── docs/                   # Design notes
├── public/                 # Static assets
├── scripts/release/        # Release scripts the deploy runner executes
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout with meta tags
│   │   ├── page.tsx        # Main fractal viewer page
│   │   ├── globals.css     # Global styles
│   │   └── api/health/route.ts # Health check endpoint
│   ├── components/ui/      # Reusable UI components
│   ├── lib/                # Core logic and utilities
│   │   ├── canvasNavigation.ts # Wheel, drag and touch listeners
│   │   ├── colorMapping.ts     # Color schemes
│   │   ├── fractalRenderer.ts  # Canvas rendering engine
│   │   ├── mandelbrot.ts       # Mandelbrot iteration and coordinates
│   │   ├── presets.ts          # Built-in and saved presets
│   │   ├── renderQuality.ts    # Preview vs full-resolution decisions
│   │   └── zoomPan.ts          # Zoom and pan manager
│   ├── __tests__/          # Test for the health route
│   └── types/              # TypeScript type definitions
├── Dockerfile              # Multi-stage container build
├── Makefile                # install, dev, build, check, test, gate, docker-*
├── next.config.js          # Next.js configuration
├── package.json            # Scripts and dependencies
├── vitest.config.mts       # Vitest configuration
└── tailwind.config.js      # Tailwind configuration
```

(`.beads/`, `.claude/`, `.runtime/` and `CLAUDE.local.md` are local agent state,
not part of the project.)

## Mathematics Behind the Magic

The Mandelbrot set is defined by the iterative formula:

```
z₀ = 0
z_{n+1} = z_n² + c
```

Where `c` is a complex number representing each pixel's coordinate. Points that don't diverge to infinity after a maximum number of iterations are considered part of the set.

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

This repo does not deploy itself, and no workflow here holds a cloud
credential. Deployment is done only by the human, through the devops system.
Three workflows live in `.forgejo/workflows/`:

- **`gate.yml`** — the landing gate. A push to a `land/**` branch starts it, and
  it runs `make gate`. That is the only workflow a push to this repo starts.
- **`deploy.yml`** — the release flow. A protected `v*` tag pushed by the human
  starts it, on the `deploy` runner; it builds and pushes the image, deploys it
  to staging, and promotes that same digest to prod.
- **`teardown.yml`** — destroys the app's two stacks. A protected `teardown-v*`
  tag pushed by the human starts it, on the same runner.

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
