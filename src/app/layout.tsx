import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { siteOrigin } from "@/lib/siteOrigin";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const TITLE = "Next Fractals - Interactive Fractal Explorer";
const DESCRIPTION =
  "Generate beautiful fractals with real-time parameter adjustment. Explore the Mandelbrot set, Julia sets, the Burning Ship, the Tricorn, the Multibrot sets and the Newton fractal with customizable parameters, zoom controls, and preset configurations.";

// The social card, public/og-card.png (scripts/make-og-card.mjs draws it). The
// size is the file's own, which is what og:image:width and height must say.
const CARD_PATH = "/og-card.png";
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const CARD_ALT =
  "Fractal Explorer: a colourful Julia set spiral beside the title and the line Wander the Mandelbrot, Julia and Burning Ship sets";

/**
 * The page's metadata, with every absolute URL on the origin that served the
 * request. One image goes to staging and production unchanged, so the origin
 * cannot be baked in at build time; `siteOrigin` reads it from the proxy's
 * headers and validates it before it reaches the page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const origin = siteOrigin((name) => requestHeaders.get(name), {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  const card = `${origin}${CARD_PATH}`;

  return {
    metadataBase: new URL(origin),
    title: TITLE,
    description: DESCRIPTION,
    keywords: [
      "fractals",
      "mandelbrot",
      "mathematics",
      "visualization",
      "interactive",
    ],
    authors: [{ name: "Sloan Ahrens" }],
    creator: "Sloan Ahrens",
    publisher: "Sloan Ahrens",
    openGraph: {
      type: "website",
      locale: "en_US",
      url: `${origin}/`,
      title: TITLE,
      description: DESCRIPTION,
      images: [
        {
          url: card,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          alt: CARD_ALT,
          type: "image/png",
        },
      ],
      siteName: "Next Fractals",
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description:
        "Generate beautiful fractals with real-time parameter adjustment. Explore infinite mathematical beauty.",
      images: [{ url: card, alt: CARD_ALT }],
      creator: "@sloanahrens",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        <div className="min-h-full bg-background text-foreground">
          {children}
        </div>
      </body>
    </html>
  );
}
