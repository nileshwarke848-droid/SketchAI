import { variantToEditableSvgString } from '../data/artwork.js';

export const DEFAULT_SCENE_COLOR = '#242422';
export const MIN_OBJECT_SIZE = 40;
export const MAX_OBJECT_SIZE = 1100;

let sceneIdCounter = 0;

/** Preserve the established full-color rendering for non-MDI bundled icons. */
export function defaultSceneObjectColor(artwork, brushColor) {
  return artwork?.origin === 'icon' && artwork.source !== 'mdi' ? 'original' : brushColor;
}

export function createSceneObjectId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `scene-${Date.now().toString(36)}-${(++sceneIdCounter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A serialisable scene object; artwork data is immutable and shared by copies. */
export function createSceneObject({
  id = createSceneObjectId(),
  artwork,
  label,
  x,
  y,
  width,
  height,
  rotation = 0,
  color = DEFAULT_SCENE_COLOR,
  flipX = false,
  zIndex = 0,
}) {
  if (!artwork?.id || !artwork?.w || !artwork?.h || !artwork?.b) {
    throw new TypeError('A scene object requires a complete artwork variant.');
  }
  if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError('Scene object position and dimensions must be finite and positive.');
  }
  const artworkData = {
    id: artwork.id,
    w: artwork.w,
    h: artwork.h,
    b: artwork.b,
    origin: artwork.origin,
    source: artwork.source,
    sourceKey: artwork.sourceKey,
    mode: artwork.mode,
  };
  return {
    id,
    artworkId: artwork.id,
    artwork: artworkData,
    label: String(label ?? ''),
    x,
    y,
    width,
    height,
    rotation,
    color,
    flipX: Boolean(flipX),
    zIndex,
  };
}

/** Places an artwork object around the rough sketch while preserving its ratio. */
export function getSceneObjectPlacement(bounds, artwork, canvasWidth, canvasHeight, {
  minDimension = 140,
  maxDimension = 320,
  padding = 8,
} = {}) {
  if (!bounds?.width || !bounds?.height || !artwork?.w || !artwork?.h) return null;
  const requested = Math.max(bounds.width, bounds.height);
  const longestSide = Math.min(maxDimension, Math.max(minDimension, requested));
  const scale = longestSide / Math.max(artwork.w, artwork.h);
  const width = artwork.w * scale;
  const height = artwork.h * scale;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const x = clamp(centerX - width / 2, padding, Math.max(padding, canvasWidth - width - padding));
  const y = clamp(centerY - height / 2, padding, Math.max(padding, canvasHeight - height - padding));
  return { x, y, width, height };
}

export function cloneSceneObjects(objects) {
  return objects.map((object) => ({ ...object, artwork: object.artwork }));
}

export function renumberSceneObjects(objects) {
  return objects.map((object, index) => ({ ...object, zIndex: index }));
}

export function addSceneObject(objects, object) {
  return renumberSceneObjects([...objects, { ...object }]);
}

export function updateSceneObject(objects, id, update) {
  let changed = false;
  const next = objects.map((object) => {
    if (object.id !== id) return object;
    const patch = typeof update === 'function' ? update(object) : update;
    if (!patch) return object;
    changed = true;
    return { ...object, ...patch };
  });
  return changed ? next : objects;
}

export function deleteSceneObject(objects, id) {
  const next = objects.filter((object) => object.id !== id);
  return next.length === objects.length ? objects : renumberSceneObjects(next);
}

export function duplicateSceneObject(objects, id, { offset = 20, idFactory = createSceneObjectId } = {}) {
  const original = objects.find((object) => object.id === id);
  if (!original) return { objects, duplicate: null };
  const duplicate = {
    ...original,
    id: idFactory(),
    x: original.x + offset,
    y: original.y + offset,
    artwork: original.artwork,
    zIndex: objects.length,
  };
  return { objects: renumberSceneObjects([...objects, duplicate]), duplicate };
}

/** Move exactly one array/z-order step; array order is authoritative. */
export function shiftSceneObject(objects, id, direction) {
  const index = objects.findIndex((object) => object.id === id);
  const target = index + Math.sign(direction);
  if (index < 0 || target < 0 || target >= objects.length) return objects;
  const next = [...objects];
  [next[index], next[target]] = [next[target], next[index]];
  return renumberSceneObjects(next);
}

export function getObjectCenter(object) {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

/** Convert a canvas/world point to the object's unrotated, unflipped local axes. */
export function worldToObjectLocal(object, point) {
  const center = getObjectCenter(object);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const angle = degreesToRadians(object.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotatedX = cos * dx + sin * dy;
  const rotatedY = -sin * dx + cos * dy;
  return { x: object.flipX ? -rotatedX : rotatedX, y: rotatedY };
}

/** Convert an object's unrotated, unflipped local point to canvas/world space. */
export function objectLocalToWorld(object, point) {
  const center = getObjectCenter(object);
  const vector = localVectorToWorld(object, point.x, point.y);
  return { x: center.x + vector.x, y: center.y + vector.y };
}

export function localVectorToWorld(object, x, y) {
  const flippedX = object.flipX ? -x : x;
  const angle = degreesToRadians(object.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: cos * flippedX - sin * y, y: sin * flippedX + cos * y };
}

export function hitTestObject(object, point, padding = 0) {
  const local = worldToObjectLocal(object, point);
  return Math.abs(local.x) <= object.width / 2 + padding
    && Math.abs(local.y) <= object.height / 2 + padding;
}

/** Topmost-first object hit testing, using transformed local-space bounds. */
export function hitTestScene(objects, point, padding = 0) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    if (hitTestObject(objects[index], point, padding)) return objects[index];
  }
  return null;
}

export function getTransformedCorners(object) {
  return [
    { signX: -1, signY: -1 },
    { signX: 1, signY: -1 },
    { signX: 1, signY: 1 },
    { signX: -1, signY: 1 },
  ].map(({ signX, signY }) => ({
    signX,
    signY,
    ...objectLocalToWorld(object, {
      x: signX * object.width / 2,
      y: signY * object.height / 2,
    }),
  }));
}

export function getRotationHandle(object, gap = 32) {
  return objectLocalToWorld(object, { x: 0, y: -object.height / 2 - gap });
}

/** Resize from the opposite local-space corner and preserve the initial ratio. */
export function resizeSceneObject(object, handle, pointer, {
  minSize = MIN_OBJECT_SIZE,
  maxSize = MAX_OBJECT_SIZE,
} = {}) {
  const { signX, signY } = handle;
  if (!signX || !signY) return object;
  const anchorLocal = {
    x: -signX * object.width / 2,
    y: -signY * object.height / 2,
  };
  const anchorWorld = objectLocalToWorld(object, anchorLocal);
  const pointerLocal = worldToObjectLocal(object, pointer);
  const dragWidth = signX * (pointerLocal.x - anchorLocal.x);
  const dragHeight = signY * (pointerLocal.y - anchorLocal.y);
  const scale = clamp(
    Math.max(minSize / object.width, minSize / object.height,
      dragWidth / object.width, dragHeight / object.height),
    Math.max(minSize / object.width, minSize / object.height),
    maxSize / Math.max(object.width, object.height),
  );
  const width = object.width * scale;
  const height = object.height * scale;
  const anchorOffset = localVectorToWorld(object, -signX * width / 2, -signY * height / 2);
  const centerX = anchorWorld.x - anchorOffset.x;
  const centerY = anchorWorld.y - anchorOffset.y;
  return {
    ...object,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function getRotationFromPointer(object, startRotation, startPointer, pointer, snap = false) {
  const center = getObjectCenter(object);
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
  let delta = currentAngle - startAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const degrees = startRotation + delta * 180 / Math.PI;
  return snap ? Math.round(degrees / 15) * 15 : degrees;
}

export function artworkImageKey(artworkId, color) {
  return `${artworkId}\u0000${color}`;
}

export function createArtworkImageCache(ImageConstructor = globalThis.Image) {
  const images = new Map();
  const pending = new Map();
  return {
    get(artworkId, color) {
      return images.get(artworkImageKey(artworkId, color));
    },
    async ensure(artwork, color) {
      const key = artworkImageKey(artwork.id, color);
      if (images.has(key)) return images.get(key);
      if (pending.has(key)) return pending.get(key);
      if (typeof ImageConstructor !== 'function') throw new Error('Image decoding is unavailable.');
      const task = (async () => {
        const image = new ImageConstructor();
        const svg = variantToEditableSvgString(artwork, {
          width: artwork.w,
          height: artwork.h,
          color,
        });
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        if (typeof image.decode === 'function') {
          await image.decode();
        } else {
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Artwork SVG failed to load.'));
          });
        }
        images.set(key, image);
        return image;
      })();
      pending.set(key, task);
      try {
        return await task;
      } finally {
        pending.delete(key);
      }
    },
    has(artworkId, color) {
      return images.has(artworkImageKey(artworkId, color));
    },
    clear() {
      images.clear();
      pending.clear();
    },
  };
}

/** Deterministic source-of-truth render: scene array order is back-to-front. */
export function renderScene(objects, canvas, imageCache) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  for (const object of objects) {
    const image = imageCache instanceof Map
      ? imageCache.get(artworkImageKey(object.artworkId, object.color))
      : imageCache?.get(object.artworkId, object.color);
    if (!image) continue;
    const center = getObjectCenter(object);
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.translate(center.x, center.y);
    context.rotate(degreesToRadians(object.rotation));
    context.scale(object.flipX ? -1 : 1, 1);
    context.drawImage(image, -object.width / 2, -object.height / 2, object.width, object.height);
    context.restore();
  }
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
