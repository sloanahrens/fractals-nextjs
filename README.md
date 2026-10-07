# Next Fractals - Interactive Mandelbrot Set Generator

A modern, interactive web application for exploring the infinite beauty of the Mandelbrot set, built with Next.js 14 and TypeScript.

![Next Fractals Preview](public/fractal-preview.png)

**Deployment:** This repo contains no deploy pipeline. Deployment is done only
by the human through the devops system.

## Overview

Next Fractals is a real-time fractal generator that allows users to explore the Mandelbrot set with smooth zoom controls, customizable parameters, and preset configurations. The application uses optimized Canvas API rendering with progressive calculation techniques for smooth performance and provides an intuitive interface for mathematical visualization.

## Features

### 🎨 Interactive Visualization

- **Real-time Rendering**: Smooth fractal generation with optimized performance
- **Zoom Controls**: Seamless zooming with mouse wheel and touch gestures
- **Pan Navigation**: Click and drag to explore different regions
- **Center Controls**: Precise positioning with coordinate input

### ⚙️ Customizable Parameters

- **Iteration Control**: Adjust detail level with iteration sliders
- **Color Mapping**: Dynamic color schemes for enhanced visualization
- **Parameter Presets**: Quick access to interesting fractal configurations
- **Custom Presets**: Save and manage your own configurations

### 🚀 Technical Features

- **Canvas API Rendering**: Direct pixel manipulation for optimal performance
- **Progressive Rendering**: Non-blocking calculations with requestAnimationFrame
- **Responsive Design**: Works seamlessly across desktop and mobile devices
- **TypeScript**: Full type safety and enhanced developer experience

### 🔧 DevOps & CI/CD Features

- **Containerized Deployment**: Docker-based deployment with multi-stage builds
- **Deploy Contract**: Root `Dockerfile`, server on `$PORT` (8080), `/api/health` route for probes
- **Quality Gate**: `make gate` runs install, lint, typecheck, build and the test suite
- **ESLint + TypeScript**: Code quality and type checking in CI

## Technology Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Performance**: Optimized Canvas API rendering
- **UI Components**: Custom React components with modern design

## Getting Started

### Prerequisites

- Node.js 18.0 or later
- npm or yarn package manager

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
# Test CI/CD pipeline locally (runs build, lint, and type checking)
docker run --rm -v $(pwd):/app -w /app node:20-alpine sh -c "npm ci && npm run build && npm run lint && npx tsc --noEmit"

# Build production Docker image
docker build --platform linux/amd64 -t fractals-next:test -f Dockerfile .

# Run production container locally
docker run --rm -p 8080:8080 fractals-next:test
```

The production container will be available at [http://localhost:8080](http://localhost:8080).

## Usage

### Basic Navigation

- **Zoom In/Out**: Use mouse wheel or zoom controls
- **Pan**: Click and drag to move around the fractal
- **Reset**: Use preset configurations to jump to interesting locations

### Advanced Features

- **Custom Presets**: Create and save your own fractal configurations (stored in browser localStorage)
- **Parameter Adjustment**: Fine-tune iterations and other settings

## Project Structure

```
├── .forgejo/workflows/     # Landing gate (make gate)
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout with meta tags
│   │   ├── page.tsx        # Main fractal viewer page
│   │   ├── globals.css     # Global styles
│   │   └── api/health/route.ts # Health check endpoint
│   ├── components/ui/      # Reusable UI components
│   ├── lib/                # Core logic and utilities
│   └── types/              # TypeScript type definitions
├── Dockerfile              # Multi-stage container build
└── public/                 # Static assets
```

## Mathematics Behind the Magic

The Mandelbrot set is defined by the iterative formula:

```
z₀ = 0
z_{n+1} = z_n² + c
```

Where `c` is a complex number representing each pixel's coordinate. Points that don't diverge to infinity after a maximum number of iterations are considered part of the set.

## Performance Optimization

- **Canvas API Rendering**: Direct pixel manipulation for optimal performance
- **Progressive Rendering**: Non-blocking calculations with requestAnimationFrame
- **Cancellable Operations**: Rendering can abort when parameters change mid-calculation
- **Memory Management**: Efficient canvas and data structure handling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the mathematical beauty of Benoit Mandelbrot's work
- Built with modern web technologies for optimal performance
- Designed for both mathematical exploration and visual enjoyment

## Deployment

This repo does not deploy itself. Deployment is done only by the human, through
the devops system; there is no CI/CD pipeline in this repo and no cloud
credentials here. The image contract the deploy system relies on is a root
`Dockerfile`, a server that listens on `$PORT` (8080), the `/api/health` route,
and no baked secrets.

### Local Docker

```bash
# Build and run locally
docker build -t fractals-nextjs .
docker run -p 8080:8080 fractals-nextjs
```

---

**Explore the infinite complexity of mathematics through interactive visualization.**
