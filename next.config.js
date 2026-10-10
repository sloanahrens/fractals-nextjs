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
  // The pre-built link previews under public/og (fr-xnl): one picture per
  // catalogue place, a static file Next would otherwise serve with
  // `Cache-Control: public, max-age=0` and an ETag, so a crawler or a browser
  // revalidates one on every share. They change only when
  // `scripts/make-og-previews.mjs` is run, so they can be cached for a day and
  // served stale for a week while that happens.
  //
  // This rule covers `/og/...` and nothing else: the page, the health route
  // and every other asset keep the headers they had (`next.config` caching is
  // not something to widen without knowing what is behind it).
  async headers() {
    return [
      {
        source: "/og/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
