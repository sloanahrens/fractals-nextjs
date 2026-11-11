import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at `/manifest.webmanifest`, so "Add to home
 * screen" installs the app full-screen under its own name rather than as a
 * browser tab.
 *
 * The colours are the page's `--background` in `globals.css` (`0 0% 100%`,
 * white), which is what the body paints; the test holds the two together. The
 * icon is `app/icon.png`, which Next serves at `/icon.png`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fractals",
    short_name: "Fractals",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
  };
}
