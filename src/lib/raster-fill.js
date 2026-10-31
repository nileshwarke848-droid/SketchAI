import { DEFAULT_BACKGROUND_COLOR, hexToRgb, normalizeHexColor } from './color-utils.js';

export const DEFAULT_FILL_TOLERANCE = 22;

/**
 * Draw the current visible composition into an offscreen boundary canvas.
 * Editable scene artwork and rough sketch are only read as boundary pixels;
 * no scene data is flattened or replaced.
 */
export function composeFillBoundary(referenceCanvas, {
  backgroundColor = DEFAULT_BACKGROUND_COLOR,
  fillCanvas,
  sceneCanvas,
  sketchCanvas,
}) {
  if (!referenceCanvas) throw new TypeError('A reference canvas is required.');
  const context = referenceCanvas.getContext('2d', { willReadFrequently: true });
  context.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);
  const normalizedBackground = normalizeHexColor(backgroundColor);
  if (!normalizedBackground) throw new TypeError(`Unsupported canvas background color: ${backgroundColor}`);
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = normalizedBackground;
  context.fillRect(0, 0, referenceCanvas.width, referenceCanvas.height);
  for (const layer of [fillCanvas, sceneCanvas, sketchCanvas]) {
    if (layer) context.drawImage(layer, 0, 0, referenceCanvas.width, referenceCanvas.height);
  }
  return context.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
}

/**
 * Iterative four-neighbour flood fill. A fixed-size integer queue and one-byte
 * visited mask cap allocations at approximately 4.4 MB for a 1200 × 720 canvas
 * and avoid recursion/stack overflow even when the whole canvas is one region.
 */
export function floodFillMask(imageData, seedX, seedY, tolerance = DEFAULT_FILL_TOLERANCE) {
  const { width, height, data } = imageData ?? {};
  if (!(width > 0) || !(height > 0) || !data || data.length < width * height * 4) {
    throw new TypeError('Flood fill requires a complete RGBA image.');
  }
  const x = Math.floor(seedX);
  const y = Math.floor(seedY);
  const mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return { mask, count: 0, target: null };

  const seed = (y * width + x) * 4;
  const target = [data[seed], data[seed + 1], data[seed + 2], data[seed + 3]];
  const threshold = Math.max(0, Math.min(255, Number(tolerance) || 0));
  const pixelCount = width * height;
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const seedIndex = y * width + x;
  queue[tail++] = seedIndex;
  mask[seedIndex] = 1;
  let count = 0;

  const matches = (index) => {
    const offset = index * 4;
    return Math.abs(data[offset] - target[0]) <= threshold
      && Math.abs(data[offset + 1] - target[1]) <= threshold
      && Math.abs(data[offset + 2] - target[2]) <= threshold
      && Math.abs(data[offset + 3] - target[3]) <= threshold;
  };
  const enqueue = (index) => {
    if (mask[index] || !matches(index)) return;
    mask[index] = 1;
    queue[tail++] = index;
  };

  while (head < tail) {
    const index = queue[head++];
    count += 1;
    const px = index % width;
    if (px > 0) enqueue(index - 1);
    if (px + 1 < width) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < pixelCount) enqueue(index + width);
  }
  return { mask, count, target };
}

/** Apply the computed region to a separate fill-layer ImageData buffer. */
export function applyFillMask(imageData, mask, color) {
  const rgba = parseHexColor(color);
  if (!rgba) throw new TypeError(`Unsupported fill color: ${color}`);
  const { data, width, height } = imageData;
  if (mask.length !== width * height) throw new TypeError('Fill mask dimensions do not match the target image.');
  let changed = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const offset = index * 4;
    if (data[offset] === rgba[0] && data[offset + 1] === rgba[1]
      && data[offset + 2] === rgba[2] && data[offset + 3] === rgba[3]) continue;
    data[offset] = rgba[0];
    data[offset + 1] = rgba[1];
    data[offset + 2] = rgba[2];
    data[offset + 3] = rgba[3];
    changed += 1;
  }
  return changed;
}

/** Complete a bucket operation against a composed boundary into fillCanvas only. */
export function fillCanvasRegion({
  referenceCanvas,
  fillCanvas,
  seed,
  color,
  tolerance = DEFAULT_FILL_TOLERANCE,
}) {
  if (!referenceCanvas || !fillCanvas) throw new TypeError('Reference and fill canvases are required.');
  const width = fillCanvas.width;
  const height = fillCanvas.height;
  if (referenceCanvas.width !== width || referenceCanvas.height !== height) {
    throw new TypeError('Reference and fill canvases must share logical dimensions.');
  }
  const source = referenceCanvas.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, width, height);
  const region = floodFillMask(source, seed.x, seed.y, tolerance);
  if (!region.count) return { ...region, changed: 0 };
  const targetContext = fillCanvas.getContext('2d', { willReadFrequently: true });
  const target = targetContext.getImageData(0, 0, width, height);
  const changed = applyFillMask(target, region.mask, color);
  if (changed) targetContext.putImageData(target, 0, 0);
  return { ...region, changed };
}

export function parseHexColor(color) {
  const normalized = normalizeHexColor(color);
  if (normalized) {
    const { r, g, b } = hexToRgb(normalized);
    return [r, g, b, 255];
  }
  // Keep the raster helper's earlier shorthand convenience without admitting
  // shorthand into the canonical scene/UI color representation.
  if (typeof color === 'string' && /^#[\da-f]{3}$/i.test(color)) {
    const expanded = `#${[...color.slice(1)].map((channel) => channel + channel).join('')}`;
    const { r, g, b } = hexToRgb(expanded);
    return [r, g, b, 255];
  }
  return null;
}
