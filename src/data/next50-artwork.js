// SketchAI-original alternate views for Quick, Draw! labels 51–100.
// These hand-authored SVG paths fill the distinct-line-art gaps in that range;
// they are not AutoDraw art or transformed copies of existing glyphs.
const SIZE = { w: 24, h: 24 };
const v = (body, width = 1.5) => ({
  ...SIZE,
  b: `<g fill="none" stroke="STROKE" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
});

// Distinct alternate views where the existing line-art candidate was missing,
// clipped, or too close to the imported primary. Keep each glyph class-specific.
export const NEXT50_DERIVED_ART = {
  camouflage: v('<path d="M3 5h18v14H3z"/><path d="M3 9c2-3 4-3 6-1l2 2-3 2-2-1-3 2zM12 6c2-2 4-1 5 1l3-1 1 3-3 2-3-1-2 2-3-2zM4 16l3-3 3 1 1 3-3 2H4zM14 14l2-2 3 1 2 3-2 2h-4z"/>'),
  crocodile: v('<path d="M2 14c3-4 7-5 11-3l4-4 4 2-1 4 2 2-4 2-5-2-4 5H5zM3 14h6M6 18v3M12 17v4M18 16v3"/><path d="M6 12 8 10l2 2M10 11l2-2 2 2M15 11l2-2 2 2"/><circle cx="19" cy="12" r=".6"/>'),
};

export const NEXT50_LINE_ART = {
  cake: v('<path d="M4 13h16v7H4zM4 16h16M7 13V8h10v5M8 8V5M12 8V4M16 8V5"/><path d="M6 20v2M18 20v2M7 11h10"/>'),
  calculator: v('<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 6h10v4H7z"/><path d="M8 13h1M12 13h1M16 13h1M8 16h1M12 16h1M16 16h1M8 19h1M12 19h1M16 19h1"/>'),
  calendar: v('<path d="M4 6h16v15H4zM4 10h16M8 3v5M16 3v5"/><path d="M7 13h2M11 13h2M15 13h2M7 16h2M11 16h2M15 16h2M7 19h2"/>'),
  camera: v('<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="14" r="1.5"/><path d="M18 10h1"/>'),
  camouflage: v('<path d="M3 5c3-3 5-1 7 0s4 2 6 0 4-2 5 0v5c-3 2-5 1-7 0s-4-2-6 0-4 2-5 0zM3 15c2-2 4-1 6 0s4 2 6 0 4-2 6 0v4c-2 2-4 1-6 0s-4-2-6 0-4 2-6 0z"/>'),
  campfire: v('<path d="M12 3c2 4-2 5 1 8 1-2 3-3 3-5 4 4 5 8 2 12a7 7 0 0 1-12-1c-2-4 0-8 3-11 0 3 1 4 3 5 1-3-1-5 0-8z"/><path d="m5 20 14-7M5 13l14 7M8 21h8"/>'),
  candle: v('<path d="M8 10h8v10H8zM7 20h10v2H7zM12 3c2 2 2 4 0 6-2-2-2-4 0-6zM10 13h4"/>'),
  cannon: v('<path d="M4 10h13l3 3-3 3H7l-3-2zM7 16v3M15 16v3M5 19h13M17 10l2-3 2 1-2 5M6 10 4 7h3l2 3"/><circle cx="9" cy="19" r="1.5"/>'),
  canoe: v('<path d="M2 13c4-4 16-4 20 0-4 5-16 5-20 0zM5 13h14M9 9l-3-4M15 9l3-4M6 4l-2 1M18 4l2 1"/>'),
  car: v('<path d="M3 15 5 9h13l3 6v4H3zM5 15h14M7 9l2-4h6l3 4"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M10 12h4"/>'),
  carrot: v('<path d="m5 8 14 3-9 10zM6 8 4 4M7 8 8 3M8 9l4-5M5 8l-3-1"/><path d="m9 12 2 1M8 15l2 1M7 18l2 1"/>'),
  'ceiling fan': v('<circle cx="12" cy="10" r="2"/><path d="M12 8c-2-5-1-7 1-7 2 0 2 3 0 7M14 10c5-2 7-1 7 1 0 2-3 2-7 0M12 12c2 5 1 7-1 7-2 0-2-3 0-7M10 10c-5 2-7 1-7-1 0-2 3-2 7 0"/><path d="M12 12v8M9 22h6"/>'),
  cello: v('<path d="M10 4c-2 1-2 4-1 6l-2 3 1 7 4 2 4-2 1-7-2-3c1-2 1-5-1-6M10 4h4M11 8h2M12 9v11M8 13h8"/><path d="M18 4 8 21M17 3l2 1"/>'),
  'cell phone': v('<path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 5h8v12H8z"/><circle cx="12" cy="19.5" r=".7"/><path d="M9 7h6"/>'),
  chair: v('<path d="M7 4v8h10V4M6 12h12v4H6zM7 16v5M17 16v5M5 21h14M7 8h10"/>'),
  chandelier: v('<path d="M12 2v5M5 7h14M7 7v4M12 7v4M17 7v4M4 11h6v3H4zM9 11h6v3H9zM14 11h6v3h-6zM7 14v3M12 14v3M17 14v3"/><path d="M5 18h4M10 18h4M15 18h4M7 21h10"/>'),
  church: v('<path d="M4 21V9l8-5 8 5v12zM9 21v-7h6v7M11 4V2h2v3M12 2V1M4 10h16M7 9V6M17 9V6"/><path d="M11 16h2M12 14v5"/>'),
  circle: v('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
  clarinet: v('<path d="M6 4 18 20M5 5l2-2 2 2-2 2zM16 18l2-2 2 2-2 2z"/><path d="m9 8 2-2M11 11l2-2M13 14l2-2M15 17l2-2M8 9h2M10 12h2M12 15h2"/><path d="M4 3 3 2M20 22l1-1"/>'),
  clock: v('<path d="M7 3h10v18H7zM9 6h6v6H9zM12 8v2l2 1M9 15h2M13 15h2M9 18h2M13 18h2"/><path d="M10 2h4M10 22h4"/>'),
  cloud: v('<path d="M5 17a4 4 0 0 1 1-8 6 6 0 0 1 11-1 4 4 0 0 1 2 8zM8 19l-1 2M13 19l-1 2M18 19l-1 2"/>'),
  'coffee cup': v('<path d="M5 8h12v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM17 10h2a2 2 0 0 1 0 5h-2M8 5c-1-1 1-2 0-3M12 5c-1-1 1-2 0-3M14 5c-1-1 1-2 0-3"/>'),
  compass: v('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5zM12 3v2M12 19v2M3 12h2M19 12h2"/><circle cx="12" cy="12" r="1"/>'),
  cookie: v('<path d="M20 13a8 8 0 1 1-9-9c0 3 3 6 7 5 0 2 1 3 2 4z"/><circle cx="8" cy="10" r=".8"/><circle cx="13" cy="14" r=".8"/><circle cx="9" cy="17" r=".8"/><circle cx="15" cy="19" r=".8"/>'),
  cooler: v('<path d="M4 9h16l-1 11H5zM3 9l2-4h14l2 4M8 5V3h8v2M7 12v5M12 12v5M17 12v5"/><path d="M6 20v2M18 20v2"/>'),
  cow: v('<path d="M5 8 3 5l4 1M19 8l2-3-4 1M6 8c0-2 2-3 6-3s6 1 6 3v7a6 6 0 0 1-12 0zM8 12h2M14 12h2M9 17c2 2 4 2 6 0"/><path d="M8 21v2M16 21v2"/>'),
  crayon: v('<path d="m7 20 2 2 11-11-4-4L5 18zM16 7l3-3 4 4-3 3M5 18l-2 3 4-1M9 18l4 2M12 15l4 2M15 12l4 2"/>'),
  crocodile: v('<path d="M2 14c2-3 5-4 9-3l4-3 3 2 4-1v4l-4 2-4-1-3 3H6zM3 14h7M15 11l2 2M7 17v3M12 16v4M18 15v4"/><path d="M5 13v-2M8 12l1-2M11 12l1-2M14 11l1-2"/><circle cx="19" cy="12" r=".6"/>'),
  crown: v('<path d="m3 7 5 4 4-7 4 7 5-4-2 13H5zM5 17h14M3 7l1 2M21 7l-1 2"/><circle cx="3" cy="6" r="1"/><circle cx="12" cy="3" r="1"/><circle cx="21" cy="6" r="1"/>'),
  'cruise ship': v('<path d="M2 15h20l-3 5H6zM5 14V8h14v6M8 8V5h8v3M10 5V3h4v2M7 11h2M11 11h2M15 11h2M4 21h16"/><path d="M7 17h10"/>'),
  cup: v('<path d="M5 5h14v11a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM19 8h2v6h-2M8 8h8M8 12h8"/><path d="M9 2v2M15 2v2"/>'),
  dishwasher: v('<path d="M5 3h14v18H5zM7 6h10v3H7zM8 12h8v7H8zM10 13v5M14 13v5"/><circle cx="16.5" cy="4.5" r=".5"/>'),
  'diving board': v('<path d="M3 18h18M5 18V8h3v10M8 8h12v2H8M18 10v2M20 10v2M12 11v2M16 11v2"/><path d="M8 7h12M6 6h2"/>'),
  dolphin: v('<path d="M3 15c4-1 6-5 8-8 0 4 3 5 7 4l3-3v5l-3 2-5 1-3 4-2-4-5-1zM11 7l1-4 3 4M8 14l4 1"/><circle cx="17" cy="12" r=".6"/>'),
  dragon: v('<path d="M4 16c2-5 7-7 11-5l5-4-1 6 3 3-5 1-4-2-4 5-4-1 2-3zM15 11l2-4M17 12l4-2M8 15l-3-3M10 18v3M14 17v4"/><path d="M8 11 6 7l4 2M12 10l1-4 2 3"/>'),
  dresser: v('<path d="M5 3h14v18H5zM7 5h10v5H7zM7 12h10v6H7zM11 7h2M11 15h2M4 21h16"/><path d="M7 2h10M8 19v2M16 19v2"/>'),
  drill: v('<path d="M4 8h11l4 3-4 3H9v6H6v-6H4zM15 8V5h3v3M19 11h3v2h-3M5 8V5h4v3M8 14h4"/><path d="M6 20h4"/>'),
};

// Two additional SketchAI-original alternate views for classes with a source
// gap. These are deliberately different views/poses rather than recolors.
export const NEXT50_VARIANTS = {
  camouflage: [
    v('<path d="M3 4h18v16H3z"/><path d="M3 7c3-3 5-1 7 0s4 2 6 0 4-2 5 0M3 13c3-2 5-1 7 0s4 1 6 0 4-1 5 0M3 18c2-2 4-1 6 0s4 2 6 0 4-1 7 0"/>'),
    v('<path d="M4 3h16v18H4zM4 7l4-4M4 14 15 3M4 20 20 4M9 21 20 10M16 21l4-4"/><path d="M7 8h3M13 14h3M6 17h2"/>'),
  ],
  cello: [
    v('<path d="M8 6c-2 2-1 4 0 6l-2 3 2 6 4 2 4-2 2-6-2-3c1-2 2-4 0-6l-4-2zM10 5h4M12 5v15M9 13h6"/><path d="M19 4 8 22M18 3l2 1"/>'),
    v('<path d="M11 3c-2 1-3 4-1 6l-2 4 1 7 3 2 3-2 1-7-2-4c2-2 1-5-1-6zM10 6h4M12 8v12M9 13h6"/><path d="M5 8v12M4 8h2M4 20h2"/>'),
  ],
  chandelier: [
    v('<path d="M12 2v4M5 6h14M7 6v5M12 6v5M17 6v5M4 11h6v3H4zM9 11h6v3H9zM14 11h6v3h-6zM7 14v4M12 14v4M17 14v4M5 18h14M8 21h8"/>'),
    v('<path d="M12 2v4M4 6h16M6 6v4M10 6v6M14 6v6M18 6v4M4 10h4v3H4zM16 10h4v3h-4zM10 12h4v4h-4zM6 13v4M18 13v4M4 17h16M8 20h8"/><path d="M6 21h12"/>'),
  ],
  circle: [
    v('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="2"/>'),
    v('<circle cx="12" cy="12" r="8"/><path d="M8 5c2-2 6-2 8 0M5 9c-2 2-2 4 0 6M19 9c2 2 2 4 0 6M8 19c2 2 6 2 8 0"/>'),
  ],
  clarinet: [
    v('<path d="M7 3h4v3H7zM8 6v13l2 2 2-2V6M8 9h4M8 12h4M8 15h4M8 18h4M5 3h8M9 2v1"/><circle cx="10" cy="10" r=".5"/><circle cx="10" cy="13" r=".5"/><circle cx="10" cy="16" r=".5"/>'),
  ],
  cooler: [
    v('<path d="M4 8h16v12H4zM3 8l2-4h14l2 4M8 4V2h8v2M7 11h10v6H7zM8 20v2M16 20v2"/><path d="M9 13h6M9 15h6"/>'),
    v('<path d="M4 9h15v11H4zM3 8l2-4h14l2 4M6 7l3 2 3-2 3 2 3-2M7 12h9M7 15h9M7 18h4"/><path d="M18 9v11M5 20v2M17 20v2"/>'),
  ],
  crayon: [
    v('<path d="m5 18 11-11 4 4L9 22H5zM16 7l3-3 4 4-3 3M5 18l-2 4 4-1M9 14l3 3M12 11l3 3M15 8l3 3"/>'),
    v('<path d="M4 5h12v4H4zM16 5l4 2-4 2M4 5 2 7l2 2M6 9v12h8V9M8 12h4M8 15h4M8 18h4"/>'),
  ],
  crocodile: [
    v('<path d="M2 13c3-3 7-4 11-2l4-3 5 1v4l-5 2-5-1-3 4H5zM3 13h6M7 18v3M12 16v4M18 14v4M17 11l2 2"/><path d="M5 12v-2M8 11V9M11 11V9M14 11V9"/><circle cx="19" cy="11" r=".6"/>'),
    v('<path d="M3 15c2-4 6-6 10-5l4-4 4 2-2 4 3 2-4 2-5-1-3 4H5zM4 15h6M8 18v3M13 16v4M18 15v4"/><path d="m4 13 2-2 2 2M7 11l2-2 2 2M11 10l2-2 2 2"/><circle cx="18" cy="11" r=".6"/>'),
  ],
  'cruise ship': [
    v('<path d="M2 15h20l-4 5H6zM5 14V8h14v6M8 8V5h8v3M10 5V3h4v2M7 11h2M11 11h2M15 11h2M5 21h14"/>'),
    v('<path d="M3 16h18l-3 4H6zM6 15V9h12v6M8 9V6h8v3M11 6V4h2v2M8 12h2M14 12h2M7 21h10"/><path d="M3 16l3-2M21 16l-3-2M10 10h4"/>'),
  ],
  'diving board': [
    v('<path d="M3 19h18M5 19V8h3v11M8 8h13v2H8M18 10v4M20 10v4M11 11v3M14 11v3"/><path d="M8 7h13M4 6h4"/>'),
    v('<path d="M3 18h18M5 18V10h3v8M8 10h13v2H8M19 12v4M21 12v4M11 13v3M14 13v3"/><path d="M8 9h13M4 8h4"/>'),
  ],
  dresser: [
    v('<path d="M5 3h14v18H5zM7 5h10v4H7zM7 11h10v4H7zM7 17h10v2H7zM11 7h2M11 13h2"/><path d="M4 21h16M8 2h8"/>'),
    v('<path d="M4 5 17 3l3 2v16l-3 2-13-2zM6 7l11-1v4L6 11zM6 13l11 1v4L6 17zM10 9h2M10 15h2M4 23h15"/>'),
  ],
};
