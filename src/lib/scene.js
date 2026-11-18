import { variantToEditableSvgString } from '../data/artwork.js';
import { normalizeHexColor } from './color-utils.js';

export const DEFAULT_SCENE_COLOR = '#242422';
export const MIN_OBJECT_SIZE = 40;
export const MAX_OBJECT_SIZE = 1100;
export const MIN_TEXT_FONT_SIZE = 10;
export const MAX_TEXT_FONT_SIZE = 300;
export const SAFE_TEXT_FAMILIES = Object.freeze([
  'Arial, sans-serif',
  'Georgia, serif',
  'monospace',
]);

let sceneIdCounter = 0;

/** Preserve the established full-color rendering for non-MDI bundled icons. */
export function defaultSceneObjectColor(artwork, brushColor) {
  if (artwork?.origin === 'icon' && artwork.source !== 'mdi') return 'original';
  return normalizeHexColor(brushColor) ?? DEFAULT_SCENE_COLOR;
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
  const normalizedColor = color === 'original' && artwork.origin === 'icon' && artwork.source !== 'mdi'
    ? 'original'
    : normalizeHexColor(color);
  if (!normalizedColor) throw new TypeError(`Scene object color must be a valid RGB hex value: ${color}`);
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
    type: 'artwork',
    artworkId: artwork.id,
    artwork: artworkData,
    label: String(label ?? ''),
    x,
    y,
    width,
    height,
    rotation,
    color: normalizedColor,
    flipX: Boolean(flipX),
    zIndex,
  };
}

/** Create a single-line text object using the shared editable-scene model. */
export function createTextSceneObject({
  id = createSceneObjectId(),
  text,
  x,
  y,
  fontSize = 48,
  fontFamily = SAFE_TEXT_FAMILIES[0],
  fontWeight = 'normal',
  textAlign = 'left',
  color = DEFAULT_SCENE_COLOR,
  rotation = 0,
  flipX = false,
  zIndex = 0,
  width,
  height,
}) {
  const value = String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
  const size = clamp(Number(fontSize) || 48, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
  if (!value) throw new TypeError('A text scene object requires non-empty text.');
  if (![x, y, rotation].every(Number.isFinite)) {
    throw new TypeError('Text object position and rotation must be finite.');
  }
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) throw new TypeError(`Text color must be a valid RGB hex value: ${color}`);
  const family = SAFE_TEXT_FAMILIES.includes(fontFamily) ? fontFamily : SAFE_TEXT_FAMILIES[0];
  const weight = fontWeight === 'bold' ? 'bold' : 'normal';
  const align = ['left', 'center', 'right'].includes(textAlign) ? textAlign : 'left';
  const bounds = getEstimatedTextBounds(value, size, weight);
  const objectWidth = Number.isFinite(width) && width > 0 ? width : bounds.width;
  const objectHeight = Number.isFinite(height) && height > 0 ? height : bounds.height;
  return {
    id,
    type: 'text',
    artworkId: null,
    artwork: null,
    label: value,
    x,
    y,
    width: objectWidth,
    height: objectHeight,
    rotation,
    color: normalizedColor,
    flipX: Boolean(flipX),
    zIndex,
    text: value,
    fontSize: size,
    fontFamily: family,
    fontWeight: weight,
    textAlign: align,
  };
}

/**
 * A doodle-erase remnant: raster pixels left after partially erasing an
 * illustration or converting sketch ink. Stored as a PNG data URL so it is
 * serialisable for undo history, and fully editable like artwork.
 */
export function createBitmapSceneObject({
  id = createSceneObjectId(),
  bitmap,
  bitmapId,
  bounds = null,
  label,
  x,
  y,
  width,
  height,
  rotation = 0,
  color = 'original',
  flipX = false,
  zIndex = 0,
}) {
  if (typeof bitmap !== 'string' || !bitmap.startsWith('data:image/png')) {
    throw new TypeError('A bitmap object requires a PNG data URL.');
  }
  if (![x, y, width, height, rotation].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError('Bitmap object position and dimensions must be finite and positive.');
  }
  const normalizedColor = color === 'original' ? 'original' : normalizeHexColor(color);
  if (!normalizedColor) throw new TypeError(`Bitmap object color must be a valid RGB hex value: ${color}`);
  return {
    id,
    type: 'bitmap',
    artworkId: null,
    artwork: null,
    bitmapId: String(bitmapId ?? id),
    bitmap,
    bitmapWidth: Number.isFinite(bounds?.width) ? bounds.width : null,
    bitmapHeight: Number.isFinite(bounds?.height) ? bounds.height : null,
    label: String(label ?? 'Doodle remnant'),
    x,
    y,
    width,
    height,
    rotation,
    color: normalizedColor,
    flipX: Boolean(flipX),
    zIndex,
  };
}

/** Conservative canvas-independent width estimate for the inline editor. */
export function getEstimatedTextBounds(text, fontSize, fontWeight = 'normal') {
  const value = String(text ?? '');
  const units = Array.from(value).reduce((total, character) => {
    if (/[ilI.,'`!:;|]/.test(character)) return total + 0.32;
    if (/[MW@#%&]/.test(character)) return total + 0.88;
    if (/\s/.test(character)) return total + 0.34;
    if (/[A-Z0-9]/.test(character)) return total + 0.63;
    return total + 0.55;
  }, 0);
  const weightFactor = fontWeight === 'bold' ? 1.06 : 1;
  return {
    width: Math.max(48, units * fontSize * weightFactor + 20),
    height: Math.max(24, fontSize * 1.45),
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
    let safePatch = patch;
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      const keepsOriginalArtworkColors = patch.color === 'original' && object.type === 'artwork'
        && object.artwork?.origin === 'icon' && object.artwork.source !== 'mdi';
      const normalizedColor = keepsOriginalArtworkColors ? 'original' : normalizeHexColor(patch.color);
      if (!normalizedColor) return object;
      safePatch = { ...patch, color: normalizedColor };
    }
    changed = true;
    return { ...object, ...safePatch };
  });
  return changed ? next : objects;
}

export function deleteSceneObject(objects, id) {
  const next = objects.filter((object) => object.id !== id);
  return next.length === objects.length ? objects : renumberSceneObjects(next);
}

export function deleteSceneObjects(objects, ids) {
  const selected = new Set(ids);
  if (!selected.size) return objects;
  const next = objects.filter((object) => !selected.has(object.id));
  return next.length === objects.length ? objects : renumberSceneObjects(next);
}

/** A stable selection-order list based on authoritative back-to-front scene order. */
export function getSelectedSceneObjects(objects, ids) {
  const selected = new Set(ids);
  return objects.filter((object) => selected.has(object.id));
}

export function duplicateSceneObjects(objects, ids, { offset = 20, idFactory = createSceneObjectId } = {}) {
  const selectedObjects = getSelectedSceneObjects(objects, ids);
  if (!selectedObjects.length) return { objects, duplicates: [] };
  const usedIds = new Set(objects.map((object) => object.id));
  const nextId = () => {
    let id = idFactory();
    if (!id || usedIds.has(id)) {
      do { id = createSceneObjectId(); } while (usedIds.has(id));
    }
    usedIds.add(id);
    return id;
  };
  const duplicates = selectedObjects.map((object, index) => ({
    ...object,
    id: nextId(),
    x: object.x + offset,
    y: object.y + offset,
    artwork: object.artwork,
    zIndex: objects.length + index,
  }));
  return { objects: renumberSceneObjects([...objects, ...duplicates]), duplicates };
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

/** Move a selected set by one stack step while retaining selected relative order. */
export function reorderSceneObjects(objects, ids, direction) {
  const selected = new Set(ids);
  if (!selected.size || !direction) return objects;
  const next = [...objects];
  let changed = false;
  if (direction > 0) {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selected.has(next[index].id) && !selected.has(next[index + 1].id)) {
        [next[index], next[index + 1]] = [next[index + 1], next[index]];
        changed = true;
      }
    }
  } else {
    for (let index = 1; index < next.length; index += 1) {
      if (selected.has(next[index].id) && !selected.has(next[index - 1].id)) {
        [next[index], next[index - 1]] = [next[index - 1], next[index]];
        changed = true;
      }
    }
  }
  return changed ? renumberSceneObjects(next) : objects;
}

/**
 * Re-insert a replacement object at the stack slot the original occupied.
 *
 * `objects` is the array *after* the original was deleted; `slot` is the deleted
 * object's zIndex. Rendering order is array order, so this also renumbers the
 * survivors: deleting shifts them down while they keep their old zIndex labels,
 * and leaving those stale makes the stack harder to reason about even though the
 * painted result is unchanged.
 */
export function insertSceneObjectAt(objects, object, slot) {
  const base = renumberSceneObjects(objects);
  const insertAt = Math.min(Math.max(0, Math.trunc(slot) || 0), base.length);
  return renumberSceneObjects([...base.slice(0, insertAt), { ...object }, ...base.slice(insertAt)]);
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

export function getObjectAxisAlignedBounds(object) {
  const corners = getTransformedCorners(object);
  const xs = corners.map(({ x }) => x);
  const ys = corners.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

/** Axis-aligned union of each selected object's transformed local-space bounds. */
export function getGroupBounds(objects) {
  if (!objects.length) return null;
  const bounds = objects.map(getObjectAxisAlignedBounds);
  const x = Math.min(...bounds.map((item) => item.x));
  const y = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.right));
  const bottom = Math.max(...bounds.map((item) => item.bottom));
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

/** Select objects whose rotated/flipped axis-aligned bounds intersect a marquee. */
export function getObjectsIntersectingRect(objects, rect) {
  if (!rect) return [];
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return objects.filter((object) => {
    const bounds = getObjectAxisAlignedBounds(object);
    return bounds.x <= right && bounds.right >= left && bounds.y <= bottom && bounds.bottom >= top;
  });
}

/** Click semantics for object selection, including Shift toggling and group drag. */
export function updateSelectionForClick(objects, currentIds, hitId, { shiftKey = false } = {}) {
  const current = getSelectedSceneObjects(objects, currentIds).map((object) => object.id);
  if (shiftKey) {
    if (!hitId) return current;
    return getSelectedSceneObjects(objects, current.includes(hitId)
      ? current.filter((id) => id !== hitId)
      : [...current, hitId]).map((object) => object.id);
  }
  if (!hitId) return [];
  return current.includes(hitId) ? current : [hitId];
}

/** Replace a selection with marquee hits, or union the hits when Shift is held. */
export function selectObjectsInMarquee(objects, currentIds, rect, { additive = false } = {}) {
  const selected = new Set(additive ? currentIds : []);
  for (const object of getObjectsIntersectingRect(objects, rect)) selected.add(object.id);
  return objects.filter((object) => selected.has(object.id)).map((object) => object.id);
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
    ...(object.type === 'text' ? {
      fontSize: clamp(object.fontSize * scale, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE),
    } : {}),
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

/** Move every selected object from its gesture-start snapshot by one logical delta. */
export function moveSceneObjects(objects, startObjects, dx, dy) {
  const starts = new Map(startObjects.map((object) => [object.id, object]));
  let changed = false;
  const next = objects.map((object) => {
    const start = starts.get(object.id);
    if (!start) return object;
    changed = true;
    return { ...object, x: start.x + dx, y: start.y + dy };
  });
  return changed ? next : objects;
}

/** Proportionally resize a selection around the opposite corner of its group AABB. */
export function resizeSceneObjectsGroup(objects, startObjects, bounds, handle, pointer, {
  minObjectSize = MIN_OBJECT_SIZE,
  maxObjectSize = MAX_OBJECT_SIZE,
} = {}) {
  if (!startObjects.length || !bounds || !handle?.signX || !handle?.signY) return objects;
  const anchor = {
    x: handle.signX > 0 ? bounds.x : bounds.right,
    y: handle.signY > 0 ? bounds.y : bounds.bottom,
  };
  const dragWidth = handle.signX * (pointer.x - anchor.x);
  const dragHeight = handle.signY * (pointer.y - anchor.y);
  const requestedScale = Math.max(dragWidth / bounds.width, dragHeight / bounds.height);
  const minScale = Math.max(...startObjects.map((object) => Math.max(
    minObjectSize / object.width,
    minObjectSize / object.height,
    object.type === 'text' ? MIN_TEXT_FONT_SIZE / object.fontSize : 0,
  )));
  const maxScale = Math.min(...startObjects.map((object) => Math.min(
    maxObjectSize / Math.max(object.width, object.height),
    object.type === 'text' ? MAX_TEXT_FONT_SIZE / object.fontSize : Infinity,
  )));
  const scale = clamp(requestedScale, minScale, Math.max(minScale, maxScale));
  const starts = new Map(startObjects.map((object) => [object.id, object]));
  let changed = false;
  const next = objects.map((object) => {
    const start = starts.get(object.id);
    if (!start) return object;
    changed = true;
    const width = start.width * scale;
    const height = start.height * scale;
    const center = getObjectCenter(start);
    const scaledCenter = {
      x: anchor.x + (center.x - anchor.x) * scale,
      y: anchor.y + (center.y - anchor.y) * scale,
    };
    return {
      ...object,
      x: scaledCenter.x - width / 2,
      y: scaledCenter.y - height / 2,
      width,
      height,
      ...(start.type === 'text' ? {
        fontSize: clamp(start.fontSize * scale, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE),
      } : {}),
    };
  });
  return changed ? next : objects;
}

/** Rotate each selected object's center around the group center and add a shared angle. */
export function rotateSceneObjectsGroup(objects, startObjects, bounds, startPointer, pointer) {
  if (!startObjects.length || !bounds) return objects;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
  let delta = currentAngle - startAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const starts = new Map(startObjects.map((object) => [object.id, object]));
  let changed = false;
  const next = objects.map((object) => {
    const start = starts.get(object.id);
    if (!start) return object;
    changed = true;
    const objectCenter = getObjectCenter(start);
    const dx = objectCenter.x - center.x;
    const dy = objectCenter.y - center.y;
    const rotatedCenter = {
      x: center.x + cos * dx - sin * dy,
      y: center.y + sin * dx + cos * dy,
    };
    return {
      ...object,
      x: rotatedCenter.x - start.width / 2,
      y: rotatedCenter.y - start.height / 2,
      rotation: start.rotation + delta * 180 / Math.PI,
    };
  });
  return changed ? next : objects;
}

export function flipSceneObjects(objects, ids) {
  const selected = new Set(ids);
  let changed = false;
  const next = objects.map((object) => {
    if (!selected.has(object.id)) return object;
    changed = true;
    return { ...object, flipX: !object.flipX };
  });
  return changed ? next : objects;
}

export function recolorSceneObjects(objects, ids, color) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return objects;
  const selected = new Set(ids);
  let changed = false;
  const next = objects.map((object) => {
    if (!selected.has(object.id) || !['artwork', 'text', 'bitmap'].includes(object.type) || object.color === normalizedColor) return object;
    changed = true;
    return { ...object, color: normalizedColor };
  });
  return changed ? next : objects;
}

export function artworkImageKey(artworkId, color) {
  const normalizedColor = color === 'original' ? 'original' : normalizeHexColor(color);
  if (!normalizedColor) throw new TypeError('Artwork cache color must be a valid RGB hex value: ' + color);
  return `${artworkId}\u0000${normalizedColor}`;
}

/** Bitmap remnants are stored by id; their PNG data lives on the object itself. */
export function bitmapImageKey(bitmapId) {
  return `bitmap\u0000${bitmapId}`;
}

/**
 * One lookup surface for both illustration SVGs and bitmap remnants, so
 * `renderScene` needs a single cache argument.
 */
export function createSceneImageCache(artworkCache, bitmapCache) {
  return {
    get(artworkId, color) {
      return artworkCache?.get(artworkId, color);
    },
    getBitmap(bitmapId) {
      return bitmapCache?.get(bitmapId);
    },
    has(artworkId, color) {
      return Boolean(artworkCache?.has(artworkId, color));
    },
    hasBitmap(bitmapId) {
      return Boolean(bitmapCache?.has(bitmapId));
    },
    async ensure(artwork, color) {
      return artworkCache.ensure(artwork, color);
    },
    async ensureBitmap(bitmapId, dataUrl) {
      return bitmapCache.ensure(bitmapId, dataUrl);
    },
    putBitmap(bitmapId, source) {
      return bitmapCache.put(bitmapId, source);
    },
    clear() {
      artworkCache?.clear();
      bitmapCache?.clear();
    },
  };
}

/** Decode (once) the PNG held by a bitmap scene object. */
export function createBitmapImageCache(ImageConstructor = globalThis.Image) {
  const images = new Map();
  const pending = new Map();
  return {
    get(bitmapId) {
      return images.get(bitmapImageKey(bitmapId));
    },
    has(bitmapId) {
      return images.has(bitmapImageKey(bitmapId));
    },
    /** Register an already-decoded raster (a fresh remnant) and drop any PNG. */
    put(bitmapId, source) {
      images.set(bitmapImageKey(bitmapId), source);
      pending.delete(bitmapImageKey(bitmapId));
      return source;
    },
    delete(bitmapId) {
      images.delete(bitmapImageKey(bitmapId));
      pending.delete(bitmapImageKey(bitmapId));
    },
    async ensure(bitmapId, dataUrl) {
      const key = bitmapImageKey(bitmapId);
      if (images.has(key)) return images.get(key);
      if (pending.has(key)) return pending.get(key);
      if (typeof ImageConstructor !== 'function') throw new Error('Image decoding is unavailable.');
      const task = (async () => {
        const image = new ImageConstructor();
        image.src = dataUrl;
        if (typeof image.decode === 'function') {
          await image.decode();
        } else {
          await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Bitmap remnant failed to load.'));
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
    clear() {
      images.clear();
      pending.clear();
    },
  };
}

export function createArtworkImageCache(ImageConstructor = globalThis.Image) {
  const images = new Map();
  const pending = new Map();
  return {
    get(artworkId, color) {
      return images.get(artworkImageKey(artworkId, color));
    },
    async ensure(artwork, color) {
      const normalizedColor = color === 'original' ? 'original' : normalizeHexColor(color);
      if (!normalizedColor) throw new TypeError(`Artwork cache color must be a valid RGB hex value: ${color}`);
      const key = artworkImageKey(artwork.id, normalizedColor);
      if (images.has(key)) return images.get(key);
      if (pending.has(key)) return pending.get(key);
      if (typeof ImageConstructor !== 'function') throw new Error('Image decoding is unavailable.');
      const task = (async () => {
        const image = new ImageConstructor();
        const svg = variantToEditableSvgString(artwork, {
          width: artwork.w,
          height: artwork.h,
          color: normalizedColor,
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
    const center = getObjectCenter(object);
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.translate(center.x, center.y);
    context.rotate(degreesToRadians(object.rotation));
    context.scale(object.flipX ? -1 : 1, 1);
    if (object.type === 'text') {
      context.fillStyle = object.color;
      context.font = `${object.fontWeight === 'bold' ? 'bold' : 'normal'} ${object.fontSize}px ${object.fontFamily}`;
      context.textAlign = object.textAlign;
      context.textBaseline = 'middle';
      const padding = Math.min(10, object.width / 8);
      const textX = object.textAlign === 'left' ? -object.width / 2 + padding
        : object.textAlign === 'right' ? object.width / 2 - padding : 0;
      context.fillText(object.text, textX, 0, Math.max(1, object.width - padding * 2));
    } else if (object.type === 'bitmap') {
      const image = imageCache instanceof Map
        ? imageCache.get(bitmapImageKey(object.bitmapId))
        : imageCache?.getBitmap?.(object.bitmapId);
      if (image) context.drawImage(image, -object.width / 2, -object.height / 2, object.width, object.height);
    } else {
      const image = imageCache instanceof Map
        ? imageCache.get(artworkImageKey(object.artworkId, object.color))
        : imageCache?.get(object.artworkId, object.color);
      if (image) context.drawImage(image, -object.width / 2, -object.height / 2, object.width, object.height);
    }
    context.restore();
  }
}

function degreesToRadians(degrees) {
  return degrees * Math.PI / 180;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
