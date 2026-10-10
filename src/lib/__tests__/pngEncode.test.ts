import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { encodePng } from "../pngEncode";

interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** RGB, three bytes a pixel, filters undone */
  rgb: Uint8Array;
  chunkTypes: string[];
}

/** CRC-32 written out independently of the encoder's table. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A small PNG reader: checks the framing and undoes filters 0 to 4. */
function decodePng(file: Buffer): DecodedPng {
  expect([...file.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const chunkTypes: string[] = [];
  const data: Buffer[] = [];
  let header: Buffer | null = null;
  let offset = 8;

  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString("latin1");
    const body = file.subarray(offset + 8, offset + 8 + length);
    const crc = file.readUInt32BE(offset + 8 + length);

    expect(crc, `CRC of ${type}`).toBe(
      crc32(file.subarray(offset + 4, offset + 8 + length)),
    );
    chunkTypes.push(type);
    if (type === "IHDR") header = body;
    if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  expect(offset).toBe(file.length);

  if (header === null) throw new Error("no IHDR");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bytes = 3;
  const stride = width * bytes;
  const raw = inflateSync(Buffer.concat(data));
  expect(raw.length).toBe((stride + 1) * height);

  const rgb = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const value = raw[y * (stride + 1) + 1 + i];
      const left = i >= bytes ? rgb[y * stride + i - bytes] : 0;
      const up = y > 0 ? rgb[(y - 1) * stride + i] : 0;
      const upLeft =
        y > 0 && i >= bytes ? rgb[(y - 1) * stride + i - bytes] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      rgb[y * stride + i] = (value + predicted) & 0xff;
    }
  }

  return {
    width,
    height,
    bitDepth: header[8],
    colorType: header[9],
    rgb,
    chunkTypes,
  };
}

/** A width x height picture whose bytes follow a pattern. */
function pattern(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 7) % 256;
    rgba[i * 4 + 1] = (i * 13 + 5) % 256;
    rgba[i * 4 + 2] = (i * 29 + 100) % 256;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

describe("encodePng", () => {
  it("decodes back to the pixels it was given", () => {
    const rgba = pattern(5, 3);
    const png = decodePng(encodePng(rgba, 5, 3));

    expect(png.width).toBe(5);
    expect(png.height).toBe(3);
    expect(png.bitDepth).toBe(8);
    expect(png.colorType).toBe(2);
    for (let i = 0; i < 15; i++) {
      expect([...png.rgb.subarray(i * 3, i * 3 + 3)]).toEqual([
        rgba[i * 4],
        rgba[i * 4 + 1],
        rgba[i * 4 + 2],
      ]);
    }
  });

  it("round-trips a picture whose rows want different filters", () => {
    // A flat row, a horizontal ramp, a row equal to the one above, and noise.
    const width = 16;
    const rgba = new Uint8ClampedArray(width * 4 * 4);
    for (let x = 0; x < width; x++) {
      const set = (y: number, value: number) => {
        const i = (y * width + x) * 4;
        rgba.set([value, value, value, 255], i);
      };
      set(0, 90);
      set(1, x * 16);
      set(2, x * 16);
      set(3, (x * 2654435761) % 256);
    }

    const png = decodePng(encodePng(rgba, width, 4));

    for (let i = 0; i < width * 4; i++) {
      expect(png.rgb[i * 3]).toBe(rgba[i * 4]);
    }
  });

  it("writes the framing a 1200x630 card needs", () => {
    const file = encodePng(pattern(1200, 630), 1200, 630);

    expect(file.subarray(1, 4).toString("latin1")).toBe("PNG");
    // IHDR is the first chunk: width and height are big-endian at 16 and 20.
    expect(file.readUInt32BE(16)).toBe(1200);
    expect(file.readUInt32BE(20)).toBe(630);
    expect(file[24]).toBe(8);
    expect(file[25]).toBe(2);
    expect(decodePng(file).chunkTypes).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("is the same bytes for the same picture", () => {
    const a = encodePng(pattern(40, 30), 40, 30);
    const b = encodePng(pattern(40, 30), 40, 30);

    expect(a.equals(b)).toBe(true);
  });

  it("is different bytes for a different picture", () => {
    const first = pattern(8, 8);
    const second = pattern(8, 8);
    second[0] ^= 1;

    expect(encodePng(first, 8, 8).equals(encodePng(second, 8, 8))).toBe(false);
  });

  it("does not store alpha", () => {
    const rgba = pattern(4, 4);
    const withAlpha = pattern(4, 4);
    for (let i = 3; i < withAlpha.length; i += 4) withAlpha[i] = 10;

    expect(encodePng(rgba, 4, 4).equals(encodePng(withAlpha, 4, 4))).toBe(true);
  });

  it("accepts a plain Uint8Array and a one-pixel picture", () => {
    const png = decodePng(encodePng(new Uint8Array([1, 2, 3, 255]), 1, 1));

    expect([...png.rgb]).toEqual([1, 2, 3]);
  });

  it("compresses a flat picture to far less than its raw size", () => {
    const flat = new Uint8ClampedArray(1200 * 630 * 4).fill(200);

    expect(encodePng(flat, 1200, 630).length).toBeLessThan(10_000);
  });

  it.each([
    [0, 5],
    [5, 0],
    [-1, 5],
    [2.5, 4],
    [Number.NaN, 4],
  ])("refuses a size of %s x %s", (width, height) => {
    expect(() => encodePng(new Uint8Array(64), width, height)).toThrow(
      RangeError,
    );
  });

  it("refuses a buffer that is not width x height x 4 bytes", () => {
    expect(() => encodePng(new Uint8Array(15), 2, 2)).toThrow(/not 2x2x4/);
    expect(() => encodePng(new Uint8Array(17), 2, 2)).toThrow(RangeError);
  });
});
