'use strict';

/**
 * Generator `build/icon.ico` tanpa dependensi eksternal.
 * Membuat ICO berisi beberapa ukuran PNG-like BMP 32-bit (16, 32, 48, 64, 128, 256).
 *
 * Jalankan:  node scripts/make-icon.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'build');
const outFile = resolve(outDir, 'icon.ico');

/* ------------------------------- PNG --------------------------------- */

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());

  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer -> PNG bytes. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ Drawing ------------------------------ */

/** Gambar logo KasirPro sederhana (receipt + centang hijau) via canvas manual. */
function drawLogo(size) {
  const px = Buffer.alloc(size * size * 4, 0);
  const s = size / 64; // skala dari desain 64x64

  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255;
    px[i] = Math.round(px[i] * (1 - na) + r * na);
    px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
    px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
    px[i + 3] = Math.max(px[i + 3], a);
  };

  const rect = (x, y, w, h, color, radius = 0) => {
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) {
        let inside = true;
        if (radius > 0) {
          const dx = Math.min(xx, w - 1 - xx);
          const dy = Math.min(yy, h - 1 - yy);
          if (dx < radius && dy < radius) {
            const ddx = radius - dx;
            const ddy = radius - dy;
            inside = ddx * ddx + ddy * ddy <= radius * radius;
          }
        }
        if (inside) set(x + xx, y + yy, color);
      }
    }
  };

  const circle = (cx, cy, r, color) => {
    for (let yy = -r; yy <= r; yy += 1) {
      for (let xx = -r; xx <= r; xx += 1) {
        if (xx * xx + yy * yy <= r * r) set(cx + xx, cy + yy, color);
      }
    }
  };

  // Latar: gradien biru -> gelap
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x / size + y / size) / 2;
      set(x, y, [
        Math.round(37 + (15 - 37) * t),
        Math.round(99 + (23 - 99) * t),
        Math.round(235 + (42 - 235) * t),
        255,
      ]);
    }
  }

  // Kartu struk putih
  rect(Math.round(13 * s), Math.round(18 * s), Math.round(38 * s), Math.round(30 * s), [255, 255, 255, 242], Math.round(5 * s));
  // Header struk gelap
  rect(Math.round(13 * s), Math.round(18 * s), Math.round(38 * s), Math.round(9 * s), [15, 23, 42, 255], Math.round(5 * s));
  // Garis item
  rect(Math.round(19 * s), Math.round(32 * s), Math.round(8 * s), Math.round(4 * s), [148, 163, 184, 255], Math.round(2 * s));
  rect(Math.round(19 * s), Math.round(40 * s), Math.round(14 * s), Math.round(4 * s), [148, 163, 184, 255], Math.round(2 * s));
  // Kolom hijau
  rect(Math.round(38 * s), Math.round(30 * s), Math.round(6 * s), Math.round(16 * s), [34, 197, 94, 230], Math.round(2 * s));
  // Lingkaran centang
  circle(Math.round(46 * s), Math.round(18 * s), Math.round(7 * s), [15, 23, 42, 255]);
  circle(Math.round(46 * s), Math.round(18 * s), Math.round(6 * s), [34, 197, 94, 255]);
  // Tanda centang
  const stroke = (x0, y0, x1, y1, w, color) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      circle(x, y, Math.max(1, Math.round(w / 2)), color);
    }
  };
  stroke(43 * s, 18 * s, 45.2 * s, 20.4 * s, Math.max(1.6, 2 * s), [15, 23, 42, 255]);
  stroke(45.2 * s, 20.4 * s, 49.4 * s, 15.6 * s, Math.max(1.6, 2 * s), [15, 23, 42, 255]);

  return px;
}

/* -------------------------------- ICO -------------------------------- */

function buildIco(sizes) {
  const images = sizes.map((size) => {
    const png = encodePng(size, size, drawLogo(size));
    return { size, png };
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  const blobs = [];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry[0] = img.size >= 256 ? 0 : img.size; // width
    entry[1] = img.size >= 256 ? 0 : img.size; // height
    entry[2] = 0; // jumlah warna
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(img.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(img.png);
    offset += img.png.length;
  }

  return Buffer.concat([header, ...entries, ...blobs]);
}

mkdirSync(outDir, { recursive: true });
const ico = buildIco([16, 24, 32, 48, 64, 128, 256]);
writeFileSync(outFile, ico);
console.log(`icon dibuat: ${outFile} (${ico.length} bytes)`);
