/**
 * `firstDifference` (`byteCompare.ts`): the index of the first byte two pictures
 * disagree on, -1 when they hold the same bytes, and the length of the shorter
 * buffer when one ends inside the other — a truncated picture never equals the
 * whole one it is a prefix of. `firstDifferenceBeyond` is the same walk with
 * room for rounding: a byte within the tolerance agrees.
 */
import { describe, expect, it } from "vitest";

import { firstDifference, firstDifferenceBeyond } from "./byteCompare";

const bytes = (...values: number[]): Uint8ClampedArray =>
  Uint8ClampedArray.from(values);

describe("firstDifference", () => {
  it("is -1 for two buffers of the same bytes, and for two empty ones", () => {
    expect(firstDifference(bytes(0, 1, 255), bytes(0, 1, 255))).toBe(-1);
    expect(firstDifference(bytes(), bytes())).toBe(-1);
  });

  it("is the index of the first byte that differs, not a later one", () => {
    expect(firstDifference(bytes(0, 1, 2, 3), bytes(0, 1, 9, 9))).toBe(2);
    expect(firstDifference(bytes(7, 0), bytes(6, 0))).toBe(0);
  });

  it("walks the whole buffer, so a last byte that differs is found", () => {
    const whole = bytes(...Array.from({ length: 3072 }, (_, i) => i % 256));
    const altered = Uint8ClampedArray.from(whole);
    altered[3071] = (altered[3071] + 1) % 256;

    expect(firstDifference(whole, altered)).toBe(3071);
  });

  it("treats a buffer that ends inside the other as a difference where it ends", () => {
    expect(firstDifference(bytes(1, 2), bytes(1, 2, 3))).toBe(2);
    expect(firstDifference(bytes(1, 2, 3), bytes(1, 2))).toBe(2);
  });

  it("names a difference inside the shared part rather than the end", () => {
    expect(firstDifference(bytes(1, 2, 3), bytes(1, 9))).toBe(1);
  });
});

describe("firstDifferenceBeyond", () => {
  it("agrees on any difference within its tolerance, in either direction", () => {
    expect(firstDifferenceBeyond(bytes(10, 10), bytes(12, 8), 2)).toBe(-1);
  });

  it("names the first byte further apart than the tolerance", () => {
    expect(firstDifferenceBeyond(bytes(10, 10, 10), bytes(11, 13, 10), 2)).toBe(
      1,
    );
  });

  it("holds a buffer that ends inside the other to the same tolerance", () => {
    expect(firstDifferenceBeyond(bytes(5, 5), bytes(5, 5, 9), 1)).toBe(2);
  });
});
