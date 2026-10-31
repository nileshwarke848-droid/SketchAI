/**
 * Placement and commitment for a temporary sketch's accepted clean artwork.
 * The rough sketch is an overlay only; it is never an erase mask for art.
 */
export function getArtworkReplacementPlacement(bounds, canvasWidth, canvasHeight, {
  minDimension = 140,
  maxDimension = 320,
  padding = 8,
} = {}) {
  if (!bounds?.width || !bounds?.height) return null;
  const dimension = Math.min(maxDimension, Math.max(minDimension, Math.max(bounds.width, bounds.height)));
  const x = Math.max(padding, Math.min(canvasWidth - dimension - padding,
    bounds.x + bounds.width / 2 - dimension / 2));
  const y = Math.max(padding, Math.min(canvasHeight - dimension - padding,
    bounds.y + bounds.height / 2 - dimension / 2));
  return { x, y, dimension };
}

/**
 * Replace the current temporary sketch with clean artwork on the permanent
 * layer. Existing art is composited normally and is never destination-out'd.
 */
export function commitSketchReplacement({ permanentCanvas, sketchCanvas, image, bounds }) {
  const placement = getArtworkReplacementPlacement(
    bounds,
    permanentCanvas.width,
    permanentCanvas.height,
  );
  if (!placement) return null;

  sketchCanvas.getContext('2d').clearRect(0, 0, sketchCanvas.width, sketchCanvas.height);

  const ctx = permanentCanvas.getContext('2d');
  ctx.save();
  try {
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(image, placement.x, placement.y, placement.dimension, placement.dimension);
  } finally {
    ctx.restore();
  }
  return placement;
}
