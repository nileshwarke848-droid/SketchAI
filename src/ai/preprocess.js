// Preprocessing for the SketchAI doodle classifier.
//
// Everything here is plain JavaScript with no TensorFlow.js dependency, so the
// pixel pipeline can be inspected and unit-tested on its own.
//
// The model is a 28x28 single-channel CNN trained on Google's Quick, Draw!
// bitmaps. Those bitmaps were produced by rasterising 256x256 vector doodles onto
// a 28x28 black surface with white ink, using `cairo` with:
//
//   line_width = 16 (in 256-space), padding = 16, antialias = best,
//   total_padding = 2 * 16 + 16 = 48
//   scale = 28 / (256 + 48) = 0.0921
//
// which makes the drawing's bounding box fill 255 * 0.0921 = 23.5 of the 28
// pixels (a margin of ~2.25px, i.e. ~16% of the frame) and gives strokes a
// ~1.5px width. Ink values are 0..255 and training divided them by 255.
//
// See https://github.com/googlecreativelab/quickdraw-dataset/issues/19#issuecomment-402247262
//
// Matching that geometry is what makes recognition work. In particular a browser
// pen stroke is usually much thinner than 1.5/28 of the drawing, so a naive
// downscale leaves pale, sub-pixel lines that the network has never seen. The
// `normaliseInkPeak` step repairs exactly that: it rescales intensities so the
// strongest ink is close to fully opaque again, without changing the geometry.

export const INPUT_SIZE = 28;

// 28 / 23.5 = 1.19: the drawing's bounding box is scaled to ~84% of the frame.
export const CROP_PADDING = 1.186;

// Pixel alpha above this counts as ink when looking for the drawing's bounds.
export const INK_ALPHA_THRESHOLD = 10;

// Below these amounts a sketch is treated as accidental: a tap with a 7px pen
// leaves ~50 ink pixels, a stray 20px line ~200, while even a small 40px doodle
// made with a 3px pen leaves ~500. Inference is skipped until there is enough.
export const MIN_INK_PIXELS = 240;
export const MIN_INK_SPAN = 16;

// Ink is rescaled so its 97th percentile reaches this opacity (see above).
export const TARGET_INK_PEAK = 0.9;
export const MIN_CONTRAST_GAMMA = 0.15;

const EMPTY = Object.freeze({ x: 0, y: 0, width: 0, height: 0, inkPixels: 0, inkMass: 0 });

/** Reads the alpha channel of a sketch canvas (alpha == "how much ink is here"). */
export function readSketchAlpha(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3];
  return { alpha, width, height };
}

/** Bounding box of every pixel that carries ink. */
export function findInkBounds(alpha, width, height, threshold = INK_ALPHA_THRESHOLD) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let inkPixels = 0;
  let inkMass = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const a = alpha[row + x];
      if (a > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        inkPixels += 1;
        inkMass += a / 255;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, inkPixels, inkMass };
}

/** Convenience helper used by the canvas code when it only needs the bounds. */
export function getSketchBounds(canvas) {
  const { alpha, width, height } = readSketchAlpha(canvas);
  return findInkBounds(alpha, width, height) ?? EMPTY;
}

/** Is there enough of a drawing to be worth a prediction? */
export function isMeaningfulSketch(bounds) {
  if (!bounds) return false;
  return bounds.inkPixels >= MIN_INK_PIXELS && Math.max(bounds.width, bounds.height) >= MIN_INK_SPAN;
}

/**
 * Centred square around the drawing. Padding keeps outer details (petals, rays,
 * wheels, antennae) inside the frame; aspect ratio is preserved because one
 * square is used for both axes.
 */
export function getCropSquare(bounds, padding = CROP_PADDING) {
  const side = Math.max(bounds.width, bounds.height) * padding;
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;
  return { x: centreX - side / 2, y: centreY - side / 2, side };
}

/**
 * Area-averages the crop into `size` x `size` cells of 0..1 ink intensity.
 * Area averaging (rather than nearest-neighbour sampling) is what keeps thin
 * strokes from disappearing, and it mirrors how the training bitmaps were
 * antialiased. Anything outside the canvas counts as no ink.
 */
export function rasterizeInk(alpha, width, height, square, size = INPUT_SIZE) {
  const ink = new Float32Array(size * size);
  const scale = square.side / size;
  const cellArea = scale * scale;
  for (let oy = 0; oy < size; oy += 1) {
    const top = square.y + oy * scale;
    const bottom = top + scale;
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(height, Math.ceil(bottom));
    for (let ox = 0; ox < size; ox += 1) {
      const left = square.x + ox * scale;
      const right = left + scale;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(width, Math.ceil(right));
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        const row = y * width;
        for (let x = x0; x < x1; x += 1) sum += alpha[row + x];
      }
      ink[oy * size + ox] = Math.min(1, sum / cellArea / 255);
    }
  }
  return ink;
}

/**
 * Rescales intensities so the 97th-percentile ink value reaches `target`.
 *
 * A drawing made with a browser pen ends up with strokes only ~0.5px wide on the
 * 28x28 grid, so their antialiased pixels peak around 0.3-0.6 instead of the
 * model's fully opaque 1.0. A gamma curve lifts that ink back into the range the
 * network was trained on. Geometry (and therefore petals, thin lines and rays)
 * is untouched; only brightness is remapped.
 */
export function normaliseInkPeak(ink, target = TARGET_INK_PEAK, minGamma = MIN_CONTRAST_GAMMA) {
  const sorted = Float32Array.from(ink).sort();
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(0.97 * (sorted.length - 1)))];
  if (!(peak > 0) || peak >= target) return { ink, gamma: 1, peak };
  const gamma = Math.min(1, Math.max(minGamma, Math.log(target) / Math.log(peak)));
  if (gamma >= 1) return { ink, gamma: 1, peak };
  const out = new Float32Array(ink.length);
  for (let i = 0; i < ink.length; i += 1) out[i] = Math.pow(ink[i], gamma);
  return { ink: out, gamma, peak };
}

/**
 * Full pipeline: canvas -> alpha -> bounding box -> centred crop -> 28x28
 * area-averaged ink -> contrast normalisation -> [1, 28, 28, 1] ready values.
 *
 * Returns `{ ok: false, reason }` for blank or tiny sketches so that inference is
 * never run on an empty canvas.
 */
export function preprocessSketch(
  canvas,
  { size = INPUT_SIZE, padding = CROP_PADDING, targetInkPeak = TARGET_INK_PEAK, minGamma = MIN_CONTRAST_GAMMA } = {},
) {
  const { alpha, width, height } = readSketchAlpha(canvas);
  const bounds = findInkBounds(alpha, width, height);
  if (!bounds) return { ok: false, reason: 'blank', size, canvasWidth: width, canvasHeight: height };
  if (!isMeaningfulSketch(bounds)) return { ok: false, reason: 'tiny', bounds, size };
  const square = getCropSquare(bounds, padding);
  const raw = rasterizeInk(alpha, width, height, square, size);
  const { ink, gamma, peak } = normaliseInkPeak(raw, targetInkPeak, minGamma);
  return {
    ok: true,
    size,
    ink,
    bounds,
    square,
    padding,
    targetInkPeak,
    diagnostics: {
      gamma,
      peak,
      inkPixels: bounds.inkPixels,
      coverage: ink.reduce((total, value) => total + value, 0) / ink.length,
    },
  };
}

// ---------------------------------------------------------------------------------------
// Model-specific preprocessing profiles
// ---------------------------------------------------------------------------------------
//
// SketchAI ships two classifiers and they were *not* trained the same way, so each
// one gets its own pixel profile instead of a shared guess:
//
//   100-class (fallback)  Trained by a third party; the profile below is the one the
//                         audit measured to work best for it (top-1 81% on its test
//                         doodles). It is frozen — do not "improve" it, because that
//                         would change the accuracy of the model that has to keep
//                         working when the big model is missing.
//
//   345-class (ours)      Trained here on Google's Quick, Draw! 28x28 numpy bitmaps:
//                         fully opaque white ink (255 -> 1.0 after dividing by 255),
//                         1.5 px pen, drawing bbox scaled to 84% of the frame. The
//                         geometry is identical to the profile above (both reproduce
//                         the Quick, Draw! renderer), but the *ink intensity* target is
//                         higher and the darkest gamma allowed is stricter, because
//                         our training pixels really are at full opacity. A browser
//                         pen is thinner, so its antialiased strokes would otherwise
//                         sit at ~0.3-0.5 where the model only ever saw ~1.0.

export const PREPROCESS_PROFILES = Object.freeze({
  '100': Object.freeze({
    id: '100',
    size: INPUT_SIZE,
    padding: CROP_PADDING,
    targetInkPeak: TARGET_INK_PEAK,
    minGamma: MIN_CONTRAST_GAMMA,
    source: 'third-party training pipeline, audit-tuned, frozen',
  }),
  '345': Object.freeze({
    id: '345',
    size: INPUT_SIZE,
    padding: CROP_PADDING,
    // Quick, Draw! bitmaps top out at 255/255 after normalisation.
    targetInkPeak: 1.0,
    // Never brighten so aggressively that noise becomes solid ink.
    minGamma: 0.25,
    source: 'Google Quick, Draw! 28x28 numpy bitmaps (this project\'s own training run)',
  }),
});

/** Preprocessing for the 100-class fallback model (unchanged legacy behaviour). */
export function preprocessFor100Model(canvas) {
  const profile = PREPROCESS_PROFILES['100'];
  return preprocessSketch(canvas, {
    size: profile.size,
    padding: profile.padding,
    targetInkPeak: profile.targetInkPeak,
    minGamma: profile.minGamma,
  });
}

/** Preprocessing for the 345-class model trained by this project. */
export function preprocessFor345Model(canvas) {
  const profile = PREPROCESS_PROFILES['345'];
  return preprocessSketch(canvas, {
    size: profile.size,
    padding: profile.padding,
    targetInkPeak: profile.targetInkPeak,
    minGamma: profile.minGamma,
  });
}

/** Dispatch by profile id, with the 100-class profile as the safe default. */
export function preprocessForModel(canvas, profileId = '100') {
  return profileId === '345' ? preprocessFor345Model(canvas) : preprocessFor100Model(canvas);
}
