import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://fractals.team.trabian.ai",
  ),
  title: "Next Fractals - Interactive Fractal Explorer",
  description:
    "Generate beautiful fractals with real-time parameter adjustment. Explore the Mandelbrot set, Julia sets and the Burning Ship with customizable parameters, zoom controls, and preset configurations.",
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
    url:
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === "production"
        ? "https://next-fractals-app.run.app"
        : "http://localhost:3000"),
    title: "Nextjs Fractals - Interactive Fractal Explorer",
    description:
      "Generate beautiful fractals with real-time parameter adjustment. Explore the Mandelbrot set, Julia sets and the Burning Ship with customizable parameters, zoom controls, and preset configurations.",
    images: [
      {
        url: "/fractal-preview.png",
        width: 1200,
        height: 630,
        alt: "Nextjs Fractals - Mandelbrot Set Visualization",
        type: "image/png",
      },
    ],
    siteName: "Next Fractals",
  },
  twitter: {
    card: "summary_large_image",
    title: "Next Fractals - Interactive Fractal Explorer",
    description:
      "Generate beautiful fractals with real-time parameter adjustment. Explore infinite mathematical beauty.",
    images: ["/fractal-preview.png"],
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
