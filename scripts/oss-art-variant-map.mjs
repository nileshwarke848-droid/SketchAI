// Curated, reviewed supplemental sources for canonical Batch-1 categories only.
//
// A primary lives in `MAP` inside oss-art-sources.mjs; this map never replaces
// it. Each additional entry is a genuinely different depiction, not another
// export of the same path. Keep the list short: a category is intentionally
// omitted when the available source libraries only repeat the same glyph or
// offer a semantically wrong neighbour.
//
// [library, icon-name, optional mode override]
//
// Source names, license/version, and URLs are in SOURCES in
// scripts/oss-art-sources.mjs. The generated file has its own credit registry.
export const ART_VARIANT_MAP = {
  anvil: [
    // MDI/anvil repeats the Lucide primary's same side profile; Game Icons
    // contributes the distinct pedestal/base treatment instead.
    ['gameicons', 'anvil'],
  ],
  bandage: [
    ['mdi', 'bandage'],
  ],
  basket: [
    ['lucide', 'shopping-basket'],
  ],
  beach: [
    ['mdi', 'beach'],
  ],
  binoculars: [
    // The round-lens Iconoir glyph repeats the primary; Lucide's square lenses
    // provide the visibly different alternate.
    ['lucide', 'binoculars'],
  ],
  book: [
    ['lucide', 'book'],
  ],
  bread: [
    ['gameicons', 'bread'],
  ],
  bridge: [
    // MDI/bridge is another suspension bridge; Game Icons supplies an arch.
    ['gameicons', 'bridge'],
  ],
  broccoli: [
    ['gameicons', 'broccoli'],
  ],
  cactus: [
    ['gameicons', 'cactus'],
  ],
  candle: [
    ['mdi', 'candle'],
  ],
  canoe: [
    ['gameicons', 'wood-canoe'],
  ],
  castle: [
    ['mdi', 'castle'],
  ],
  'ceiling fan': [
    ['mdi', 'ceiling-fan-light'],
  ],
  clock: [
    ['gameicons', 'cuckoo-clock'],
  ],
  cloud: [
    ['tabler', 'cloud-rain'],
    ['lucide', 'cloud-lightning'],
  ],
  'coffee cup': [
    ['tabler', 'mug'],
  ],
  computer: [
    ['lucide', 'laptop'],
  ],
  couch: [
    ['tabler', 'sofa'],
  ],
  dolphin: [
    ['gameicons', 'dolphin'],
  ],
  dragon: [
    ['fontawesome', 'dragon'],
  ],
  drums: [
    ['gameicons', 'drum-kit'],
  ],
  duck: [
    ['gameicons', 'duck'],
  ],
};
