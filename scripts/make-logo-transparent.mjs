/**
 * One-off: derive public/logo.png from public/logo.jpg by removing the
 * light lavender-white backdrop (#EEEBEF-ish). Removal is FLOOD-FILL from
 * the image border only — background-connected pixels go transparent,
 * anything enclosed by the artwork (e.g. white counters inside letters)
 * is preserved. Run: node scripts/make-logo-transparent.mjs
 */
import sharp from "sharp";

const SRC = "public/logo.jpg";
const OUT = "public/logo.png"; // brand-purple ink, transparent bg, trimmed
const OUT_WHITE = "public/logo-white.png"; // same shape, white ink for dark surfaces
const TOL = 34; // max per-channel distance from the backdrop colour

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width: w, height: h, channels } = info; // channels === 4
const idx = (x, y) => (y * w + x) * channels;

// Reference backdrop colour = mean of the four 24px corners.
const corners = [];
for (const [cx, cy] of [
  [0, 0],
  [w - 24, 0],
  [0, h - 24],
  [w - 24, h - 24],
]) {
  for (let y = cy; y < cy + 24; y++) {
    for (let x = cx; x < cx + 24; x++) {
      corners.push([idx(x, y), idx(x, y) + 1, idx(x, y) + 2]);
    }
  }
}
const avg = [0, 1, 2].map(
  (c) => corners.reduce((s, i) => s + data[i[c]], 0) / corners.length,
);

const isBackdrop = (p) =>
  Math.abs(data[p] - avg[0]) <= TOL &&
  Math.abs(data[p + 1] - avg[1]) <= TOL &&
  Math.abs(data[p + 2] - avg[2]) <= TOL;

// BFS flood fill from every border pixel.
const visited = new Uint8Array(w * h);
const queue = [];
for (let x = 0; x < w; x++) {
  queue.push([x, 0], [x, h - 1]);
}
for (let y = 0; y < h; y++) {
  queue.push([0, y], [w - 1, y]);
}

let removed = 0;
while (queue.length) {
  const [x, y] = queue.pop();
  if (x < 0 || y < 0 || x >= w || y >= h) continue;
  const v = y * w + x;
  if (visited[v]) continue;
  visited[v] = 1;
  const p = v * channels;
  if (!isBackdrop(p)) continue;
  data[p + 3] = 0; // transparent
  removed++;
  queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Feather: pixels adjacent to transparency get partial alpha (anti-alias).
for (let y = 1; y < h - 1; y++) {
  for (let x = 1; x < w - 1; x++) {
    const p = idx(x, y);
    if (data[p + 3] === 0) continue;
    const near =
      data[p - channels + 3] === 0 ||
      data[p + channels + 3] === 0 ||
      data[p - w * channels + 3] === 0 ||
      data[p + w * channels + 3] === 0;
    if (near && isBackdrop(p)) data[p + 3] = 128;
  }
}

// Trim to the ink bounding box (+2px pad) so the emblem renders at a
// predictable size regardless of source-canvas margins.
let minX = w, maxX = 0, minY = h, maxY = 0;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (data[idx(x, y) + 3] > 40) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
minX = Math.max(0, minX - 2);
minY = Math.max(0, minY - 2);
maxX = Math.min(w - 1, maxX + 2);
maxY = Math.min(h - 1, maxY + 2);
const tw = maxX - minX + 1;
const th = maxY - minY + 1;

// White-ink variant: keep alpha, push every visible pixel to white.
const white = Buffer.from(data);
for (let i = 0; i < w * h; i++) {
  const p = i * channels;
  if (white[p + 3] === 0) continue;
  white[p] = 255;
  white[p + 1] = 255;
  white[p + 2] = 255;
}

const crop = { left: minX, top: minY, width: tw, height: th };

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .extract(crop)
  .png({ compressionLevel: 9 })
  .toFile(OUT);

await sharp(white, { raw: { width: w, height: h, channels: 4 } })
  .extract(crop)
  .png({ compressionLevel: 9 })
  .toFile(OUT_WHITE);

console.log(
  `logo.png + logo-white.png written: ${tw}x${th} (trimmed from ${w}x${h}), ${removed} px removed (${(
    (100 * removed) /
    (w * h)
  ).toFixed(1)}%), backdrop rgb(${avg.map(Math.round)})`,
);
