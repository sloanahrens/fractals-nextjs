/**
 * A PNG encoder for the server: raw RGBA in, the bytes of a PNG file out.
 *
 * `/api/og` draws a view with no canvas to ask for a PNG, and this is the whole
 * of what it needs, written on `node:zlib` alone so the app gains no
 * dependency. It writes an 8-bit truecolour image (colour type 2): the
 * explorer's pictures are always opaque, so the alpha byte is dropped, which
 * is a quarter less to compress and to send. Each row picks whichever of the
 * None, Sub and Up filters leaves the smallest sum of absolute residuals (the
 * usual heuristic), which is most of what a smooth gradient gains.
 *
 * The output is a function of the pixels alone: no timestamp, no text chunk,
 * and zlib is deterministic for one input at one level, so the same picture is
 * always the same bytes (which is what lets a CDN and a test treat it as one
 * file).
 *
 * Node only: it imports `node:zlib`, so nothing the browser bundle reaches may
 * import it.
 */

import { deflateSync } from "node:zlib";

/** The eight bytes every PNG file starts with. */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel in the input (RGBA) and in the file (RGB). */
const INPUT_BYTES = 4;
const OUTPUT_BYTES = 3;

/** The row filters used: a filter byte starts every row. */
const FILTER_NONE = 0;
const FILTER_SUB = 1;
const FILTER_UP = 2;

/** zlib level: 6 is the library's default and a fair price for the size. */
const COMPRESSION_LEVEL = 6;

/** The CRC-32 table of the polynomial PNG uses, built once. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a chunk's type and data, as the format asks. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** One chunk: length, type, data, and the CRC over type and data. */
function chunk(type: string, data: Uint8Array): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(typeAndData.length + 8);

  out.writeUInt32BE(data.length, 0);
  typeAndData.copy(out, 4);
  out.writeUInt32BE(crc32(typeAndData), typeAndData.length + 4);

  return out;
}

/** The sum of a filtered row's bytes read as signed, lower being smoother. */
function cost(row: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < row.length; i++) {
    total += row[i] < 128 ? row[i] : 256 - row[i];
  }
  return total;
}

/**
 * Encode RGBA pixels as a PNG file.
 *
 * @param rgba - `width * height * 4` bytes, row by row from the top; alpha is
 *   not stored, so a picture with transparency is written opaque
 * @param width - Width in pixels, a positive integer
 * @param height - Height in pixels, a positive integer
 * @returns The file's bytes
 * @throws RangeError when the size is not a positive integer pair, or the
 *   buffer is not exactly `width * height * 4` bytes
 */
export function encodePng(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Buffer {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("PNG width and height must be integers");
  }
  if (width < 1 || height < 1) {
    throw new RangeError("PNG width and height must be at least 1");
  }
  if (rgba.length !== width * height * INPUT_BYTES) {
    throw new RangeError(
      `PNG pixel buffer is ${rgba.length} bytes, not ${width}x${height}x4`,
    );
  }

  const stride = width * OUTPUT_BYTES;
  // Each row in the file is a filter byte then `stride` bytes.
  const raw = Buffer.alloc((stride + 1) * height);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  const sub = new Uint8Array(stride);
  const up = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const source = y * width * INPUT_BYTES;
    for (let x = 0; x < width; x++) {
      current[x * 3] = rgba[source + x * INPUT_BYTES];
      current[x * 3 + 1] = rgba[source + x * INPUT_BYTES + 1];
      current[x * 3 + 2] = rgba[source + x * INPUT_BYTES + 2];
    }

    for (let i = 0; i < stride; i++) {
      sub[i] = (current[i] - (i >= OUTPUT_BYTES ? current[i - 3] : 0)) & 0xff;
      up[i] = (current[i] - previous[i]) & 0xff;
    }

    let filter = FILTER_NONE;
    let best = cost(current);
    const subCost = cost(sub);
    if (subCost < best) {
      filter = FILTER_SUB;
      best = subCost;
    }
    if (cost(up) < best) filter = FILTER_UP;

    const target = y * (stride + 1);
    raw[target] = filter;
    const chosen =
      filter === FILTER_SUB ? sub : filter === FILTER_UP ? up : current;
    raw.set(chosen, target + 1);

    previous.set(current);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter method: adaptive
  header[12] = 0; // interlace: none

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: COMPRESSION_LEVEL })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
