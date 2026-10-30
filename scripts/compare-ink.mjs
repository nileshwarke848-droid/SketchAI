// Compares the visual weight of the imported artwork with the hand-authored
// line art it replaces, so the imported set is not accidentally much bolder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import { LINE_ART } from '../src/data/line-art.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = 96;

function inkPct(art, token) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${art.w} ${art.h}">`
    + `${art.b.replaceAll(token, '#000')}</svg>`;
  // `.pixels` is a getter that allocates; read it once.
  const { pixels, width: W, height: H } = new Resvg(svg, { fitTo: { mode: 'width', value: R } }).render();
  let n = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 24) n++;
  return (n / (W * H)) * 100;
}

const stat = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  const at = (q) => s[Math.floor((s.length - 1) * q)].toFixed(1);
  return `p10=${at(0.1)}  p50=${at(0.5)}  p90=${at(0.9)}`;
};

process.stdout.write('measuring existing line art...\n');
const oldV = Object.values(LINE_ART).map((a) => inkPct(a, 'STROKE'));
process.stdout.write('  done\n');
process.stdout.write('measuring imported art...\n');
const newV = Object.values(IMPORTED_ART).map((a) => inkPct(a, 'STROKE'));
process.stdout.write('  done\n');
console.log(`existing custom line art (n=${oldV.length})  ink%: ${stat(oldV)}`);
console.log(`new imported art         (n=${newV.length})  ink%: ${stat(newV)}`);

const cr = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const modes = {};
for (const c of Object.values(cr)) for (const e of c.categories) modes[e.label] = e.mode;
console.log('\nrendering mode for the tricky ones:');
for (const l of ['dresser', 'fireplace', 'passport', 'stove', 'hot tub',
  'dog', 'cat', 'zebra', 'elephant', 'horse', 'chair', 'drums']) {
  if (modes[l]) console.log(`  ${modes[l].padEnd(8)} ${l}`);
}
const counts = {};
for (const m of Object.values(modes)) counts[m] = (counts[m] ?? 0) + 1;
console.log(`\nmode totals: ${JSON.stringify(counts)}`);
