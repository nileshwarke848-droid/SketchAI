// Additional clean artwork variants, drawn for this project.
//
// The bundled icon library (src/data/icons.js) gives every category exactly one
// picture. AutoDraw-style suggestion bars work better when a class offers a few
// visually distinct options, so this file adds hand-authored line-art variants
// for the categories that matter most in a demo.
//
// Licence: these paths are original artwork created for SketchAI, MIT-licensed
// with the rest of the project. Nothing here is scraped from AutoDraw or any
// other artist collection.
//
// Style: 24x24 viewBox, stroke-based line art with no fill unless a shape needs
// it. The literal token STROKE is replaced with the current brush colour at
// render time, so inserted artwork matches what the user drew with.
//
// `VARIANT_SETS` is keyed by the canonical Quick, Draw! label (spaces, lower
// case). The bundled icon always stays variant #1; entries here follow it.

/**
 * Wraps paths in a group with the shared line style.
 * @param {string} body
 * @param {{fill?: string}} [options]
 */
function strokes(body, options = {}) {
  const fill = options.fill ?? 'none';
  return (
    `<g stroke="STROKE" fill="${fill}" stroke-width="1.6" ` +
    `stroke-linecap="round" stroke-linejoin="round">${body}</g>`
  );
}

/** A solid (filled) accent, e.g. eyes or a flower centre. */
function solid(body) {
  return `<g fill="STROKE" stroke="none">${body}</g>`;
}

const SIZE = { w: 24, h: 24 };

/** Convenience: a variant body plus its 24x24 box. */
function v(body) {
  return { ...SIZE, b: body };
}

// ---------------------------------------------------------------------------
// HIGH PRIORITY — two extra variants each (3 total with the bundled icon)
// ---------------------------------------------------------------------------

const HIGH_PRIORITY = {
  sun: [
    v(
      strokes('<circle cx="12" cy="12" r="4.6"/>') +
        strokes(
          '<path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6"/>' +
            '<path d="M5.1 5.1l1.9 1.9M17 17l1.9 1.9M18.9 5.1L17 7M7 17l-1.9 1.9"/>',
        ),
    ),
    v(
      strokes(
        '<path d="M2.5 20.5h19"/>' +
          '<path d="M6.5 20.5a5.5 5.5 0 0 1 11 0"/>' +
          '<path d="M12 3.5v3M5.6 6.6l1.9 1.9M18.4 6.6l-1.9 1.9"/>',
      ),
    ),
  ],

  flower: [
    v(
      strokes(
        '<circle cx="12" cy="6.6" r="2.9"/><circle cx="16.1" cy="9.6" r="2.9"/>' +
          '<circle cx="14.4" cy="14.8" r="2.9"/><circle cx="9.6" cy="14.8" r="2.9"/>' +
          '<circle cx="7.9" cy="9.6" r="2.9"/>',
        { strokeWidth: 1.5 },
      ) + strokes('<path d="M12 17v5.5"/>') +
      strokes('<path d="M12 18.8c2.6 0 4.2-1.3 4.4-3.6-2.5-.6-4.1.7-4.4 3.6z"/>'),
    ),
    v(
      strokes(
        '<path d="M12 15V21"/>' +
          '<path d="M8.6 8.6c0 3.8 1.5 6.4 3.4 6.4s3.4-2.6 3.4-6.4c0 0-2.2-1.8-3.4-1.8S8.6 8.6 8.6 8.6z"/>' +
          '<path d="M12 17.6c-3.2.2-4.8-1.4-5.2-3.6 2.6-.8 4.4.4 5.2 3.6z"/>' +
          '<path d="M12 17.6c3.2.2 4.8-1.4 5.2-3.6-2.6-.8-4.4.4-5.2 3.6z"/>',
      ),
    ),
  ],

  tree: [
    v(
      strokes('<path d="M12 16.5V21"/>') +
        strokes(
          '<path d="M12 3.5c3.9 0 7 2.7 7 6 0 3.4-3.1 5.5-7 5.5s-7-2.1-7-5.5c0-3.3 3.1-6 7-6z"/>',
        ),
    ),
    v(
      strokes(
        '<path d="M12 2.8 7 9.5h10z"/><path d="M12 8.5 5.5 16h13z"/><path d="M12 21v-5"/>',
      ),
    ),
  ],

  house: [
    v(
      strokes(
        '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10.5V20h13v-9.5"/>' +
          '<path d="M10 20v-5h4v5"/>',
      ),
    ),
    v(
      strokes(
        '<path d="M2.5 12 12 4.5 21.5 12"/><path d="M5 10.5V20h14v-9.5"/>' +
          '<path d="M15.5 4.8h2.6v3.8"/><path d="M10 20v-4.5h4V20"/>' +
          '<path d="M6.6 12.6h2.6v2.6H6.6z"/>',
      ),
    ),
  ],

  cat: [
    v(
      strokes(
        '<path d="M7.8 7.6 6 3.2l4.6 2.2"/><path d="M16.2 7.6 18 3.2l-4.6 2.2"/>' +
          '<circle cx="12" cy="11" r="5"/>' +
          '<path d="M8.4 15.4c0 0-1 5 3.6 5s3.6-5 3.6-5"/>' +
          '<path d="M15.6 18.6c2.6.6 4.2-1 4.7-3.2"/>',
      ) + solid('<circle cx="10.1" cy="10.2" r=".95"/><circle cx="13.9" cy="10.2" r=".95"/>') +
      strokes('<path d="M12 12.4v1"/>', { strokeWidth: 1.4 }),
    ),
    v(
      strokes(
        '<path d="M5.6 10.6C5.6 6.4 8.5 3 12 3s6.4 3.4 6.4 7.6c0 4.4-2.9 7.9-6.4 7.9s-6.4-3.5-6.4-7.9z"/>' +
          '<path d="M6.9 6.3 5.1 2.6l4.2 1.8"/><path d="M17.1 6.3 18.9 2.6l-4.2 1.8"/>' +
          '<path d="M12 12.6c-1 1.2-2.6 1.2-3.6 0M12 12.6c1 1.2 2.6 1.2 3.6 0"/>' +
          '<path d="M3 11.4h2.4M18.6 11.4H21M4.2 14.4l2.1-.9M19.8 14.4l-2.1-.9"/>',
      ) + solid('<circle cx="9.7" cy="10.3" r="1"/><circle cx="14.3" cy="10.3" r="1"/>'),
    ),
  ],

  dog: [
    v(
      strokes(
        '<path d="M6.6 9.4C5.4 4.8 7.2 3.4 8.6 5.2c.9 1.2 1.6 2.6 1.6 2.6"/>' +
          '<path d="M17.4 9.4c1.2-4.6-.6-6-2-4.2-.9 1.2-1.6 2.6-1.6 2.6"/>' +
          '<circle cx="12" cy="11.4" r="5.1"/>' +
          '<path d="M8.5 15.8c0 0-.9 4.8 3.5 4.8s3.5-4.8 3.5-4.8"/>' +
          '<path d="M15.8 18.4c2.8 0 4-1.4 4.2-3"/>',
      ) + solid('<circle cx="10.1" cy="10.4" r=".95"/><circle cx="13.9" cy="10.4" r=".95"/><ellipse cx="12" cy="13.1" rx="1.5" ry="1.1"/>'),
    ),
    v(
      strokes(
        '<path d="M4.8 8.2c0-3 2.4-5 5.4-5h3.6c3 0 5.4 2 5.4 5 0 3.6-2.2 6.4-5 6.4' +
          '-.9 1.6-1.6 3-1.6 4.4h-3.2c0-1.4-.7-2.8-1.6-4.4-2.8 0-5-2.8-5-6.4z"/>' +
          '<path d="M6.2 12.4c1.4 1 3.4 1 4.6 0M13.2 12.4c1.2 1 3.2 1 4.6 0"/>',
      ) + solid('<circle cx="9.4" cy="8.6" r="1"/><circle cx="14.6" cy="8.6" r="1"/><circle cx="12" cy="11.2" r="1.2"/>'),
    ),
  ],

  car: [
    v(
      strokes(
        '<path d="M2.5 15.5h19"/>' +
          '<path d="M4 15.5V13l2-4.5h12l2 4.5v2.5"/>' +
          '<path d="M6.6 8.5h10.8"/>' +
          '<path d="M7 15.5v0M17 15.5v0"/>',
      ) + solid('<circle cx="7.2" cy="16.2" r="1.7"/><circle cx="16.8" cy="16.2" r="1.7"/>'),
    ),
    v(
      strokes(
        '<path d="M5 17.5h14"/>' +
          '<path d="M5.5 17.5V11l2-1h9l2 1v6.5"/>' +
          '<path d="M7.5 10.2 8.4 6h7.2l.9 4.2"/>' +
          '<path d="M8.5 12.8h7"/>',
      ) + solid('<circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/>'),
    ),
  ],

  bus: [
    v(
      strokes(
        '<path d="M3 5.5h18v11H3z"/>' +
          '<path d="M3 10.5h18"/>' +
          '<path d="M6.5 10.5v6M11 10.5v6M15.5 10.5v6"/>' +
          '<path d="M5 16.5v2M19 16.5v2"/>',
      ) + solid('<circle cx="7" cy="18.8" r="1.4"/><circle cx="17" cy="18.8" r="1.4"/>'),
    ),
    v(
      strokes(
        '<path d="M4 4.5h16v13H4z"/>' +
          '<path d="M4 9h16"/>' +
          '<path d="M7.5 4.5v4.5M12 4.5v4.5M16.5 4.5v4.5"/>' +
          '<path d="M8 17.5v1.5M16 17.5v1.5"/>' +
          '<path d="M12 11.5v2.5"/>',
      ) + solid('<circle cx="7.5" cy="19.5" r="1.2"/><circle cx="16.5" cy="19.5" r="1.2"/>'),
    ),
  ],

  airplane: [
    v(
      strokes(
        '<path d="M2.5 13.5 21 8.5l-1.6 3.2L21 15l-18.5-1.5z"/>' +
          '<path d="M8.5 12.5 11 3.5l2.2.6L11.6 12.4"/>' +
          '<path d="M8.5 13.2 11 20l2.2-.6-1.6-6.6"/>',
      ),
    ),
    v(
      strokes(
        '<path d="M12 2.5c1 0 1.6 1.2 1.6 3v3.2l7.4 4.3v2.2l-7.4-2.2v3.6l2.6 1.8v1.5L12 19l-4.2.9v-1.5l2.6-1.8v-3.6L3 15.2V13l7.4-4.3V5.5c0-1.8.6-3 1.6-3z"/>',
        { strokeWidth: 1.4 },
      ),
    ),
  ],

  fish: [
    v(
      strokes(
        '<path d="M2.5 12c3-4 7-6 10.5-6 3.6 0 6.5 2.7 6.5 6s-2.9 6-6.5 6C9.5 18 5.5 16 2.5 12z"/>' +
          '<path d="M19.5 12 22.5 8v8z"/>',
      ) + solid('<circle cx="7.5" cy="10.8" r="1"/>') +
      strokes('<path d="M13 12c1.2-1.4 2.8-2 4.5-1.8"/>', { strokeWidth: 1.3 }),
    ),
    v(
      strokes(
        '<path d="M3 12c2.5-3.5 6-5.5 9.5-5.5 3.8 0 6.9 2.5 6.9 5.5S16.3 17.5 12.5 17.5C9 17.5 5.5 15.5 3 12z"/>' +
          '<path d="M19.4 12c1.4-2 2.6-3 3.6-3v6c-1 0-2.2-1-3.6-3z"/>' +
          '<path d="M11 6.8c1.2 1.8 1.2 8.6 0 10.4"/>' +
          '<path d="M8 9.5c1.2 1 1.6 3.4 1 5"/>',
      ) + solid('<circle cx="6.6" cy="11" r="1"/>'),
    ),
  ],

  umbrella: [
    v(
      strokes(
        '<path d="M2.5 12a9.5 9.5 0 0 1 19 0z"/>' +
          '<path d="M12 12v7c0 1.4-1.6 2-2.6 2.6"/>' +
          '<path d="M12 12V3.2"/>' +
          '<path d="M8 12c0-2.2 1.8-4 4-4s4 1.8 4 4"/>',
        { strokeWidth: 1.5 },
      ),
    ),
    v(
      strokes(
        '<path d="M3.5 11.5c0-4.7 3.8-8.5 8.5-8.5s8.5 3.8 8.5 8.5z"/>' +
          '<path d="M12 11.5V20c0 1.2-1.4 1.8-2.4 2.4"/>' +
          '<path d="M5.6 11.5c1.6 0 1.6-2.5 3.2-2.5s1.6 2.5 3.2 2.5 1.6-2.5 3.2-2.5 1.6 2.5 3.2 2.5"/>',
        { strokeWidth: 1.5 },
      ),
    ),
  ],
};

// ---------------------------------------------------------------------------
// SECOND PRIORITY — one extra variant each (2 total with the bundled icon)
// ---------------------------------------------------------------------------

const SECOND_PRIORITY = {
  train: [
    v(
      strokes(
        '<path d="M5 3.5h11v10H5z"/><path d="M16 6.5h2.5l1.5 3v4H16"/>' +
          '<path d="M7 6.5h7v4H7z"/>' + '<path d="M6 13.5v2M14 13.5v2M19 13.5v2"/>' +
          '<path d="M3 17.5h15"/>',
      ) + solid('<circle cx="7.5" cy="16.4" r="1.1"/><circle cx="14.5" cy="16.4" r="1.1"/>'),
    ),
  ],
  shoe: [
    v(
      strokes(
        '<path d="M2.5 16.5v-4l4-.5 3-3 4.5.5c2.5.3 4.5 1.4 5.5 3l1.5 3-2 1H4z"/>' +
          '<path d="M6.5 12.5l3 2.2M9.5 11.8l2.6 2.2"/>',
        { strokeWidth: 1.5 },
      ),
    ),
  ],
  guitar: [
    v(
      strokes(
        '<path d="M14.5 2.5 21.5 9.5"/>' +
          '<path d="M13 4c-3.4 1.6-5.4 4.4-5 7.2.4 2.6 2.6 4.4 5.2 4.2 2.6-.2 4.4-2.4 4.2-5-.2-2.6-2.2-4.6-4.4-5.6z"/>' +
          '<path d="M8.6 8.4 15 14.8"/>',
      ) + solid('<circle cx="12.2" cy="10.6" r="2"/>'),
    ),
  ],
  elephant: [
    v(
      strokes(
        '<path d="M4 8.5c0-3 2.6-5 6-5 2 0 3.6.8 4.6 2 1.4-.6 3 .2 3.4 1.8.4 1.6-.4 3-1.6 3.6' +
          ' 0 .6 0 1.2-.2 1.8-.6 3-3.4 5.3-6.8 5.3-3.2 0-5.4-2-5.4-4.6V12c0-.6 0-1.2.2-1.8' +
          'C3.6 9.4 4 9 4 8.5z"/>' +
          '<path d="M7.5 13.5c0 3 1 5 2.6 6.5"/>' +
          '<path d="M15.5 13.8c0 2.8.8 4.8 2.2 6.2"/>' +
          '<path d="M6 18.5c.6 1 1.4 1.6 2.4 1.8"/>',
      ) + solid('<circle cx="8" cy="7.6" r=".9"/>'),
    ),
  ],
  lion: [
    v(
      strokes(
        '<path d="M4.5 8c0-4 3.3-6.5 7.5-6.5S19.5 4 19.5 8c0 3.2-2 5.8-4.6 6.6' +
          '.2.8.4 1.6.4 2.4 0 .8-.2 1.4-.6 2-2 1-5 1-7 0-.4-.6-.6-1.2-.6-2 0-.8.2-1.6.4-2.4C6.5 13.8 4.5 11.2 4.5 8z"/>' +
          '<path d="M6.5 8.5c.8 0 1.4.6 1.4 1.4M16.1 8.5c.8 0 1.4.6 1.4 1.4"/>' +
          '<path d="M9.5 11.4c.6.6 1.5.6 2.1 0M12.4 11.4c.6.6 1.5.6 2.1 0"/>',
      ) + solid('<circle cx="9.5" cy="8.4" r=".9"/><circle cx="14.5" cy="8.4" r=".9"/><ellipse cx="12" cy="12.6" rx="1.2" ry=".9"/>'),
    ),
  ],
  bicycle: [
    v(
      strokes(
        '<circle cx="5.5" cy="16" r="4"/><circle cx="18.5" cy="16" r="4"/>' +
          '<path d="M5.5 16 10 8h5l3.5 8"/>' +
          '<path d="M9 8h6"/>' +
          '<path d="M13.5 8l1.5-3h2.5"/>' +
          '<path d="M12 8v8"/>',
      ),
    ),
  ],
  bird: [
    v(
      strokes(
        '<path d="M4 15.5c0-4 3.4-7 8-7 3 0 5.4 1.4 6.8 3.6l3.7-.6-2 3 1 2.6-3.4-.4c-.8.8-1.8 1.4-3 1.7v3.1l-2.5-1.8L11.5 21v-3.2C7.4 17 4 16.6 4 15.5z"/>',
        { strokeWidth: 1.5 },
      ) + solid('<circle cx="13.6" cy="12.4" r=".9"/>') +
      strokes('<path d="M17.4 13.4l2.4 1"/>', { strokeWidth: 1.3 }),
    ),
  ],
  // Quick, Draw! has no plain "boat" — the sailboat is the canonical label.
  sailboat: [
    v(
      strokes(
        '<path d="M3 15.5h18l-2.5 4.5H5.5z"/>' +
          '<path d="M12 15.5V4"/>' +
          '<path d="M12 5.5 19 13"/>' +
          '<path d="M13.5 6 8 13"/>',
      ),
    ),
  ],
  chair: [
    v(
      strokes(
        '<path d="M7 3.5v9"/><path d="M7 12.5h10"/>' +
          '<path d="M17 3.5v17"/><path d="M7 12.5v8"/>' +
          '<path d="M7 8.5h3"/>',
      ),
    ),
  ],
  clock: [
    v(
      strokes(
        '<circle cx="12" cy="12" r="8.5"/>' +
          '<path d="M12 6.5V12l4 2.5"/>' +
          '<path d="M12 1.8v1.6M22.2 12h-1.6M12 22.2v-1.6M1.8 12h1.6"/>',
      ),
    ),
  ],
  cloud: [
    v(
      strokes(
        '<path d="M6 18.5a4 4 0 0 1 .3-8 5.5 5.5 0 0 1 10.4 1.2 3.4 3.4 0 0 1-.4 6.8z"/>',
      ),
    ),
  ],
  cup: [
    v(
      strokes(
        '<path d="M4.5 5.5h12v7a6 6 0 0 1-12 0z"/>' +
          '<path d="M16.5 7.5h2a2.5 2.5 0 0 1 0 5h-2"/>' +
          '<path d="M3 21h15"/>',
      ),
    ),
  ],
  door: [
    v(
      strokes(
        '<path d="M6 21V3.5h12V21"/>' +
          '<path d="M4.5 21h15"/>' +
          '<path d="M14 12.5v1"/>',
      ) + solid('<circle cx="14" cy="12.6" r=".9"/>'),
    ),
  ],
  eye: [
    v(
      strokes(
        '<path d="M2 12c3-4.5 6.5-6.5 10-6.5S19 7.5 22 12c-3 4.5-6.5 6.5-10 6.5S5 16.5 2 12z"/>',
      ) + solid('<circle cx="12" cy="12" r="3"/>'),
    ),
  ],
  face: [
    v(
      strokes(
        '<circle cx="12" cy="12" r="9"/>' +
          '<path d="M8.5 14.5c.9 1.6 2.1 2.4 3.5 2.4s2.6-.8 3.5-2.4"/>',
      ) + solid('<circle cx="9" cy="10" r="1.1"/><circle cx="15" cy="10" r="1.1"/>'),
    ),
  ],
  hand: [
    v(
      strokes(
        '<path d="M9 12V4.5a1.6 1.6 0 0 1 3.2 0V11"/>' +
          '<path d="M12.2 11V3.6a1.6 1.6 0 0 1 3.2 0V11"/>' +
          '<path d="M15.4 11V5.4a1.6 1.6 0 0 1 3.2 0V14c0 4-2.6 7-6.4 7-3 0-4.4-1.6-5.4-3.6L4 13.4a1.6 1.6 0 0 1 2.6-1.8L9 14"/>',
        { strokeWidth: 1.4 },
      ),
    ),
  ],
  // "heart" is not a Quick, Draw! category (checked against the canonical 345
  // and the 100-class fallback), so this slot went to a tier-C label that
  // otherwise renders as a text-only card.
  'baseball bat': [
    v(
      strokes(
        '<path d="M12 21v-2"/>' +
          '<path d="M9.8 19c-.4-3.2-.5-6 0-8.2.3-1.3.9-2.3 1.3-3.4-.5-.9-.6-1.9-.3-2.9.5-1.5 1.7-.9 2.5-.9s2-.6 2.5.9c.3 1 .2 2-.3 2.9.4 1.1 1 2.1 1.3 3.4.5 2.2.4 5 0 8.2"/>' +
          '<path d="M9.8 19a2.2 2.2 0 0 0 4.4 0"/>',
      ),
    ),
  ],
  key: [
    v(
      strokes(
        '<circle cx="8" cy="8" r="4.5"/>' +
          '<path d="M11.2 11.2 20 20"/>' +
          '<path d="M17 17l2-2M19 19l2-2"/>',
      ),
    ),
  ],
  moon: [
    v(
      strokes(
        '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
      ),
    ),
  ],
  // Canonical label is "cell phone" (there is also "telephone").
  'cell phone': [
    v(
      strokes(
        '<path d="M7.5 2.5h9v19h-9z"/>' +
          '<path d="M10.5 5.5h3"/>' +
          '<path d="M11 18.5h2"/>',
      ),
    ),
  ],
  star: [
    v(
      strokes(
        '<path d="M12 2.8l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.6l6.5-.9z"/>',
      ),
    ),
  ],
  table: [
    v(
      strokes(
        '<path d="M2.5 9.5h19"/><path d="M5 9.5V21M19 9.5V21"/>' +
          '<path d="M2.5 9.5 5 5h14l2.5 4.5"/>',
      ),
    ),
  ],
};

/** Every extra variant, keyed by canonical label. */
export const VARIANT_SETS = { ...HIGH_PRIORITY, ...SECOND_PRIORITY };

/** Categories with at least one hand-authored variant. */
export const VARIANT_LABELS = Object.keys(VARIANT_SETS);

/** Total number of hand-authored variants in this file. */
export const VARIANT_COUNT = Object.values(VARIANT_SETS).reduce(
  (total, list) => total + list.length,
  0,
);
