#!/usr/bin/env node
// Render the final, in-scope Batch-2/3 artwork review sheets and machine-readable
// review manifest. The sheets show counted options, human/raster exclusions,
// and any legacy fallback that remains visible in the default four-card pool.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData as NapiImageData } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { getArtworkVariants, variantToSvgString } from '../src/data/artwork.js';
import { labelsForBatch, reviewCategory, summarizeBatch } from './batch-artwork-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs/artwork-review');
const PRIMARY_CREDITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/oss-art-credits.json'), 'utf8'));
const INK = '#1a1a18';
const CELL = 126;
const LABEL_W = 165;
const PAD = 8;
const PAGE_SIZE = 10;
const HEADER_H = 49;
const ROW_H = CELL + 26;
const TILE_SIZE = CELL - 20;
const LIB_NAMES = {
  tabler: 'Tabler', lucide: 'Lucide', iconoir: 'Iconoir', mdi: 'MDI',
  gameicons: 'Game Icons', fontawesome: 'Font Awesome',
};
const COLORS = {
  primary: { border: '#516c4f', bg: '#f4f8f2', tag: '#416242' },
  variant: { border: '#7c9b71', bg: '#f8fbf6', tag: '#557d49' },
  lineart: { border: '#74839a', bg: '#f5f7fb', tag: '#53677f' },
  derived: { border: '#8a76b8', bg: '#f8f5fd', tag: '#71569f' },
  reviewOnly: { border: '#cbbd9d', bg: '#fbf8f0', tag: '#8d7546' },
  fallback: { border: '#c88989', bg: '#fdf5f5', tag: '#a55050' },
};

function sourceName(variant) {
  if (!variant) return '';
  if (variant.origin === 'derived') return 'SketchAI original';
  if (variant.source && variant.sourceKey) return `${LIB_NAMES[variant.source] ?? variant.source}/${variant.sourceKey}`;
  if (variant.origin === 'imported' || variant.origin === 'imported-variant') {
    const label = variant.id?.replace(/-imported(?:-secondary)?$/, '');
    for (const [lib, source] of Object.entries(PRIMARY_CREDITS)) {
      const item = source.categories.find((entry) => entry.label === label);
      if (item) return `${LIB_NAMES[lib] ?? lib}/${item.icon}`;
    }
    return 'pinned open-source SVG';
  }
  if (variant.origin === 'lineart' || variant.origin === 'variant') return 'SketchAI original';
  if (variant.origin === 'icon') return `${variant.source ?? 'legacy'} fallback`;
  return variant.origin ?? '';
}

function kindFor(variant, isPrimary = false) {
  if (variant.origin === 'derived') return 'derived';
  if (isPrimary) return 'primary';
  if (variant.origin === 'lineart') return 'lineart';
  return 'variant';
}

function detailsFor(variant) {
  return {
    id: variant.id,
    origin: variant.origin,
    source: sourceName(variant),
  };
}

function safeTitle(text, limit = 22) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function drawSvg(ctx, svg, x, y, size) {
  const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const off = createCanvas(rendered.width, rendered.height);
  off.getContext('2d').putImageData(
    new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height), 0, 0,
  );
  ctx.drawImage(off, x, y);
}

function drawPlaceholder(ctx, x, y, title) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 1, y + 1, CELL - 2, CELL - 2); ctx.clip();
  ctx.strokeStyle = '#e5e8e1'; ctx.lineWidth = 1;
  for (let d = -CELL; d < CELL * 2; d += 10) {
    ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + CELL, y + CELL); ctx.stroke();
  }
  ctx.fillStyle = '#858b80'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(title, x + CELL / 2, y + CELL / 2, CELL - 8);
  ctx.restore();
}

function makeRows(batch) {
  const labels = labelsForBatch(batch);
  return labels.map((label, offset) => {
    const review = reviewCategory(label, batch);
    const appPool = getArtworkVariants(label);
    const tiles = [];
    review.options.forEach((variant, index) => {
      const primary = index === 0;
      tiles.push({
        variant,
        kind: kindFor(variant, primary),
        title: primary ? (variant.origin === 'derived' ? 'DERIVED PRIMARY' : 'PRIMARY') : `COUNTED ${index + 1}`,
        sub: sourceName(variant),
      });
    });
    review.duplicates.forEach((entry) => {
      const reason = entry.reason ?? (entry.lineArt ? 'duplicate SketchAI line drawing' : 'raster near-duplicate');
      tiles.push({
        variant: entry.candidate,
        kind: 'reviewOnly',
        title: entry.manual && /clipp?ed|frame edge/i.test(reason) ? 'NOT COUNTED · CLIPPED' : 'NOT COUNTED · DUPLICATE',
        sub: sourceName(entry.candidate),
      });
    });

    // Only show fallback artwork that is actually present in the app's default
    // four-card pool. It remains visible but never inflates clean-art counts.
    const visibleFallbacks = appPool.filter((variant) => variant.origin === 'icon');
    visibleFallbacks.forEach((variant) => tiles.push({
      variant,
      kind: 'reviewOnly',
      title: 'APP FALLBACK · NOT COUNTED',
      sub: sourceName(variant),
    }));
    if (!review.options.length && !visibleFallbacks.length) {
      tiles.push({ variant: null, kind: 'fallback', title: 'FALLBACK · TEXT ONLY', sub: 'no clean drawing' });
    }

    const indexed = offset + (batch === 2 ? 101 : 201);
    return {
      index: indexed,
      label,
      note: `${review.options.length} counted · ${review.duplicates.length} excluded${visibleFallbacks.length ? ' · fallback kept' : ''}`,
      tiles,
      manifest: {
        index: indexed,
        label,
        counted: review.options.map(detailsFor),
        notCounted: review.duplicates.map((entry) => ({
          ...detailsFor(entry.candidate),
          reason: entry.reason ?? `raster near-duplicate of ${entry.comparedTo?.id ?? 'another option'}${Number.isFinite(entry.overlap) ? ` (${entry.overlap.toFixed(3)} overlap)` : ''}`,
          comparedTo: entry.comparedTo?.id ?? null,
          overlap: Number.isFinite(entry.overlap) ? Number(entry.overlap.toFixed(4)) : null,
        })),
        fallback: visibleFallbacks.map(detailsFor),
        fallbackState: visibleFallbacks.length ? 'legacy-artwork-preserved-not-counted' : review.options.length ? 'not-applicable' : 'text-only',
      },
      _review: review,
    };
  });
}

function renderPage(rows, page, pageCount, batch) {
  const maxTiles = Math.max(1, ...rows.map((row) => row.tiles.length));
  const width = LABEL_W + PAD * 2 + maxTiles * (CELL + PAD);
  const height = HEADER_H + rows.length * (ROW_H + 7) + 14;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = INK; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(`SketchAI · Artwork review · Batch ${batch}`, 12, 22);
  const first = rows[0]?.index ?? 0;
  const last = rows.at(-1)?.index ?? 0;
  ctx.fillStyle = '#686e64'; ctx.font = '10px sans-serif';
  ctx.fillText(`Canonical categories ${first}–${last} · counted art, exclusions, and preserved fallback states`, 12, 39);
  ctx.textAlign = 'right'; ctx.fillStyle = '#8b8f86';
  ctx.fillText(`page ${page}/${pageCount} · ${rows.length} categories`, width - 12, 22);

  let rasterErrors = 0;
  rows.forEach((row, rowIndex) => {
    const y = HEADER_H + rowIndex * (ROW_H + 7);
    ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${String(row.index).padStart(3, '0')}. ${row.label}`, 10, y + CELL / 2 - 4, LABEL_W - 12);
    ctx.fillStyle = '#858b80'; ctx.font = '8px sans-serif';
    ctx.fillText(row.note, 10, y + CELL / 2 + 11, LABEL_W - 12);
    row.tiles.forEach((tile, column) => {
      const x = LABEL_W + PAD + column * (CELL + PAD);
      const style = COLORS[tile.kind] ?? COLORS.reviewOnly;
      ctx.fillStyle = style.bg; ctx.fillRect(x, y, CELL, CELL);
      ctx.strokeStyle = style.border; ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, CELL - 1, CELL - 1);
      if (tile.variant) {
        try {
          const svg = variantToSvgString(tile.variant, { size: TILE_SIZE, color: INK });
          drawSvg(ctx, svg, x + 10, y + 9, TILE_SIZE);
        } catch (error) {
          rasterErrors++;
          ctx.fillStyle = '#b00020'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('BROKEN SVG', x + CELL / 2, y + CELL / 2);
          console.error(`${row.label}/${tile.variant.id}: ${error.message}`);
        }
      } else {
        drawPlaceholder(ctx, x, y, tile.title);
      }
      ctx.fillStyle = style.tag; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(safeTitle(tile.title, 28), x + CELL / 2, y + CELL + 9, CELL - 2);
      ctx.fillStyle = '#777d73'; ctx.font = '7px sans-serif';
      ctx.fillText(safeTitle(tile.sub ?? '', 32), x + CELL / 2, y + CELL + 19, CELL - 4);
    });
  });
  if (rasterErrors) throw new Error(`${rasterErrors} SVG(s) failed to rasterise in Batch ${batch}, page ${page}`);
  return canvas.toBuffer('image/png');
}

for (const batch of [2, 3]) {
  const rows = makeRows(batch);
  const summary = summarizeBatch(batch);
  const rangeStart = batch === 2 ? 101 : 201;
  const rangeEnd = batch === 2 ? 200 : 345;
  const pages = Math.ceil(rows.length / PAGE_SIZE);
  const distribution = {
    threePlus: summary.counts.threePlus,
    exactlyTwo: summary.counts.exactlyTwo,
    exactlyOne: summary.counts.exactlyOne,
    zero: summary.counts.zero,
  };
  const manifest = {
    batch,
    canonicalRange: [rangeStart, rangeEnd],
    totalCategories: rows.length,
    distinctOptions: rows.reduce((sum, row) => sum + row._review.options.length, 0),
    distribution,
    categoriesUnderThree: rows.filter((row) => row._review.options.length < 3).map((row) => ({
      index: row.index, label: row.label, count: row._review.options.length,
    })),
    pages,
    rows: rows.map(({ manifest: item }) => item),
  };
  const basename = `batch-${batch}-contact-sheet`;
  for (let page = 0; page < pages; page++) {
    const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const file = path.join(OUT_DIR, `${basename}-${String(page + 1).padStart(2, '0')}.png`);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(file, renderPage(slice, page + 1, pages, batch));
    console.log(`${path.relative(ROOT, file)}  ${slice[0].index}–${slice.at(-1).index}  ${slice.length} categories`);
  }
  const manifestPath = path.join(OUT_DIR, `batch-${batch}-review-manifest.json`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${path.relative(ROOT, manifestPath)}  ${manifest.distinctOptions} counted options · ${manifest.categoriesUnderThree.length} categories under three`);
}
