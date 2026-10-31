#!/usr/bin/env node
// Renders a multi-tile artwork review sheet from a rows JSON.
//
//   node scripts/render-artwork-review.mjs --input=/tmp/rows.json --out=/tmp/sheet.png
//
// Each row is one category: the name, then its current artwork followed by the
// new options being proposed, so a reviewer can judge "is this genuinely a
// different drawing of the same object?" against what the app shows today.
//
// rows.json = [{ label, note?, tiles: [{ title, sub?, svg, warn?, kind }] }]
//   kind: 'current' | 'proposed' | 'fallback' | 'derived'
//
// Tiles are rasterised through @resvg/resvg-js at exactly the size a suggestion
// card uses, so what is judged here is what a user sees. Emoji fallbacks are
// drawn with a hatched background and never mixed in silently: a tile with no
// real drawing is labelled FALLBACK so it cannot pass for finished artwork.
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const INK = '#1a1a18';
const CELL = Number(args.cell ?? 116);
const PER_SHEET = Number(args.per ?? 25);
const LABEL_W = Number(args.labelW ?? 132);
const PAD = 10;

const rows = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const TILE = CELL - 20;

function drawSvg(ctx, svg, x, y, size) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const off = createCanvas(rendered.width, rendered.height);
  off.getContext('2d').putImageData(
    new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height), 0, 0,
  );
  ctx.drawImage(off, x + (size === rendered.width ? 0 : 0), y, rendered.width, rendered.height);
}

const KIND_STYLE = {
  current: { border: '#c9ccc2', bg: '#ffffff', tag: 'now' },
  proposed: { border: '#7aa06f', bg: '#f6fbf4', tag: 'new' },
  derived: { border: '#8a76b8', bg: '#f8f5fd', tag: 'derived' },
  fallback: { border: '#d9b2b2', bg: '#fdf3f3', tag: 'FALLBACK' },
};

const sheets = Math.ceil(rows.length / PER_SHEET);
const base = path.extname(args.out) ? args.out.replace(/\.png$/, '') : args.out;

for (let sheet = 0; sheet < sheets; sheet++) {
  const slice = rows.slice(sheet * PER_SHEET, (sheet + 1) * PER_SHEET);
  const cols = Math.max(...rows.map((r) => r.tiles.length));
  const width = LABEL_W + cols * (CELL + PAD) + PAD * 2;
  const rowH = CELL + 26;
  const height = 46 + slice.length * rowH + 16;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = INK;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    args.title ?? 'Artwork review sheet',
    12, 26,
  );
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#8b8f86';
  ctx.textAlign = 'right';
  ctx.fillText(`sheet ${sheet + 1}/${sheets} · ${slice.length} categories`, width - 12, 26);

  slice.forEach((row, i) => {
    const y = 44 + i * rowH;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(row.label, 12, y + CELL / 2 - 2, LABEL_W - 14);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = row.needsReview ? '#b4562f' : '#9aa094';
    ctx.fillText(row.note ?? (row.needsReview ? 'check meaning' : ''), 12, y + CELL / 2 + 13, LABEL_W - 14);

    row.tiles.forEach((tile, j) => {
      const x = LABEL_W + j * (CELL + PAD);
      const style = KIND_STYLE[tile.kind] ?? KIND_STYLE.current;
      ctx.fillStyle = style.bg;
      ctx.fillRect(x, y, CELL, CELL);
      if (tile.kind === 'fallback') {
        ctx.save();
        ctx.strokeStyle = '#f0dede';
        ctx.lineWidth = 1;
        for (let d = -CELL; d < CELL * 2; d += 7) {
          ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + CELL, y + CELL); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.strokeStyle = style.border;
      ctx.lineWidth = tile.warn ? 2 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      if (tile.svg) drawSvg(ctx, tile.svg, x + 10, y + 10, TILE);
      ctx.fillStyle = '#6d7268';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${style.tag} · ${tile.title}`, x + CELL / 2, y + CELL + 12, CELL - 2);
      if (tile.warn) {
        ctx.fillStyle = '#b4562f';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('?', x + 4, y + 13);
      }
    });
  });

  const file = sheets === 1 ? `${base}.png` : `${base}-${String(sheet + 1).padStart(2, '0')}.png`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`${path.relative(process.cwd(), file)}  ${width}x${height}  ${slice.length} categories`);
}
