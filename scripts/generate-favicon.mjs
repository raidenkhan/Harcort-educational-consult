/**
 * Generates the Harcourt favicon set from src/app/icon.svg:
 *   - src/app/favicon.ico   (legacy fallback: 16/32/48px PNG frames inside an ICO)
 *   - src/app/apple-icon.png (iOS home-screen: 180px)
 * Modern browsers use src/app/icon.svg directly (Next.js serves it automatically).
 *
 * Run: npm run favicon
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = path.join(root, "src", "app", "icon.svg");

/** Rasterize the SVG at an exact pixel size (vector-clean upscale). */
async function renderPng(size) {
  const svg = (await readFile(svgPath, "utf8")).replace(
    /<svg([^>]*?)>/,
    `<svg$1 width="${size}" height="${size}">`,
  );
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Assemble PNG frames into a standard ICO container (Vista+ embedded-PNG format). */
function toIco(pngs, sizes) {
  const count = pngs.length;
  const header = Buffer.alloc(6 + 16 * count);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + 16 * count;
  const blobs = [];
  pngs.forEach((png, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e); // width
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1); // height
    header.writeUInt8(0, e + 2); // color count
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // planes
    header.writeUInt16LE(32, e + 6); // bit count
    header.writeUInt32LE(png.length, e + 8); // bytes in resource
    header.writeUInt32LE(offset, e + 12); // image offset
    offset += png.length;
    blobs.push(png);
  });

  return Buffer.concat([header, ...blobs]);
}

const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(renderPng));
const ico = toIco(frames, sizes);

const icoPath = path.join(root, "src", "app", "favicon.ico");
await writeFile(icoPath, ico);
const applePath = path.join(root, "src", "app", "apple-icon.png");
await writeFile(applePath, await renderPng(180));

// Validate the container ourselves (libvips can't read ICO): parse the ICO,
// extract each PNG frame, and decode it as a standalone PNG with sharp.
const written = await readFile(icoPath);
const count = written.readUInt16LE(4);
for (let i = 0; i < count; i++) {
  const e = 6 + 16 * i;
  const off = written.readUInt32LE(e + 12);
  const size = written.readUInt32LE(e + 8);
  const frame = written.subarray(off, off + size);
  if (frame.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`frame ${i} is not a PNG`);
  }
  const m = await sharp(frame).metadata();
  console.log(`  frame ${i}: ${m.width}x${m.height} PNG, ${size} bytes`);
}
const apple = await sharp(applePath).metadata();
console.log(`apple-icon.png -> ${apple.width}x${apple.height} ${apple.format}`);
console.log(`favicon.ico -> ${ico.length} bytes, ${count} frames, OK`);
