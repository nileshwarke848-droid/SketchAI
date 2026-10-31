#!/usr/bin/env node
// Batch-1 visual review sheet — canonical categories 1 through 100 only.
//
//   node scripts/render-batch1-contact-sheet.mjs [output.png]
//
// Every row shows the artwork exactly as the current preview/insert path uses it:
// primary, variant 2, variant 3, and a separate original SketchAI line drawing
// when one exists. Blank slots are explicitly labelled rather than filled with
// a nearby icon. If a category has no clean drawing, the primary tile is marked
// FALLBACK and displays text only; emoji are never smuggled into the review.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { IMPORTED_ART } from '../src/data/imported-art.js';
import { IMPORTED_ART_VARIANTS } from '../src/data/imported-art-variants.js';
import { BATCH1_DERIVED_ART } from '../src/data/batch1-derived-art.js';
import { BATCH1_LABELS, reviewBatch1Category, summarizeBatch1 } from './batch1-artwork-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ?? path.join(ROOT, 'docs/artwork-review/batch-1-contact-sheet.png');
const INK = '#1a1a18';
const LABEL_W = 176;
const CELL = 148;
const PAD = 9;
const HEADER_H = 56;
const ROW_GAP = 8;
const ROW_H = CELL + 24;
const TILE_SIZE = CELL - 20;
const COUNT = 100;
const CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const labels = BATCH1_LABELS;

const COLORS = {
  primary: { border: '#516c4f', bg: '#f4f8f2', tag: '#416242', label: 'PRIMARY' },
  variant: { border: '#7c9b71', bg: '#f8fbf6', tag: '#557d49', label: 'VARIANT' },
  lineart: { border: '#74839a', bg: '#f5f7fb', tag: '#53677f', label: 'SKETCHAI LINE ART' },
  fallback: { border: '#c88989', bg: '#fdf5f5', tag: '#a55050', label: 'FALLBACK' },
  missing: { border: '#d9ddd5', bg: '#fafbf9', tag: '#9aa094', label: 'NO DISTINCT OPTION' },
  reviewOnly: { border: '#cbbd9d', bg: '#fbf8f0', tag: '#8d7546', label: 'NOT COUNTED' },
};

function sourceName(variant) {
  if (!variant) return '';
  if (variant.origin === 'derived') return 'SketchAI-derived';
  if (variant.source && variant.sourceKey) return `${variant.source}/${variant.sourceKey}`;
  if (variant.origin === 'imported') {
    const labels = {
      tabler: 'Tabler', lucide: 'Lucide', iconoir: 'Iconoir', mdi: 'MDI',
      gameicons: 'Game Icons', fontawesome: 'Font Awesome',
    };
    // Primary source metadata is kept in the generated credit files. Find the
    // matching category without loading upstream source trees.
    for (const [id, source] of Object.entries(CREDITS)) {
      const c = source.categories.find((x) => x.label === variant.id?.replace(/-imported$/, ''));
      if (c) return `${labels[id] ?? id}/${c.icon}`;
    }
    return 'open-source SVG';
  }
  if (variant.origin === 'imported-variant' && !variant.sourceKey) {
    const label = variant.id?.replace(/-imported-secondary$/, '');
    for (const [id, source] of Object.entries(CREDITS)) {
      const c = source.categories.find((x) => x.label === label);
      if (c) return `${id}/${c.icon} · retained`;
    }
  }
  if (variant.origin === 'lineart') return 'SketchAI original';
  if (variant.origin === 'variant') return 'SketchAI original';
  return variant.origin ?? '';
}

function tile(variant, kind, title) {
  if (!variant) return { variant: null, kind: kind ?? 'missing', title: title ?? COLORS[kind ?? 'missing'].label, sub: '' };
  return { variant, kind, title, sub: sourceName(variant) };
}

function rowFor(label) {
  const review = reviewBatch1Category(label);
  const primary = review.primary;
  // Mirror the app's default four-card pool. Distinct options are green;
  // retained near-duplicates/weak variants are still shown, but clearly marked
  // NOT COUNTED so the sheet documents what the UI can currently offer.
  const visible = getArtworkVariants(label);
  const counted = new Set(review.options.map((variant) => variant.id));
  const visibleAlternates = visible.filter((variant) =>
    variant.id !== primary?.id && variant.origin !== 'lineart' && variant.origin !== 'icon');
  const altTiles = visibleAlternates.slice(0, 2).map((variant, index) => {
    const isCounted = counted.has(variant.id);
    return tile(
      variant,
      isCounted ? 'variant' : 'reviewOnly',
      isCounted ? `VARIANT ${index + 2}` : `VARIANT ${index + 2} · NOT COUNTED`,
    );
  });
  const lineTile = review.lineArt
    ? tile(review.lineArt, 'lineart', COLORS.lineart.label)
    : review.lineArtCandidate
      ? tile(review.lineArtCandidate, 'reviewOnly', 'SKETCHAI LINE ART · NOT COUNTED')
      : null;
  const notes = [];
  if (BATCH1_DERIVED_ART[label]) notes.push('derived only where source gap');
  if (review.duplicates.length) notes.push(`${review.duplicates.length} option(s) excluded from count`);

  return {
    label,
    note: notes.join(' · '),
    tiles: [
      primary ? tile(primary, 'primary', COLORS.primary.label) : tile(null, 'fallback', 'FALLBACK · text only'),
      altTiles[0] ?? tile(null, 'missing', 'NO DISTINCT VARIANT 2'),
      altTiles[1] ?? tile(null, 'missing', 'NO DISTINCT VARIANT 3'),
      lineTile ?? tile(null, 'missing', 'NO SEPARATE SKETCHAI LINE ART'),
    ],
  };
}

function drawSvg(ctx, svg, x, y, size) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const off = createCanvas(rendered.width, rendered.height);
  off.getContext('2d').putImageData(
    new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height), 0, 0,
  );
  ctx.drawImage(off, x, y);
}

function drawMissing(ctx, x, y, text) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, CELL, CELL);
  ctx.clip(); // Hatch only this placeholder; never paint across adjacent artwork.
  ctx.strokeStyle = '#e5e8e1';
  ctx.lineWidth = 1;
  for (let d = -CELL; d < CELL * 2; d += 10) {
    ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + CELL, y + CELL); ctx.stroke();
  }
  ctx.fillStyle = '#858b80';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + CELL / 2, y + CELL / 2, CELL - 8);
  ctx.restore();
}

if (labels.length !== COUNT) throw new Error(`Expected ${COUNT} canonical Batch-1 labels, found ${labels.length}`);
const rows = labels.map(rowFor);
const width = LABEL_W + PAD * 2 + 4 * (CELL + PAD);
let rasterErrors = 0;

function renderSheet(sheetRows, startIndex, outputPath, rangeLabel) {
  const height = HEADER_H + sheetRows.length * (ROW_H + ROW_GAP) + 12;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = INK;
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SketchAI · Artwork expansion · Batch 1', 14, 23);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#686e64';
  ctx.fillText(
    `Canonical categories ${rangeLabel} · primary, variants 2–3, and separate existing SketchAI line art`,
    14, 42,
  );

  sheetRows.forEach((row, localIndex) => {
    const y = HEADER_H + localIndex * (ROW_H + ROW_GAP);
    const categoryIndex = startIndex + localIndex;
    ctx.fillStyle = INK;
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${String(categoryIndex + 1).padStart(3, '0')}. ${row.label}`, 12, y + CELL / 2 - 2, LABEL_W - 10);
    ctx.fillStyle = row.note ? '#99643e' : '#94998f';
    ctx.font = '9px sans-serif';
    ctx.fillText(row.note, 12, y + CELL / 2 + 12, LABEL_W - 10);

    row.tiles.forEach((item, j) => {
      const x = LABEL_W + PAD + j * (CELL + PAD);
      const style = COLORS[item.kind];
      ctx.fillStyle = style.bg;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);

      if (item.variant) {
        const svg = variantToSvgString(item.variant, { size: TILE_SIZE, color: INK });
        try { drawSvg(ctx, svg, x + 10, y + 9, TILE_SIZE); }
        catch (error) {
          rasterErrors++;
          ctx.fillStyle = '#b00020'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('BROKEN SVG', x + CELL / 2, y + CELL / 2);
          console.error(`${row.label} ${item.title}: ${error.message}`);
        }
      } else {
        drawMissing(ctx, x, y, item.title.startsWith('FALLBACK') ? 'FALLBACK · TEXT ONLY' : 'not available');
      }

      ctx.fillStyle = style.tag;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.title, x + CELL / 2, y + CELL + 10, CELL - 2);
      ctx.fillStyle = '#777d73';
      ctx.font = '8px sans-serif';
      ctx.fillText(item.sub ?? '', x + CELL / 2, y + CELL + 20, CELL - 4);
    });
  });

  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`${path.relative(ROOT, outputPath)}  ${width}×${height}  ${sheetRows.length} categories`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
renderSheet(rows, 0, OUT, '1–100');

// The overview is useful for one-glance coverage, but too tall for a careful
// visual review. Write ten numbered, full-resolution pages (ten categories each).
const PAGE_SIZE = 10;
const stem = OUT.replace(/\.png$/i, '');
for (let start = 0, page = 1; start < rows.length; start += PAGE_SIZE, page++) {
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  const end = start + pageRows.length;
  const pagePath = `${stem}-${String(page).padStart(2, '0')}.png`;
  renderSheet(pageRows, start, pagePath, `${start + 1}–${end} of 100`);
}

if (rasterErrors) throw new Error(`${rasterErrors} SVG(s) failed to rasterise.`);
const noClean = rows.filter((r) => r.tiles[0].kind === 'fallback').map((r) => r.label);
const { counts } = summarizeBatch1();
console.log(`clean primary: ${COUNT - noClean.length}/${COUNT}; no acceptable clean artwork: ${noClean.length}${noClean.length ? ` (${noClean.join(', ')})` : ''}`);
console.log(`distinct pool: 3+:${counts.threePlus}  exactly 2:${counts.exactlyTwo}  exactly 1:${counts.exactlyOne}  none:${counts.zero}`);
console.log(`generated pool: ${Object.keys(IMPORTED_ART).length} imported primaries, ${Object.values(IMPORTED_ART_VARIANTS).flat().length} sourced variants, ${Object.keys(BATCH1_DERIVED_ART).length} derived drawings`);
