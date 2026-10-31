import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { pageMetadataConfig } from "@/lib/deploymentParams";
import { pageMetadata } from "@/lib/pageMetadata";
import { requestOrigin } from "./requestOrigin";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * The page's metadata, with every absolute URL on the origin that served the
 * request (`pageMetadata`). This is the head for a request with no view in it;
 * the page adds the view a shared query link names, which a layout cannot see
 * because only a page is given the search parameters.
 */
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await requestOrigin(), {}, pageMetadataConfig());
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
