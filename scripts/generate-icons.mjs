// Genereert PWA icon-PNG's uit de SVG-masters.
// Vereist: npm install --no-save sharp
// Run vanaf project root: node scripts/generate-icons.mjs

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const ICONS_DIR = path.resolve('pwa/icons');

async function svgToPng(svgPath, size, outPath) {
  const svg = await fs.readFile(svgPath);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`  ok ${path.basename(outPath)} (${size}x${size})`);
}

async function main() {
  const masterStd = path.join(ICONS_DIR, 'icon-master.svg');
  const masterMask = path.join(ICONS_DIR, 'icon-master-maskable.svg');

  console.log('Standaard (rounded square):');
  await svgToPng(masterStd, 180, path.join(ICONS_DIR, 'apple-touch-icon.png'));
  await svgToPng(masterStd, 192, path.join(ICONS_DIR, 'icon-192.png'));
  await svgToPng(masterStd, 512, path.join(ICONS_DIR, 'icon-512.png'));
  await svgToPng(masterStd, 32, path.join(ICONS_DIR, 'favicon-32.png'));
  await svgToPng(masterStd, 16, path.join(ICONS_DIR, 'favicon-16.png'));

  console.log('Maskable (full bleed, safe zone):');
  await svgToPng(masterMask, 192, path.join(ICONS_DIR, 'icon-maskable-192.png'));
  await svgToPng(masterMask, 512, path.join(ICONS_DIR, 'icon-maskable-512.png'));

  console.log('\nAlle icons in /pwa/icons/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
