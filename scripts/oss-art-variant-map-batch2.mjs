// Curated, visually reviewed supplemental source art for canonical Batch-2
// categories 101–200. The source libraries and their pinned licenses are in
// scripts/oss-art-sources.mjs. Only genuinely different depictions are kept;
// close exports, wrong subtypes, and ornamental/UI-like glyphs stay excluded.
//
// [library, icon-name, optional mode override]
export const ART_VARIANT_MAP_BATCH2 = {
  ear: [
    ['lucide', 'ear'],
  ],
  flashlight: [
    // The diagonal handheld view differs from the upright Lucide primary.
    ['gameicons', 'flashlight'],
  ],
  hammer: [
    // A claw-hammer head/pose, unlike the straight carpenter hammer primary.
    ['lucide', 'hammer'],
  ],
  helmet: [
    ['gameicons', 'helmet'],
  ],
  hospital: [
    // A compact hospital sign and a whole hospital building are separate views.
    ['iconoir', 'hospital'],
    ['lucide', 'hospital'],
  ],
  hourglass: [
    ['lucide', 'hourglass'],
  ],
  lighthouse: [
    ['mdi', 'lighthouse'],
  ],
  lollipop: [
    // Spiral lollipop, distinct from the twisted-candy Tabler drawing.
    ['lucide', 'lollipop'],
  ],
  microphone: [
    // Handheld diagonal microphone vs the upright microphone-on-stand primary.
    ['gameicons', 'microphone'],
  ],
  nose: [
    // Front-facing nose; the existing primary and SketchAI line art are profiles.
    ['gameicons', 'nose-front'],
  ],
};
