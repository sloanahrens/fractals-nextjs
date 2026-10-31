import type { Metadata } from "next";
import { pageMetadataConfig } from "@/lib/deploymentParams";
import { ogUrl, pageMetadata } from "@/lib/pageMetadata";
import type { SearchParams } from "@/lib/viewPreview";
import FractalExplorer from "./FractalExplorer";
import { requestOrigin } from "./requestOrigin";

/**
 * The head for this request. A shared view link carries its view in the query
 * (`/?v=1&f=julia&...`), which a crawler sees and the part after `#` never
 * reaches, so the page is where the search parameters are read: when they name
 * a view the codec can read, og:image is the pre-built picture of the nearest
 * place of that view's fractal; otherwise this is the head the layout gives.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return pageMetadata(
    await requestOrigin(),
    await searchParams,
    pageMetadataConfig(),
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // og:url is the one head tag the page writes itself, because Next's metadata
  // API cannot keep the root's slash (`ogUrl` says why). React hoists a `<meta>`
  // rendered here into the head, and `pageMetadata` leaves the field out, so
  // there is one og:url and it is this one.
  const url = ogUrl(await requestOrigin(), await searchParams);

  return (
    <>
      <meta property="og:url" content={url} />
      <FractalExplorer />
    </>
  );
}
