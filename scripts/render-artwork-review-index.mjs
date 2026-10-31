#!/usr/bin/env node
// Generate docs/artwork-review/README.md from the audited manifests and pin set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_DIR = path.join(ROOT, 'docs/artwork-review');
const audit = JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, 'all-category-option-audit.json'), 'utf8'));
const manifests = Object.fromEntries([2, 3].map((batch) => [
  batch,
  JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, `batch-${batch}-review-manifest.json`), 'utf8')),
]));
const pageRows = (batch, pageCount, first) => Array.from({ length: pageCount }, (_, index) => {
  const start = first + index * 10;
  const end = Math.min(start + 9, batch === 2 ? 200 : 345);
  const file = `batch-${batch}-contact-sheet-${String(index + 1).padStart(2, '0')}.png`;
  return `| [${file}](${file}) | ${start}–${end} |`;
}).join('\n');
const sourceRows = audit.pinnedSources.map((source) => {
  const count = audit.primaryCredits[source.id]?.categories?.length ?? 0;
  return `| ${source.name} ${source.version} | ${source.license} | ${count} |`;
}).join('\n');
const derived = audit.customDerivedDrawings.map((entry) => `${entry.label} (Batch ${entry.batch})`).join(', ');
const underThreeGroups = [0, 1, 2].map((count) => {
  const items = audit.categoriesUnderThree.filter((entry) => entry.count === count);
  const content = items.map((entry) => `${String(entry.index).padStart(3, '0')} ${entry.label}`).join('; ');
  return `<details>\n<summary>${count} options — ${items.length} categories</summary>\n\n${content}\n\n</details>`;
}).join('\n\n');
const b1 = audit.batchSummaries[1];
const b2 = audit.batchSummaries[2];
const b3 = audit.batchSummaries[3];
const totalPrimary = b1.cleanPrimaryCoverage + b2.cleanPrimaryCoverage + b3.cleanPrimaryCoverage;
const totalSourceVariants = b1.approvedSourceVariants + b2.approvedSourceVariants + b3.approvedSourceVariants;
const totalVariantLabels = b1.variantLabels + b2.variantLabels + b3.variantLabels;
const totalDerived = audit.customDerivedDrawings.length;
const totalManualExclusions = audit.manualExclusionRules;
const text = `# Artwork review index — all 345 canonical categories

This index covers every Quick, Draw! canonical label in the model's official order. Batch 1 remains in its original review scope; Batch 2 is **101–200** and Batch 3 is **201–345**. The numbered sheets show the actual artwork pools, approved counted options, excluded near-duplicates/clipped drawings, and preserved app fallbacks.

## Contact sheets

Each PNG page contains ten categories (the final Batch-3 page contains five). Batch-1 overview and page artifacts are preserved unchanged.

### Batch 1 — canonical 1–100 (preserved)

- [100-category overview](batch-1-contact-sheet.png)

| Sheet | Canonical range |
|---|---:|
| [batch-1-contact-sheet-01.png](batch-1-contact-sheet-01.png) | 1–10 |
| [batch-1-contact-sheet-02.png](batch-1-contact-sheet-02.png) | 11–20 |
| [batch-1-contact-sheet-03.png](batch-1-contact-sheet-03.png) | 21–30 |
| [batch-1-contact-sheet-04.png](batch-1-contact-sheet-04.png) | 31–40 |
| [batch-1-contact-sheet-05.png](batch-1-contact-sheet-05.png) | 41–50 |
| [batch-1-contact-sheet-06.png](batch-1-contact-sheet-06.png) | 51–60 |
| [batch-1-contact-sheet-07.png](batch-1-contact-sheet-07.png) | 61–70 |
| [batch-1-contact-sheet-08.png](batch-1-contact-sheet-08.png) | 71–80 |
| [batch-1-contact-sheet-09.png](batch-1-contact-sheet-09.png) | 81–90 |
| [batch-1-contact-sheet-10.png](batch-1-contact-sheet-10.png) | 91–100 |

### Batch 2 — canonical 101–200

| Sheet | Canonical range |
|---|---:|
${pageRows(2, manifests[2].pages, 101)}

### Batch 3 — canonical 201–345

| Sheet | Canonical range |
|---|---:|
${pageRows(3, manifests[3].pages, 201)}

Machine-readable, per-category records (including artwork IDs, origins, source names, exclusions, overlap values, and fallback state): [all-category-option-audit.json](all-category-option-audit.json). Phase-specific sheet manifests: [Batch 2](batch-2-review-manifest.json) · [Batch 3](batch-3-review-manifest.json).

## Counting rules and QA snapshot

A counted option must render as a nonblank, legible drawing of the canonical object, fit inside its frame, and be distinct from already-counted art. Raster near-duplicates use the shared **0.62** visual-overlap threshold; human curation additionally excludes semantic lookalikes, wrong subtypes, decorative/UI marks, and clipped line art. The frozen Batch-1 rules remain in \`scripts/batch1-artwork-review.mjs\`; Batch-2/3 rules and documented exclusions are in \`scripts/batch-artwork-review.mjs\`. The full audit records 118 manual exclusions and 3 additional raster near-duplicates (overlap above 0.62) as not counted. Existing legacy icons remain available where the app already falls back to them, but they do **not** inflate clean-option counts.

| Scope | Clean primary coverage | Distinct options | Distribution (3+ / 2 / 1 / 0) | Licensed source variants | Variant labels | Custom/derived drawings | Manual exclusion rules | Categories under 3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Batch 1 · 1–100 | ${b1.cleanPrimaryCoverage}/100 | ${b1.distinctOptions} | ${b1.distribution.threePlus} / ${b1.distribution.exactlyTwo} / ${b1.distribution.exactlyOne} / ${b1.distribution.zero} | ${b1.approvedSourceVariants} | ${b1.variantLabels} | ${b1.derivedDrawings.length} | ${b1.manualExclusionRules} | ${b1.categoriesUnderThree.length} |
| Batch 2 · 101–200 | ${b2.cleanPrimaryCoverage}/100 | ${b2.distinctOptions} | ${b2.distribution.threePlus} / ${b2.distribution.exactlyTwo} / ${b2.distribution.exactlyOne} / ${b2.distribution.zero} | ${b2.approvedSourceVariants} | ${b2.variantLabels} | ${b2.derivedDrawings.length} | ${b2.manualExclusionRules} | ${b2.categoriesUnderThree.length} |
| Batch 3 · 201–345 | ${b3.cleanPrimaryCoverage}/145 | ${b3.distinctOptions} | ${b3.distribution.threePlus} / ${b3.distribution.exactlyTwo} / ${b3.distribution.exactlyOne} / ${b3.distribution.zero} | ${b3.approvedSourceVariants} | ${b3.variantLabels} | ${b3.derivedDrawings.length} | ${b3.manualExclusionRules} | ${b3.categoriesUnderThree.length} |
| **All · 1–345** | **${totalPrimary}/345** | **${audit.totalDistinctOptions}** | **${audit.distribution.threePlus} / ${audit.distribution.exactlyTwo} / ${audit.distribution.exactlyOne} / ${audit.distribution.zero}** | **${totalSourceVariants}** | **${totalVariantLabels}** | **${totalDerived}** | **${totalManualExclusions}** | **${audit.categoriesUnderThree.length}** |

So the complete pool has **${audit.totalDistinctOptions}** distinct counted options across 345 categories; **${audit.categoriesUnderThree.length}** have fewer than three, and no category was padded just to reach three. The ${audit.distribution.zero} zero-option labels remain honest fallback/text states.

### Every category with fewer than three counted options

Indices are one-based canonical positions. Counts below reflect reviewed, distinct options (not legacy app fallback icons).

${underThreeGroups}

## Custom/derived art and curation notes

The ${totalDerived} original local drawings are: ${derived}. They are authored as local SVGs and do not copy the paths of upstream icons. The Batch-2 fireplace drawing replaces two too-dense exact glyphs. The Batch-3 stop sign drawing replaces the only pinned exact glyph after its raster ink measured 52.8%; it uses a simple octagon, pole, and path-drawn STOP lettering.

Important uncertainties and deliberate non-matches:

- **Garden hose**: no suitable pinned exact source; text-only. **Swing set**: no accurate set source; a tree swing is not treated as a swing set.
- **The Great Wall of China**: no clean exact illustration; brick-wall imagery is not counted. **Stereo**: a speaker/loudspeaker is only a weak legacy fallback and is not counted as a stereo.
- **Raccoon**: the available head-only fallback does not meet the whole-animal requirement and is not counted. Similar whole-body requirements are preserved for animal sources.
- **Golf club** and **paint can**: misleading flag-in-hole and palette/bucket art were removed from the fallback/primary pools; both are text-only pending a suitable exact source.
- **Foot**, **mouse**, and **sheep**: clipped hand-drawn line art touches the frame and is not counted; the remaining clean source is retained where available.
- Legacy **APP FALLBACK · NOT COUNTED** tiles show app-visible fallback artwork only. **FALLBACK · TEXT ONLY** means there is no clean drawing or retained icon for that class.

Curation corrections include police car → \`gameicons/police-car\`, power outlet → \`tabler/outlet\`, oven → \`mdi/toaster-oven\`, table → \`mdi/table-furniture\`, Mona Lisa → \`gameicons/mona-lisa\`, passport → \`gameicons/passport\`, stove → \`gameicons/gas-stove\`, shorts → \`gameicons/underwear-shorts\`, wine bottle → \`mdi/bottle-wine\`, and wine glass → \`mdi/glass-wine\`. The requested exact Game Icons sources for streetlight, underwear, swan, trombone, steak, scorpion, tennis racquet, and windmill are also pinned in the source registry; no alternative was forced when a suitable distinct drawing was not available.

## Sources, licenses, and reproducibility

Primary imports: **${audit.importedPrimaryDrawings}/345** categories. Each source is pinned in \`scripts/oss-art-sources.mjs\`; batch-specific variants have curated maps and generated credit files. All source fetches use official npm packages or the official tagged Iconoir GitHub archive—no Google AutoDraw scraping, random web art, or new emoji primaries.

| Pinned library | License | Imported primaries |
|---|---|---:|
${sourceRows}

Full category-level attribution is in \`scripts/oss-art-credits.json\`, \`scripts/oss-art-variant-credits.json\`, \`scripts/oss-art-variant-credits-batch2.json\`, and \`scripts/oss-art-variant-credits-batch3.json\`. The complete pinned versions/URLs and credits are included in the audit JSON.

Rebuild from an empty temporary cache and require byte-identical generated primaries, credits, and both batch variant sets with:

\`\`\`sh
node scripts/test-oss-art-reproducibility.mjs
node scripts/audit-all-artwork-options.mjs
node scripts/render-batch-review-sheets.mjs
node scripts/render-artwork-review-index.mjs
\`\`\`

The cold-cache audit compares generated primaries and both variant sets byte-for-byte. After commit, \`node scripts/audit-artwork-scope.mjs --base=HEAD^\` verifies canonical range scope and byte-identical Batch-1 inputs/artifacts. Build and app regression checks are tracked in the final handoff; real-browser download confirmation still requires the short manual checklist because jsdom does not implement browser download policy.
`;
fs.writeFileSync(path.join(REVIEW_DIR, 'README.md'), text);
console.log(`Wrote ${path.relative(ROOT, path.join(REVIEW_DIR, 'README.md'))}`);
