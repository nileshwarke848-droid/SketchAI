import { normalizeHexColor } from './color-utils.js';

/** Draw one segment in logical canvas pixels, independent of the current view zoom. */
export function drawCanvasStrokeSegment(context, from, to, color, size, { erase = false } = {}) {
  const normalizedColor = normalizeHexColor(color);
  if (!context || !from || !to || !normalizedColor || !Number.isFinite(size) || size <= 0) return false;

  context.save();
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  context.strokeStyle = normalizedColor;
  context.lineWidth = size;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x + 0.01, to.y + 0.01);
  context.stroke();
  context.restore();
  return true;
}
