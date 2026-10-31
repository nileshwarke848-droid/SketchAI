// Small number of original Batch-1 drawings for classes with no reasonable
// accurate, style-matched open-source option. These are hand-drawn SVG paths,
// not scraped, generated from images, or copied from Google AutoDraw.
//
// The exact-source search is documented in scripts/oss-art-variant-map.mjs and
// scripts/oss-art-sources.mjs. Where a library has an accurate clean drawing,
// that source is preferred. These local drawings use the same 24×24 grid and
// STROKE token as the imported artwork so preview and insertion stay identical.

const SIZE = { w: 24, h: 24 };
const pen = (body, width = 1.45) =>
  `<g fill="none" stroke="STROKE" stroke-width="${width}" ` +
  'stroke-linecap="round" stroke-linejoin="round">' + body + '</g>';
const dot = (body) => `<g fill="STROKE" stroke="none">${body}</g>`;
const art = (body) => ({ ...SIZE, b: body });

export const BATCH1_DERIVED_ART = {
  // There is no licensed whole-angel drawing in the pinned sources: the nearest
  // Game Icons entries are only wings or clothing. This one shows a full figure,
  // halo, and feathered wings rather than pretending that wings alone are an angel.
  angel: art(
    pen('<ellipse cx="12" cy="3.1" rx="3.3" ry="1.05"/>')
    + pen('<circle cx="12" cy="6.5" r="2.15"/>')
    + pen('<path d="M9.8 9.1 7.2 12.5l1.5 1.2M14.2 9.1l2.6 3.4-1.5 1.2"/>')
    + pen('<path d="M9.8 9.1h4.4l2 8.8H7.8z"/>')
    + pen('<path d="M9.4 17.9 8.2 21M14.6 17.9l1.2 3.1M8.2 21h3M12.8 21h3"/>')
    + pen('<path d="M8.1 10.2c-2.2-1.4-4.6-.7-5.5 1.5-.9 2.2.2 4.6 2.3 5.1 1.2.3 2.4-.2 3.1-1.3M15.9 10.2c2.2-1.4 4.6-.7 5.5 1.5.9 2.2-.2 4.6-2.3 5.1-1.2.3-2.4-.2-3.1-1.3"/>')
    + pen('<path d="M5.1 12.1 6.8 13M4.8 14.1l2 .2M18.9 12.1l-1.7.9M19.2 14.1l-2 .2"/>'),
  ),

  // No source depicts a migrating group. This makes the meaning explicit as a
  // flock moving in a loose V, not a paw-print or one unrelated animal.
  'animal migration': art(
    // The classic open M-shaped bird marks read as a flock while staying light
    // and line-drawn at card size. The leader sits at the point of the V.
    pen('<path d="M7.4 6.8c1.5-1.7 3-1.7 4.5 0 1.5-1.7 3-1.7 4.5 0"/>', 1.2)
    + pen('<path d="M2.8 11.6c1.1-1.3 2.2-1.3 3.3 0 1.1-1.3 2.2-1.3 3.3 0"/>', 1.15)
    + pen('<path d="M14.6 11.6c1.1-1.3 2.2-1.3 3.3 0 1.1-1.3 2.2-1.3 3.3 0"/>', 1.15)
    + pen('<path d="M1.6 17c.8-1 1.6-1 2.4 0 .8-1 1.6-1 2.4 0"/>', 1.1)
    + pen('<path d="M17.6 17c.8-1 1.6-1 2.4 0 .8-1 1.6-1 2.4 0"/>', 1.1),
  ),

  // No pinned library has a bottle cap. The ridged circular rim and crimp marks
  // distinguish this from a coin or a plain circle.
  bottlecap: art(
    // Side view of a shallow metal cap: domed top, short shell, and the crimped
    // skirt that distinguishes it from a gear or coin.
    pen('<path d="M4.8 9.2c0-2.2 3.2-4 7.2-4s7.2 1.8 7.2 4v2.2c0 .8-.5 1.4-1.3 1.8v1.3c0 .7-.6 1.2-1.3 1.5v1.2c0 .9-1.9 1.6-4.6 1.6s-4.6-.7-4.6-1.6V16c-.7-.3-1.3-.8-1.3-1.5v-1.3c-.8-.4-1.3-1-1.3-1.8z"/>')
    + pen('<path d="M4.8 9.2c0 2.2 3.2 4 7.2 4s7.2-1.8 7.2-4"/>')
    + pen('<path d="M7.2 13.4v1.3M9.1 14.3v1.4M11 14.8v1.3M13 14.8v1.3M14.9 14.3v1.4M16.8 13.4v1.3"/>', 1.1)
    + pen('<path d="M9 8.6c.8-.6 1.8-.9 3-.9s2.2.3 3 .9"/>', 1.1),
  ),

  // The nearest source is a ring icon, not a bracelet. Beads and a small clasp
  // make this an honest wrist bracelet rather than a jewelry-category guess.
  bracelet: art(
    // A loop of individual beads and a small clasp; no circular "watch face".
    pen('<path d="M6.1 7.2c1.8-1.8 3.7-2.5 5.9-2.5M14 4.9c2.1.4 3.7 1.3 5.1 2.9M19.2 9c.8 1.7 1 3.4.5 5.1M18.8 15.8c-1 1.6-2.4 2.7-4.2 3.4M12.7 19.7c-2 .1-3.8-.4-5.3-1.6M6.2 16.7c-1.1-1.4-1.7-3-1.7-4.8M4.8 10c.2-1 .6-1.9 1.3-2.8"/>', 0.72)
    + pen('<circle cx="6.1" cy="7.2" r="1.35"/><circle cx="9.1" cy="5.3" r="1.35"/><circle cx="12.5" cy="4.8" r="1.35"/><circle cx="15.9" cy="5.8" r="1.35"/><circle cx="18.7" cy="8.7" r="1.35"/><circle cx="19.7" cy="12.1" r="1.35"/><circle cx="18.4" cy="15.7" r="1.35"/><circle cx="15.3" cy="18.7" r="1.35"/><circle cx="11.8" cy="19.1" r="1.35"/><circle cx="8.3" cy="17.8" r="1.35"/><circle cx="5.2" cy="14.7" r="1.35"/><circle cx="4.7" cy="11.2" r="1.35"/>', 0.72)
    + pen('<path d="M11.1 3.5h1.8v.9h-1.8zM11.5 2.8h1v.7h-1z"/>', 0.72),
  ),

  // There is no blackberry drawing in the pinned libraries. A compound berry
  // with visible drupelets and a leaf is used instead of re-labelling grapes.
  blackberry: art(
    pen('<path d="M11.7 7.2c-2.5-2.4-5.9-2.2-7.4.4-1.4 2.4-.3 5.1 1.8 6.5-.7 2.5.8 4.8 3.2 5.1 1.8 1.9 4.9 1.7 6.3-.3 2.7.1 4.4-2.4 3.4-4.8 1.6-2.3.5-5.1-1.8-6.1-.8-2.5-3.5-3.3-5.5-.8z"/>')
    + pen('<path d="M11.8 7.1c.6-2.1 2.2-3.4 4.6-3.6-.8 1.7-2 2.8-3.5 3.4M12.2 7c-.2-1.8-1.2-3-2.9-3.6.1 1.7.9 2.8 2.9 3.6"/>')
    + dot('<circle cx="7.7" cy="9.6" r=".45"/><circle cx="11.4" cy="9.2" r=".45"/><circle cx="15" cy="10" r=".45"/><circle cx="6.8" cy="13" r=".45"/><circle cx="10.1" cy="12.4" r=".45"/><circle cx="13.8" cy="13" r=".45"/><circle cx="9.1" cy="16" r=".45"/><circle cx="12.5" cy="16.5" r=".45"/>'),
  ),

  // Blueberries get the characteristic small crown at the blossom end; not a
  // grape bunch recoloured as another berry.
  blueberry: art(
    // Three clustered round berries with the small blossom-end crown, no stems
    // or leaves that would make them read as cherries or grapes.
    pen('<circle cx="7.1" cy="14.7" r="3.7"/><circle cx="16.8" cy="14.8" r="3.7"/><circle cx="12" cy="8.1" r="3.7"/>')
    + pen('<path d="M5.8 10.8l.8-.9.9.5.3-1 .8.8 1-.2-.3 1 .8.7-1 .3-.2 1-.8-.7-.9.3.1-1.1-.8-.6z"/>', 0.9)
    + pen('<path d="M15.5 10.9l.8-.9.9.5.3-1 .8.8 1-.2-.3 1 .8.7-1 .3-.2 1-.8-.7-.9.3.1-1.1-.8-.6z"/>', 0.9)
    + pen('<path d="M10.7 4.1l.8-.9.9.5.3-1 .8.8 1-.2-.3 1 .8.7-1 .3-.2 1-.8-.7-.9.3.1-1.1-.8-.6z"/>', 0.9),
  ),

  // No suitable cello source is in the pinned sets (the existing violin is a
  // different instrument). This is a full-size cello outline with neck, bridge,
  // strings and f-holes, not a violin relabelled as a cello.
  cello: art(
    pen('<path d="M9.1 7.2h5.8v3c1.3.9 2 2.3 1.7 3.8l-.6 2.4c-.3 1.2.8 2 1 3.1.2 1.5-1.9 2.7-5 2.7s-5.2-1.2-5-2.7c.2-1.1 1.3-1.9 1-3.1l-.6-2.4c-.3-1.5.4-2.9 1.7-3.8z"/>')
    + pen('<path d="M10 7.2V3.3h4v3.9M9.2 4.2H7.7M14.8 4.2h1.5M9.2 5.8H8M14.8 5.8H16"/>')
    + pen('<path d="M11 7.2v11.3M13 7.2v11.3M9.4 14.2h5.2M9.6 17.8c.6 1.3 1.4 1.9 2.4 1.9s1.8-.6 2.4-1.9"/>')
    + pen('<path d="M9.7 13.2c-.9.8-.9 1.7 0 2.4M14.3 13.2c.9.8.9 1.7 0 2.4"/>'),
  ),

  // The sole exact-name source is a heavy silhouette. This clean outline adds
  // the mouthpiece, long keyed body, and flared bell so the class reads as a
  // clarinet rather than a dark, featureless woodwind glyph.
  clarinet: art(
    pen('<path d="M10.7 3.2h2.6l-.3 2.1h-2zM10.9 5.3h2.2l.9 12.1 2.4 3.4H7.6l2.4-3.4z"/>', 1.0)
    + pen('<path d="M10.6 7.3h2.8M10.8 17.3h3.8M9.2 20.8h5.6"/>', 0.95)
    + pen('<path d="M9.8 8.8h1M9.7 11.4h1M9.6 14h1M14 8.2h1M14.2 10.9h1M14.4 13.6h1"/>', 0.95)
    + dot('<circle cx="12" cy="8.5" r=".28"/><circle cx="12.1" cy="10.6" r=".28"/><circle cx="12.3" cy="12.8" r=".28"/><circle cx="12.4" cy="15" r=".28"/>'),
  ),

  // A clean wax crayon is not available in the pinned libraries; the brush icon
  // formerly used for this class was a paintbrush, not a crayon.
  crayon: art(
    pen('<path d="M3 12 7.3 7.7h12.2l1.7 4.3-1.7 4.3H7.3z"/>')
    + pen('<path d="M3 12 7.3 7.7v8.6zM10 7.7v8.6M17.8 7.7v8.6"/>')
    + pen('<path d="M8.2 11.9h.1"/>', 1.2),
  ),

  // Game Icons is the only exact cooler source but its dense silhouette is too
  // glyph-like for the primary. This clean line drawing is primary; the licensed
  // source remains available as a secondary option.
  cooler: art(
    pen('<path d="M4 8.2h16v12.6H4z"/>')
    + pen('<path d="M3 7h18v2H3zM7 7V5.2h10V7"/>')
    + pen('<path d="M9.4 12.2h5.2v4.6H9.4zM10.6 14.4h2.8M5.8 11.2v6.8M18.2 11.2v6.8"/>')
    + pen('<path d="M12 10.6v1.3M12 17v1.3"/>', 1.15),
  ),

  // The former pool icon was not a diving board. No approved source has the
  // object itself, so this shows the spring board, its support, and pool water.
  'diving board': art(
    pen('<path d="M3.4 6.2h17.2l-.8 1.6H4.1z"/>')
    + pen('<path d="M7.1 7.8v8.1M7.1 15.9h4.2M11.3 15.9v-4.4M11.3 11.5h3.2"/>')
    + pen('<path d="M3 18.3c1.6-.8 3.2-.8 4.8 0s3.2.8 4.8 0 3.2-.8 4.8 0 3.2.8 4.8 0"/>')
    + pen('<path d="M3 21c1.6-.8 3.2-.8 4.8 0s3.2.8 4.8 0 3.2-.8 4.8 0 3.2.8 4.8 0"/>', 1.2),
  ),

  // The exact MDI dresser glyph is a dense filled cabinet; the outline variant
  // is still too heavy at card size. A clear three-drawer chest avoids switching
  // the class to a wardrobe or filing cabinet.
  dresser: art(
    pen('<path d="M4.6 4.4h14.8v14.8H4.6z"/>')
    + pen('<path d="M4.6 9.3h14.8M4.6 14.2h14.8"/>')
    + pen('<circle cx="10" cy="6.9" r=".42"/><circle cx="14" cy="6.9" r=".42"/>')
    + pen('<circle cx="10" cy="11.8" r=".42"/><circle cx="14" cy="11.8" r=".42"/>')
    + pen('<circle cx="10" cy="16.7" r=".42"/><circle cx="14" cy="16.7" r=".42"/>')
    + pen('<path d="M6.2 19.2v1.4M17.8 19.2v1.4M5.7 20.6h1M17.3 20.6h1"/>'),
  ),

  // The libraries have generic ship symbols but no cruise liner. This liner has
  // several passenger decks/windows and a long hull; it is primary, while the
  // existing imported ship and SketchAI line-art remain as alternatives.
  'cruise ship': art(
    pen('<path d="M2.6 16.2h18.8l-2.1 3.5H5z"/>')
    + pen('<path d="M4.6 16.2V9.2h14.8v7M7.2 9.2V6.4h9.6v2.8M9.2 6.4V4.5h5.6v1.9"/>')
    + pen('<path d="M6.4 11.2h1.2M9.4 11.2h1.2M12.4 11.2h1.2M15.4 11.2h1.2M6.4 13.6h1.2M9.4 13.6h1.2M12.4 13.6h1.2M15.4 13.6h1.2"/>', 1.1)
    + pen('<path d="M3 21c1.6-.7 3.2-.7 4.8 0s3.2.7 4.8 0 3.2-.7 4.8 0 3.2.7 4.8 0"/>', 1.2),
  ),
};

export const BATCH1_DERIVED_LABELS = Object.keys(BATCH1_DERIVED_ART);
