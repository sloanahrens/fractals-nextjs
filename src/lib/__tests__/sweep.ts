/**
 * Checking a great many samples with one assertion.
 *
 * A test that sweeps a grid or a line of thousands of points used to call
 * `expect` for every sample, and the assertions cost more than the counts under
 * test: five such tests timed out under load in the post-land run of the Sine
 * landing. These two helpers do the sweep in a plain loop and hand back one
 * answer to assert on, naming the first few points that failed.
 *
 * What they must not lose is what a per-sample `expect` did without being asked:
 * `expect(NaN).toBeLessThan(x)` throws, while `NaN < x` and `NaN > x` are both
 * false, so a bound written as a comparison lets a NaN through. A sample that is
 * not a finite number is therefore a failure here before any comparison is made,
 * whatever the caller's bound says. `sweep.test.ts` feeds both helpers a NaN.
 */

/** One sample: where it was taken, and the number the kind gave there. */
export interface Sample {
  /** Described, with JSON, only for a sample that failed. */
  at: unknown;
  value: number;
}

/** What a sweep found: the first offenders, named, and how many were looked at. */
export interface SweepResult {
  offenders: string[];
  checked: number;
}

/** How many offenders a sweep names; the rest are counted by the failure itself. */
const NAMED = 5;

/**
 * Check every sample and name the first few that fail.
 * @param samples - The samples, produced as they are read
 * @param holds - Whether a finite value is acceptable; never asked about NaN or
 *   an infinity, which are offenders already
 * @returns The offenders, as `where gave value`, and the number of samples seen
 */
export function sweep(
  samples: Iterable<Sample>,
  holds: (value: number) => boolean,
): SweepResult {
  const offenders: string[] = [];
  let checked = 0;

  for (const sample of samples) {
    checked++;
    if (Number.isFinite(sample.value) && holds(sample.value)) continue;

    if (offenders.length < NAMED) {
      offenders.push(`${JSON.stringify(sample.at)} gave ${sample.value}`);
    }
  }

  return { offenders, checked };
}

/**
 * The largest change from one sample to the next, and where it happened.
 *
 * A step to or from a value that is not a finite number is infinitely large, so
 * a NaN cannot hide among small jumps the way it would from a running maximum
 * (`NaN > largest` is false).
 * @param samples - The samples in order along the line
 * @returns The largest jump and the `at` of the sample that ended it
 */
export function largestJump(samples: Iterable<Sample>): {
  jump: number;
  at: unknown;
} {
  let previous: number | undefined;
  let jump = 0;
  let at: unknown;

  for (const sample of samples) {
    const step = !Number.isFinite(sample.value)
      ? Infinity
      : previous === undefined
        ? 0
        : !Number.isFinite(previous)
          ? Infinity
          : Math.abs(sample.value - previous);

    if (step > jump) {
      jump = step;
      at = sample.at;
    }
    previous = sample.value;
  }

  return { jump, at };
}
