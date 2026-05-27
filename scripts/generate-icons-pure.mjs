/**
 * Genereert PWA icon-PNG's zonder sharp (puur Node + zlib).
 * Run: node scripts/generate-icons-pure.mjs
 * Windows (aanbevolen): powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
 * Met npm: node scripts/generate-icons.mjs (rendert uit SVG via sharp).
 */

import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';

const ICONS_DIR = path.resolve('pwa/icons');

/** Mic-rimpel designbrief (1024-canvas): outer 150→400, kern 76→202.67 */
const R_OUT = 400;
const R_MID = 357.33;
const R_IN = 314.67;
const R_CORE = 202.67;
const MONO_CX = 493;
const MONO_CY = 528;
const MONO_FIT = 0.74;
const MONO_FIT_MASK = 0.65;
const RING_MASK = 0.88;

const COL = {
  choc: [0x3d, 0x2f, 0x1f, 255],
  cream: [0xf2, 0xe8, 0xd5, 255],
  sageL: [0xc8, 0xd4, 0xb5, 255],
  sageM: [0xa5, 0xb8, 0x94, 255],
  sageD: [0x6b, 0x8e, 0x6f, 255],
};

/** Zelfde pad als icon-master.svg (1024-coördinaten) */
const MONOGRAM_STD = [
  ['M', 668, 292],
  ['C', 520, 248, 368, 268, 318, 360],
  ['C', 278, 432, 318, 508, 430, 536],
  ['L', 548, 568],
  ['C', 648, 594, 698, 648, 678, 728],
  ['C', 648, 838, 518, 878, 358, 852],
  ['C', 278, 838, 238, 808, 218, 768],
  ['L', 308, 728],
  ['C', 328, 768, 388, 788, 468, 798],
  ['C', 568, 812, 648, 778, 668, 708],
  ['C', 688, 638, 628, 588, 528, 562],
  ['L', 408, 528],
  ['C', 298, 498, 248, 428, 268, 348],
  ['C', 308, 228, 468, 178, 638, 228],
  ['C', 708, 248, 748, 268, 768, 292],
  ['Z'],
];

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function flattenCubic(p0, p1, p2, p3, tol, out) {
  const flat =
    dist2(p0, p1) <= tol &&
    dist2(p1, p2) <= tol &&
    dist2(p2, p3) <= tol;
  if (flat) {
    out.push(p3);
    return;
  }
  const p01 = lerp(p0, p1, 0.5);
  const p12 = lerp(p1, p2, 0.5);
  const p23 = lerp(p2, p3, 0.5);
  const p012 = lerp(p01, p12, 0.5);
  const p123 = lerp(p12, p23, 0.5);
  const p0123 = lerp(p012, p123, 0.5);
  flattenCubic(p0, p01, p012, p0123, tol, out);
  flattenCubic(p0123, p123, p23, p3, tol, out);
}

function buildPolyline(commands) {
  const pts = [];
  let cur = [0, 0];
  for (const cmd of commands) {
    const t = cmd[0];
    if (t === 'M') {
      cur = [cmd[1], cmd[2]];
      pts.push(cur);
    } else if (t === 'L') {
      cur = [cmd[1], cmd[2]];
      pts.push(cur);
    } else if (t === 'C') {
      const p0 = cur;
      const p1 = [cmd[1], cmd[2]];
      const p2 = [cmd[3], cmd[4]];
      const p3 = [cmd[5], cmd[6]];
      flattenCubic(p0, p1, p2, p3, 0.25, pts);
      cur = p3;
    } else if (t === 'Z') {
      if (pts.length) pts.push([pts[0][0], pts[0][1]]);
    }
  }
  return pts;
}

const POLY_STD = buildPolyline(MONOGRAM_STD);

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function insideRoundRect(x, y, size, rx) {
  const r = Math.min(rx, size / 2);
  if (x < r && y < r) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
  if (x >= size - r && y < r) return (x - (size - r)) ** 2 + (y - r) ** 2 <= r * r;
  if (x < r && y >= size - r) return (x - r) ** 2 + (y - (size - r)) ** 2 <= r * r;
  if (x >= size - r && y >= size - r) {
    return (x - (size - r)) ** 2 + (y - (size - r)) ** 2 <= r * r;
  }
  return true;
}

function blendRgb(bg, fg, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return [
    Math.round(bg[0] * (1 - a) + fg[0] * a),
    Math.round(bg[1] * (1 - a) + fg[1] * a),
    Math.round(bg[2] * (1 - a) + fg[2] * a),
    255,
  ];
}

function sampleMonogramS(x, y, size, maskable, rx) {
  const scale = size / 1024;
  const ringScale = maskable ? RING_MASK : 1;
  const fit = (maskable ? MONO_FIT_MASK : MONO_FIT) * scale * ringScale;
  const cx = size / 2;
  const cy = size / 2;
  const samples = 4;
  let acc = 0;
  let n = 0;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = x + (sx + 0.5) / samples - 0.5 / samples;
      const py = y + (sy + 0.5) / samples - 0.5 / samples;
      if (!maskable && !insideRoundRect(px, py, size, rx)) continue;
      const designX = (px - cx) / fit + MONO_CX;
      const designY = (py - cy) / fit + MONO_CY;
      if (pointInPoly(designX, designY, POLY_STD)) acc += 1;
      n += 1;
    }
  }
  return n ? acc / n : 0;
}

function renderIcon(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const scale = size / 1024;
  const ringScale = maskable ? RING_MASK : 1;
  const rs = scale * ringScale;
  const rx = maskable ? 0 : Math.round(225 * scale);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!maskable && !insideRoundRect(x, y, size, rx)) {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 0;
        continue;
      }
      const dist = Math.hypot(x - cx, y - cy);
      let color = COL.cream;
      if (dist <= R_OUT * rs) color = COL.sageL;
      if (dist <= R_MID * rs) color = COL.sageM;
      if (dist <= R_IN * rs) color = COL.sageD;
      if (dist <= R_CORE * rs) color = COL.choc;
      const sA = sampleMonogramS(x, y, size, maskable, rx);
      if (sA > 0) color = blendRgb(color, COL.cream, sA);
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = color[3];
    }
  }
  return buf;
}

function crc32(buf) {
  let c = 0xffffffff;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c2 = n;
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1;
      t[n] = c2;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writeIcon(size, outPath, opts) {
  const rgba = renderIcon(size, opts);
  await fs.writeFile(outPath, encodePng(rgba, size, size));
  console.log(`  ok ${path.basename(outPath)} (${size}x${size})`);
}

async function main() {
  console.log('Standaard (rounded square):');
  await writeIcon(180, path.join(ICONS_DIR, 'apple-touch-icon.png'), { maskable: false });
  await writeIcon(192, path.join(ICONS_DIR, 'icon-192.png'), { maskable: false });
  await writeIcon(512, path.join(ICONS_DIR, 'icon-512.png'), { maskable: false });
  await writeIcon(32, path.join(ICONS_DIR, 'favicon-32.png'), { maskable: false });
  await writeIcon(16, path.join(ICONS_DIR, 'favicon-16.png'), { maskable: false });
  console.log('Maskable (full bleed):');
  await writeIcon(192, path.join(ICONS_DIR, 'icon-maskable-192.png'), { maskable: true });
  await writeIcon(512, path.join(ICONS_DIR, 'icon-maskable-512.png'), { maskable: true });
  console.log('\nAlle icons in /pwa/icons/');
  console.log('Tip: met npm: npm install --no-save sharp && node scripts/generate-icons.mjs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
