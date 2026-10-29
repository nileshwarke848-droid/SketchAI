import * as tf from '@tensorflow/tfjs';

// The original model was trained on 28×28 Quick, Draw! bitmaps: white ink on black,
// with values divided by 255. The transparent sketch layer lets any brush color
// be interpreted as ink, without including previously inserted illustrations.
export async function loadModel() {
  const base = import.meta.env.BASE_URL;
  const [model, response] = await Promise.all([
    tf.loadLayersModel(`${base}model/model.json`),
    fetch(`${base}model/classes.txt`),
  ]);
  if (!response.ok) throw new Error('Labels could not be loaded');
  const labels = (await response.text()).trim().split(/\r?\n/);
  return { model, labels };
}

export function getInkBounds(canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] > 10) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function predict(model, labels, sketch) {
  const bounds = getInkBounds(sketch);
  if (!bounds) return [];
  // Fit the bounding box into a centered square with a small margin, preserving
  // aspect ratio. Alpha, not brightness, means colorful strokes work too.
  const side = Math.max(bounds.width, bounds.height) * 1.12;
  const temp = document.createElement('canvas'); temp.width = 28; temp.height = 28;
  const ctx = temp.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sketch, bounds.x - (side - bounds.width) / 2, bounds.y - (side - bounds.height) / 2, side, side, 0, 0, 28, 28);
  const rgba = ctx.getImageData(0, 0, 28, 28).data;
  const ink = new Float32Array(28 * 28);
  for (let i = 0; i < ink.length; i++) ink[i] = rgba[i * 4 + 3] / 255;
  const scores = tf.tidy(() => Array.from(model.predict(tf.tensor4d(ink, [1, 28, 28, 1])).dataSync()));
  return scores.map((score, index) => ({ label: labels[index].replaceAll('_', ' '), score })).sort((a, b) => b.score - a.score).slice(0, 3);
}
