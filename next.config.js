/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  // Read once, as the config loads, which is the start of `next build`: the
  // Docker build context has no .git and the image is built without build
  // arguments, so this is the one moment the build time is knowable. The build
  // replaces each `process.env.NEXT_PUBLIC_BUILD_TIME` it compiles with this
  // value, which is what lets /api/version report it from a running server.
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

module.exports = nextConfig;
