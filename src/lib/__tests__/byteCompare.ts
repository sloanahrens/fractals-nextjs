/**
 * Holding one picture to another byte for byte, and saying where they part.
 *
 * A test that compared a repaint with a full render used to write
 * `expect(Array.from(a)).toEqual(Array.from(b))`: two 3,072-element copies and a
 * deep comparison of both, for every scheme, Reverse and Shift it checked, which
 * was about 40% of `fractalRendererTrap.test.ts`'s cost. One walk over the two
 * buffers answers with the index of the first byte that differs — or -1 for
 * none — so `expect(firstDifference(a, b)).toBe(-1)` names that index in its
 * failure, which is the whole of what the copied arrays said.
 *
 * The samples `sweep.ts` checks are numbers a kind computed, and a NaN among
 * them would slip through a bare comparison, so it fails one before asking the
 * caller's bound. These are the bytes of a `Uint8ClampedArray`: whole numbers 0
 * to 255, with no NaN and no infinity to let through, and `!==` is exact for
 * them. A buffer that is shorter than the other is a difference at its end, not
 * an equality over the part they share.
 */

/**
 * The index of the first byte two buffers disagree on.
 * @param first - One buffer
 * @param second - The buffer to hold it to
 * @returns That index, -1 when both hold the same bytes, or the length of the
 *   shorter buffer when one ends before the other and the shared part is equal
 */
export function firstDifference(
  first: Uint8ClampedArray,
  second: Uint8ClampedArray,
): number {
  const shared = Math.min(first.length, second.length);

  for (let index = 0; index < shared; index++) {
    if (first[index] !== second[index]) return index;
  }

  return first.length === second.length ? -1 : shared;
}
