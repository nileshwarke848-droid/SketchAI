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
export const MAP = {
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
  table:      ['tabler', 'table'],

  // ---- synonyms for labels no library uses verbatim ------------------------
  'smiley face': ['tabler', 'mood-smile'],
  't-shirt':     ['tabler', 'shirt'],
  eyeglasses:    ['lucide', 'glasses'],
  bear:          ['mdi', 'teddy-bear'],
  'hot dog':     ['mdi', 'food-hot-dog'],
  'hot dog2':    ['mdi', 'food-hot-dog'],
  'school bus':  ['tabler', 'bus'],
  'police car':  ['tabler', 'car'],
  'pickup truck': ['tabler', 'truck'],
  'cruise ship': ['tabler', 'ship'],
  'sea turtle':  ['mdi', 'turtle'],
  crocodile:     ['mdi', 'snake'],
  'flying saucer': ['tabler', 'ufo'],
  'picture frame': ['tabler', 'photo'],
  'power outlet': ['tabler', 'plug'],
  'golf club':   ['tabler', 'golf'],
  'tennis racquet': ['tabler', 'ball-tennis'],
  'paper clip':  ['tabler', 'paperclip'],
  'house plant': ['tabler', 'plant'],
  'the eiffel tower': ['tabler', 'building-eiffel-tower'],
  'the great wall of china': ['lucide', 'brick-wall'],
  'the mona lisa': ['tabler', 'photo'],
  'cello':      ['mdi', 'violin'],
  'trombone':   ['mdi', 'trumpet'],
  'clarinet':   ['mdi', 'glass-flute'],
  'drums':      ['lucide', 'drum'],
  'saw':        ['mdi', 'hand-saw'],
  'matches':    ['tabler', 'matchstick'],
  'toothpaste': ['mdi', 'toothbrush-paste'],
  'toothbrush': ['mdi', 'toothbrush'],
  'toothbrush2'  : ['mdi', 'toothbrush'],
  'rollerskates': ['tabler', 'roller-skating'],
  'see saw':    ['mdi', 'seesaw'],
  'diving board': ['tabler', 'pool'],
  'spreadsheet': ['tabler', 'table'],
  'stereo':     ['lucide', 'speaker'],
  'telephone':  ['tabler', 'phone'],
  'lighter':    ['tabler', 'lighter'],
  'parrot':     ['lucide', 'bird'],
  'flamingo':   ['lucide', 'bird'],
  'swan':       ['lucide', 'bird'],
  'pond':       ['tabler', 'pool'],
  'ocean':      ['lucide', 'waves'],
  'river':      ['lucide', 'waves'],
  'garden':     ['tabler', 'garden-cart'],
  'bush':       ['tabler', 'plant'],
  'peas':       ['tabler', 'plant'],
  'watermelon': ['mdi', 'fruit-watermelon'],
  'pineapple':  ['mdi', 'fruit-pineapple'],
  'grapes':     ['tabler', 'grape'],
  'blackberry': ['tabler', 'grape'],
  'blueberry':  ['tabler', 'grape'],
  'steak':      ['tabler', 'meat'],
  'string bean': ['tabler', 'carrot'],
  'asparagus':  ['tabler', 'carrot'],
  'pear':       ['mdi', 'fruit-pear'],
  'sweater':    ['tabler', 'shirt'],
  'shorts':     ['tabler', 'shirt'],
  'underwear':  ['tabler', 'shirt'],
  'bowtie':     ['tabler', 'bow'],
  'snowman':    ['tabler', 'snowman'],
  'bee':        ['mdi', 'bee'],
  'bat':        ['mdi', 'bat'],
  'snail':      ['mdi', 'snail'],
  'scorpion':   ['mdi', 'spider'],
  'mouse':      ['mdi', 'mouse'],
  'squirrel':   ['lucide', 'squirrel'],
  lightning:    ['lucide', 'zap'],
  skyscraper:   ['lucide', 'building-2'],
  oven:         ['tabler', 'microwave'],
  microwave:    ['tabler', 'microwave'],
  crayon:       ['tabler', 'brush'],
  'paint can':  ['tabler', 'paint'],

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
  'stop sign':  ['gameicons', 'stop-sign'],
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
  'sheep':      ['mdi', 'sheep'],
  'cow':        ['mdi', 'cow'],
  'duck':       ['mdi', 'duck'],
  'owl':        ['mdi', 'owl'],
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
