/**
 * Generator icon PWA (tanpa dependensi eksternal).
 * Jalankan:  node scripts/make-icons.mjs
 * Menghasilkan: public/icons/icon-192.png, icon-512.png, apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ----------------------------- PNG encoder ----------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ Drawing -------------------------------- */

function createCanvas(size) {
  return { size, data: Buffer.alloc(size * size * 4) };
}

function px(canvas, x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const i = (y * canvas.size + x) * 4;
  const src = a / 255;
  const dstA = canvas.data[i + 3] / 255;
  const outA = src + dstA * (1 - src);
  if (outA === 0) return;
  canvas.data[i] = Math.round((r * src + canvas.data[i] * dstA * (1 - src)) / outA);
  canvas.data[i + 1] = Math.round((g * src + canvas.data[i + 1] * dstA * (1 - src)) / outA);
  canvas.data[i + 2] = Math.round((b * src + canvas.data[i + 2] * dstA * (1 - src)) / outA);
  canvas.data[i + 3] = Math.round(outA * 255);
}

/** Rounded rectangle dengan anti-alias sederhana (4x4 supersampling di tepi). */
function roundRect(canvas, x0, y0, w, h, radius, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y += 1) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x += 1) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          const pxx = x + (sx + 0.5) / 4;
          const pyy = y + (sy + 0.5) / 4;
          if (insideRoundRect(pxx, pyy, x0, y0, w, h, radius)) hits += 1;
        }
      }
      if (hits) px(canvas, x, y, [color[0], color[1], color[2], (color[3] ?? 255) * (hits / 16)]);
    }
  }
}

function insideRoundRect(pxx, pyy, x0, y0, w, h, r) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (pxx < x0 || pyy < y0 || pxx > x1 || pyy > y1) return false;
  const cx = Math.min(Math.max(pxx, x0 + r), x1 - r);
  const cy = Math.min(Math.max(pyy, y0 + r), y1 - r);
  const dx = pxx - cx;
  const dy = pyy - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Logo: kotak hitam + laci kasir putih + garis "K" sederhana. */
function drawLogo(size) {
  const c = createCanvas(size);
  const u = size / 512; // skala dari desain 512

  // latar
  roundRect(c, 0, 0, size, size, 112 * u, [17, 24, 39, 255]);

  // badan mesin kasir
  roundRect(c, 108 * u, 150 * u, 296 * u, 150 * u, 28 * u, [255, 255, 255, 255]);
  // display
  roundRect(c, 140 * u, 182 * u, 120 * u, 44 * u, 12 * u, [17, 24, 39, 255]);
  // tombol
  for (let i = 0; i < 3; i += 1) {
    roundRect(c, 288 * u + i * 34 * u, 186 * u, 22 * u, 36 * u, 8 * u, [161, 98, 7, 255]);
  }
  // laci bawah
  roundRect(c, 148 * u, 318 * u, 216 * u, 46 * u, 16 * u, [255, 255, 255, 255]);
  // garis accent emas
  roundRect(c, 108 * u, 386 * u, 296 * u, 18 * u, 9 * u, [250, 204, 21, 255]);

  return c;
}

function write(name, canvas) {
  const file = join(ROOT, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(canvas.size, canvas.size, canvas.data));
  console.log('  ✓', name);
}

console.log('Membuat icon PWA…');
for (const size of [192, 512]) write(`public/icons/icon-${size}.png`, drawLogo(size));
write('public/icons/apple-touch-icon.png', drawLogo(180));
write('src/app/icon.png', drawLogo(64));
console.log('Selesai.');
