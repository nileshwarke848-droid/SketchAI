/**
 * Map CSS viewport coordinates into a canvas's logical pixel coordinate space.
 *
 * `viewport` is the borderless, padding-free rectangle shared by the permanent
 * canvas, sketch overlay and selection SVG. CSS resizing is handled here; DPR
 * must not be applied because pointer coordinates and DOMRects are CSS pixels.
 */
export function clientToCanvasPoint(clientX, clientY, viewport, canvasWidth, canvasHeight) {
  const rect = viewport.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return {
    x: (clientX - rect.left) * (canvasWidth / rect.width),
    y: (clientY - rect.top) * (canvasHeight / rect.height),
  };
}
