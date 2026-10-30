// Builds the 345-category metadata and the bundled icon subset.
//
// Source of truth: Google Quick, Draw! official category list (345 names,
// CC BY 4.0). Icon artwork: Fluent Emoji Flat (MIT) and Noto Emoji (Apache-2.0)
// via Iconify JSON packages. Only the icons actually referenced are copied into
// src/data/icons.json, so the bundle stays small.
//
// Run: node scripts/build-categories.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CATEGORY_FILE = path.join(ROOT, 'src/data/quickdraw-categories.txt');
const MODULES = '/tmp/tools/node_modules/@iconify-json';

const SETS = {
  fluent: { pkg: 'fluent-emoji-flat', label: 'Fluent Emoji Flat', license: 'MIT', url: 'https://github.com/microsoft/fluentui-emoji' },
  noto: { pkg: 'noto', label: 'Noto Emoji', license: 'Apache-2.0', url: 'https://github.com/googlefonts/noto-emoji' },
  mdi: { pkg: 'mdi', label: 'Material Design Icons', license: 'Apache-2.0', url: 'https://github.com/Pictogrammers/MaterialDesignIcons' },
};

// category -> icon id ("set:name"), or null for a deliberate text-only card.
// Tier A: a direct icon for the object. Tier B: a close, readable stand-in.
const ICONS = {
  'aircraft carrier': 'fluent:ship',
  'airplane': 'fluent:airplane',
  'alarm clock': 'fluent:alarm-clock',
  'ambulance': 'fluent:ambulance',
  'angel': 'fluent:baby-angel',
  'animal migration': 'fluent:paw-prints',
  'ant': 'fluent:ant',
  'anvil': 'fluent:hammer-and-wrench',
  'apple': 'fluent:red-apple',
  'arm': 'fluent:flexed-biceps',
  'asparagus': 'fluent:leafy-green',
  'axe': 'fluent:axe',
  'backpack': 'fluent:backpack',
  'banana': 'fluent:banana',
  'bandage': 'fluent:adhesive-bandage',
  'barn': 'fluent:hut',
  'baseball': 'fluent:baseball',
  'baseball bat': null,
  'basket': 'fluent:basket',
  'basketball': 'fluent:basketball',
  'bat': 'fluent:bat',
  'bathtub': 'fluent:bathtub',
  'beach': 'fluent:beach-with-umbrella',
  'bear': 'fluent:bear',
  'beard': 'fluent:man-beard',
  'bed': 'fluent:bed',
  'bee': 'fluent:honeybee',
  'belt': null,
  'bench': 'mdi:bench',
  'bicycle': 'fluent:bicycle',
  'binoculars': 'mdi:binoculars',
  'bird': 'fluent:bird',
  'birthday cake': 'fluent:birthday-cake',
  'blackberry': 'fluent:grapes',
  'blueberry': 'fluent:blueberries',
  'book': 'fluent:books',
  'boomerang': 'fluent:boomerang',
  'bottlecap': null,
  'bowtie': 'fluent:necktie',
  'bracelet': 'fluent:ring',
  'brain': 'fluent:brain',
  'bread': 'fluent:bread',
  'bridge': 'fluent:bridge-at-night',
  'broccoli': 'fluent:broccoli',
  'broom': 'fluent:broom',
  'bucket': 'fluent:bucket',
  'bulldozer': 'fluent:tractor',
  'bus': 'fluent:bus',
  'bush': 'fluent:herb',
  'butterfly': 'fluent:butterfly',
  'cactus': 'fluent:cactus',
  'cake': 'fluent:shortcake',
  'calculator': 'fluent:abacus',
  'calendar': 'fluent:calendar',
  'camel': 'fluent:camel',
  'camera': 'fluent:camera',
  'camouflage': null,
  'campfire': 'fluent:fire',
  'candle': 'fluent:candle',
  'cannon': null,
  'canoe': 'fluent:canoe',
  'car': 'fluent:automobile',
  'carrot': 'fluent:carrot',
  'castle': 'fluent:castle',
  'cat': 'fluent:cat-face',
  'ceiling fan': 'mdi:ceiling-fan',
  'cello': 'fluent:violin',
  'cell phone': 'fluent:mobile-phone',
  'chair': 'fluent:chair',
  'chandelier': 'mdi:chandelier',
  'church': 'fluent:church',
  'circle': 'fluent:hollow-red-circle',
  'clarinet': 'fluent:saxophone',
  'clock': 'fluent:alarm-clock',
  'cloud': 'fluent:cloud',
  'coffee': 'fluent:hot-beverage',
  'coffee cup': 'fluent:hot-beverage',
  'compass': 'fluent:compass',
  'computer': 'fluent:desktop-computer',
  'cookie': 'fluent:cookie',
  'cooler': null,
  'couch': 'fluent:couch-and-lamp',
  'cow': 'fluent:cow-face',
  'crab': 'fluent:crab',
  'crayon': 'fluent:crayon',
  'crocodile': 'fluent:crocodile',
  'crown': 'fluent:crown',
  'cruise ship': 'fluent:passenger-ship',
  'cup': 'fluent:cup-with-straw',
  'diamond': 'fluent:gem-stone',
  'dishwasher': 'mdi:dishwasher',
  'diving board': null,
  'dog': 'fluent:dog-face',
  'dolphin': 'fluent:dolphin',
  'donut': 'fluent:doughnut',
  'door': 'fluent:door',
  'dresser': 'mdi:dresser',
  'drill': null,
  'drums': 'fluent:drum',
  'duck': 'fluent:duck',
  'dumbbell': 'fluent:person-lifting-weights',
  'ear': 'fluent:ear',
  'elbow': 'fluent:flexed-biceps',
  'elephant': 'fluent:elephant',
  'envelope': 'fluent:envelope',
  'eraser': 'noto:eraser',
  'eye': 'fluent:eye',
  'eyeglasses': 'fluent:glasses',
  'face': 'fluent:grinning-face',
  'fan': 'mdi:fan',
  'feather': 'fluent:feather',
  'fence': 'mdi:fence',
  'finger': 'fluent:backhand-index-pointing-up',
  'fire hydrant': 'mdi:fire-hydrant',
  'fireplace': 'fluent:fire',
  'firetruck': 'fluent:fire-engine',
  'fish': 'fluent:fish',
  'flamingo': 'fluent:flamingo',
  'flip flops': 'fluent:thong-sandal',
  'floor lamp': 'fluent:light-bulb',
  'flower': 'fluent:blossom',
  'flying saucer': 'fluent:flying-saucer',
  'foot': 'fluent:foot',
  'fork': 'fluent:fork-and-knife',
  'frog': 'fluent:frog',
  'frying pan': 'fluent:cooking',
  'garden': 'fluent:house-with-garden',
  'garden hose': null,
  'giraffe': 'fluent:giraffe',
  'goatee': null,
  'golf club': 'fluent:flag-in-hole',
  'grapes': 'fluent:grapes',
  'grass': 'fluent:herb',
  'guitar': 'fluent:guitar',
  'hamburger': 'fluent:hamburger',
  'hammer': 'fluent:hammer',
  'hand': 'fluent:waving-hand',
  'harp': 'noto:harp',
  'hat': 'fluent:billed-cap',
  'headphones': 'fluent:headphone',
  'hedgehog': 'fluent:hedgehog',
  'helicopter': 'fluent:helicopter',
  'helmet': 'fluent:rescue-workers-helmet',
  'hexagon': 'mdi:hexagon',
  'hockey puck': 'mdi:hockey-puck',
  'hockey stick': 'mdi:hockey-sticks',
  'hot air balloon': 'fluent:balloon',
  'hot dog': 'fluent:hot-dog',
  'hot tub': 'fluent:bathtub',
  'hourglass': 'fluent:hourglass-done',
  'house': 'fluent:house',
  'house plant': 'fluent:potted-plant',
  'hurricane': 'fluent:cyclone',
  'ice cream': 'fluent:ice-cream',
  'jacket': 'fluent:coat',
  'jail': 'fluent:locked',
  'kangaroo': 'fluent:kangaroo',
  'key': 'fluent:key',
  'keyboard': 'fluent:keyboard',
  'knee': 'fluent:bone',
  'knife': 'fluent:kitchen-knife',
  'ladder': 'fluent:ladder',
  'lantern': 'fluent:red-paper-lantern',
  'laptop': 'fluent:laptop',
  'leaf': 'fluent:leaf-fluttering-in-wind',
  'leg': 'fluent:leg',
  'light bulb': 'fluent:light-bulb',
  'lighter': null,
  'lighthouse': 'noto:lighthouse',
  'lightning': 'fluent:high-voltage',
  'line': null,
  'lion': 'fluent:lion',
  'lipstick': 'fluent:lipstick',
  'lobster': 'fluent:lobster',
  'lollipop': 'fluent:lollipop',
  'mailbox': 'fluent:closed-mailbox-with-raised-flag',
  'map': 'fluent:world-map',
  'marker': 'fluent:pencil',
  'matches': null,
  'megaphone': 'fluent:megaphone',
  'mermaid': 'noto:mermaid',
  'microphone': 'fluent:studio-microphone',
  'microwave': 'mdi:microwave',
  'milk': 'fluent:glass-of-milk',
  'moon': 'fluent:crescent-moon',
  'motorbike': 'fluent:motor-scooter',
  'mountain': 'fluent:mountain',
  'mouse': 'fluent:mouse',
  'moustache': 'mdi:mustache',
  'mouth': 'fluent:mouth',
  'mug': 'fluent:hot-beverage',
  'mushroom': 'fluent:mushroom',
  'nail': null,
  'necklace': 'mdi:necklace',
  'nose': 'fluent:nose',
  'ocean': 'fluent:water-wave',
  'octagon': 'fluent:stop-sign',
  'octopus': 'fluent:octopus',
  'onion': 'fluent:onion',
  'oven': 'mdi:stove',
  'owl': 'fluent:owl',
  'oyster': 'fluent:oyster',
  'paint can': 'fluent:artist-palette',
  'paintbrush': 'fluent:paintbrush',
  'palm tree': 'fluent:palm-tree',
  'panda': 'fluent:panda',
  'pants': 'fluent:jeans',
  'paper clip': 'fluent:paperclip',
  'parachute': 'fluent:parachute',
  'parrot': 'fluent:parrot',
  'passport': 'fluent:passport-control',
  'peanut': 'fluent:peanuts',
  'pear': 'fluent:pear',
  'peas': 'fluent:pea-pod',
  'pencil': 'fluent:pencil',
  'penguin': 'fluent:penguin',
  'piano': 'fluent:musical-keyboard',
  'picture frame': 'fluent:framed-picture',
  'pig': 'fluent:pig-face',
  'pillow': 'fluent:bed',
  'pineapple': 'fluent:pineapple',
  'pizza': 'fluent:pizza',
  'pliers': 'mdi:pliers',
  'police car': 'fluent:oncoming-police-car',
  'pond': 'fluent:droplet',
  'pool': 'mdi:pool',
  'popsicle': 'fluent:shaved-ice',
  'postcard': 'fluent:love-letter',
  'power outlet': 'fluent:electric-plug',
  'prehistoric': 'fluent:t-rex',
  'rabbit': 'fluent:rabbit-face',
  'raccoon': 'fluent:raccoon',
  'radio': 'fluent:radio',
  'rain': 'fluent:cloud-with-rain',
  'rainbow': 'fluent:rainbow',
  'rake': 'mdi:rake',
  'Remote': 'fluent:television',
  'remote control': 'fluent:television',
  'rifle': 'fluent:water-pistol',
  'river': 'fluent:water-wave',
  'rollerskates': 'fluent:ice-skate',
  'sailboat': 'fluent:sailboat',
  'sandwich': 'fluent:sandwich',
  'saw': 'fluent:carpentry-saw',
  'saxophone': 'fluent:saxophone',
  'school bus': 'fluent:oncoming-bus',
  'scissors': 'fluent:scissors',
  'scorpion': 'fluent:scorpion',
  'screwdriver': 'fluent:hammer-and-wrench',
  'sea turtle': 'fluent:turtle',
  'see saw': 'mdi:seesaw',
  'shark': 'fluent:shark',
  'sheep': 'noto:ewe',
  'shoe': 'fluent:running-shoe',
  'shorts': 'fluent:shorts',
  'shovel': 'mdi:shovel',
  'sink': 'mdi:sink',
  'skateboard': 'fluent:skateboard',
  'skull': 'fluent:skull',
  'skyscraper': 'fluent:office-building',
  'sleeping bag': 'fluent:person-in-bed',
  'smiley face': 'fluent:smiling-face-with-smiling-eyes',
  'snail': 'fluent:snail',
  'snake': 'fluent:snake',
  'snorkel': 'fluent:diving-mask',
  'snowflake': 'fluent:snowflake',
  'snowman': 'fluent:snowman',
  'sock': 'fluent:socks',
  'speedboat': 'fluent:speedboat',
  'spider': 'fluent:spider',
  'spoon': 'fluent:spoon',
  'spreadsheet': 'fluent:bar-chart',
  'square': 'fluent:black-large-square',
  'squiggle': null,
  'squirrel': null,
  'stairs': 'mdi:stairs',
  'star': 'fluent:star',
  'steak': 'fluent:cut-of-meat',
  'stereo': 'fluent:loudspeaker',
  'stitches': 'fluent:adhesive-bandage',
  'stop sign': 'fluent:stop-sign',
  'stove': 'mdi:stove',
  'streetlight': 'fluent:light-bulb',
  'string bean': null,
  'submarine': 'mdi:submarine',
  'suitcase': 'fluent:luggage',
  'sun': 'fluent:sun',
  'sushi': 'fluent:sushi',
  'sweater': null,
  'swing set': null,
  'sword': 'fluent:crossed-swords',
  'syringe': 'fluent:syringe',
  'table': 'mdi:table-furniture',
  'teapot': 'fluent:teapot',
  'teddy': 'fluent:teddy-bear',
  'telephone': 'fluent:telephone',
  'telescope': 'fluent:telescope',
  'tennis racquet': 'fluent:tennis',
  'tent': 'fluent:tent',
  'The Eiffel Tower': 'fluent:tokyo-tower',
  'The Great Wall of China': null,
  'The Mona Lisa': 'fluent:framed-picture',
  'tiger': 'fluent:tiger-face',
  'toaster': 'mdi:toaster',
  'toe': 'fluent:foot',
  'toilet': 'fluent:toilet',
  'tooth': 'fluent:tooth',
  'toothbrush': 'fluent:toothbrush',
  'toothpaste': 'fluent:toothbrush',
  'tornado': 'fluent:tornado',
  'tractor': 'fluent:tractor',
  'traffic light': 'fluent:vertical-traffic-light',
  'train': 'fluent:locomotive',
  'tree': 'fluent:deciduous-tree',
  'triangle': 'fluent:red-triangle',
  'trombone': 'fluent:trumpet',
  'truck': 'fluent:delivery-truck',
  'trumpet': 'fluent:trumpet',
  'umbrella': 'fluent:umbrella',
  'underwear': 'fluent:briefs',
  'van': 'fluent:minibus',
  'vase': 'fluent:amphora',
  'washing machine': 'mdi:washing-machine',
  'waterslide': null,
  'whale': 'fluent:spouting-whale',
  'windmill': 'mdi:wind-turbine',
  'wine bottle': 'fluent:bottle-with-popping-cork',
  'wine glass': 'fluent:wine-glass',
  'wristwatch': 'fluent:watch',
  'yoga': 'fluent:person-in-lotus-position',
  'zebra': 'fluent:zebra',
  'zigzag': null,
  'the letter a': null,
};

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const catalogues = {};
for (const [key, meta] of Object.entries(SETS)) {
  const json = JSON.parse(fs.readFileSync(path.join(MODULES, meta.pkg, 'icons.json'), 'utf8'));
  const icons = { ...(json.icons || {}) };
  for (const [name, alias] of Object.entries(json.aliases || {})) {
    const parent = json.icons[alias.parent];
    if (parent) icons[name] = parent;
  }
  // Each set has its own default viewBox (fluent 32, noto 128, mdi 24). Icons
  // without explicit width/height MUST inherit it or the viewBox crops them.
  catalogues[key] = { icons, size: { w: json.width ?? 32, h: json.height ?? 32 } };
}

// Categories whose icon is a direct depiction of the object (tier A). Anything
// else that maps to an icon is a recognisable stand-in (tier B).
const DIRECT = new Set([
  'airplane', 'alarm clock', 'ambulance', 'ant', 'apple', 'axe', 'backpack', 'banana',
  'bandage', 'barn', 'baseball', 'basket', 'basketball', 'bat', 'bathtub', 'beach', 'bear',
  'bed', 'bee', 'bicycle', 'bird', 'birthday cake', 'book', 'boomerang', 'brain', 'bread',
  'bridge', 'broccoli', 'broom', 'bucket', 'bus', 'butterfly', 'cactus', 'cake', 'calendar',
  'camel', 'camera', 'campfire', 'candle', 'canoe', 'car', 'carrot', 'castle', 'cat',
  'cell phone', 'chair', 'church', 'cloud', 'coffee cup', 'compass', 'computer', 'cookie',
  'cow', 'crab', 'crayon', 'crown', 'cruise ship', 'cup', 'diamond', 'dog', 'dolphin',
  'donut', 'door', 'drums', 'duck', 'ear', 'elephant', 'envelope', 'eye', 'eyeglasses',
  'face', 'feather', 'firetruck', 'fish', 'flamingo', 'flower', 'flying saucer', 'foot',
  'frog', 'giraffe', 'grapes', 'guitar', 'hamburger', 'hammer', 'hand', 'harp', 'headphones',
  'hedgehog', 'helicopter', 'hourglass', 'house', 'hurricane', 'ice cream', 'jacket',
  'kangaroo', 'key', 'keyboard', 'knife', 'ladder', 'lantern', 'laptop', 'leg', 'light bulb',
  'lighthouse', 'lightning', 'lion', 'lipstick', 'lobster', 'lollipop', 'map', 'microphone',
  'mermaid', 'moon', 'mountain', 'mouse', 'mouth', 'mushroom', 'nose', 'ocean', 'octopus',
  'onion', 'owl', 'paintbrush', 'palm tree', 'panda', 'pants', 'paper clip', 'parachute',
  'parrot', 'pencil', 'penguin', 'piano', 'picture frame', 'pig', 'pillow', 'pineapple',
  'pizza', 'police car', 'popcorn', 'potato', 'power outlet', 'pumpkin', 'rabbit', 'raccoon',
  'radio', 'rain', 'rainbow', 'remote control', 'river', 'sandwich', 'saw', 'saxophone',
  'scissors', 'scorpion', 'shark', 'sheep', 'shorts', 'skateboard', 'skull', 'skyscraper',
  'snail', 'snake', 'snowflake', 'snowman', 'sock', 'spider', 'spoon', 'square', 'star',
  'steak', 'stop sign', 'submarine', 'suitcase', 'sun', 'sword', 'syringe', 'teapot',
  'teddy', 'telephone', 'telescope', 'tent', 'tiger', 'toilet', 'tooth', 'toothbrush',
  'tornado', 'tractor', 'traffic light', 'train', 'tree', 'triangle', 'trumpet', 'truck',
  'umbrella', 'violin', 'watermelon', 'whale', 'wine glass', 'wristwatch', 'zebra',
]);

export function resolveIcon(name) {
  if (Object.prototype.hasOwnProperty.call(ICONS, name)) {
    const id = ICONS[name];
    if (id == null) return { tier: 'C', icon: null };
    const [set, icon] = id.split(':');
    const data = catalogues[set]?.icons[icon];
    if (!data) throw new Error(`Unknown icon "${id}" for category "${name}"`);
    return { icon: id, set, name: icon, data, defaultSize: catalogues[set].size };
  }
  // fall back to an exact slug match in the primary set
  const s = slug(name);
  if (catalogues.fluent.icons[s]) return { icon: `fluent:${s}`, set: 'fluent', name: s, data: catalogues.fluent.icons[s], defaultSize: catalogues.fluent.size };
  if (catalogues.noto.icons[s]) return { icon: `noto:${s}`, set: 'noto', name: s, data: catalogues.noto.icons[s], defaultSize: catalogues.noto.size };
  return { icon: null };
}

/** Iconify bodies reuse ids like "a" for gradients; namespace them per icon. */
function namespaceIds(body, prefix) {
  return body
    .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`)
    .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}-${id}"`)
    .replace(/\s+/g, ' ')
    .trim();
}

const categories = fs.readFileSync(CATEGORY_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
if (categories.length !== 345) throw new Error(`Expected 345 categories, found ${categories.length}`);
if (new Set(categories).size !== 345) throw new Error('Duplicate categories in the source list');

const iconsOut = {};
const meta = [];
const problems = [];
for (const name of categories) {
  let resolved;
  try {
    resolved = resolveIcon(name);
  } catch (error) {
    problems.push(error.message);
    resolved = { icon: null };
  }
  // Tier A when the icon actually depicts the object: its slug shares a word with
  // the category name, or it is explicitly allow-listed. Otherwise it is a
  // recognisable stand-in (B). No icon at all means a typographic card (C).
  const iconSlug = resolved.icon ? resolved.icon.split(':')[1] : '';
  const sharesWord = iconSlug.split('-').some((part) => part.length > 2 && name.toLowerCase().split(/[\s-]+/).includes(part));
  const tier = !resolved.icon ? 'C' : (DIRECT.has(name) || sharesWord ? 'A' : 'B');
  const key = resolved.icon ? resolved.icon.replace(':', '-').replace(/[^a-z0-9-]/gi, '') : null;
  if (key) {
    const { data, defaultSize } = resolved;
    iconsOut[key] = {
      w: data.width ?? defaultSize.w,
      h: data.height ?? defaultSize.h,
      b: namespaceIds(data.body, key),
    };
  }
  meta.push({
    label: name,
    key,
    tier,
    source: resolved.icon ? `${resolved.set}` : null,
  });
}
if (problems.length) {
  console.error('ICON PROBLEMS:\n' + problems.join('\n'));
  process.exitCode = 1;
}

const withIcon = meta.filter((m) => m.key).length;
const tierA = meta.filter((m) => m.tier === 'A').length;
const tierB = meta.filter((m) => m.tier === 'B').length;
const tierC = meta.filter((m) => m.tier === 'C');

const header = `// Generated by scripts/build-categories.mjs - do not edit by hand.
// Category names: Google Quick, Draw! official list (345), CC BY 4.0.
// Icon artwork: Fluent Emoji Flat (MIT) and Noto Emoji (Apache-2.0); see
// src/data/icons.js and README credits. Categories with no honest icon get a
// typographic card instead (tier C).
`;
const body = `export const CATEGORY_COUNT = ${meta.length};

/** Every category the extended model can predict, in official Quick Draw order. */
export const categories = ${JSON.stringify(meta, null, 0)};

export const categoriesByLabel = new Map(categories.map((entry) => [entry.label, entry]));

// Three canonical labels carry capital letters ("The Eiffel Tower",
// "The Mona Lisa", "The Great Wall of China"). Lookups route through
// normaliseLabel(), which lowercases, so a lowercase index is required too.
export const categoriesByNormalisedLabel = new Map(
  categories.map((entry) => [entry.label.toLowerCase(), entry]),
);
`;
fs.writeFileSync(path.join(ROOT, 'src/data/categories.js'), header + body);
// A JS module rather than JSON so both Vite and plain Node can import it without
// JSON import attributes.
fs.writeFileSync(
  path.join(ROOT, 'src/data/icons.js'),
  `// Generated by scripts/build-categories.mjs - do not edit by hand.
// Icon artwork: Fluent Emoji Flat (MIT, https://github.com/microsoft/fluentui-emoji),
// Noto Emoji (Apache-2.0, https://github.com/googlefonts/noto-emoji) and
// Material Design Icons (Apache-2.0, https://github.com/Pictogrammers/MaterialDesignIcons),
// redistributed via the Iconify JSON packages.
export const ICON_LICENSES = ${JSON.stringify({ fluent: { license: 'MIT', url: 'https://github.com/microsoft/fluentui-emoji' }, noto: { license: 'Apache-2.0', url: 'https://github.com/googlefonts/noto-emoji' }, mdi: { license: 'Apache-2.0', url: 'https://github.com/Pictogrammers/MaterialDesignIcons' } })};
export const ICONS = ${JSON.stringify(iconsOut)};
`,
);

const bytes = fs.statSync(path.join(ROOT, 'src/data/icons.js')).size;
console.log(`categories: ${meta.length}`);
console.log(`with artwork: ${withIcon} (tier A ${tierA}, tier B ${tierB}), text fallback: ${tierC.length}`);
console.log(`icons.js: ${(bytes / 1024).toFixed(0)} KB (${Object.keys(iconsOut).length} icons)`);
console.log('text fallbacks:', tierC.map((c) => c.label).join(', '));
