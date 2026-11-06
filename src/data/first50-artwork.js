// Original supplemental drawings for the first 50 canonical Quick, Draw! labels.
// These are intentionally distinct views/poses, not resizes or recolors of the
// existing glyphs. The paths are original to SketchAI and covered by the
// repository's MIT license; no Google AutoDraw artwork is used.
const SIZE = { w: 24, h: 24 };
const v = (body, width = 1.5) => ({
  ...SIZE,
  b: `<g fill="none" stroke="STROKE" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
});
const dot = (body) => `<g fill="STROKE" stroke="none">${body}</g>`;

// These labels had no original SketchAI line-art option in the existing pool.
// Each new drawing is a deliberately different outline/view from the supplied
// icon options and from the additional variants below.
export const FIRST50_LINE_ART = {
  angel: v('<circle cx="12" cy="5" r="2"/><path d="M7 3c2-2 8-2 10 0M12 8v6M8 10l4-2 4 2M12 14l-4 6M12 14l4 6M7 9 3 7l-1 4 5 2M17 9l4-2 1 4-5 2"/>'),
  'animal migration': v('<path d="M3 9c3-3 5-3 8 0-3 3-5 3-8 0zM9 6c3-3 5-3 8 0-3 3-5 3-8 0zM15 9c3-3 5-3 8 0-3 3-5 3-8 0zM6 16c3-3 5-3 8 0-3 3-5 3-8 0zM13 17l4 2 4-2"/><path d="M3 21h18"/>'),
  'aircraft carrier': v('<path d="M2 14.5 5 18h14l3-3.5-4-1H6z"/><path d="M7 13.5V7h7v6.5M15 12l3-2v4M8 7l2-3h3l1 3M4 19.5h16M9 10h3"/><path d="M10 11V8.5M11.5 11V8.5"/>'),
  'alarm clock': v('<path d="m6 6-3-2M18 6l3-2M8 7 5 5M16 7l3-2"/><path d="M6 9 9 7h9l3 2v9l-3 2H8l-2-2z"/><ellipse cx="13" cy="12.5" rx="4.5" ry="4"/><path d="M13 9.5v3l2.4 1.3M9 20v2M18 19l1 2"/>'),
  anvil: v('<path d="M3 8h5l2 2h4l2-2h5l-2.4 4.5h-4.2l-1 5H18v2H6v-2h4.5l-1-5H6z"/><path d="M8 8 6.2 5.5h4L12 7l1.8-1.5h4L16 8M10.5 17.5h3"/>'),
  arm: v('<path d="M5 20.5v-5.2l2.1-2.2V8.6c0-1.3 1.9-1.4 2-.1v3.3h1V5.2c0-1.4 2-1.4 2 0v6.1h1V6.5c0-1.3 2-1.3 2 0v5.1h1V8.8c0-1.3 2-1.2 2 .1v6.5l-3 5.1z"/><path d="M7 15.5h8M10 5v-1M14 6.5l1-1"/>'),
  asparagus: v('<path d="M3 19 17 6c2-2 4 0 2 2L5 21z"/><path d="M15 8c0-3 2-5 5-5l-1 5M16 7l-3-3M18 6l3 1M12 11l-3-2M10 13l-3-2M8 15l-3-2M6 17l-3-1M4 19l-1-2M5 20l2 1"/>'),
  backpack: v('<path d="M7 7V7a5 5 0 0 1 10 0V7M5.5 8.5A2.5 2.5 0 0 1 8 6h8a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 16 22H8a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M8.5 11h7v5h-7zM5.5 10 3.8 12v6l1.7 1M18.5 10l1.7 2v6l-1.7 1M9 8.5h6"/>'),
  bandage: v('<path d="m4 15 11-11a3.5 3.5 0 0 1 5 5L9 20a3.5 3.5 0 0 1-5-5z"/><path d="m7 12 5 5M10 9l5 5"/><circle cx="8.5" cy="14.5" r=".7"/><circle cx="11.5" cy="11.5" r=".7"/>'),
  baseball: v('<circle cx="12" cy="12" r="9"/><path d="M6 5.2c2.1 2.3 2.7 4.4 2.2 6.8S6 16.7 4.2 18M18 5.2c-2.1 2.3-2.7 4.4-2.2 6.8s2.2 4.7 4 6"/><path d="m5.5 7.8 1.3.5M6.4 10l1.2.3M6.1 16.1l1.2-.7M5 18l1.2-.9M18.5 7.8l-1.3.5M17.6 10l-1.2.3M17.9 16.1l-1.2-.7M19 18l-1.2-.9"/>'),
  'baseball bat': v('<path d="M5.2 20.5 3.5 18.8 17.8 4.5a2 2 0 0 1 2.8 0l.9.9a2 2 0 0 1 0 2.8L7.2 22.5z"/><path d="m5.3 17 2 2M7.1 15.2l2 2M8.9 13.4l2 2M10.7 11.6l2 2M12.5 9.8l2 2M14.3 8l2 2M3.4 19.8l-1 1M6.5 21.8l-1 1"/>'),
  basket: v('<path d="M3 10h18l-2 11H5zM5 10l4-6M19 10l-4-6M8 12v7M12 12v7M16 12v7"/><path d="M2.5 9.5h19"/>'),
  basketball: v('<circle cx="12" cy="12" r="9"/><path d="M3.5 9c4.2 1.7 7.5 5.7 8.5 12M20.5 9C16.3 10.7 13 14.7 12 21M5.5 5.5c4.4 1.4 8.6 1.4 13 0M5.5 18.5c4.4-1.4 8.6-1.4 13 0"/>'),
  bat: v('<path d="M12 11.5c-2.6-4-5.8-5.8-8.2-4.2-2.5 1.7-1.6 5.2.7 7.2l-2 4.7 6-1.4 3.5 2.5 3.5-2.5 6 1.4-2-4.7c2.3-2 3.2-5.5.7-7.2-2.4-1.6-5.6.2-8.2 4.2z"/><path d="M12 11.5v8.8M7.5 12.5l1.4 1M16.5 12.5l-1.4 1"/>'),
  bathtub: v('<path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM5 12V6a2 2 0 0 1 4 0v1M7 20v2M17 20v2M7 15h10"/><path d="M9 8h5M14 8v3"/>'),
  beach: v('<path d="M3 20h18M5 20a7 7 0 0 1 14 0M12 5v2M5.5 8l1.5 1.5M18.5 8 17 9.5M12 10v10M7 14h10M7.5 14l-2-3M16.5 14l2-3"/><circle cx="12" cy="4" r="2"/>'),
  beard: v('<path d="M7 7a5 5 0 0 1 10 0v4c0 2-1 3-2 4v2l-3 4-3-4v-2c-1-1-2-2-2-4z"/><path d="M7 10c-2 2-2 7 1 9l2 2M17 10c2 2 2 7-1 9l-2 2M9.5 11h.1M14.4 11h.1"/>'),
  belt: v('<path d="M2 9h20v6H2zM9 8v8M9 10h6v4H9zM4 9V7h2v2M18 15v2h2v-2"/><circle cx="12" cy="12" r="1"/>'),
  bench: v('<path d="M4 10h16v4H4zM6 14v6M18 14v6M3 20h18M6 7h12M7 7v3M17 7v3"/><path d="M2.5 10 4 8M21.5 10 20 8M8 6V4h8v2"/>'),
  binoculars: v('<path d="M6 6h4l2 4 2-4h4l2 11a3 3 0 0 1-3 3h-1a4 4 0 0 1-4-4 4 4 0 0 1-4 4H7a3 3 0 0 1-3-3z"/><circle cx="8" cy="15" r="2.3"/><circle cx="16" cy="15" r="2.3"/><path d="M10 7h4M12 10v3"/>'),
  'birthday cake': v('<path d="M4 12h16v8H4zM4 16h16M7 12V8h10v4M8 8V5M12 8V4M16 8V5"/><path d="M6 20v2M18 20v2M7 10h10"/><path d="M7 15c1-1 2 1 3 0s2 1 3 0 2 1 4 0"/>'),
  boomerang: v('<path d="M4 4c6 1 10 4 16 15-7-2-12-6-16-15z"/><path d="m5 5 13 12M4 4l-1 3M20 19l-3 2M8 8l-2 1M12 12l-1 2"/>'),
  bowtie: v('<path d="M5 3h14l-2 5-5 3-5-3zM5 3l5 6M19 3l-5 6"/><path d="M11 9 4 6 2 7v6l2 1 7-3M13 9l7-3 2 1v6l-2 1-7-3M11 8h2v5h-2z"/><path d="M4 5 2 7M20 5l2 2"/>'),
  bridge: v('<path d="M2 19h20M4 19V9M20 19V9M4 10c3-5 13-5 16 0M4 12h16M7 12v7M12 12v7M17 12v7"/><path d="M2 9h3M19 9h3"/>'),
  broom: v('<path d="m14 4 2 2-8 9-2-2zM8 13l-5 6 1 2 8-4M16 6l2-2M14 4l-2 2"/><path d="m5 18 4 2M4 20l3 2M8 16l4 2"/>'),
  bucket: v('<path d="M4 8h16l-2 13H6zM3 8l2-4h14l2 4M8 8a4 4 0 0 1 8 0M7 12v5M12 12v5M17 12v5"/>'),
  bulldozer: v('<path d="M4 16V9h8l4 4v3M12 9V5h4l2 8M3 16h14v4H5zM17 15h4l1 4h-5"/><circle cx="8" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/><path d="M12 6h4M5 9 3 12v4"/>'),
  bush: v('<path d="M4 20a4 4 0 0 1-1-7 5 5 0 0 1 4-7 6 6 0 0 1 10 1 5 5 0 0 1 4 8 4 4 0 0 1-2 5zM12 20v2M7 20v2M17 20v2"/><path d="M7 11h.1M11 8h.1M16 12h.1M9 16h.1M15 17h.1"/>'),
  blackberry: v('<path d="M12 5c-4 0-7 3-7 7s3 8 7 8 7-4 7-8-3-7-7-7zM12 5V3M12 4 9 2M12 4l3-2"/><circle cx="8" cy="9" r="1.3"/><circle cx="12" cy="8" r="1.3"/><circle cx="16" cy="9" r="1.3"/><circle cx="7" cy="13" r="1.3"/><circle cx="11" cy="12" r="1.3"/><circle cx="15" cy="13" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="13" cy="17" r="1.3"/>'),
  blueberry: v('<path d="M3 20 18 6M7 16l-3-1M10 13l-1-4M13 10l4 1M16 7l1-4"/><circle cx="6" cy="18" r="2.5"/><circle cx="10" cy="14" r="2.7"/><circle cx="14" cy="10" r="2.8"/><circle cx="18" cy="6" r="2.5"/><path d="m4.5 16.5 1.5 1.5 1.5-1.5M8.5 12.5l1.5 1.5 1.5-1.5M12.5 8.5l1.5 1.5 1.5-1.5M16.5 4.5 18 6l1.5-1.5"/>'),
  bottlecap: v('<path d="M12 3 14 4l2-.5 1 2 2 .5v2l2 1-.5 2 1 2-1.5 1.5v2l-2 1-1 2-2-.5-2 1-1.5-1.5-2 .5-1-2-2-.5v-2l-2-1 .5-2-1-2L6.5 9V7l2-1 1-2 2 .5z"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/><path d="M10 12h4M12 10v4"/>'),
  bracelet: v('<ellipse cx="12" cy="12" rx="8" ry="5" transform="rotate(-25 12 12)"/><ellipse cx="12" cy="12" rx="5" ry="2.8" transform="rotate(-25 12 12)"/><path d="m5 8 2-2 2 1M17 16l2 2-2 2M10 8l.5 1M14 15l.5 1M17 10l.5 1"/><circle cx="18.5" cy="7" r="1.3"/>'),
};

// Additional original depictions. Stroke-based SVGs are used wherever a
// different angle or pose makes the object easier to distinguish.
export const FIRST50_VARIANTS = {
  'aircraft carrier': [
    v('<path d="M3 16 6 19h13l2-3-4-1H7zM6 15V8h11v7M18 13l3 1M8 8l2-3h4l3 3M4 20h15"/><path d="M10 10v3M11.5 10v3M14 10v3M15.5 10v3"/>'),
    v('<path d="m2 17 4 4h12l4-4-5-2H7zM7 15V9l7-3v9M14 8l4 2v6M5 21h14M9 10h3"/><path d="M9 13v-2M11 13v-2"/>'),
  ],
  'alarm clock': [
    v('<path d="M7 6 4 3M17 6l3-3"/><circle cx="12" cy="12" r="7"/><path d="M12 8v4l-3 2M8 20l-2 2M16 20l2 2M6 5l-2 1M18 5l2 1"/>'),
    v('<path d="M7 7 5 4M17 7l2-3"/><ellipse cx="12" cy="12" rx="7" ry="6"/><path d="M12 8v4l4 1M8 18l-2 3M16 18l2 3M5 12h2M17 12h2"/>'),
  ],
  angel: [
    v('<circle cx="8" cy="7" r="2"/><path d="M5 4c2-2 6-1 7 1M8 9l3 3-2 4M9 11l-4 2-3-2M9 15l-4 4M10 16l4 3M12 10c3-4 7-5 9-2-2 3-5 4-8 4M7 5 4 2M10 6l3-3"/>'),
    v('<circle cx="10" cy="6" r="2"/><path d="M7 3c1-1.5 5-1.5 6 0M10 8v7M10 10l-4 2-2 4M10 11l4 1 3-2M10 15l-4 5M10 15l5 4M15 9c2-3 4-3 6-1-1 2-3 4-6 4"/>'),
    v('<circle cx="12" cy="6" r="2"/><path d="M8.5 3c1-1.6 6-1.6 7 0M12 8v6M8 11l4-2 4 2M12 14l-5 5M12 14l5 5M7 10 3 8 2 12l5 1M17 10l4-2 1 4-5 1M9 20h6"/>'),
  ],
  'animal migration': [
    v('<path d="M2 9c3-4 6-4 9 0-3 4-6 4-9 0zM13 9c3-4 6-4 9 0-3 4-6 4-9 0zM7 17c3-4 6-4 9 0-3 4-6 4-9 0z"/><path d="M11 9h2M13 17h2M4 21h16"/>'),
    v('<path d="M2 7c3-3 5-3 8 0-3 3-5 3-8 0zM9 5c3-3 5-3 8 0-3 3-5 3-8 0zM15 8c3-3 5-3 8 0-3 3-5 3-8 0zM5 15c3-3 5-3 8 0-3 3-5 3-8 0z"/><path d="m4 21 4-2 3 1 4-3 5 1"/>'),
    v('<path d="M3 10c2-3 4-3 7 0-3 3-5 3-7 0zM9 8c2-3 4-3 7 0-3 3-5 3-7 0zM15 10c2-3 4-3 7 0-3 3-5 3-7 0zM6 17c2-3 4-3 7 0-3 3-5 3-7 0zM13 17c2-3 4-3 7 0-3 3-5 3-7 0z"/><path d="M4 22h16"/>'),
  ],
  ant: [v('<path d="M7 13c-2-3-1-6 2-7 3-1 5 1 5 4s-2 5-5 4M14 11l4-2M14 13l4 2M8 8 5 5M8 11H4M8 14l-3 3M13 8l2-3M15 10l4-2M15 14l4 2"/><circle cx="7" cy="11" r="2"/>')],
  anvil: [v('<path d="M3 8 6 4h12l3 4-4 3H9L3 8zM7 6h10M9 11l2 3v3H8v2h10v-2h-3v-3l2-3M10 14h4"/><path d="M4 8h4M18 8h3"/>')],
  arm: [
    v('<g transform="translate(1 0) scale(0.9 1)"><path d="M5 20c2-1 3-3 3-5l-1-4c-.5-2 1.5-3 2.5-1l1.5 2 2-6c.8-2.5 4-2 4 .5v4c2-2 4-1 4 1v3c2-.5 3 1 2 3l-2 3z"/><path d="M10 15c2-2 4-2 6 0M6 20h14"/></g>'),
    v('<path d="M3 14h10l2-3v-4c0-2 3-2 3 0v3l-1 5-3 4H3zM3 14l-1 3M2 17l2 2M4 19h8"/><path d="M17 10l3-1M16 13l4 1M14 17l3 2"/>'),
  ],
  asparagus: [
    v('<path d="M4 20 7 8l2-4 2 4-3 12M10 20l2-15 2-3 2 3-2 15M16 20l1-11 3-4 2 5-4 10"/><path d="m7 12-3-2M8 9l3-3M12 11 10 9M13 7l2-2M17 14l-2-2M19 11l3-2M5 17h14"/>'),
    v('<path d="M5 5 17 18M9 4l10 11M4 10l10 11M7 7l12 12"/><path d="M4 4 6 3l2 4M8 3l2 1 1 4M3 9l2-1 2 4M6 6l-1 2M9 6l-2 2M12 8l-2 2M14 11l-2 2M16 14l-2 2"/><path d="M8 13c2-2 4-2 6 0l-2 3-4-1z"/>'),
  ],
  backpack: [v('<path d="M8 7V5a4 4 0 0 1 8 0v2M6 9h12v11H6zM8 9v-2h8v2M8 12h8v4H8zM4 11l2 1M18 12l2-2v7l-2 1M8 20v2M16 20v2"/>')],
  bandage: [],
  barn: [
    v('<path d="M3 10 12 3l9 7v11H3zM7 21v-7l5-3 5 3v7M6 10h2M16 10h2M5 11v10M19 11v10"/><path d="M9 7h6M12 3v4"/>'),
    v('<path d="m4 10 8-6 8 6v10H4zM8 20v-5l4-2 4 2v5M6 11h3M15 11h3M12 4v5"/><path d="M3 21h18M10 17h4"/>'),
  ],
  baseball: [v('<circle cx="12" cy="12" r="8"/><path d="M6 6c2 2 2.5 4 2 6s-1.5 4-3.2 6M18 6c-2 2-2.5 4-2 6s1.5 4 3.2 6M6 9l2 .7M7 11l1.5.3M6.5 15l1.5-.7M18 9l-2 .7M17 11l-1.5.3M17.5 15l-1.5-.7"/>')],
  'baseball bat': [],
  basket: [],
  basketball: [
    v('<circle cx="12" cy="12" r="8"/><path d="M4.3 9c3.5 1.6 6.5 4.6 7.7 11M19.7 9c-3.5 1.6-6.5 4.6-7.7 11M6 6c4 1.4 8 1.4 12 0M6 18c4-1.4 8-1.4 12 0"/>'),
    v('<path d="M5 8c0-3 3-5 7-5s7 2 7 5v8c0 3-3 5-7 5s-7-2-7-5z"/><path d="M5 10c4 2 10 2 14 0M5 14c4-2 10-2 14 0M12 3v18"/>'),
  ],
  bat: [],
  bathtub: [],
  beach: [v('<path d="M2 19h20M4 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0M6 13a6 6 0 0 1 12 0M12 5v8M8 13h8M7 9l-2-2M17 9l2-2"/><circle cx="12" cy="4" r="2"/>')],
  beard: [
    v('<path d="M8 4c4-2 9 0 10 4l-1 3 2 2-3 2-2 7-4-1-3-5-3-2 2-2-1-3c0-2 1-4 3-5z"/><path d="M8 5c-2 2-2 5 0 7M12 10h.1M16 10h.1M8 13c1 4 3 6 5 7l2-5 3-2M8 14l-3 1"/>'),
    v('<path d="M4 12c2-2 5-3 8-2 3-1 6 0 8 2-1 3-3 5-5 6l-3 3-3-3c-2-1-4-3-5-6z"/><path d="M4 12c1-3 4-4 8-3 4-1 7 0 8 3M8 12c1 2 2 3 4 3s3-1 4-3M7 15l2 2M17 15l-2 2M11 18l1 1 1-1M6 8c2-2 4-2 6-1M14 7c2-1 4 0 5 2"/>'),
  ],
  bee: [
    v('<ellipse cx="12" cy="13" rx="5" ry="6"/><path d="M8 9 5 5c-2-2-4 0-2 3l4 3M16 9l3-4c2-2 4 0 2 3l-4 3M8 12h8M8 15h8M10 19l-2 2M14 19l2 2M10 7 9 4M14 7l1-3"/><circle cx="10" cy="11" r=".4"/><circle cx="14" cy="11" r=".4"/>'),
    v('<ellipse cx="12" cy="12" rx="6" ry="4" transform="rotate(-25 12 12)"/><path d="M9 8 6 4c-2-2-4 0-2 3l4 4M15 7l2-4c2-2 4 0 2 3l-3 4M8 12l7-3M10 16l7-3M7 15l-3 2M17 8l3-2M10 7l-1-3"/><circle cx="16" cy="9" r=".5"/>'),
  ],
  belt: [
    v('<path d="M3 10h18v4H3zM10 9v6M10 10h5v4h-5zM5 10V8h2v2M18 14v2h2v-2"/><circle cx="12.5" cy="12" r=".5"/>'),
    v('<path d="M4 4h5v10c0 3 2 5 5 5h6v3h-7c-5 0-9-4-9-9zM4 4h5M7 6h2v5H7zM14 16h3v2h-3z"/><circle cx="6.5" cy="13" r=".5"/><circle cx="12" cy="18.5" r=".5"/>'),
  ],
  bench: [],
  binoculars: [],
  'birthday cake': [
    v('<ellipse cx="12" cy="16" rx="8" ry="4"/><path d="M4 14c0 2 3.6 4 8 4s8-2 8-4v3c0 2-3.6 4-8 4s-8-2-8-4zM8 13V8M12 12V6M16 13V8M8 7c-1-1 0-2 1-2M12 5c-1-1 0-2 1-2M16 7c-1-1 0-2 1-2M3 20c2 2 5 3 9 3s7-1 9-3"/><path d="M8 13l1 1 1-1M12 11l1 1 1-1M16 13l1 1 1-1"/>'),
    v('<path d="M4 18 12 6l8 12zM4 18c0 2 16 2 16 0v2c0 2-16 2-16 0zM12 6V3M9 11V8M15 11V8"/><path d="M12 3c-1-1 0-2 1-2M9 8c-1-1 0-2 1-2M15 8c-1-1 0-2 1-2M8 14h.1M11 14h.1M14 14h.1M17 14h.1"/>'),
  ],
  blackberry: [
    v('<path d="M11 19 9 12M9 12 6 8M10 13l4-4M9 11 5 12M12 18l4-2M6 8 4 5M6 8l3-2M14 9l1-4M14 9l4 1"/><path d="M3 4c2-1 4 0 4 2-2 1-4 0-4-2zM14 4c2-1 4 0 4 2-2 1-4 0-4-2zM3 12c1-2 4-2 5 0-1 2-4 2-5 0z"/><circle cx="12" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="13.5" cy="14.5" r="1.6"/><circle cx="16.5" cy="14.5" r="1.6"/><circle cx="15" cy="17" r="1.6"/>'),
    v('<path d="M4 7c4 1 6 4 8 8M12 15l5-6M12 15l-5 4M14 12l4 2M8 11l-4 1M16 9l1-4M17 9l3-1"/><path d="M2 10c1-2 4-2 5 0-1 2-4 2-5 0zM6 18c1-2 4-2 5 0-1 2-4 2-5 0zM17 4c2-1 4 0 4 2-2 1-4 0-4-2z"/><circle cx="12" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="13.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><circle cx="15" cy="20" r="1.5"/>'),
    v('<path d="M5 11c0-4 3-7 7-7s7 3 7 7v8H5zM12 4v15M7 8c2 1 3 3 3 5M17 8c-2 1-3 3-3 5M8 19l4-4 4 4"/><circle cx="7" cy="7" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="17" cy="7" r="1.2"/><circle cx="6" cy="11" r="1.2"/><circle cx="18" cy="11" r="1.2"/>'),
  ],
  blueberry: [
    v('<path d="M5 14c0-5 3-9 7-9s7 4 7 9c0 4-3 7-7 7s-7-3-7-7zM12 5V3M12 4 9 2M12 4l3-2M7 9 5 7M17 9l2-2"/>'),
    v('<path d="M4 17c2 2 5 3 8 3s6-1 8-3M5 16c1-3 3-5 7-5s6 2 7 5M12 11V6M12 7 9 5M12 7l3-2"/><circle cx="7" cy="12" r="2.7"/><circle cx="12" cy="10" r="2.7"/><circle cx="17" cy="12" r="2.7"/><circle cx="9.5" cy="16" r="2.7"/><circle cx="14.5" cy="16" r="2.7"/><path d="m6 11 1 1 1-1M11 9l1 1 1-1M16 11l1 1 1-1M9 15l1 1 1-1M14 15l1 1 1-1"/>'),
    v('<path d="M4 15c0 3 3.6 5 8 5s8-2 8-5M4 15h16M6 14c0-4 2-7 6-7s6 3 6 7M12 7V4M12 5 9 3M12 5l3-2"/><circle cx="8" cy="13" r="2.2"/><circle cx="13" cy="11" r="2.2"/><circle cx="16" cy="14" r="2.2"/><path d="m7 12 1 1 1-1M12 10l1 1 1-1M15 13l1 1 1-1"/>'),
  ],
  boomerang: [v('<path d="M3 15c5-6 10-9 18-10-3 7-8 11-18 10zM4 14c3-1 5-3 7-5M8 13c3-1 5-3 7-5M13 10l1 3M16 7l1 3"/><path d="M2 19c5 2 10 1 14-2M4 21c5 1 10 0 14-3"/>')],
  bottlecap: [
    v('<ellipse cx="12" cy="12" rx="8" ry="6"/><ellipse cx="12" cy="12" rx="5" ry="3.5"/><path d="M4 12v3c0 3 16 3 16 0v-3M7 8 5 6M12 6V4M17 8l2-2M7 16l-2 2M12 18v2M17 16l2 2"/>'),
    v('<path d="M4 9h16v8H4zM6 9V7h3v2M15 9V7h3v2M7 17v2h3v-2M14 17v2h3v-2"/><ellipse cx="12" cy="13" rx="5" ry="2.5"/><path d="M8 12h8"/>'),
    v('<path d="M5 8c1-3 4-5 8-5s7 2 8 5v7c-1 3-4 5-8 5s-7-2-8-5z"/><ellipse cx="13" cy="8" rx="8" ry="4.5"/><path d="M5 8v7c2 3 14 5 16 0M7 6l2 1M11 4l1 2M16 5l-1 2M19 7l-2 1M7 15l2 1M12 17l1 1M17 16l1 1"/><ellipse cx="13" cy="8" rx="4" ry="2"/>'),
  ],
  bowtie: [v('<path d="M7 3h10v18H7zM8 4l4 5 4-5M8 10l4 4 4-4"/><g transform="rotate(-28 12 12)"><path d="M11 11 4 7 2 8v7l2 1 7-3M13 11l7-4 2 1v7l-2 1-7-3M11 9h2v5h-2z"/><path d="m4 9 4 2M20 9l-4 2"/></g>')],
  bracelet: [
    v('<path d="M3 18c4-1 6-3 8-6l2-4c1-2 4-1 3 1l-1 3 4-1c2 0 3 2 1 3l-6 6c-3 2-7 2-11 1z"/><path d="M7 15c3 1 6 2 10 1M6 17c3 1 7 2 11 1M9 14l1 2M13 11l2 2M17 14l1 2"/><circle cx="13" cy="15" r=".6"/><circle cx="16" cy="15" r=".6"/>'),
    v('<path d="M5 17c0-5 3-9 7-9s7 4 7 9M5 17h14M6 17l-1 2M18 17l1 2M8 14c1-1 2-1 3 0M13 14c1-1 2-1 3 0"/><path d="M7 15c2 2 8 2 10 0M11 8V5l2-2 2 2-1 3M12 18v3l2 2 2-2v-3"/><circle cx="13" cy="5" r=".8"/><circle cx="15" cy="21" r=".8"/>'),
    v('<path d="M5 14c0-5 3-9 7-9s7 4 7 9-3 7-7 7-7-2-7-7z"/><path d="M7 14c0-3 2-6 5-6s5 3 5 6-2 5-5 5-5-2-5-5z"/><circle cx="12" cy="5" r="1"/><circle cx="7" cy="8" r="1"/><circle cx="17" cy="8" r="1"/><circle cx="7" cy="18" r="1"/><circle cx="17" cy="18" r="1"/>'),
  ],
  bread: [v('<path d="M4 18V9a8 8 0 0 1 16 0v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 14h16M8 8l2-2M13 9l2-3M9 16v2M15 16v2"/>')],
  broccoli: [v('<path d="M12 12v9M8 21h8M12 12c-4 1-7-1-7-4 0-2 2-3 4-2 0-3 2-4 4-3 2-1 4 1 4 3 2-1 4 0 4 2 0 3-3 5-7 4"/><circle cx="8" cy="7" r=".7"/><circle cx="12" cy="5" r=".7"/><circle cx="16" cy="7" r=".7"/>')],
  bulldozer: [v('<path d="M3 15h13l3 3v2H4zM6 15V8h8l3 7M7 8V5h5v3M16 13l4 1 2 5h-3"/><circle cx="8" cy="18" r="2"/><circle cx="15" cy="18" r="2"/><path d="M5 10H3v4h2M8 6h4"/>')],
  bush: [
    v('<path d="M3 19c-2-3 0-6 3-7-1-4 2-7 6-6 3-3 8-1 8 3 4 2 3 7 0 9zM6 19v2M12 19v2M18 19v2"/><path d="M7 11h.1M12 9h.1M17 12h.1M9 15h.1M15 16h.1"/>'),
    v('<g transform="translate(1 0) scale(0.9 1)"><path d="M2 19c0-3 2-5 5-5-1-3 1-6 4-6 2-4 7-3 8 0 3 0 5 3 3 6 2 2 1 5-2 6H5zM7 20v2M12 20v2M17 20v2"/><path d="M7 13h.1M11 11h.1M16 10h.1M19 14h.1M9 17h.1M15 17h.1"/></g>'),
  ],
};
