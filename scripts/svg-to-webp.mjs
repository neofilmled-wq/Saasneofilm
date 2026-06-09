import sharp from 'sharp';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Render tile art at 800×600 (2× the on-screen tile size) so it stays
// crisp on 1080p Fire Stick HD without the WebP looking like mush.
const TARGETS = [
  { dir: 'apps/tv-app-legacy/public/tile-art', width: 800, height: 600 },
  { dir: 'apps/tv-app-legacy/public/brand',    width: 240, height: 240 },
];

for (const { dir, width, height } of TARGETS) {
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
  } catch {
    continue;
  }
  for (const file of files) {
    const inPath = join(dir, file);
    const outPath = join(dir, file.replace(/\.svg$/, '.webp'));
    const svg = await readFile(inPath);
    const webp = await sharp(svg, { density: 300 })
      .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88, alphaQuality: 92, effort: 6 })
      .toBuffer();
    await writeFile(outPath, webp);
    console.log(`  ${inPath}  ->  ${outPath}  (${webp.length} B)`);
  }
}
