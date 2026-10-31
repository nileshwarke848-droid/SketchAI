/**
 * Shared logical-canvas/view transform helpers.
 *
 * The document always remains 1200 × 720 logical pixels. `zoom` is a scale and
 * `panX`/`panY` are CSS-pixel translations in the canvas viewport. Pointer input
 * is first expressed relative to the untransformed viewport, then inverse
 * transformed into logical document coordinates. DPR is intentionally omitted.
 */
export const MIN_VIEW_ZOOM = 0.25;
export const MAX_VIEW_ZOOM = 4;
export const DEFAULT_VIEWPORT = Object.freeze({ zoom: 1, panX: 0, panY: 0 });

export function clampViewZoom(zoom) {
  const value = Number(zoom);
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, Number.isFinite(value) ? value : 1));
}

/** Apply the CSS view transform to a point in viewport-local CSS pixels. */
export function applyViewportTransform(point, viewport = DEFAULT_VIEWPORT) {
  const zoom = clampViewZoom(viewport.zoom);
  return {
    x: point.x * zoom + (Number(viewport.panX) || 0),
    y: point.y * zoom + (Number(viewport.panY) || 0),
  };
}

/** Inverse of applyViewportTransform. */
export function inverseViewportTransform(point, viewport = DEFAULT_VIEWPORT) {
  const zoom = clampViewZoom(viewport.zoom);
  return {
    x: (point.x - (Number(viewport.panX) || 0)) / zoom,
    y: (point.y - (Number(viewport.panY) || 0)) / zoom,
  };
}

/**
 * Convert a client coordinate to viewport-local CSS pixels. Keeping this step
 * shared also gives pan gestures the same origin as drawing gestures.
 */
export function clientToViewportPoint(clientX, clientY, viewportElement) {
  const rect = viewportElement?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/**
 * Map a browser pointer into logical 1200 × 720 coordinates (or another logical
 * size). The viewport element itself is never transformed; only its stage is.
 */
export function clientToCanvasPoint(
  clientX,
  clientY,
  viewportElement,
  canvasWidth,
  canvasHeight,
  view = DEFAULT_VIEWPORT,
) {
  const rect = viewportElement?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !(canvasWidth > 0) || !(canvasHeight > 0)) return { x: 0, y: 0 };
  const viewPoint = inverseViewportTransform(
    { x: clientX - rect.left, y: clientY - rect.top },
    view,
  );
  return {
    x: viewPoint.x * (canvasWidth / rect.width),
    y: viewPoint.y * (canvasHeight / rect.height),
  };
}

/** Map logical document coordinates to browser client coordinates. */
export function canvasToClientPoint(
  x,
  y,
  viewportElement,
  canvasWidth,
  canvasHeight,
  view = DEFAULT_VIEWPORT,
) {
  const rect = viewportElement?.getBoundingClientRect?.();
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !(canvasWidth > 0) || !(canvasHeight > 0)) return { x: 0, y: 0 };
  const transformed = applyViewportTransform({
    x: x * (rect.width / canvasWidth),
    y: y * (rect.height / canvasHeight),
  }, view);
  return { x: rect.left + transformed.x, y: rect.top + transformed.y };
}

/** Compute a new pan that keeps a viewport-local CSS point stationary. */
export function zoomViewportAroundPoint(viewport, nextZoom, point) {
  const zoom = clampViewZoom(nextZoom);
  const anchored = inverseViewportTransform(point, viewport);
  return {
    zoom,
    panX: point.x - anchored.x * zoom,
    panY: point.y - anchored.y * zoom,
  };
}

/** CSS transform string used by the single transformed canvas stage. */
export function viewportTransformCss(viewport = DEFAULT_VIEWPORT) {
  const zoom = clampViewZoom(viewport.zoom);
  const panX = Number(viewport.panX) || 0;
  const panY = Number(viewport.panY) || 0;
  return `translate(${panX}px, ${panY}px) scale(${zoom})`;
}
