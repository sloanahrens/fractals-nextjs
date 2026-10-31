/**
 * The head's metadata, read the way a card consumer reads it
 *
 * The Twitter creator is the one metadata field this app leaves to the
 * deployment, so more than one test asks what a metadata object carries there.
 * The cast lives here once, because `Metadata`'s `twitter` field is wider than
 * the one property the tests care about.
 */
import type { pageMetadata } from "../pageMetadata";

/** The creator tag a metadata object carries, if it carries one. */
export function creatorOf(metadata: ReturnType<typeof pageMetadata>) {
  return (metadata.twitter as { creator?: string }).creator;
}
