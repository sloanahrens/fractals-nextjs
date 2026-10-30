/**
 * The two sweep helpers (`sweep.ts`) keep what a per-sample `expect` did without
 * being asked: a sample that is not a finite number fails. Each case feeds a NaN
 * (or an infinity) to a bound that a bare comparison would let through.
 */
import { describe, expect, it } from "vitest";

import { largestJump, sweep, type Sample } from "./sweep";

const at = (x: number, value: number): Sample => ({ at: { x }, value });

describe("sweep", () => {
  it("finds nothing wrong with samples that all hold, and counts them", () => {
    const result = sweep([at(0, 1), at(1, 2), at(2, 3)], (v) => v <= 10);

    expect(result).toEqual({ offenders: [], checked: 3 });
  });

  it("names a sample the bound rejects, with where it was", () => {
    const result = sweep([at(0, 1), at(1, 99), at(2, 3)], (v) => v <= 10);

    expect(result.offenders).toEqual(['{"x":1} gave 99']);
  });

  it("fails a NaN even when the bound would let it through", () => {
    // `() => true` is the bound a bare comparison amounts to for a NaN: it says
    // nothing against it. The sample still has to fail.
    const result = sweep([at(0, 1), at(1, Number.NaN), at(2, 3)], () => true);

    expect(result.offenders).toEqual(['{"x":1} gave NaN']);
    expect(result.checked).toBe(3);
  });

  it("fails an infinity the same way", () => {
    const result = sweep(
      [at(0, Infinity), at(1, -Infinity)],
      () => true,
    );

    expect(result.offenders).toHaveLength(2);
  });

  it("names only the first five offenders, however many there are", () => {
    const samples = Array.from({ length: 20 }, (_, i) => at(i, Number.NaN));
    const result = sweep(samples, () => true);

    expect(result.offenders).toHaveLength(5);
    expect(result.offenders[0]).toContain('"x":0');
    expect(result.checked).toBe(20);
  });

  it("never asks the bound about a value that is not finite", () => {
    const asked: number[] = [];

    sweep([at(0, Number.NaN), at(1, 4)], (v) => {
      asked.push(v);

      return true;
    });

    expect(asked).toEqual([4]);
  });
});

describe("largestJump", () => {
  it("is the largest step and where it ended", () => {
    const result = largestJump([at(0, 1), at(1, 1.5), at(2, 4), at(3, 4.25)]);

    expect(result.jump).toBe(2.5);
    expect(result.at).toEqual({ x: 2 });
  });

  it("is 0 for a line that never moves, and for a single sample", () => {
    expect(largestJump([at(0, 3), at(1, 3)]).jump).toBe(0);
    expect(largestJump([at(0, 3)]).jump).toBe(0);
  });

  it("makes a NaN the largest jump, with where it was", () => {
    const result = largestJump([at(0, 1), at(1, Number.NaN), at(2, 1.1)]);

    expect(result.jump).toBe(Infinity);
    expect(result.at).toEqual({ x: 1 });
  });

  it("makes the step out of a NaN infinite too, and a lone NaN a failure", () => {
    expect(largestJump([at(0, Number.NaN), at(1, 1)]).jump).toBe(Infinity);
    expect(largestJump([at(0, Number.NaN)]).jump).toBe(Infinity);
  });

  it("makes an infinity infinite", () => {
    expect(largestJump([at(0, 1), at(1, Infinity)]).jump).toBe(Infinity);
  });
});
