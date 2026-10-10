/** Sample grid columns and rows: about 32 x 24, evenly spaced over the picture. */
export const BLANK_SAMPLE_COLUMNS = 32;
export const BLANK_SAMPLE_ROWS = 24;

/**
 * The largest sum of channel differences (red, green, blue) at which a sample
 * still counts as the picture's common colour.
 */
export const BLANK_COLOR_DISTANCE = 24;

/** The share of samples that must be that colour for the picture to be blank. */
export const BLANK_SHARE = 0.98;

/**
 * The most of a featured place's picture that may be one colour. A place a
 * fractal's button leads with has to show form and colour, so it is held to a
 * stricter share than the blank hint's.
 */
export const FEATURED_MAX_UNIFORM_SHARE = 0.6;

/** The size the page reads the canvas down to before asking. */
export const BLANK_READ_WIDTH = 64;
export const BLANK_READ_HEIGHT = 48;

/** How long a picture must have sat settled before the hint may show. */
export const BLANK_HINT_DELAY_MS = 600;

/**
 * The share of an evenly spaced grid of samples that sit within a small colour
 * distance of the colour most of the grid shares: 1 for a flat field, lower the
 * more of the picture is something else. A banded gradient scores low, because
 * its bands differ by more than the distance from one to the next.
 *
 * `pixels` is RGBA, row by row. A picture with no pixels, or fewer values than
 * its size says, scores 0: there is nothing to say about it.
 */
export function nearUniformShare(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 0;
  if (width < 1 || height < 1 || pixels.length < width * height * 4) {
    return 0;
  }

  const samples: number[] = [];
  const counts = new Map<number, number>();

  for (let row = 0; row < BLANK_SAMPLE_ROWS; row++) {
    const y = Math.floor(((row + 0.5) * height) / BLANK_SAMPLE_ROWS);

    for (let column = 0; column < BLANK_SAMPLE_COLUMNS; column++) {
      const x = Math.floor(((column + 0.5) * width) / BLANK_SAMPLE_COLUMNS);
      const at = (Math.min(y, height - 1) * width + Math.min(x, width - 1)) * 4;
      const packed =
        (pixels[at] << 16) | (pixels[at + 1] << 8) | pixels[at + 2];

      samples.push(packed);
      counts.set(packed, (counts.get(packed) ?? 0) + 1);
    }
  }

  let common = samples[0];
  let commonCount = 0;

  for (const [packed, count] of counts) {
    if (count > commonCount) {
      common = packed;
      commonCount = count;
    }
  }

  const near = samples.filter(
    (packed) => colorDistance(packed, common) <= BLANK_COLOR_DISTANCE,
  ).length;

  return near / samples.length;
}

/**
 * Whether a picture is nearly one colour: at least 98% of the grid is the
 * common colour (see `nearUniformShare`). A deep zoom into the set's inside, or
 * out in the field beyond it, is that. A picture with no pixels is not called
 * blank.
 */
export function isBlankImage(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  return nearUniformShare(pixels, width, height) >= BLANK_SHARE;
}

function colorDistance(a: number, b: number): number {
  return (
    Math.abs((a >> 16) - (b >> 16)) +
    Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) +
    Math.abs((a & 255) - (b & 255))
  );
}

/**
 * Reads a canvas down to a small copy and asks `isBlankImage` of it. Null when
 * the canvas cannot be read (no 2D context, a tainted or zero-sized canvas), so
 * the caller can tell "not blank" from "could not tell" and show nothing for
 * both.
 */
export function canvasIsBlank(canvas: HTMLCanvasElement): boolean | null {
  try {
    if (canvas.width < 1 || canvas.height < 1) return null;

    const copy = document.createElement("canvas");
    copy.width = BLANK_READ_WIDTH;
    copy.height = BLANK_READ_HEIGHT;

    const context = copy.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(canvas, 0, 0, BLANK_READ_WIDTH, BLANK_READ_HEIGHT);
    const { data } = context.getImageData(
      0,
      0,
      BLANK_READ_WIDTH,
      BLANK_READ_HEIGHT,
    );

    return isBlankImage(data, BLANK_READ_WIDTH, BLANK_READ_HEIGHT);
  } catch {
    return null;
  }
}
