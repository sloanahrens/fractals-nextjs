/** The attributes of every `<tag ...>` in `html`, keys lower-cased. */
function tagsNamed(html: string, tag: string): Record<string, string>[] {
  const found: Record<string, string>[] = [];
  for (const match of html.matchAll(new RegExp(`<${tag}\\s([^>]*)>`, "gi"))) {
    const attributes: Record<string, string> = {};
    for (const pair of match[1].matchAll(/([\w:-]+)="([^"]*)"/g)) {
      attributes[pair[1].toLowerCase()] = pair[2]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
    }
    found.push(attributes);
  }
  return found;
}

/**
 * The `content` of the first `<meta>` whose `property` or `name` is `key`.
 *
 * @param html - The served page
 * @param key - e.g. `og:image` or `twitter:image`
 * @returns The content, or null when the page has no such tag
 */
export function metaContent(html: string, key: string): string | null {
  const tag = tagsNamed(html, "meta").find(
    (attributes) => attributes.property === key || attributes.name === key,
  );
  return tag?.content ?? null;
}

/**
 * The `href` of the first `<link>` whose `rel` includes `rel`.
 *
 * @param html - The served page
 * @param rel - e.g. `icon` or `apple-touch-icon`
 * @returns The href, or null when the page has no such link
 */
export function linkHref(html: string, rel: string): string | null {
  const tag = tagsNamed(html, "link").find((attributes) =>
    (attributes.rel ?? "").split(/\s+/).includes(rel),
  );
  return tag?.href ?? null;
}
