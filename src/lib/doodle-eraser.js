import { drawShapeObject } from './scene.js';

/**
 * Doodle eraser: a soft, brush-like eraser that removes pixels anywhere on the
 * document. Unlike the classic eraser — which deletes a whole scene object as
 * soon as the pointer crosses it — this mode shaves material off and keeps
 * whatever survives as a fully editable object.
 *
 * Two inputs are handled:
 *   - illustrations / doodle remnants (scene objects), erased per object in the
 *     object's own local raster space so rotation and flips stay correct
 *   - freehand sketch ink (the sketch overlay), which is converted into editable
 *     objects once the gesture that touched it ends
 *
 * Everything here is pure canvas geometry; the React layer owns the scene.
 */

/** A doodle erase stroke is wider than the brush, matching the classic eraser feel. */
export const DOODLE_RADIUS_FACTOR = 3;

/** Alpha at or below this counts as empty. */
export const ALPHA_FLOOR = 8;

/** Raster resolution for a live erase. 2× keeps soft edges and keeps PNGs small. */
export const ERASE_PIXEL_SCALE = 2;

/** A remnant smaller than this is treated as fully erased. */
export const MIN_REMNANT_PIXELS = 12;

export function createCanvasFactory(canvasFactory) {
  return canvasFactory ?? ((width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  });
}

/** Drawable source for one object: its cached SVG artwork or its cached raster. */
export function objectImageKey(object) {
  return object.type === 'bitmap' ? `bitmap\u0000${object.bitmapId}` : null;
}

/**
 * Render one scene object into a standalone raster at `pixelScale`.
 * Recoloured objects are tinted the same way `renderScene` tints them, so the
 * remnant a user erases is exactly the pixels they can see.
 */
export function renderObjectRaster({ object, image, pixelScale = ERASE_PIXEL_SCALE, canvasFactory }) {
  const makeCanvas = createCanvasFactory(canvasFactory);
  const width = Math.max(1, Math.round(object.width * pixelScale));
  const height = Math.max(1, Math.round(object.height * pixelScale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.clearRect(0, 0, width, height);
  // Text has no decoded image; paint its glyphs so the eraser can shave them
  // exactly like artwork pixels. Layout mirrors renderScene, in local space.
  if (object.type === 'text') {
    renderTextGlyphs({ context, object, pixelScale });
    return canvas;
  }
  if (object.type === 'shape') {
    context.save();
    // Keep this raster in unrotated object-local space. The surviving bitmap
    // carries the original scene rotation/flip just like any other object.
    context.translate(width / 2, height / 2);
    context.scale(pixelScale, pixelScale);
    drawShapeObject(context, object);
    context.restore();
    return canvas;
  }
  if (image) {
    context.drawImage(image, 0, 0, width, height);
    if (object.color && object.color !== 'original') {
      context.globalCompositeOperation = 'source-in';
      context.fillStyle = object.color;
      context.fillRect(0, 0, width, height);
      context.globalCompositeOperation = 'source-over';
    }
  }
  return canvas;
}

/** Draw a text object's glyphs into a local-space raster centred on the canvas. */
export function renderTextGlyphs({ context, object, pixelScale = ERASE_PIXEL_SCALE }) {
  const scale = pixelScale;
  const width = Math.round(object.width * scale);
  const height = Math.round(object.height * scale);
  const padding = Math.min(10, object.width / 8) * scale;
  context.save();
  // renderScene draws text around the object's centre; the raster's centre is
  // the same point, so mirror that transform here.
  context.translate(width / 2, height / 2);
  context.fillStyle = object.color;
  context.font = `${object.fontWeight === 'bold' ? 'bold' : 'normal'} ${object.fontSize * scale}px ${object.fontFamily}`;
  context.textAlign = object.textAlign;
  context.textBaseline = 'middle';
  const textX = object.textAlign === 'left' ? -width / 2 + padding
    : object.textAlign === 'right' ? width / 2 - padding : 0;
  context.fillText(object.text, textX, 0, Math.max(1, width - padding * 2));
  context.restore();
  return context;
}

/**
 * Alpha mask of where a world-space stroke travelled inside one object.
 * `points` are world coordinates; `worldToLocal` comes from the scene model.
 */
export function createEraseMask({
  width,
  height,
  points,
  radius,
  worldToLocal,
  canvasFactory,
}) {
  const makeCanvas = createCanvasFactory(canvasFactory);
  const mask = makeCanvas(width, height);
  const context = mask.getContext('2d');
  if (!context || !points?.length) return mask;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#fff';
  context.fillStyle = '#fff';
  context.lineWidth = Math.max(1, radius * 2);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const local = points.map((point) => worldToLocal(point));
  if (local.length === 1) {
    context.beginPath();
    context.arc(local[0].x, local[0].y, Math.max(0.5, radius), 0, Math.PI * 2);
    context.fill();
    return mask;
  }
  context.beginPath();
  context.moveTo(local[0].x, local[0].y);
  for (let index = 1; index < local.length; index += 1) {
    context.lineTo(local[index].x + 0.01, local[index].y + 0.01);
  }
  context.stroke();
  return mask;
}

/**
 * Does the stroke actually cover visible pixels of this raster? Bounding boxes
 * quickly become larger than the drawing (an erase can hollow out the middle),
 * so acting on box overlap alone would "trim" blank space. Early-exits on the
 * first shared pixel.
 */
export function maskOverlapsInk({ canvas, mask, threshold = ALPHA_FLOOR }) {
  const context = canvas?.getContext?.('2d');
  const maskContext = mask?.getContext?.('2d');
  if (!context || !maskContext) return false;
  if (canvas.width !== mask.width || canvas.height !== mask.height) return false;
  const ink = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const stroke = maskContext.getImageData(0, 0, mask.width, mask.height).data;
  for (let offset = 3; offset < ink.length; offset += 4) {
    if (stroke[offset] > threshold && ink[offset] > threshold) return true;
  }
  return false;
}

/** Does this alpha mask touch anything at all? */
export function maskHasInk(mask, { threshold = ALPHA_FLOOR } = {}) {
  const context = mask?.getContext?.('2d');
  if (!context) return false;
  const { data } = context.getImageData(0, 0, mask.width, mask.height);
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] > threshold) return true;
  }
  return false;
}

/**
 * Crop a raster to its surviving (non-transparent) pixels.
 * @returns {{remaining:number, canvas:HTMLCanvasElement|null, bounds:Object|null}}
 */
export function measureRemaining({ canvas, canvasFactory, minPixels = MIN_REMNANT_PIXELS }) {
  const makeCanvas = createCanvasFactory(canvasFactory);
  if (!canvas) return { remaining: 0, canvas: null, bounds: null };
  const context = canvas.getContext('2d');
  if (!context) return { remaining: 0, canvas: null, bounds: null };
  const width = canvas.width;
  const height = canvas.height;
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let remaining = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] <= ALPHA_FLOOR) continue;
      remaining += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (remaining < minPixels) return { remaining, canvas: null, bounds: null };
  const bounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const cropped = makeCanvas(bounds.width, bounds.height);
  cropped.getContext('2d').drawImage(
    canvas,
    bounds.x, bounds.y, bounds.width, bounds.height,
    0, 0, bounds.width, bounds.height,
  );
  return { remaining, canvas: cropped, bounds };
}

/**
 * Encode a raster as a PNG data URL. `@napi-rs/canvas` (used by the audits)
 * exposes `toBuffer` but not `toDataURL`, so support both.
 */
export function canvasToPngDataUrl(canvas) {
  if (typeof canvas?.toDataURL === 'function') return canvas.toDataURL('image/png');
  if (typeof canvas?.toBuffer === 'function') {
    return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
  }
  throw new Error('This canvas cannot be encoded as a PNG.');
}

/** Erase the mask out of a raster, then crop to what is left. */
export function eraseWithMask({ canvas, mask, canvasFactory, minPixels = MIN_REMNANT_PIXELS }) {
  const context = canvas?.getContext?.('2d');
  if (!context || !mask) return { remaining: 0, canvas: null, bounds: null };
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(mask, 0, 0);
  context.restore();
  return measureRemaining({ canvas, canvasFactory, minPixels });
}

/** Convert origin-local raster bounds back into a world-space object box. */
export function remnantPlacement({ object, localBounds, pixelScale = ERASE_PIXEL_SCALE }) {
  const unitWidth = object.width / Math.max(1, Math.round(object.width * pixelScale));
  const unitHeight = object.height / Math.max(1, Math.round(object.height * pixelScale));
  const width = localBounds.width * unitWidth;
  const height = localBounds.height * unitHeight;
  const centerLocal = {
    x: localBounds.x * unitWidth + width / 2 - object.width / 2,
    y: localBounds.y * unitHeight + height / 2 - object.height / 2,
  };
  const angle = (object.rotation * Math.PI) / 180;
  const flippedX = object.flipX ? -centerLocal.x : centerLocal.x;
  const offsetX = Math.cos(angle) * flippedX - Math.sin(angle) * centerLocal.y;
  const offsetY = Math.sin(angle) * flippedX + Math.cos(angle) * centerLocal.y;
  const center = { x: object.x + object.width / 2 + offsetX, y: object.y + object.height / 2 + offsetY };
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/**
 * Group surviving sketch ink into separate editable objects so two doodles far
 * apart do not become one giant object. Uses 4-connected union-find over alpha,
 * which is linear-ish and keeps large sketches fast.
 */
export function splitInkBlobs({
  canvas,
  minPixels = MIN_REMNANT_PIXELS,
  maxBlobs = 80,
  canvasFactory,
}) {
  const makeCanvas = createCanvasFactory(canvasFactory);
  const context = canvas?.getContext?.('2d');
  if (!context) return [];
  const { width, height } = canvas;
  const { data } = context.getImageData(0, 0, width, height);
  const total = width * height;
  const parent = new Int32Array(total);
  const ink = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    parent[index] = index;
    ink[index] = data[index * 4 + 3] > ALPHA_FLOOR ? 1 : 0;
  }
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      if (!ink[index]) continue;
      if (x + 1 < width && ink[index + 1]) union(index, index + 1);
      if (y + 1 < height && ink[index + width]) union(index, index + width);
    }
  }
  const groups = new Map();
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      if (!ink[index]) continue;
      const root = find(index);
      let group = groups.get(root);
      if (!group) {
        group = { minX: width, minY: height, maxX: -1, maxY: -1, count: 0 };
        groups.set(root, group);
      }
      group.count += 1;
      if (x < group.minX) group.minX = x;
      if (x > group.maxX) group.maxX = x;
      if (y < group.minY) group.minY = y;
      if (y > group.maxY) group.maxY = y;
    }
  }
  const blobs = [];
  for (const group of groups.values()) {
    if (group.count < minPixels) continue;
    if (group.maxX < 0) continue;
    const margin = 1;
    const left = Math.max(0, group.minX - margin);
    const top = Math.max(0, group.minY - margin);
    const right = Math.min(width - 1, group.maxX + margin);
    const bottom = Math.min(height - 1, group.maxY + margin);
    const blobWidth = right - left + 1;
    const blobHeight = bottom - top + 1;
    const blob = makeCanvas(blobWidth, blobHeight);
    blob.getContext('2d').drawImage(canvas, left, top, blobWidth, blobHeight, 0, 0, blobWidth, blobHeight);
    blobs.push({
      canvas: blob,
      bounds: { x: left, y: top, width: blobWidth, height: blobHeight },
      pixels: group.count,
    });
  }
  blobs.sort((left, right) => right.pixels - left.pixels);
  return blobs.slice(0, maxBlobs);
}

/** Distance from a point to a line segment; used to test sketch ink under a stroke. */
function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - from.x, point.y - from.y);
  let t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/**
 * Is there sketch ink under this stroke segment? Only the stroke's bounding box
 * is read, so this stays cheap during a drag.
 */
export function sketchInkUnderSegment(sketch, from, to, radius, { threshold = ALPHA_FLOOR } = {}) {
  const context = sketch?.getContext?.('2d');
  if (!context) return false;
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius - 1));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius - 1));
  const right = Math.min(sketch.width - 1, Math.ceil(Math.max(from.x, to.x) + radius + 1));
  const bottom = Math.min(sketch.height - 1, Math.ceil(Math.max(from.y, to.y) + radius + 1));
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width <= 0 || height <= 0) return false;
  const { data } = context.getImageData(left, top, width, height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] <= threshold) continue;
      if (distanceToSegment({ x: left + x, y: top + y }, from, to) <= radius) return true;
    }
  }
  return false;
}

/** Copy the surviving sketch ink onto its own sheet so each blob can be cropped. */
export function sketchInkSheet({ sketch, canvasFactory }) {
  const makeCanvas = createCanvasFactory(canvasFactory);
  const sheet = makeCanvas(sketch.width, sketch.height);
  const context = sheet.getContext('2d');
  context.clearRect(0, 0, sketch.width, sketch.height);
  context.drawImage(sketch, 0, 0);
  return sheet;
}
