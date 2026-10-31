// Where each imported drawing comes from.
//
// Task D replaces SketchAI's hand-authored line art with artwork sourced from
// openly licensed icon libraries. Nothing here comes from Google AutoDraw —
// AutoDraw was a style reference only.
//
// mode:
//   'stroke'  – the library already draws outlines (fill="none"); keep as is.
//   'outline' – the library ships solid silhouettes; render them as outlines so
//               the result is line art with minimal fill, per the style target.
import path from 'node:path';

const SRC_ROOT = process.env.OSS_ICON_ROOT ?? '/home/user/iconsrc';

export const SOURCES = {
  tabler: {
    name: 'Tabler Icons',
    version: '3.50.0',
    license: 'MIT',
    copyright: 'Copyright (c) 2020-2025 Paweł Kuna',
    url: 'https://github.com/tabler/tabler-icons',
    dir: 'tabler-icons-3.50.0/icons/outline',
    recursive: true,
    mode: 'stroke',
    fetch: { npm: '@tabler/icons', paths: { 'package/icons/outline': 'tabler-icons-${version}/icons/outline' } },
  },
  lucide: {
    name: 'Lucide',
    version: '1.65.0',
    license: 'ISC',
    copyright: 'Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.',
    url: 'https://github.com/lucide-icons/lucide',
    dir: 'lucide-static-1.65.0/icons',
    recursive: true,
    mode: 'stroke',
    fetch: { npm: 'lucide-static', paths: { 'package/icons': 'lucide-static-${version}/icons' } },
  },
  iconoir: {
    name: 'Iconoir',
    version: '7.12.1',
    license: 'MIT',
    copyright: 'Copyright (c) 2021 Iconoir',
    url: 'https://github.com/iconoir-icons/iconoir',
    dir: 'iconoir-7.12.1/icons/regular',
    recursive: true,
    mode: 'stroke',
    fetch: { github: 'iconoir-icons/iconoir', tag: 'v${version}', paths: { 'iconoir-${version}/icons/regular': 'iconoir-${version}/icons/regular' } },
  },
  mdi: {
    name: 'Material Design Icons',
    version: '7.4.47',
    license: 'Apache-2.0',
    copyright: 'Copyright 2020 Pictogrammers',
    url: 'https://github.com/Templarian/MaterialDesign',
    dir: 'mdi-svg-7.4.47/svg',
    recursive: false,
    mode: 'outline',
    fetch: { npm: '@mdi/svg', paths: { 'package/svg': 'mdi-svg-${version}/svg' } },
  },
  gameicons: {
    name: 'Game Icons',
    version: '1.2.4',
    license: 'CC BY 3.0',
    copyright: 'Game Icons by Lorc, Delapouite, Skoll, and contributors (game-icons.net)',
    url: 'https://github.com/game-icons/icons',
    dir: 'game-icons',
    recursive: false,
    mode: 'outline',
    jsonSet: true, // IconifyJSON: icons.json -> { icons: { name: { body } } }
    fetch: { npm: '@iconify-json/game-icons', paths: { 'package/icons.json': 'game-icons/icons.json' } },
  },
  fontawesome: {
    name: 'Font Awesome Free',
    version: '7.3.1',
    license: 'CC BY 4.0',
    copyright: 'Copyright Fonticons, Inc.',
    url: 'https://github.com/FortAwesome/Font-Awesome',
    dir: 'fortawesome-free-solid-svg-icons-7.3.1',
    recursive: false,
    mode: 'outline',
    jsModule: true,
    fetch: { npm: '@fortawesome/free-solid-svg-icons', paths: { 'package': 'fortawesome-free-solid-svg-icons-${version}' } },
  },
};

export function sourcePath(id) {
  return path.join(SRC_ROOT, SOURCES[id].dir);
}

// ---------------------------------------------------------------------------
// Hand-picked mappings.
//
// Rules used when picking these:
//   * Animals must be WHOLE animals. Every mainstream icon set draws dog/cat as
//     a face; those are rejected. MDI `dog-side` and Font Awesome `cat` are the
//     only full-body options found.
//   * Stroke libraries (Tabler / Lucide / Iconoir) are preferred for objects —
//     they are designed as line art already.
//   * Filled libraries (MDI / Font Awesome) are used only where no stroke
//     equivalent exists, and are rendered as outlines.
//
// [lib, icon, modeOverride?, extraBody?]
// Exact source art can still be a poor visual fit. These labels have original
// Batch-1 drawings in src/data/batch1-derived-art.js because no pinned source
// gives a readable, class-specific primary (or its silhouette is too chunky).
// Dresser is skipped because both exact MDI variants are too dense; wardrobe or
// filing-cabinet alternatives would mislabel the class.
export const SKIP_IMPORTED_ART = new Set(['clarinet', 'cooler', 'dresser', 'fireplace', 'lion', 'monkey', 'panda', 'paint can', 'stop sign', 'stereo']);

export const MAP = {
  // ---- Batch 1: reviewed primary corrections --------------------------------
  // These are the first 100 canonical labels. Use a source whose subject is the
  // class itself; do not substitute a nearby object just to fill a slot.
  'aircraft carrier': ['gameicons', 'carrier'],
  asparagus:   ['gameicons', 'asparagus'],
  bear:        ['gameicons', 'polar-bear'],
  bowtie:      ['mdi', 'bow-tie'],
  bush:        ['lucide', 'shrub'],

  // ---- demo critical -------------------------------------------------------
  dog:        ['mdi', 'dog-side'],                                  // full body side view
  cat:        ['fontawesome', 'cat'],                               // full body; MDI cat is a face
  car:        ['tabler', 'car'],
  bus:        ['tabler', 'bus'],
  house:      ['lucide', 'house'],
  tree:       ['tabler', 'tree'],
  flower:     ['tabler', 'flower'],
  sun:        ['tabler', 'sun'],
  umbrella:   ['tabler', 'umbrella'],
  fish:       ['tabler', 'fish'],
  airplane:   ['iconoir', 'airplane'],
  // zebra: no library ships one. Built from MDI `horse` (a clean full-body
  // horse) plus stripe strokes — a derived drawing, credited as such.
  zebra: [
    'mdi',
    'horse',
    'outline',
    '<path d="M8.3 9.1 9.1 13.1"/><path d="M10.3 8.6 11.1 13.6"/><path d="M12.3 8.7 13.1 13.9"/><path d="M14.3 9.5 15.1 13.9"/>',
  ],

  // ---- high priority -------------------------------------------------------
  train:      ['tabler', 'train'],
  shoe:       ['tabler', 'shoe'],
  guitar:     ['lucide', 'guitar'],
  elephant:   ['mdi', 'elephant'],
  // lion: no open library ships one. Left to the existing fallback.
  bicycle:    ['iconoir', 'bicycle'],
  bird:       ['lucide', 'bird'],
  sailboat:   ['tabler', 'sailboat'],
  chair:      ['fontawesome', 'chair'],
  clock:      ['tabler', 'clock'],
  cloud:      ['tabler', 'cloud'],
  cup:        ['tabler', 'cup'],
  door:       ['lucide', 'door-closed'],
  eye:        ['tabler', 'eye'],
  face:       ['tabler', 'mood-smile'],
  hand:       ['lucide', 'hand'],
  key:        ['tabler', 'key'],
  moon:       ['tabler', 'moon'],
  'cell phone': ['tabler', 'device-mobile'],
  star:       ['tabler', 'star'],
  table:      ['mdi', 'table-furniture'],

  // ---- synonyms for labels no library uses verbatim ------------------------
  'smiley face': ['tabler', 'mood-smile'],
  't-shirt':     ['tabler', 'shirt'],
  dumbbell:      ['lucide', 'dumbbell'],
  eyeglasses:    ['lucide', 'glasses'],
  'hot dog':     ['mdi', 'food-hot-dog'],
  'hot dog2':    ['mdi', 'food-hot-dog'],
  'school bus':  ['mdi', 'bus-school'],
  'police car':  ['gameicons', 'police-car'],
  'pickup truck': ['fontawesome', 'truck-pickup'],
  'cruise ship': ['tabler', 'ship'],
  'sea turtle':  ['mdi', 'turtle'],
  'flying saucer': ['tabler', 'ufo'],
  'picture frame': ['tabler', 'photo'],
  'power outlet': ['tabler', 'outlet'],
  passport:      ['gameicons', 'passport'],
  'wine bottle': ['mdi', 'bottle-wine'],
  'wine glass':  ['mdi', 'glass-wine'],
  'paper clip':  ['tabler', 'paperclip'],
  'house plant': ['tabler', 'plant'],
  'the eiffel tower': ['tabler', 'building-eiffel-tower'],
  'the mona lisa': ['gameicons', 'mona-lisa'],
  'trombone':   ['gameicons', 'trombone'],
  'drums':      ['lucide', 'drum'],
  'saw':        ['mdi', 'hand-saw'],
  'matches':    ['tabler', 'matchstick'],
  'toothpaste': ['mdi', 'toothbrush-paste'],
  'toothbrush': ['mdi', 'toothbrush'],
  'toothbrush2'  : ['mdi', 'toothbrush'],
  'rollerskates': ['tabler', 'roller-skating'],
  'see saw':    ['mdi', 'seesaw'],
  'spreadsheet': ['tabler', 'table'],
  'telephone':  ['tabler', 'phone'],
  'lighter':    ['tabler', 'lighter'],
  'flamingo':   ['gameicons', 'flamingo'],
  'swan':       ['gameicons', 'swan'],
  'ocean':      ['lucide', 'waves'],
  'river':      ['lucide', 'waves'],
  'peas':       ['gameicons', 'peas'],
  'watermelon': ['mdi', 'fruit-watermelon'],
  'pineapple':  ['mdi', 'fruit-pineapple'],
  'grapes':     ['tabler', 'grape'],
  'steak':      ['gameicons', 'steak'],
  'pear':       ['mdi', 'fruit-pear'],
  'shorts':     ['gameicons', 'underwear-shorts'],
  'underwear':  ['gameicons', 'underwear'],
  'snowman':    ['tabler', 'snowman'],
  'bee':        ['mdi', 'bee'],
  'bat':        ['mdi', 'bat'],
  'snail':      ['mdi', 'snail'],
  'scorpion':   ['gameicons', 'scorpion'],
  'mouse':      ['mdi', 'mouse'],
  'squirrel':   ['lucide', 'squirrel'],
  lightning:    ['lucide', 'zap'],
  skyscraper:   ['lucide', 'building-2'],
  oven:         ['mdi', 'toaster-oven'],
  microwave:    ['tabler', 'microwave'],
  stove:        ['gameicons', 'gas-stove'],
  'streetlight': ['gameicons', 'street-light'],
  'tennis racquet': ['gameicons', 'tennis-racket'],
  'windmill':   ['gameicons', 'windmill'],

  // ---- animals no stroke library ships: Game Icons (CC BY 3.0) -------------
  lion:         ['gameicons', 'lion'],
  tiger:        ['gameicons', 'tiger'],
  monkey:       ['gameicons', 'monkey'],
  camel:        ['gameicons', 'camel'],
  whale:        ['gameicons', 'sperm-whale'],
  hedgehog:     ['gameicons', 'hedgehog'],
  ant:          ['gameicons', 'ant'],
  crab:         ['gameicons', 'crab'],
  octopus:      ['gameicons', 'octopus'],

  // ---- objects only Game Icons ships ---------------------------------------
  harp:         ['gameicons', 'harp'],
  lantern:      ['gameicons', 'lantern'],
  cannon:       ['gameicons', 'cannon'],
  canoe:        ['gameicons', 'canoe'],
  cooler:       ['gameicons', 'cooler'],
  potato:       ['gameicons', 'potato'],
  strawberry:   ['gameicons', 'strawberry'],
  'sleeping bag': ['gameicons', 'sleeping-bag'],
  snorkel:      ['gameicons', 'snorkel'],
  vase:         ['gameicons', 'porcelain-vase'],
  rifle:        ['gameicons', 'rifle'],
  beard:        ['gameicons', 'beard'],
  belt:         ['gameicons', 'belt'],
  arm:          ['gameicons', 'arm'],
  leg:          ['gameicons', 'leg'],
  nose:         ['gameicons', 'nose-side'],
  'kangaroo':   ['mdi', 'kangaroo'],
  'koala':      ['mdi', 'koala'],
  'panda':      ['mdi', 'panda'],
  'penguin':    ['mdi', 'penguin'],
  'pig':        ['mdi', 'pig-variant'],
  'sheep':      ['gameicons', 'sheep'],
  'cow':        ['fontawesome', 'cow'],  // whole animal; MDI's exact glyph is only a face
  'duck':       ['mdi', 'duck'],
  'owl':        ['gameicons', 'owl'],
  'rabbit':     ['mdi', 'rabbit'],
  'dolphin':    ['mdi', 'dolphin'],
  'shark':      ['mdi', 'shark'],
  'turtle':     ['mdi', 'turtle'],
  'snake':      ['mdi', 'snake'],
  'spider':     ['mdi', 'spider'],
  'butterfly':  ['mdi', 'butterfly'],
  'donkey':     ['mdi', 'donkey'],
  'horse':      ['mdi', 'horse'],
};
