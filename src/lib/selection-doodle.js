import { getObjectCenter, getTransformedCorners } from './scene.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A lasso that stops a little short of its starting point is still a lasso: with a
// mouse nobody lands exactly where they began. The allowance scales with the size
// of the loop itself (15 % of its bounding-box diagonal) and is capped so a large
// scribble is still treated as a scribble.
export const LOOP_GAP_RATIO = 0.15;
export const MAX_LOOP_GAP = 120;

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function boundingDiagonal(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** Distance between the first and last point of a selection stroke. */
export function selectionDoodleGap(points) {
  if (!Array.isArray(points) || points.length < 2) return Infinity;
  return distance(points[0], points[points.length - 1]);
}

export function isClosedSelectionDoodle(points, tolerance = 24) {
  if (!Array.isArray(points) || points.length < 3) return false;
  const length = pathLength(points);
  if (length < Math.max(24, tolerance * 1.5)) return false;

  const gap = selectionDoodleGap(points);
  if (gap <= tolerance) return true;

  const diagonal = boundingDiagonal(points);
  if (!(diagonal > 0)) return false;
  const allowance = Math.min(MAX_LOOP_GAP, Math.max(tolerance, diagonal * LOOP_GAP_RATIO));
  // It must also have gone somewhere: a short stab that happens to end near where
  // it started is not a loop around anything.
  return gap <= allowance && length >= diagonal * 1.5;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    if (Math.hypot(point.x - (a.x + projection * dx), point.y - (a.y + projection * dy)) < 0.001) return true;
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-8) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) + 1e-8 && b.x >= Math.min(a.x, c.x) - 1e-8
    && b.y <= Math.max(a.y, c.y) + 1e-8 && b.y >= Math.min(a.y, c.y) - 1e-8;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSegment(a, c, b))
    || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d))
    || (o4 === 0 && onSegment(c, b, d));
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointToSegmentDistance(a, c, d),
    pointToSegmentDistance(b, c, d),
    pointToSegmentDistance(c, a, b),
    pointToSegmentDistance(d, a, b),
  );
}

function polygonEdges(polygon) {
  return polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]]);
}

function pathsIntersect(first, second) {
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    const [a, b] = first[firstIndex];
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      const [c, d] = second[secondIndex];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function loopIntersectsObject(loop, object) {
  const corners = getTransformedCorners(object);
  const objectEdges = polygonEdges(corners);
  const loopEdges = polygonEdges(loop);
  const center = getObjectCenter(object);
  return pointInPolygon(center, loop)
    || corners.some((corner) => pointInPolygon(corner, loop))
    || loop.some((point) => pointInPolygon(point, corners))
    || pathsIntersect(loopEdges, objectEdges);
}

function strokeTouchesObject(stroke, object, tolerance) {
  const corners = getTransformedCorners(object);
  const edges = polygonEdges(corners);
  if (stroke.some((point) => pointInPolygon(point, corners))) return true;
  const strokeEdges = stroke.length > 1
    ? stroke.slice(1).map((point, index) => [stroke[index], point])
    : [[stroke[0], stroke[0]]];
  for (const [a, b] of strokeEdges) {
    for (const [c, d] of edges) {
      if (segmentDistance(a, b, c, d) <= tolerance) return true;
    }
  }
  return false;
}

/** Select all scene objects enclosed or crossed by a closed freehand loop. */
export function selectObjectsInDoodleLoop(objects, points, existingIds = [], { additive = false } = {}) {
  const selected = new Set(additive ? existingIds : []);
  if (points.length >= 3) {
    for (const object of objects) {
      if (loopIntersectsObject(points, object)) selected.add(object.id);
    }
  }
  return objects.filter((object) => selected.has(object.id)).map((object) => object.id);
}

/** Select scene objects touched by an open brush-like selection stroke. */
export function selectObjectsTouchedByDoodle(objects, points, tolerance = 12, existingIds = [], { additive = false } = {}) {
  const selected = new Set(additive ? existingIds : []);
  if (points.length) {
    for (const object of objects) {
      if (strokeTouchesObject(points, object, tolerance)) selected.add(object.id);
    }
  }
  return objects.filter((object) => selected.has(object.id)).map((object) => object.id);
}

/**
 * Merge several selection results into one id list in scene order.
 *
 * A closed lasso runs the loop test *and* the touched test: the loop test alone
 * misses an object the stroke merely brushed past, and the union can only ever
 * select more than the old behaviour, never less.
 */
export function combineSelectionIds(objects, ...lists) {
  const ids = new Set();
  for (const list of lists) {
    for (const id of list ?? []) ids.add(id);
  }
  return objects.filter((object) => ids.has(object.id)).map((object) => object.id);
}
