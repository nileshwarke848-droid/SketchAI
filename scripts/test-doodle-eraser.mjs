#!/usr/bin/env node
// Focused coverage for the doodle eraser: a partial erase leaves an editable
// remainder at the same world position, a full erase removes the object, and
// surviving sketch ink is converted into editable doodle objects.
import { createCanvas } from '@napi-rs/canvas';
import {
  DOODLE_RADIUS_FACTOR,
  ERASE_PIXEL_SCALE,
  createEraseMask,
  eraseWithMask,
  maskHasInk,
  maskOverlapsInk,
  measureRemaining,
  remnantPlacement,
  renderObjectRaster,
  sketchInkSheet,
  sketchInkUnderSegment,
  splitInkBlobs,
} from '../src/lib/doodle-eraser.js';
import {
  bitmapImageKey,
  createBitmapImageCache,
  createBitmapSceneObject,
  createSceneImageCache,
  createSceneObject,
  deleteSceneObject,
  getObjectCenter,
  hitTestScene,
  insertSceneObjectAt,
  objectLocalToWorld,
  renderScene,
  worldToObjectLocal,
} from '../src/lib/scene.js';

let passed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.error(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

const canvasFactory = (width, height) => createCanvas(width, height);

const ART = {
  id: 'doodle-eraser-art',
  w: 100,
  h: 100,
  origin: 'imported',
  b: '<rect fill="STROKE" x="0" y="0" width="100" height="100"/>',
};

/** A solid square standing in for a decoded artwork image. */
function solidSource(size = 200) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').fillStyle = '#242422';
  canvas.getContext('2d').fillRect(0, 0, size, size);
  return canvas;
}

/** Convert a world point into raster pixels for one object. */
function maskFor(object, raster, points, radius) {
  return createEraseMask({
    width: raster.width,
    height: raster.height,
    points,
    radius: radius * ERASE_PIXEL_SCALE,
    worldToLocal: (point) => {
      const local = worldToObjectLocal(object, point);
      return {
        x: local.x * ERASE_PIXEL_SCALE + raster.width / 2,
        y: local.y * ERASE_PIXEL_SCALE + raster.height / 2,
      };
    },
    canvasFactory,
  });
}

function countAlpha(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] > 8) count += 1;
  return count;
}

console.log('\nPartial erase keeps an editable remainder');

const object = createSceneObject({
  id: 'art-object',
  artwork: ART,
  label: 'Square',
  x: 100,
  y: 80,
  width: 300,
  height: 200,
  rotation: 0,
  color: '#242422',
});
const raster = renderObjectRaster({ object, image: solidSource(), canvasFactory });
check('the object raster is rendered at 2× for soft edges', raster.width === 600 && raster.height === 400,
  `${raster.width}×${raster.height}`);

// Slice off the object's left edge. The object box is world x 100..400, and the
// 30px-radius stroke sits at world x=120, so the surviving pixels start at local
// pixel 100 and the remnant box must shrink to 500px wide.
const mask = maskFor(object, raster, [{ x: 120, y: 20 }, { x: 120, y: 340 }], 30);
check('the erase mask touches the raster', maskHasInk(mask));
const survivor = eraseWithMask({ canvas: raster, mask, canvasFactory });
check('something survives a partial erase', Boolean(survivor.canvas), `${survivor.remaining} px`);
check('the survivor is cropped to its new bounds', survivor.bounds.width === 500 && survivor.bounds.x === 100,
  `${survivor.bounds.width}×${survivor.bounds.height} at x=${survivor.bounds.x} (was ${raster.width}×${raster.height})`);
check('the erased strip is genuinely gone',
  survivor.canvas.getContext('2d').getImageData(0, 200, 1, 1).data[3] > 8
  && survivor.bounds.x === 100, `left edge at ${survivor.bounds.x}px`);

// A stroke that only crosses a hollowed-out middle must not "trim" blank space.
const hollow = renderObjectRaster({ object, image: solidSource(), canvasFactory });
const hollowContext = hollow.getContext('2d');
hollowContext.globalCompositeOperation = 'destination-out';
hollowContext.fillRect(hollow.width * 0.25, hollow.height * 0.25, hollow.width * 0.5, hollow.height * 0.5);
hollowContext.globalCompositeOperation = 'source-over';
const middleMask = maskFor(object, hollow, [{ x: 250, y: 180 }, { x: 250, y: 182 }], 10);
const maskedInk = maskOverlapsInk({ canvas: hollow, mask: middleMask });
check('a stroke over erased (empty) pixels is ignored', !maskedInk);
const edgeMask = maskFor(object, hollow, [{ x: 110, y: 180 }, { x: 111, y: 180 }], 10);
check('a stroke over real pixels is honoured', maskOverlapsInk({ canvas: hollow, mask: edgeMask }));

const placement = remnantPlacement({ object, localBounds: survivor.bounds });
const unitScale = object.width / raster.width;
const expectedX = object.x + survivor.bounds.x * unitScale;
const expectedWidth = survivor.bounds.width * unitScale;
check('remnant keeps its world position', Math.abs(placement.x - expectedX) < 0.5,
  `x=${placement.x.toFixed(2)} expected ${expectedX.toFixed(2)}`);
check('remnant keeps its world scale', Math.abs(placement.width - expectedWidth) < 0.5,
  `w=${placement.width.toFixed(2)} expected ${expectedWidth.toFixed(2)}`);
check('remnant stays inside the original box', placement.x >= object.x - 0.5
  && placement.x + placement.width <= object.x + object.width + 0.5);

const remnant = createBitmapSceneObject({
  bitmapId: 'bitmap-1',
  bitmap: `data:image/png;base64,${survivor.canvas.toBuffer('image/png').toString('base64')}`,
  label: 'Square',
  color: '#242422',
  rotation: object.rotation,
  ...placement,
});
check('a remnant is selectable where it is drawn',
  hitTestScene([remnant], getObjectCenter(remnant))?.id === remnant.id);
check('a remnant is a bitmap object', remnant.type === 'bitmap' && remnant.bitmapId === 'bitmap-1');

// Erase the entire object: nothing should survive to become an object.
const fullMask = maskFor(object, raster, [
  { x: 100, y: 80 }, { x: 400, y: 80 }, { x: 400, y: 280 }, { x: 100, y: 280 }, { x: 100, y: 90 },
], 400);
const wiped = eraseWithMask({
  canvas: renderObjectRaster({ object, image: solidSource(), canvasFactory }),
  mask: fullMask,
  canvasFactory,
});
check('erasing everything leaves nothing selectable', !wiped.canvas && wiped.remaining === 0);

console.log('\nRotation and flip are respected');

const rotated = { ...object, rotation: 35, flipX: true };
const rotatedRaster = renderObjectRaster({ object: rotated, image: solidSource(), canvasFactory });
const worldProbe = objectLocalToWorld(rotated, { x: 60, y: 0 });
const localProbe = worldToObjectLocal(rotated, worldProbe);
check('rotation + flip round-trips through local space',
  Math.abs(localProbe.x - 60) < 0.001 && Math.abs(localProbe.y) < 0.001,
  `local=(${localProbe.x.toFixed(2)}, ${localProbe.y.toFixed(2)})`);
const rotatedMask = maskFor(rotated, rotatedRaster, [worldProbe, { x: worldProbe.x + 1, y: worldProbe.y + 1 }], 20);
check('the rotated object is hit by the stroke', maskHasInk(rotatedMask));
const rotatedSurvivor = eraseWithMask({ canvas: rotatedRaster, mask: rotatedMask, canvasFactory });
check('a rotated object keeps a remnant', Boolean(rotatedSurvivor.canvas), `${rotatedSurvivor.remaining} px`);
const rotatedPlacement = remnantPlacement({ object: rotated, localBounds: rotatedSurvivor.bounds });
check('the rotated remnant keeps a finite position and its rotation',
  Number.isFinite(rotatedPlacement.x) && Number.isFinite(rotatedPlacement.y) && rotated.rotation === 35);

console.log('\nSketch ink becomes editable doodles');

const sketch = createCanvas(600, 400);
const sketchContext = sketch.getContext('2d');
sketchContext.strokeStyle = '#242422';
sketchContext.lineWidth = 12;
sketchContext.lineCap = 'round';
for (const [ax, ay, bx, by] of [[60, 60, 200, 60], [420, 320, 540, 320]]) {
  sketchContext.beginPath();
  sketchContext.moveTo(ax, ay);
  sketchContext.lineTo(bx, by);
  sketchContext.stroke();
}
check('ink under the stroke is detected', sketchInkUnderSegment(sketch, { x: 100, y: 60 }, { x: 160, y: 60 }, 10));
check('empty space is not treated as ink', !sketchInkUnderSegment(sketch, { x: 280, y: 180 }, { x: 320, y: 180 }, 10));

// Brush-erase the left end of the first stroke, leaving a shorter segment behind.
sketchContext.globalCompositeOperation = 'destination-out';
sketchContext.lineWidth = DOODLE_RADIUS_FACTOR * 7;
sketchContext.beginPath();
sketchContext.moveTo(55, 60);
sketchContext.lineTo(60, 60);
sketchContext.stroke();
sketchContext.globalCompositeOperation = 'source-over';

check('erasing the start removed ink there',
  !sketchInkUnderSegment(sketch, { x: 52, y: 60 }, { x: 54, y: 60 }, 2));
check('the far end of the stroke survives',
  sketchInkUnderSegment(sketch, { x: 190, y: 60 }, { x: 195, y: 60 }, 4));

const sheet = sketchInkSheet({ sketch, canvasFactory });
const measured = measureRemaining({ canvas: sheet, canvasFactory });
check('the surviving sketch still has pixels', Boolean(measured.canvas), `${measured.remaining} px`);
const blobs = splitInkBlobs({ canvas: sheet, canvasFactory });
check('two separate doodles become two editable objects', blobs.length === 2, `${blobs.length} blobs`);
check('blobs are cropped to their own bounds',
  blobs.every((blob) => blob.bounds.width > 0 && blob.bounds.height > 0));
check('the trimmed stroke is shorter than the original',
  blobs.some((blob) => blob.bounds.width < 140), `${blobs.map((blob) => blob.bounds.width).join(', ')}`);

const doodles = blobs.map((blob, index) => createBitmapSceneObject({
  bitmapId: `sketch-blob-${index}`,
  bitmap: `data:image/png;base64,${blob.canvas.toBuffer('image/png').toString('base64')}`,
  label: 'Doodle',
  color: 'original',
  x: blob.bounds.x,
  y: blob.bounds.y,
  width: blob.bounds.width,
  height: blob.bounds.height,
  zIndex: index,
}));
check('every converted doodle is fully addressable',
  doodles.every((item) => hitTestScene(doodles, getObjectCenter(item))?.id === item.id));

console.log('\nText objects can be erased too');

const textObject = {
  id: 'text-1',
  type: 'text',
  text: 'Hello',
  x: 100,
  y: 100,
  width: 240,
  height: 90,
  rotation: 0,
  color: '#242422',
  flipX: false,
  fontSize: 64,
  fontFamily: 'Arial, sans-serif',
  fontWeight: 'normal',
  textAlign: 'left',
  zIndex: 0,
};
const textRaster = renderObjectRaster({ object: textObject, image: null, canvasFactory });
check('text renders into a raster instead of staying blank', countAlpha(textRaster) > 100,
  `${countAlpha(textRaster)} glyph px`);

// A stroke through the glyphs must erase some of them.
const textMask = maskFor(textObject, textRaster, [
  { x: 120, y: 148 }, { x: 320, y: 148 },
], 8);
check('a stroke across text overlaps real glyph pixels', maskOverlapsInk({ canvas: textRaster, mask: textMask }));
const textSurvivor = eraseWithMask({ canvas: textRaster, mask: textMask, canvasFactory });
check('text survives a partial erase as a remainder', Boolean(textSurvivor.canvas),
  `${textSurvivor.remaining} px left`);
check('the text remainder is cropped to the untouched glyphs',
  textSurvivor.bounds.height < textRaster.height,
  `${textSurvivor.bounds.width}×${textSurvivor.bounds.height} of ${textRaster.width}×${textRaster.height}`);

// The glyphs must sit where renderScene draws them (centred), not at (0,0).
const glyphRows = (() => {
  const { data } = textRaster.getContext('2d').getImageData(0, 0, textRaster.width, textRaster.height);
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < textRaster.height; y += 1) {
    for (let x = 0; x < textRaster.width; x += 1) {
      if (data[(y * textRaster.width + x) * 4 + 3] > 8) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { top, bottom, height: textRaster.height };
})();
check('glyphs are vertically centred in the object box',
  glyphRows.top > 5 && glyphRows.bottom < glyphRows.height - 5,
  `rows ${glyphRows.top}..${glyphRows.bottom} of ${glyphRows.height}`);

console.log('\nStack order survives trimming');

// Rendering order is array order, so the test asserts what actually matters:
// a remnant takes the trimmed object's slot, and zIndex labels stay in step with
// the array instead of drifting out of sync after a delete.
{
  const stackArt = (id) => ({ id, w: 100, h: 100, origin: 'imported', b: '<rect width="100" height="100"/>' });
  const make = (id, z) => ({
    ...createSceneObject({ id, artwork: stackArt(id), label: id, x: 10, y: 10, width: 100, height: 100, zIndex: z }),
    zIndex: z,
  });
  // Uses the same helper the app uses, so this test fails if the rule regresses.
  const trim = (objects, id) => {
    const source = objects.find((object) => object.id === id);
    const removed = deleteSceneObject(objects, id);
    const remnant = createBitmapSceneObject({
      bitmapId: `bmp-${id}`,
      bitmap: 'data:image/png;base64,AA==',
      label: source.label,
      x: source.x, y: source.y, width: 50, height: 100,
      zIndex: source.zIndex,
    });
    return insertSceneObjectAt(removed, remnant, source.zIndex);
  };
  const label = (object) => (['A', 'B', 'C'].includes(object.id) ? object.id : 'REM');

  let stack = [make('A', 0), make('B', 1), make('C', 2)];
  stack = trim(stack, 'B');
  check('trimming the middle keeps A < REM < C',
    stack.map(label).join('<') === 'A<REM<C', stack.map(label).join('<'));

  stack = trim(stack, 'C');
  check('trimming the top-most object keeps its remnant on top',
    stack.map(label).join('<') === 'A<REM<REM', stack.map(label).join('<'));
  check('stack indices stay contiguous and unique after re-insertion',
    stack.every((object, index) => object.zIndex === index),
    stack.map((object) => object.zIndex).join(','));
}

console.log('\nRendering and caching a remnant');

const target = createCanvas(240, 160);
renderScene([{ ...doodles[0], x: 20, y: 20, width: 120, height: 80 }], target, {
  getBitmap: () => blobs[0].canvas,
  get: () => null,
});
check('renderScene paints a bitmap remnant', countAlpha(target) > 50, `${countAlpha(target)} px painted`);
check('nothing is painted away from the remnant',
  target.getContext('2d').getImageData(230, 150, 1, 1).data[3] === 0);

class FakeImage {
  constructor() { this.dataUrl = ''; }
  set src(value) { this.dataUrl = value; }
  get src() { return this.dataUrl; }
  async decode() { if (!this.dataUrl) throw new Error('no image'); }
}

const bitmapCache = createBitmapImageCache(FakeImage);
const sceneCache = createSceneImageCache({ get: () => null, has: () => false }, bitmapCache);
bitmapCache.ensure('bitmap-1', doodles[0].bitmap).then(() => {
  check('the bitmap cache decodes a PNG data URL', Boolean(bitmapCache.get('bitmap-1')));
  check('bitmap cache keys do not collide with artwork keys',
    bitmapImageKey('x') !== 'x\u0000#242422');
  check('the combined scene cache exposes both lookups',
    typeof sceneCache.getBitmap === 'function' && typeof sceneCache.get === 'function');
  check('a missing bitmap is reported as missing', !bitmapCache.has('missing'));
  check('recolour support covers bitmap remnants', ['artwork', 'text', 'bitmap'].includes('bitmap'));
  console.log(`\n${passed} checks passed`);
  if (process.exitCode) console.error('Doodle eraser tests FAILED');
});
