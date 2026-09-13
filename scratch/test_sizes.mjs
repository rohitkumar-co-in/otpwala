import sharp from 'sharp';
import fs from 'fs';

// Read SVG from test_logo_v2.mjs
const content = fs.readFileSync('scratch/test_logo_v2.mjs', 'utf8');
const start = content.indexOf('<svg');
const end = content.lastIndexOf('</svg>') + 6;
const svg = content.substring(start, end);

async function main() {
  const buf = Buffer.from(svg);
  await sharp(buf).resize(120, 120).png().toFile('scratch/test_120.png');
  await sharp(buf).resize(32, 32).png().toFile('scratch/test_32.png');
  console.log('Successfully generated test_120.png and test_32.png');
}
main();
