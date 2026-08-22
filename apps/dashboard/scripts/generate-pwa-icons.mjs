// Dependency-free PWA icon generator for Fasal-Pramaan.
// Encodes RGBA PNGs by hand: PNG signature + IHDR + IDAT (zlib deflate of raw
// scanlines) + IEND, with a CRC32 per chunk. No image libraries required.
//
// Usage: node scripts/generate-pwa-icons.mjs
// Writes public/icon-192.png and public/icon-512.png ("any maskable" safe).

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

// Matches --ink in src/app/globals.css (#1c1915).
const INK = [0x1c, 0x19, 0x15, 0xff];
const SURFACE = [0xff, 0xff, 0xff, 0xff];

const CRC_TABLE = (() => {
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

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode raw RGBA rows (Uint8Array of w*h*4) as a PNG buffer. */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error("rgba size mismatch");
  }
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// "FP" glyphs on a 5x7 pixel grid (1 = ink pixel).
const GLYPH_F = [
  "11111",
  "10000",
  "10000",
  "11110",
  "10000",
  "10000",
  "10000",
];
const GLYPH_P = [
  "11111",
  "10001",
  "10001",
  "11111",
  "10000",
  "10000",
  "10000",
];
const GLYPH_W = 5;
const GLYPH_H = 7;

/**
 * Render an icon: solid rounded square in --ink with a white "FP" mark.
 * Padding keeps content inside the maskable safe zone (~80% center circle),
 * so purpose "any maskable" is safe for both sizes.
 */
function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const radius = Math.round(size * 0.2); // corner radius of the tile itself
  const inset = Math.round(size * 0.08); // transparent margin for maskable safety
  const tile = size - inset * 2;

  // Letter block geometry (scaled glyph grid centered on the tile)
  const scale = Math.max(1, Math.floor(tile / 16));
  const textW = (GLYPH_W * 2 + 1) * scale; // F gap P
  const textH = GLYPH_H * scale;
  const textX = inset + Math.floor((tile - textW) / 2);
  const textY = inset + Math.floor((tile - textH) / 2);

  const insideRoundedTile = (x, y) => {
    if (x < inset || x >= size - inset || y < inset || y >= size - inset) return false;
    const lx = Math.max(inset + radius - (x + 1), x - (size - inset - radius));
    const ly = Math.max(inset + radius - (y + 1), y - (size - inset - radius));
    return lx <= 0 || ly <= 0 || lx * lx + ly * ly <= radius * radius;
  };

  const inGlyph = (gx, gy) => {
    if (gy < 0 || gy >= GLYPH_H) return false;
    const col = Math.floor(gx / scale);
    const withinF = col >= 0 && col < GLYPH_W && GLYPH_F[gy][col] === "1";
    const pCol = col - (GLYPH_W + 1);
    const withinP =
      pCol >= 0 && pCol < GLYPH_W && GLYPH_P[gy][pCol] === "1";
    return withinF || withinP;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!insideRoundedTile(x, y)) continue; // stays fully transparent
      const gx = Math.floor((x - textX) / scale);
      const gy = Math.floor((y - textY) / scale);
      const color =
        gx >= 0 && gx < textW && gy >= 0 && gy < textH && inGlyph(gx, gy)
          ? SURFACE
          : INK;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = color[3];
    }
  }
  return encodePng(size, size, px);
}

mkdirSync(PUBLIC, { recursive: true });
for (const size of [192, 512]) {
  const out = join(PUBLIC, `icon-${size}.png`);
  const buf = renderIcon(size);
  writeFileSync(out, buf);
  console.log(`generate-pwa-icons: wrote ${out} (${size}x${size}, ${buf.length} bytes)`);
}
console.log("generate-pwa-icons: done");
