# Multi-stage Dockerfile for Next.js app optimized for GCP Cloud Run
# Uses multi-stage builds to minimize final image size and improve security

# ================================
# Stage 1: Builder
# Purpose: Build the Next.js application with all dependencies
# This stage includes dev dependencies needed for building
# ================================
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files and install ALL dependencies (including devDependencies)
# Dev dependencies are needed for the build process (TypeScript, build tools, etc.)
COPY package.json package-lock.json ./
RUN npm ci && \
    npm cache clean --force

# Copy all source code files
# This happens after dependency installation to leverage caching
# deploy/params.json is read in this stage, once, by next.config.js: the handle
# it names is compiled into the server, so the file is not carried into the
# image. A checkout without the file builds exactly as one that sets no value.
COPY . .

# Build the Next.js application
# NEXT_TELEMETRY_DISABLED: Disables Next.js telemetry data collection
# NODE_ENV=production: Ensures production optimizations are applied
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ================================
# Stage 2: Runner (Production)
# Purpose: Minimal runtime environment with only necessary files
# This is the final image that will be deployed
# ================================
FROM node:22-alpine AS runner
WORKDIR /app

# Create a non-root user for security best practices
# Running as non-root prevents container privilege escalation
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# PORT: Cloud Run automatically sets this, but we provide a default
# HOSTNAME: Bind to all network interfaces (required for container environments)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Copy only the necessary files from the builder stage
# public/: Static assets (images, fonts, etc.)
# .next/standalone/: Contains the minimal server and dependencies
# .next/static/: Contains static files generated during build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Note: No need to copy node_modules when using standalone output
# The standalone build already includes all necessary dependencies

# Change ownership of all files to the non-root user
# This ensures the application can read/write necessary files
RUN chown -R nextjs:nodejs /app

# Switch to non-root user for security
# All subsequent commands will run as this user
USER nextjs

# GIT_SHA: the commit this image was built from, passed by the release build as
# --build-arg GIT_SHA=<commit> and read back per request by /api/version. It is
# declared after the copies so a new commit does not invalidate them, and it
# defaults to empty so a plain `docker build` leaves the app exactly as it was
# (the version route reports null for an unset or malformed value).
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

# Expose port 8080 (Cloud Run's default port)
# This is documentation only - actual port binding is handled by Docker
EXPOSE 8080

# Start the Next.js standalone server
# server.js is created by Next.js when output: 'standalone' is configured
CMD ["node", "server.js"]