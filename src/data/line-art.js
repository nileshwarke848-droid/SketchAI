// Clean monochrome line art — the primary artwork SketchAI suggests.
//
// SketchAI is not "rough sketch -> emoji". It is "rough sketch -> cleaner
// drawing of the same object". These drawings are therefore:
//
//   * whole objects, not emoji faces or app icons
//   * stroke-based, no fills except tiny accents (an eye, a pupil)
//   * drawn on one 24x24 grid with one stroke weight, so every drawing looks
//     like it came from the same pen
//
// The literal token STROKE is replaced with currentColor at render time, so an
// inserted drawing matches the brush colour the user picked.
//
// Licence: original artwork drawn for this project, MIT-licensed with the rest
// of SketchAI. Nothing here is scraped from AutoDraw or an icon pack.
//
// Keyed by the canonical Quick, Draw! label (lower case).

const SIZE = { w: 24, h: 24 };

/** Wraps paths in the shared pen style. */
function pen(body, { fill = 'none', width = 1.7 } = {}) {
  return (
    `<g stroke="STROKE" fill="${fill}" stroke-width="${width}" `
    + `stroke-linecap="round" stroke-linejoin="round">${body}</g>`
  );
}

/** Solid accent — an eye, a pupil, a sound hole. Use sparingly. */
function ink(body) {
  return `<g fill="STROKE" stroke="none">${body}</g>`;
}

/** One line-art drawing. */
function art(body) {
  return { ...SIZE, b: body };
}

export const LINE_ART = {
  // -------------------------------------------------------------------------
  // DEMO-CRITICAL — whole objects, drawn to be recognised instantly
  // -------------------------------------------------------------------------

  // Full body: head, ear, snout, body, four legs, tail. Not a dog-face emoji.
  dog: art(
    pen('<circle cx="6.2" cy="7.6" r="2.9"/>')
    + pen('<path d="M4.3 5.3 2.6 3.5l1 3.8"/>')
    + pen('<path d="M3.7 8.7H1.9"/>')
    + pen('<path d="M8.7 9.5c2-1 5.8-1.1 7.8-.1 1.1.5 1 2.2-.4 2.9-1.4.7-4.1.9-6 .8"/>')
    + pen('<path d="M9 13.4c2 .9 5.4.9 7.6 0"/>')
    + pen('<path d="M17.5 10.3c1.6-.8 2.6.5 2.4 2"/>')
    + pen('<path d="M10.2 13.7v5.1M12.3 14v4.8M15.7 13.3v5.5M17.4 13.5v5.3"/>')
    + ink('<circle cx="5.7" cy="7.1" r=".5"/>'),
  ),

  // Sitting cat: head, two ears, body, curled tail, front paws.
  cat: art(
    pen('<circle cx="11.5" cy="7.8" r="3.3"/>')
    + pen('<path d="M8.6 5.6 7.9 2.6l3.1 1.7"/>')
    + pen('<path d="M14.4 5.6l.7-3-3.1 1.7"/>')
    + pen('<path d="M11.5 11.1c-2.4 0-4 2.3-4 5.1 0 1.6.2 2.9.2 2.9h7.6s.2-1.3.2-2.9c0-2.8-1.6-5.1-4-5.1z"/>')
    + pen('<path d="M15.3 17.4c2.6-.3 3.6-2 3-4"/>')
    + pen('<path d="M9.3 19.1v1.6M13.7 19.1v1.6"/>')
    + pen('<path d="M9.6 8.4h-.1M13.4 8.4h.1"/>')
    + ink('<circle cx="10.2" cy="7.4" r=".5"/><circle cx="12.8" cy="7.4" r=".5"/>'),
  ),

  // Roof, walls, door, two windows.
  house: art(
    pen('<path d="M3.4 10.6 12 3.6l8.6 7"/>')
    + pen('<path d="M5.6 9.4V20.4h12.8V9.4"/>')
    + pen('<path d="M9.8 20.4v-6.2h4.4v6.2"/>')
    + pen('<path d="M6.8 12.2h2.2v2.2H6.8z"/><path d="M15 12.2h2.2v2.2H15z"/>'),
  ),

  // Side view: body, cabin, two wheels.
  car: art(
    pen('<path d="M2.6 16.4h18.8v-4.2H2.6z"/>')
    + pen('<path d="M7.4 12.2 9.3 8.4h5.4l1.9 3.8"/>')
    + pen('<circle cx="7.4" cy="16.8" r="2.4"/><circle cx="16.6" cy="16.8" r="2.4"/>'),
  ),

  // Side view: long body, window band, two wheels.
  bus: art(
    pen('<path d="M3 5.4h18v11.4H3z"/>')
    + pen('<path d="M5.6 8.2h4.6v3H5.6z"/><path d="M11.4 8.2h4.6v3h-4.6z"/>')
    + pen('<path d="M17.4 8.6h1.6"/>')
    + pen('<circle cx="7.4" cy="18" r="2.1"/><circle cx="16.6" cy="18" r="2.1"/>'),
  ),

  // Side view: fuselage, swept wing, tail fin.
  airplane: art(
    pen('<path d="M2.8 14.2 20.4 12.3c1.2-.1 1.4 1-.1 1.3L2.9 15.9c-1.3.3-1.5-1.4-.1-1.7z"/>')
    + pen('<path d="M10 13.7 6.8 20.2h4.4l2.4-6.3"/>')
    + pen('<path d="M4.6 13.9 3.5 9h1.9l1 4.8"/>'),
  ),

  // Body, tail fin, top fin, eye.
  fish: art(
    pen('<path d="M5.2 12 1.6 8.2v7.6z"/>')
    + pen('<ellipse cx="12.8" cy="12" rx="7.2" ry="5.4"/>')
    + pen('<path d="M9.8 6.9c1.5-1.5 3.6-1.5 5.1 0"/>')
    + ink('<circle cx="16.6" cy="10.4" r=".6"/>'),
  ),

  // Trunk and canopy.
  tree: art(
    pen('<path d="M12 21v-6.4"/>')
    + pen('<path d="M12 14.8c-4.1 0-7.2-2.8-7.2-6 0-3.3 3.2-5.8 7.2-5.8s7.2 2.5 7.2 5.8c0 3.2-3.1 6-7.2 6z"/>'),
  ),

  // Five petals, centre, stem, leaf.
  flower: art(
    pen('<circle cx="12" cy="8" r="1.9"/>')
    + pen('<circle cx="12" cy="5.1" r="1.8"/><circle cx="14.7" cy="6.6" r="1.8"/>'
      + '<circle cx="13.7" cy="10" r="1.8"/><circle cx="10.3" cy="10" r="1.8"/>'
      + '<circle cx="9.3" cy="6.6" r="1.8"/>')
    + pen('<path d="M12 10.4V21"/>')
    + pen('<path d="M12 16.8c-2.6-.3-4-1.8-3.7-3.7.2-1.7 2-2.7 3.7-2.5"/>'),
  ),

  // Disc with eight rays.
  sun: art(
    pen('<circle cx="12" cy="12" r="4.3"/>')
    + pen('<path d="M12 2.4v2.9M12 18.7v2.9M2.4 12h2.9M18.7 12h2.9'
      + 'M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1"/>'),
  ),

  // Scalloped canopy and crook handle.
  umbrella: art(
    pen('<path d="M2.8 12.6c0-5.1 4.1-9.2 9.2-9.2s9.2 4.1 9.2 9.2c-1.5 1.4-3.1 1.4-4.6 0'
      + '-1.5 1.4-3.1 1.4-4.6 0-1.5 1.4-3.1 1.4-4.6 0-1.5 1.4-3.1 1.4-4.6 0z"/>')
    + pen('<path d="M12 12.6v5.8c0 1.8-1.5 3-3.1 2.8"/>'),
  ),

  // -------------------------------------------------------------------------
  // COMMON OBJECTS
  // -------------------------------------------------------------------------

  // Engine, carriage, three wheels.
  train: art(
    pen('<path d="M4 4.6h11.4v11.2H4z"/>')
    + pen('<path d="M15.4 7.4h4.6v8.4h-4.6"/>')
    + pen('<path d="M6.6 8h5.8"/>')
    + pen('<path d="M2 16.4h19.4"/>')
    + pen('<circle cx="7" cy="18.8" r="1.9"/><circle cx="12.6" cy="18.8" r="1.9"/>'
      + '<circle cx="17.6" cy="18.8" r="1.9"/>'),
  ),

  // Body, sound hole, neck, headstock.
  guitar: art(
    pen('<path d="M12.7 12.8c-2.2 0-3.9 1.8-3.9 3.9 0 2.1 1.7 3.9 3.9 3.9s3.9-1.8 3.9-3.9c0-2.1-1.7-3.9-3.9-3.9z"/>')
    + pen('<path d="M12.7 12.8V4"/>')
    + pen('<path d="M11.2 4h3"/>')
    + ink('<circle cx="12.7" cy="15.6" r="1.1"/>'),
  ),

  // Side profile with a sole.
  shoe: art(
    pen('<path d="M3 14.8c0-3 1.2-5.2 3.2-5.8 1.4-.4 2.4.3 3.2 1.5l1.6 2.4c.6.9 1.3 1.3 2.2 1.3h5.2'
      + 'c1.7 0 2.6 1 2.6 2.4v1.6c0 .9-.7 1.4-1.8 1.4H4.6c-.9 0-1.6-.6-1.6-1.4z"/>')
    + pen('<path d="M3 16.4h18.4"/>'),
  ),

  // Full body: back, head, trunk, ear, three legs, tail.
  elephant: art(
    pen('<path d="M9.4 6.4c4.6 0 9.4 2.2 9.4 6.2 0 3.2-1.6 5.4-3.4 6.4"/>')
    + pen('<path d="M9.4 6.4c-2.6.4-4.4 2.4-4.4 5.2 0 1.8.6 3.2 1.6 4.4"/>')
    + pen('<path d="M6.4 16.2c-.6 1.6-.4 3.4.6 4.6"/>')
    + pen('<path d="M8.2 8.4c-1.8-.4-3.2.8-3.2 2.8 0 1.8 1.4 3 3.2 2.6"/>')
    + pen('<path d="M11.6 18.8v3.4M14.6 19.2v3M17.6 18.6v3.6"/>')
    + pen('<path d="M18.8 15.4c1.6.2 2.2 1.2 2 2.4"/>')
    + ink('<circle cx="6" cy="11" r=".5"/>'),
  ),

  // Mane, face, body, legs, tufted tail.
  lion: art(
    pen('<circle cx="8.2" cy="10.2" r="4.4"/>')
    + pen('<circle cx="8.2" cy="10.2" r="2.5"/>')
    + pen('<path d="M11.8 11.4c3.4-.4 6.8.6 6.8 3.6 0 2.6-1 4.4-2.4 5.2"/>')
    + pen('<path d="M13 16.6v3.6M16.4 16.8v3.4M18.6 16.4v3.8"/>')
    + pen('<path d="M11.8 15.6c-.4 1.4-.4 2.8 0 4.2"/>')
    + pen('<path d="M18.8 12.4c1.8-.4 2.6.8 2.4 2"/>')
    + ink('<circle cx="7.2" cy="9.6" r=".5"/><circle cx="9.2" cy="9.6" r=".5"/>'),
  ),

  // Two wheels, frame, saddle, handlebars, pedal.
  bicycle: art(
    pen('<circle cx="5.8" cy="16.6" r="4.2"/><circle cx="18.2" cy="16.6" r="4.2"/>')
    + pen('<path d="M5.8 16.6 10.4 9.8h4.8l3 6.8"/>')
    + pen('<path d="M10.4 9.8 14 16.6"/>')
    + pen('<path d="M15.2 9.8h2.6"/>')
    + pen('<path d="M9.4 9.4h1.8"/>')
    + pen('<path d="M13.2 16.6h2.6"/>'),
  ),

  // Body, head, beak, wing, tail, two legs.
  bird: art(
    pen('<path d="M6.6 13.4c0-4 3.2-7 7.2-7 1.6 0 3 .5 4.2 1.4"/>')
    + pen('<circle cx="15.4" cy="7.6" r="2.4"/>')
    + pen('<path d="M17.6 7.6H20l-2.4 1.2"/>')
    + pen('<path d="M8.6 12.6c2-1.6 4.6-1.4 6 .8-1.6 1-3.6.8-5-.2"/>')
    + pen('<path d="M6.6 13.4 3.4 16.6l3.6.6"/>')
    + pen('<path d="M11 17.4v2.6M13.4 17.6v2.4"/>')
    + ink('<circle cx="16.2" cy="7" r=".5"/>'),
  ),

  // Hull, mast, two sails.
  sailboat: art(
    pen('<path d="M3 16.6h18l-2.6 3.4H5.6z"/>')
    + pen('<path d="M12 16.6V3.4"/>')
    + pen('<path d="M12 4.2 19.4 15"/>')
    + pen('<path d="M10.6 5.4 4.6 15"/>'),
  ),

  // Back, slats, seat, legs.
  chair: art(
    pen('<path d="M6.8 3.6v10.4M17.2 3.6v10.4"/>')
    + pen('<path d="M6.8 7.4h10.4M6.8 11h10.4"/>')
    + pen('<path d="M5.4 14h13.2"/>')
    + pen('<path d="M6.8 14v6.6M17.2 14v6.6"/>'),
  ),

  // Face, hands, four ticks.
  clock: art(
    pen('<circle cx="12" cy="12" r="9"/>')
    + pen('<path d="M12 6.6V12l4 2.4"/>')
    + pen('<path d="M12 3.4v1.6M12 19v1.6M3.4 12h1.6M19 12h1.6"/>'),
  ),

  // Puffed outline with a flat base.
  cloud: art(
    pen('<path d="M17.5 19.2a4.4 4.4 0 0 0 .4-8.8 6 6 0 0 0-11.5 2 3.9 3.9 0 0 0-.4 6.8z"/>'),
  ),

  // Cup, handle, saucer.
  cup: art(
    pen('<path d="M4.6 6.4h11l-1.2 10c-.1 1.2-1.1 2.1-2.4 2.1H8.2c-1.3 0-2.3-.9-2.4-2.1z"/>')
    + pen('<path d="M15.6 8.6h1.6c1.5 0 2.5 1 2.3 2.4-.2 1.2-1.3 2-2.6 2h-1.3"/>')
    + pen('<path d="M3.4 20.6h13.4"/>'),
  ),

  // Frame, inner panel, knob.
  door: art(
    pen('<path d="M5 21V3.8h14V21"/>')
    + pen('<path d="M8.4 21V8.6h7.2V21"/>')
    + ink('<circle cx="14.2" cy="15.2" r=".7"/>'),
  ),

  // Almond, iris, pupil.
  eye: art(
    pen('<path d="M2.4 12c3-4.6 6.4-6.8 9.6-6.8s6.6 2.2 9.6 6.8c-3 4.6-6.4 6.8-9.6 6.8S5.4 16.6 2.4 12z"/>')
    + pen('<circle cx="12" cy="12" r="3.2"/>')
    + ink('<circle cx="12" cy="12" r="1.4"/>'),
  ),

  // Simple smiley: eyes and a smile.
  face: art(
    pen('<circle cx="12" cy="12" r="9"/>')
    + pen('<path d="M8 14.6c1.2 1.4 2.5 2.1 4 2.1s2.8-.7 4-2.1"/>')
    + ink('<circle cx="9" cy="9.6" r=".9"/><circle cx="15" cy="9.6" r=".9"/>'),
  ),

  // Palm, four fingers, thumb.
  hand: art(
    pen('<path d="M7.2 13.6V7.8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v3"/>')
    + pen('<path d="M10.4 13.4V6.6c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v4"/>')
    + pen('<path d="M13.6 13.6V8c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v3"/>')
    + pen('<path d="M16.8 13.8v-3.4c0-.9.7-1.6 1.5-1.6"/>')
    + pen('<path d="M7.2 13.6c0 4.2-.4 7.2-.4 7.2h10.4c0-2.6-.4-6.4-.4-7.2"/>')
    + pen('<path d="M7.2 17.6c-1.8.4-2.8 1.6-2.6 3"/>'),
  ),

  // Bow, shaft, two teeth.
  key: art(
    pen('<circle cx="6.4" cy="12" r="3.6"/>')
    + pen('<path d="M10 12h11"/>')
    + pen('<path d="M16.4 12v3M19.4 12v2.6"/>')
    + ink('<circle cx="6.4" cy="12" r="1.2"/>'),
  ),

  // Crescent.
  moon: art(
    pen('<path d="M20.8 14.6A9 9 0 0 1 9.4 3.2 9 9 0 1 0 20.8 14.6z"/>'),
  ),

  // Handset with speaker and home button.
  'cell phone': art(
    pen('<path d="M7.4 2.6h9.2c.9 0 1.6.7 1.6 1.6v15.6c0 .9-.7 1.6-1.6 1.6H7.4c-.9 0-1.6-.7-1.6-1.6V4.2c0-.9.7-1.6 1.6-1.6z"/>')
    + pen('<path d="M10.4 5h3.2"/>')
    + pen('<path d="M10.6 18.8h2.8"/>'),
  ),

  // Five-point star.
  star: art(
    pen('<path d="M12 3.4l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.9l6.1-.9z"/>'),
  ),

  // Tabletop and two legs.
  table: art(
    pen('<path d="M3 9.6h18"/>')
    + pen('<path d="M3 8.2h18"/>')
    + pen('<path d="M5.6 9.6V20.6M18.4 9.6V20.6"/>'),
  ),

  // -------------------------------------------------------------------------
  // ANIMALS — whole bodies, not faces
  // -------------------------------------------------------------------------

  bear: art(
    pen('<circle cx="8" cy="8.4" r="3"/><circle cx="5.4" cy="5.8" r="1.3"/><circle cx="10.6" cy="5.8" r="1.3"/>')
    + pen('<path d="M8 11.4c-3.6 0-6.2 2.6-6.2 5.8 0 2 .3 3.4.3 3.4h11.8s.3-1.4.3-3.4c0-3.2-2.6-5.8-6.2-5.8z"/>')
    + pen('<path d="M5.4 20.6v-3M10.6 20.6v-3"/>')
    + ink('<circle cx="6.8" cy="8" r=".5"/><circle cx="9.2" cy="8" r=".5"/>'),
  ),

  cow: art(
    pen('<path d="M6.4 8.6c0-2.2 2-3.8 4.4-3.8h2.4c2.4 0 4.4 1.6 4.4 3.8v7.8c0 2-1.6 3.6-3.6 3.6H10c-2 0-3.6-1.6-3.6-3.6z"/>')
    + pen('<path d="M6.4 10c-1.7 0-2.6 1.3-2 2.7.4 1 1.4 1.5 2 1.3"/>')
    + pen('<path d="M17.6 10c1.7 0 2.6 1.3 2 2.7-.4 1-1.4 1.5-2 1.3"/>')
    + pen('<path d="M9 20v2.2M15 20v2.2"/>')
    + pen('<path d="M10.4 16.4c1 1 2.6 1 3.6 0"/>')
    + ink('<circle cx="10.2" cy="12.4" r=".6"/><circle cx="13.8" cy="12.4" r=".6"/>'),
  ),

  frog: art(
    pen('<path d="M12 8.4c-3.4 0-6.2 2-6.2 4.6 0 2.6 2.8 4.6 6.2 4.6s6.2-2 6.2-4.6c0-2.6-2.8-4.6-6.2-4.6z"/>')
    + pen('<circle cx="8.4" cy="6.6" r="1.8"/><circle cx="15.6" cy="6.6" r="1.8"/>')
    + pen('<path d="M5.8 13.4c-1.6.4-2.4 1.6-2 3M18.2 13.4c1.6.4 2.4 1.6 2 3"/>')
    + pen('<path d="M8 17.6c-1.4 1.4-1.6 3-.8 4.4M16 17.6c1.4 1.4 1.6 3 .8 4.4"/>')
    + ink('<circle cx="8.4" cy="6.6" r=".7"/><circle cx="15.6" cy="6.6" r=".7"/>'),
  ),

  giraffe: art(
    pen('<path d="M13.8 3.2c1.2 0 2.2 1 2.2 2.2 0 .6-.2 1.1-.5 1.5l-.7 5.5"/>')
    + pen('<path d="M13.8 3.2h-2c-1 0-1.8.8-1.8 1.8s.8 1.8 1.8 1.8h2"/>')
    + pen('<path d="M14.8 12.6c2.6.4 4.4 2.2 4.4 4.4 0 2.2-.4 3.8-.4 3.8H9.8s-.4-1.6-.4-3.8c0-2.2 1.8-4 4.4-4.4"/>')
    + pen('<path d="M10.4 20.8v-3M13.2 20.8v-3M16 20.8v-3M18.4 20.8v-3"/>'),
  ),

  horse: art(
    pen('<path d="M5.8 20.8v-7.6c0-3 1.8-5.4 4.2-5.4h4.2c2.4 0 4.2 2.4 4.2 5.4v7.6"/>')
    + pen('<path d="M10.2 12.8V8.6c0-1.6 1-2.6 2.6-2.6h1.8"/>')
    + pen('<path d="M14.6 6h2.4c.7 0 1.2.6 1.2 1.3v1.3"/>')
    + pen('<path d="M18.6 11c1.9.2 2.7 1.4 2.5 3"/>')
    + pen('<path d="M8.4 17.2v3.6M15.6 17.2v3.6"/>')
    + ink('<circle cx="16.4" cy="7.2" r=".5"/>'),
  ),

  monkey: art(
    pen('<circle cx="12" cy="6.6" r="2.8"/>')
    + pen('<circle cx="7.8" cy="6.2" r="1.5"/><circle cx="16.2" cy="6.2" r="1.5"/>')
    + pen('<path d="M12 9.4c-2.2 0-3.8 1.8-3.8 4.2 0 2 .3 3.6.3 3.6h7s.3-1.6.3-3.6c0-2.4-1.6-4.2-3.8-4.2z"/>')
    + pen('<path d="M8.2 17.2c-1.4 1-1.6 2.6-.8 3.8M15.8 17.2c1.4 1 1.6 2.6.8 3.8"/>')
    + pen('<path d="M10.4 17.2v3.4M13.6 17.2v3.4"/>')
    + pen('<path d="M15.8 12.4c2 0 2.6 1.4 2.2 2.8"/>')
    + ink('<circle cx="10.8" cy="6" r=".5"/><circle cx="13.2" cy="6" r=".5"/>'),
  ),

  mouse: art(
    pen('<path d="M9.6 12.4c0-3.4 3-5.8 6.6-5.8 2 0 3.6.8 4.6 2.2l2.4-1.6-.8 3c.6 1 .9 2 .9 3 0 3.4-2.8 6-6.4 6-3.4 0-6-2.4-6-5.4z"/>')
    + pen('<circle cx="9.8" cy="7.6" r="2.6"/>')
    + pen('<path d="M14.4 18.6c2.6.6 4.4-.6 4.8-2.8"/>')
    + ink('<circle cx="15.6" cy="11.6" r=".6"/>'),
  ),

  pig: art(
    pen('<ellipse cx="11.4" cy="12.6" rx="6.6" ry="5.2"/>')
    + pen('<path d="M6.4 10.4 4.2 8l-.4 3.2"/>')
    + pen('<ellipse cx="18.4" cy="13.4" rx="1.6" ry="1.3"/>')
    + pen('<path d="M8 17.4v3M11.2 17.8v2.6M14.4 17.8v2.6M17 17.2v3"/>')
    + pen('<path d="M5.2 12.4c-1.4-.4-2 .6-1.6 1.8"/>')
    + ink('<circle cx="14.6" cy="11" r=".5"/>'),
  ),

  rabbit: art(
    pen('<path d="M9.4 12.6c0-3.4 2.6-6 6-6s6 2.6 6 6-2.6 6-6 6-6-2.6-6-6z"/>')
    + pen('<path d="M10.6 8.2c-.4-3 0-5 .6-5s1.4 1.6 1.6 4M14.4 8.2c-.2-3 .4-5 1-5s1 1.8.8 4.2"/>')
    + pen('<circle cx="18.6" cy="16" r="1.8"/>')
    + pen('<path d="M11 18v2.4M14.6 18v2.4"/>')
    + ink('<circle cx="13.4" cy="12.4" r=".5"/>'),
  ),

  sheep: art(
    pen('<path d="M6.6 15.4c-1.8 0-2.8-1.2-2.8-2.6 0-1.4 1.2-2.6 2.8-2.6.4-1.8 2-3.2 4-3.2 1.4 0 2.6.6 3.4 1.6.8-.6 1.8-1 2.8-1 2 0 3.6 1.4 3.6 3.2 1.6 0 2.6 1.2 2.6 2.6s-1 2.6-2.6 2.6z"/>')
    + pen('<path d="M7.4 13.6c-.8.6-1.4 1.6-1.2 2.6.1.6.5 1 1 1.1"/>')
    + pen('<path d="M9.4 18.6v2.4M14.6 18.6v2.4M17 18.6v2.4"/>')
    + ink('<circle cx="6.8" cy="15.4" r=".4"/>'),
  ),

  snake: art(
    pen('<path d="M3.2 16.8c2-2 4-2 6 0s4 2 6 0 4-2 5.8 0"/>')
    + pen('<circle cx="19" cy="16.8" r="1.6"/>')
    + pen('<path d="M20.6 16.8H22"/>')
    + ink('<circle cx="19.2" cy="16.2" r=".4"/>'),
  ),

  squirrel: art(
    pen('<path d="M10.5 13.5c-2.5-1-4-3.2-4-5.8 0-3 2.2-5.2 5-5.2 2.2 0 4 1.3 4.6 3.2"/>')
    + pen('<path d="M16.1 5.5c1.8-.6 3.6.4 4.4 2.2.9 2 .2 4.4-1.6 5.4-1.4.8-3 .5-4-.6"/>')
    + pen('<path d="M19.4 9.3c1.3.3 2.2 1.5 2.2 3s-1 2.7-2.4 2.7c-1.1 0-2-.7-2.2-1.7"/>')
    + pen('<path d="M12.5 20.5v-6M14.6 20.5v-4.4"/>')
    + pen('<path d="M6.8 6.2 6 3.6l2.8 1"/>')
    + ink('<circle cx="7.8" cy="8" r=".5"/>'),
  ),

  tiger: art(
    pen('<circle cx="7.6" cy="9.4" r="3.4"/>')
    + pen('<path d="M5.2 6.4 4.4 4l2.6 1.4M10 6.4l.8-2.4-2.6 1.4"/>')
    + pen('<path d="M11 11.8c3.4-.4 7 .6 7 3.8 0 2.6-1 4.4-2.6 5.2"/>')
    + pen('<path d="M12.6 17v3.6M16 17.2v3.4M18.4 16.8v3.8M11.2 16c-.4 1.4-.4 2.8 0 4.2"/>')
    + pen('<path d="M18.8 12.6c1.8-.4 2.6.8 2.4 2.2"/>')
    + pen('<path d="M7.6 6.6v5.6M5.4 8h.1M9.8 8h.1"/>')
    + ink('<circle cx="6.4" cy="9" r=".5"/><circle cx="8.8" cy="9" r=".5"/>'),
  ),

  zebra: art(
    pen('<path d="M5.8 20.8v-7.6c0-3 1.8-5.4 4.2-5.4h4.2c2.4 0 4.2 2.4 4.2 5.4v7.6"/>')
    + pen('<path d="M10.2 12.8V8.6c0-1.6 1-2.6 2.6-2.6h1.8"/>')
    + pen('<path d="M14.6 6h2.4c.7 0 1.2.6 1.2 1.3v1.3"/>')
    + pen('<path d="M8.4 17.2v3.6M15.6 17.2v3.6"/>')
    + pen('<path d="M8.2 14.6h.1M11 13.4h.1M13.8 14.6h.1M16.6 13.4h.1"/>')
    + ink('<circle cx="16.4" cy="7.2" r=".5"/>'),
  ),

  penguin: art(
    pen('<path d="M12 3.6c3.2 0 5.4 2.6 5.4 5.8v5.2c0 3.2-2.4 5.4-5.4 5.4s-5.4-2.2-5.4-5.4V9.4C6.6 6.2 8.8 3.6 12 3.6z"/>')
    + pen('<path d="M9.8 6.6h6.4"/>')
    + pen('<path d="M12 11.4 13.4 13h-2.8z"/>')
    + pen('<path d="M6.6 12.4c-1.4 1-1.8 2.8-1.2 4.4M17.4 12.4c1.4 1 1.8 2.8 1.2 4.4"/>')
    + pen('<path d="M9.4 19.4v2.2M14.6 19.4v2.2"/>')
    + ink('<circle cx="10.4" cy="7.4" r=".6"/><circle cx="13.6" cy="7.4" r=".6"/>'),
  ),

  owl: art(
    pen('<path d="M12 3.4c3.2 0 5.6 2.6 5.6 5.8v5.8c0 3.4-2.4 5.6-5.6 5.6s-5.6-2.2-5.6-5.6V9.2C6.4 6 8.8 3.4 12 3.4z"/>')
    + pen('<path d="M6.8 6.4 8.4 3.2M17.2 6.4 15.6 3.2"/>')
    + pen('<circle cx="9.4" cy="9.6" r="2.4"/><circle cx="14.6" cy="9.6" r="2.4"/>')
    + pen('<path d="M12 12.2v2.2"/>')
    + pen('<path d="M8.4 16.4h7.2"/>')
    + ink('<circle cx="9.4" cy="9.6" r=".9"/><circle cx="14.6" cy="9.6" r=".9"/>'),
  ),

  crab: art(
    pen('<ellipse cx="12" cy="13.4" rx="5.4" ry="3.6"/>')
    + pen('<path d="M6.6 11.4c-1.6-.6-2.8.2-2.8 1.6 0 1.4 1 2.2 2.4 2M17.4 11.4c1.6-.6 2.8.2 2.8 1.6 0 1.4-1 2.2-2.4 2"/>')
    + pen('<path d="M7.6 16.6c-.8 1.4-.8 2.8 0 4M10.4 17.2c-.6 1.4-.6 2.8 0 4M13.6 17.2c.6 1.4.6 2.8 0 4M16.4 16.6c.8 1.4.8 2.8 0 4"/>')
    + ink('<circle cx="10.4" cy="11.6" r=".5"/><circle cx="13.6" cy="11.6" r=".5"/>'),
  ),

  duck: art(
    pen('<path d="M6.4 15.4c0-3.4 2.8-5.8 6.2-5.8 1.8 0 3.4.7 4.4 1.9"/>')
    + pen('<circle cx="15.6" cy="8.4" r="2.4"/>')
    + pen('<path d="M17.8 8.4h2.6l-2.6 1.4"/>')
    + pen('<path d="M6.4 15.4 3.6 18l3.4.6"/>')
    + pen('<path d="M10.2 17.6v2.6M13 17.8v2.4"/>')
    + ink('<circle cx="16.2" cy="7.8" r=".5"/>'),
  ),

  whale: art(
    pen('<path d="M3.6 13.2c0-4.2 3.6-7.4 8-7.4 3.2 0 6 1.6 7.2 4.2"/>')
    + pen('<path d="M3.6 13.2c0 4.2 3.6 7.4 8 7.4 3.2 0 6-1.6 7.2-4.2"/>')
    + pen('<path d="M18.8 9 21.6 6.4l-.6 4.2M18.8 17.4 21.6 20l-.6-4.2"/>')
    + pen('<path d="M11.4 6.4c0-1.4.6-2.4.6-3.4M13.8 6.8c.8-1 2-1.4 3-1"/>')
    + ink('<circle cx="6.6" cy="12.4" r=".6"/>'),
  ),

  shark: art(
    pen('<path d="M2.6 13.4c2.6-3.6 7.4-6 12-6 3.4 0 6 1.8 6 4 0 2.2-2.6 4-6 4-4.6 0-9.4-2.4-12-6z"/>')
    + pen('<path d="M11 7.6 9.6 3.4l4.4 3"/>')
    + pen('<path d="M2.6 13.4c-1 1.6-1 3.4 0 5l3.4-2.6"/>')
    + pen('<path d="M8.4 15.4c1 1 2.4 1 3.4 0"/>')
    + pen('<path d="M6 12.6c-.4.6-.4 1.4 0 2M7.4 12.2c-.4.6-.4 1.4 0 2"/>')
    + ink('<circle cx="5.4" cy="11.4" r=".5"/>'),
  ),

  dolphin: art(
    pen('<path d="M2.8 16.4c1.6-4.6 5.8-8 10.6-8 3.4 0 6.2 2 6.2 4.6 0 1.6-1 3-2.6 3.8"/>')
    + pen('<path d="M17 16.8c1 1.4 1 3 0 4.4l-3-1.4"/>')
    + pen('<path d="M9.4 9.4c1.6-1.6 3.6-2 5.2-1.2"/>')
    + ink('<circle cx="6.4" cy="13.4" r=".5"/>'),
  ),

  butterfly: art(
    pen('<path d="M12 12c-1.6-2.6-4-4-6.4-4-1.6 0-2.6 1-2.6 2.4 0 1.6 1.4 2.8 3.2 3-1.8.2-3.2 1.4-3.2 3 0 1.4 1 2.4 2.6 2.4 2.4 0 4.8-1.4 6.4-4z"/>')
    + pen('<path d="M12 12c1.6-2.6 4-4 6.4-4 1.6 0 2.6 1 2.6 2.4 0 1.6-1.4 2.8-3.2 3 1.8.2 3.2 1.4 3.2 3 0 1.4-1 2.4-2.6 2.4-2.4 0-4.8-1.4-6.4-4z"/>')
    + pen('<path d="M12 12v8"/>')
    + pen('<path d="M11.2 6.4c-.8-1.4-.6-2.6.4-3M12.8 6.4c.8-1.4.6-2.6-.4-3"/>'),
  ),

  bee: art(
    pen('<ellipse cx="12" cy="14.4" rx="4" ry="5"/>')
    + pen('<path d="M8.6 12.4h6.8M8.4 15.4h7.2"/>')
    + pen('<path d="M10 9.8c-1.6-2-4-2.6-5.6-1.6 1.2 1.6 3.2 2.4 5 2.2z"/>')
    + pen('<path d="M14 9.8c1.6-2 4-2.6 5.6-1.6-1.2 1.6-3.2 2.4-5 2.2z"/>')
    + pen('<path d="M11.2 6.6c-.8-1.2-.6-2.4.4-3M12.8 6.6c.8-1.2.6-2.4-.4-3"/>')
    + ink('<circle cx="10.4" cy="10.8" r=".5"/><circle cx="13.6" cy="10.8" r=".5"/>'),
  ),

  ant: art(
    pen('<ellipse cx="17.4" cy="14.4" rx="2.6" ry="2.2"/>')
    + pen('<ellipse cx="12.4" cy="14.4" rx="2" ry="1.7"/>')
    + pen('<circle cx="8.2" cy="14.2" r="2"/>')
    + pen('<path d="M6.6 12.8c-.8-1-.6-2.2.4-2.8M8.4 12.4c.6-1.2 1.8-1.6 2.8-1"/>')
    + pen('<path d="M12 16.4c-.6 1.4-1.4 2.4-2.4 3M13.4 16.4c.8 1.2 1.8 2 3 2.4M10.6 16.2c-1 1.2-2.2 2-3.4 2.2"/>'),
  ),

  spider: art(
    pen('<ellipse cx="12" cy="13.4" rx="3.4" ry="3"/>')
    + pen('<circle cx="12" cy="9.6" r="1.8"/>')
    + pen('<path d="M8.6 12.4c-2-1-3.6-.6-4.6.8M8.6 14c-2 0-3.4.8-4 2.2M8.8 15.6c-1.8.8-2.8 2.2-2.8 3.6"/>')
    + pen('<path d="M15.4 12.4c2-1 3.6-.6 4.6.8M15.4 14c2 0 3.4.8 4 2.2M15.2 15.6c1.8.8 2.8 2.2 2.8 3.6"/>')
    + ink('<circle cx="11" cy="9.2" r=".5"/><circle cx="13" cy="9.2" r=".5"/>'),
  ),

  snail: art(
    pen('<path d="M15 15.6a4.6 4.6 0 1 1-4.6-4.6c1.4 0 2.6.6 3.4 1.6a2.6 2.6 0 1 1-2.6 2.6"/>')
    + pen('<path d="M6.6 18.4c1.6 0 3-.4 4.2-1.2"/>')
    + pen('<path d="M4.4 16.6c-.6-1-.4-2 .4-2.6M6 16c.6-1 1.6-1.4 2.6-1"/>'),
  ),

  camel: art(
    pen('<path d="M5 17.6c0-3.6 1.2-6.2 3.4-7.4 1.4-.8 3.2-.8 4.6 0 1.2.8 2 2 2.4 3.6l1 3.8"/>')
    + pen('<path d="M4.6 17.8h14.6"/>')
    + pen('<path d="M11.4 10.4c0-2 .6-3.6 1.8-4.8"/>')
    + pen('<path d="M13.2 5.6c.8 0 1.4.6 1.4 1.4"/>')
    + pen('<path d="M6.6 17.8v3M9.4 17.8v3M15.4 17.8v3M18 17.8v3"/>'),
  ),

  crocodile: art(
    pen('<path d="M3.4 13.6c3-2 6.6-3 10.4-3 2.6 0 5 .6 6.8 1.8"/>')
    + pen('<path d="M3.4 15.6c3 1.6 6.6 2.4 10.4 2.4 2.6 0 5-.6 6.8-1.6"/>')
    + pen('<path d="M20.6 11 22.6 9.4l-.8 3.4"/>')
    + pen('<path d="M3.4 13.6c-1 1.2-1 3 0 4.4l3-1.6"/>')
    + pen('<path d="M7 18c-.6 1.2-.6 2.4 0 3.4M16.6 18c.6 1.2.6 2.4 0 3.4"/>')
    + ink('<circle cx="19" cy="12.4" r=".5"/>'),
  ),

  octopus: art(
    pen('<path d="M12 3.6c3.2 0 5.6 2.4 5.6 5.4 0 1.6-.4 2.8-.4 3.8 0 .8-.8 1.4-1.6 1.4h-7.2c-.8 0-1.6-.6-1.6-1.4 0-1-.4-2.2-.4-3.8C6.4 6 8.8 3.6 12 3.6z"/>')
    + pen('<path d="M7 14.2c-1 1.4-1.4 3-1.2 4.6M9.4 14.6c-.6 1.6-.6 3.2 0 4.6M12 14.8c0 1.6.2 3.2.6 4.6M14.6 14.6c.6 1.6.8 3.2.6 4.6M17 14.2c1 1.4 1.6 3 1.6 4.6"/>')
    + ink('<circle cx="9.8" cy="8.4" r=".6"/><circle cx="14.2" cy="8.4" r=".6"/>'),
  ),

  hedgehog: art(
    pen('<path d="M6.4 15.4c0-3.4 2.6-6 5.6-6s5.6 2.6 5.6 6c0 .8-.2 1.4-.2 1.4H6.6s-.2-.6-.2-1.4z"/>')
    + pen('<path d="M8 10.4 7 8M11 9.4l-.6-2.4M14 9.6l.6-2.4M16.6 11l1.8-1.8"/>')
    + pen('<path d="M4.8 16.8c1.4 0 2.6-.4 3.6-1.2"/>')
    + pen('<path d="M8 17.6v2.2M14.6 17.6v2.2"/>')
    + ink('<circle cx="6.4" cy="16" r=".5"/>'),
  ),

  // -------------------------------------------------------------------------
  // FOOD AND PLANTS
  // -------------------------------------------------------------------------

  apple: art(
    pen('<path d="M12 8.2c-3.2-1-6.4.6-6.4 4 0 4 3 7 6.4 7s6.4-3 6.4-7c0-3.4-3.2-5-6.4-4z"/>')
    + pen('<path d="M12 8.2c0-2 1-3.4 2.4-4"/>')
    + pen('<path d="M14 4.6c1.4-.6 2.6 0 2.6 1.2 0 1.2-1.4 1.8-2.6 1"/>'),
  ),

  banana: art(
    pen('<path d="M5.2 6.2c0 8.2 5.4 13.4 12.4 13 1.6-.1 3-.6 4.2-1.4"/>')
    + pen('<path d="M21.8 17.8c.2-1.8-.4-3.4-1.8-4.6-3-2.6-7.4-3.4-11.4-2.4"/>')
    + pen('<path d="M5.2 6.2c0-1.2 1-2.2 2.2-2.2"/>'),
  ),

  bread: art(
    pen('<path d="M3.6 12.4c0-2.4 2-4.4 4.4-4.4h8c2.4 0 4.4 2 4.4 4.4v6.2H3.6z"/>')
    + pen('<path d="M3.6 18.6c0 .9.7 1.6 1.6 1.6h13.6c.9 0 1.6-.7 1.6-1.6"/>')
    + pen('<path d="M7 12.4c0-1.4 1-2.4 2.4-2.4M12 12.4c0-1.4 1-2.4 2.4-2.4"/>'),
  ),

  cake: art(
    pen('<path d="M4.4 20.6v-6.8c0-1.4 1.2-2.6 2.6-2.6h10c1.4 0 2.6 1.2 2.6 2.6v6.8"/>')
    + pen('<path d="M4.4 16.6h15.2"/>')
    + pen('<path d="M8.6 11.2V8.2M12 11.2V7.6M15.4 11.2V8.2"/>')
    + pen('<path d="M12 7.6c-.7-.9-.5-1.9.3-2.4"/>'),
  ),

  pizza: art(
    pen('<path d="M12 3.2 20.8 19c.4.8-.2 1.8-1 1.8H4.2c-.8 0-1.4-1-1-1.8z"/>')
    + pen('<path d="M5.8 16.4h12.4"/>')
    + ink('<circle cx="10" cy="11" r=".8"/><circle cx="14.4" cy="13.4" r=".8"/><circle cx="11.4" cy="15.4" r=".8"/>'),
  ),

  donut: art(
    pen('<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.2"/>'),
  ),

  hamburger: art(
    pen('<path d="M4 9.6c0-2.4 2-4.4 4.4-4.4h7.2c2.4 0 4.4 2 4.4 4.4"/>')
    + pen('<path d="M3.6 12.4h16.8M4.4 15.4h15.2"/>')
    + pen('<path d="M4.6 18.6c0 1 .8 1.8 1.8 1.8h11.2c1 0 1.8-.8 1.8-1.8"/>'),
  ),

  'ice cream': art(
    pen('<path d="M8.4 11.4h7.2l-3.6 9.6z"/>')
    + pen('<path d="M12 4.4c2.4 0 4.2 1.8 4.2 4 0 2.2-1.8 3-4.2 3s-4.2-.8-4.2-3c0-2.2 1.8-4 4.2-4z"/>')
    + pen('<path d="M9 17.2h6M10.2 14.4h3.6"/>'),
  ),

  watermelon: art(
    pen('<path d="M3.6 8.4c0 6.6 3.8 11.6 8.4 11.6s8.4-5 8.4-11.6"/>')
    + pen('<path d="M3.6 8.4h16.8"/>')
    + ink('<circle cx="9" cy="12" r=".7"/><circle cx="12" cy="14" r=".7"/><circle cx="15" cy="12" r=".7"/>'),
  ),

  strawberry: art(
    pen('<path d="M12 6.4c3.4 0 6.2 3 6.2 6.8 0 3-2.8 5.4-6.2 5.4s-6.2-2.4-6.2-5.4c0-3.8 2.8-6.8 6.2-6.8z"/>')
    + pen('<path d="M8.4 6.4h7.2M12 6.4V3.6"/>')
    + ink('<circle cx="10" cy="10" r=".5"/><circle cx="14" cy="10" r=".5"/><circle cx="12" cy="13.4" r=".5"/>'),
  ),

  grapes: art(
    pen('<circle cx="9" cy="9.4" r="2"/><circle cx="13.4" cy="9.4" r="2"/><circle cx="11.2" cy="13" r="2"/>'
      + '<circle cx="7.2" cy="13.2" r="2"/><circle cx="15.4" cy="13.2" r="2"/><circle cx="11.2" cy="17" r="2"/>')
    + pen('<path d="M11.2 7.4V4.6"/>')
    + pen('<path d="M11.2 4.6c1.4-.6 2.6 0 2.6 1.2"/>'),
  ),

  carrot: art(
    pen('<path d="M10.4 5.6 5.6 19.8c-.2.6.4 1.1 1 .8L18 13.6c.6-.3.5-1.1-.2-1.2z"/>')
    + pen('<path d="M10.6 5.6c-1.4-1.4-1-3 .6-3.6M12.4 6.4c.6-1.8 2.2-2.6 3.6-2"/>'),
  ),

  mushroom: art(
    pen('<path d="M4.4 11.4c0-4.2 3.4-7.6 7.6-7.6s7.6 3.4 7.6 7.6z"/>')
    + pen('<path d="M9 11.4v6.2c0 1.4 1.2 2.4 3 2.4s3-1 3-2.4v-6.2"/>')
    + ink('<circle cx="9.4" cy="8" r=".7"/><circle cx="14.6" cy="8.6" r=".7"/>'),
  ),

  broccoli: art(
    pen('<path d="M9.6 20.6v-6.2c0-1.2 1.6-1.8 2.4-.8.9 1.1 1.4 2.5 1.4 4"/>')
    + pen('<path d="M6.4 11.4a3 3 0 1 1 5-2.2 3.2 3.2 0 0 1 5.4 1 3 3 0 1 1 .8 5.2z"/>'),
  ),

  potato: art(
    pen('<path d="M5 12.8c0-3.4 3-6 7-6s7 2.6 7 6-3 6-7 6-7-2.6-7-6z"/>')
    + pen('<path d="M9 11c.4-.4.4-1 0-1.4M13.6 14.4c.4-.4.4-1 0-1.4"/>'),
  ),

  pineapple: art(
    pen('<path d="M12 8.6c-3 0-5.4 3-5.4 6.8 0 2.6 2.4 4.4 5.4 4.4s5.4-1.8 5.4-4.4c0-3.8-2.4-6.8-5.4-6.8z"/>')
    + pen('<path d="M8.4 12.4l7.2 4.4M8.4 16.8l7.2-4.4"/>')
    + pen('<path d="M12 8.6V5.4M12 5.4c-1.6-1-1.4-2.6-.4-3.4M12 5.4c1.6-1 1.6-2.6.6-3.4"/>'),
  ),


  leaf: art(
    pen('<path d="M5 19c0-8 5.4-15 14-15 0 9-5.6 15-14 15z"/>')
    + pen('<path d="M5 19c3-4.4 6.4-7.4 10.4-9.6"/>'),
  ),

  cactus: art(
    pen('<path d="M12 21V6.4c0-1.6 1.2-2.8 2.8-2.8"/>')
    + pen('<path d="M9.4 4.4h5.2v16.6H9.4z"/>')
    + pen('<path d="M9.4 11.4H6c-1.2 0-2 .8-2 2v4.6M14.6 9.4h2.6c1.2 0 2 .8 2 2v4"/>'),
  ),

  // -------------------------------------------------------------------------
  // TRANSPORT
  // -------------------------------------------------------------------------

  truck: art(
    pen('<path d="M2.4 8.4h11v7.4h-11z"/>')
    + pen('<path d="M13.4 11.4h4l3.2 3.2v1.2h-7.2z"/>')
    + pen('<circle cx="6.6" cy="17.8" r="2.1"/><circle cx="16.6" cy="17.8" r="2.1"/>')
    + pen('<path d="M2.4 15.8h10.4"/>'),
  ),

  motorbike: art(
    pen('<circle cx="5.4" cy="16.4" r="4"/><circle cx="18.6" cy="16.4" r="4"/>')
    + pen('<path d="M5.4 16.4 10 10.6h5.2l3.4 5.8"/>')
    + pen('<path d="M10 10.6h3.4"/>')
    + pen('<path d="M13.4 10.6c-.6-1.6-.4-3 .6-4"/>'),
  ),

  helicopter: art(
    pen('<path d="M4.6 11.4h7.8c1 0 1.8.8 1.8 1.8v2.4c0 1-.8 1.8-1.8 1.8H6.6l-2 3.4"/>')
    + pen('<path d="M11 17.4h8.4"/>')
    + pen('<path d="M12.4 11.4V8.6"/>')
    + pen('<path d="M2 8.6h20"/>')
    + pen('<path d="M19.4 17.4v2.6"/>'),
  ),


  speedboat: art(
    pen('<path d="M2.6 14.6h18.8l-2.6 4.4H5.2z"/>')
    + pen('<path d="M8.6 14.6V9.4h6l2.6 5.2"/>')
    + pen('<path d="M2.6 17.4c1.6-3 4-4.6 7.2-4.6"/>'),
  ),

  tractor: art(
    pen('<path d="M4.6 16.4V11c0-1.4 1-2.4 2.4-2.4h4c1.4 0 2.4 1 2.4 2.4v5.4"/>')
    + pen('<path d="M13.4 12.4h3.6l2.4 4"/>')
    + pen('<circle cx="7.4" cy="17.6" r="3"/><circle cx="17.6" cy="17.6" r="2"/>')
    + pen('<path d="M4.6 13.4h8.8"/>'),
  ),

  ambulance: art(
    pen('<path d="M2.6 15.8v-6.8h11v6.8"/>')
    + pen('<path d="M13.6 12.2h3.4l3 2.4v1.2h-6.4z"/>')
    + pen('<circle cx="6.4" cy="17.6" r="2"/><circle cx="16.6" cy="17.6" r="2"/>')
    + pen('<path d="M8.4 8.4h2.4M9.6 7.2v2.4"/>'),
  ),

  'police car': art(
    pen('<path d="M2.6 16.2v-4h18.8v4"/>')
    + pen('<path d="M7.2 12.2 9.2 8.4h5.6l2 3.8"/>')
    + pen('<circle cx="7.4" cy="16.6" r="2.3"/><circle cx="16.6" cy="16.6" r="2.3"/>')
    + pen('<path d="M10.4 6.4h3.2"/>'),
  ),

  firetruck: art(
    pen('<path d="M2.6 15.8v-6.4h11.4v6.4"/>')
    + pen('<path d="M14 12.2h3.4l3 2.4v1.2H14z"/>')
    + pen('<circle cx="6.4" cy="17.6" r="2"/><circle cx="16.6" cy="17.6" r="2"/>')
    + pen('<path d="M4.6 9.4h7"/>')
    + pen('<path d="M8.4 12.4v-3"/>'),
  ),

  'cruise ship': art(
    pen('<path d="M2.6 15.4h18.8l-2.4 3.8H5z"/>')
    + pen('<path d="M4.6 15.4v-4.2h14.8v4.2"/>')
    + pen('<path d="M7 11.2V7.4h6.6v3.8"/>')
    + pen('<path d="M9.4 7.4V4.6"/>'),
  ),

  // -------------------------------------------------------------------------
  // NATURE AND BUILDINGS
  // -------------------------------------------------------------------------

  mountain: art(
    pen('<path d="M2.4 19.4 9.4 7.2l4.2 7 2-3.4 5.6 8.6z"/>')
    + pen('<path d="M7.8 11.2h3.4"/>'),
  ),

  rainbow: art(
    pen('<path d="M3.4 20.4a8.6 8.6 0 0 1 17.2 0"/>')
    + pen('<path d="M6.4 20.4a5.6 5.6 0 0 1 11.2 0"/>')
    + pen('<path d="M3.4 20.4h17.2"/>'),
  ),

  snowflake: art(
    pen('<path d="M12 2.6v18.8M3.9 7.3l16.2 9.4M20.1 7.3 3.9 16.7"/>')
    + pen('<path d="M12 6.6 9.4 4.2M12 6.6l2.6-2.4M12 17.4l-2.6 2.4M12 17.4l2.6 2.4"/>'),
  ),

  lightning: art(
    pen('<path d="M13.4 2.6 5.4 13.4h5.2l-1 8 8-10.8h-5.2z"/>'),
  ),

  tornado: art(
    pen('<path d="M4.4 6.4h15.2M6 9.6h11.6M7.6 12.8h8.4M9.4 16h5.6M11 19.2h2.4"/>'),
  ),


  castle: art(
    pen('<path d="M3.4 20.4V9.6h17v10.8"/>')
    + pen('<path d="M3.4 9.6V6l2-1.4V6l2.6-1.4V6l2.6-1.4V6l2.8-1.4V6l2.6-1.4V6l2.6-1.4V6l2-1.4v3.6"/>')
    + pen('<path d="M9.6 20.4v-5.4h4.8v5.4"/>'),
  ),

  church: art(
    pen('<path d="M4.6 20.4V11.4h14.8v9"/>')
    + pen('<path d="M12 11.4V4.6l5.4 6.8z"/>')
    + pen('<path d="M9.6 20.4v-5.4h4.8v5.4"/>')
    + pen('<path d="M12 4.6V2.6M10.4 3.4h3.2"/>'),
  ),

  skyscraper: art(
    pen('<path d="M6.4 20.6V4.6h11.2v16"/>')
    + pen('<path d="M9 8.4h2M13 8.4h2M9 12h2M13 12h2M9 15.6h2M13 15.6h2"/>')
    + pen('<path d="M3.4 20.6h17.2"/>'),
  ),

  barn: art(
    pen('<path d="M3.4 20.4V10.4L12 5.6l8.6 4.8v10"/>')
    + pen('<path d="M9.4 20.4v-6.4h5.2v6.4"/>')
    + pen('<path d="M9.4 16.4h5.2M12 16.4v-4"/>'),
  ),

  lighthouse: art(
    pen('<path d="M8.6 20.6 9.8 8.4h4.4l1.2 12.2z"/>')
    + pen('<path d="M10.6 12.4h2.8"/>')
    + pen('<path d="M9.4 8.4h5.2l-.6-2.4H10z"/>')
    + pen('<path d="M11 6V4.2h2V6"/>'),
  ),

  tent: art(
    pen('<path d="M12 4.6 21 19.4H3z"/>')
    + pen('<path d="M12 4.6v14.8"/>')
    + pen('<path d="M8.4 19.4 12 11l3.6 8.4"/>'),
  ),

  // -------------------------------------------------------------------------
  // EVERYDAY OBJECTS
  // -------------------------------------------------------------------------

  bed: art(
    pen('<path d="M3.4 20.6v-8.2h17.2v8.2"/>')
    + pen('<path d="M3.4 16.4h17.2"/>')
    + pen('<path d="M7.4 12.4V9.4h9.2v3"/>'),
  ),

  couch: art(
    pen('<path d="M4.4 16.4V10c0-1.6 1.4-2.8 3-2.8h9.2c1.6 0 3 1.2 3 2.8v6.4"/>')
    + pen('<path d="M2.6 16.4h18.8"/>')
    + pen('<path d="M6.4 16.4v2.6M17.6 16.4v2.6"/>')
    + pen('<path d="M9.6 12.4h4.8"/>'),
  ),

  'floor lamp': art(
    pen('<path d="M7.4 11.4h9.2l-2.4-6.4H9.8z"/>')
    + pen('<path d="M12 11.4v7.6"/>')
    + pen('<path d="M8.4 20.6h7.2"/>'),
  ),

  book: art(
    pen('<path d="M4.4 4.6h6.2c1 0 1.8.8 1.8 1.8v13.2c0-1-.8-1.8-1.8-1.8H4.4z"/>')
    + pen('<path d="M19.6 4.6h-6.2c-1 0-1.8.8-1.8 1.8v13.2c0-1 .8-1.8 1.8-1.8h6.2z"/>')
    + pen('<path d="M12 6.4v13.2"/>'),
  ),

  pencil: art(
    pen('<path d="M4.6 19.4l1.4-4 10.6-10.6c.8-.8 2-.8 2.8 0s.8 2 0 2.8L8.8 18.2z"/>')
    + pen('<path d="M14.6 5.8l3.6 3.6"/>')
    + pen('<path d="M4 20.6l2.4-.6"/>'),
  ),

  scissors: art(
    pen('<circle cx="6.4" cy="17.6" r="2.4"/><circle cx="17.6" cy="17.6" r="2.4"/>')
    + pen('<path d="M8.2 15.8 18.4 4.6M15.8 15.8 5.6 4.6"/>'),
  ),

  hammer: art(
    pen('<path d="M4.6 19.4 12.4 11.6"/>')
    + pen('<path d="M12.4 11.6c1.6-1.6 4-1.4 5.4.2 1.4 1.6 1.2 4-.4 5.4-1.6 1.4-4 1.2-5.4-.4"/>'),
  ),

  axe: art(
    pen('<path d="M5.4 20.6 15.4 10.6"/>')
    + pen('<path d="M15.4 10.6c0-3 2.2-5.2 5-5.6.4 2.8-1.4 5.4-4.2 6.2"/>'),
  ),

  'wine bottle': art(
    pen('<path d="M9.4 2.6h5.2v4.2c0 1.4 2.4 2.6 2.4 6.2v6.4c0 1.4-1 2.4-2.4 2.4H9.4c-1.4 0-2.4-1-2.4-2.4v-6.4c0-3.6 2.4-4.8 2.4-6.2z"/>')
    + pen('<path d="M7 13h10"/>'),
  ),

  'wine glass': art(
    pen('<path d="M7.4 3.4h9.2l-1 8.2c-.2 1.6-1.6 2.8-3.6 2.8s-3.4-1.2-3.6-2.8z"/>')
    + pen('<path d="M12 14.4v6M8.4 20.6h7.2"/>'),
  ),

  fork: art(
    pen('<path d="M8.4 3.4v6.4c0 1.6-1 2.4-1 4v2.4M15.6 3.4v6.4c0 1.6 1 2.4 1 4v2.4"/>')
    + pen('<path d="M12 3.4v9.8c0 1.4 0 3.4 0 8.4"/>'),
  ),

  spoon: art(
    pen('<ellipse cx="12" cy="7" rx="3.2" ry="4.2"/>')
    + pen('<path d="M12 11.2v9.4"/>'),
  ),


  'light bulb': art(
    pen('<path d="M12 3.4c3.6 0 6.4 2.8 6.4 6.4 0 2.4-1.2 4-2.4 5.2-.6.6-1 1.2-1 2H9c0-.8-.4-1.4-1-2-1.2-1.2-2.4-2.8-2.4-5.2 0-3.6 2.8-6.4 6.4-6.4z"/>')
    + pen('<path d="M9.4 17.6h5.2M9.8 20.4h4.4"/>'),
  ),

  candle: art(
    pen('<path d="M8.4 9.4h7.2v11.2H8.4z"/>')
    + pen('<path d="M8.4 12.4h7.2"/>')
    + pen('<path d="M12 9.4V6.4"/>')
    + pen('<path d="M12 6.4c-.8-1.2-.4-2.4.6-3 .8.8 1.2 1.8.8 3z"/>'),
  ),

  'smiley face': art(
    pen('<circle cx="12" cy="12" r="9"/>')
    + pen('<path d="M7.8 14.4c1.3 1.5 2.7 2.3 4.2 2.3s2.9-.8 4.2-2.3"/>')
    + ink('<circle cx="9" cy="9.6" r=".9"/><circle cx="15" cy="9.6" r=".9"/>'),
  ),

  envelope: art(
    pen('<path d="M3.4 6.4h17.2v11.2H3.4z"/>')
    + pen('<path d="M3.4 6.4 12 13l8.6-6.6"/>'),
  ),

  compass: art(
    pen('<circle cx="12" cy="12" r="9"/>')
    + pen('<path d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z"/>'),
  ),

  snowman: art(
    pen('<circle cx="12" cy="16.4" r="5"/>')
    + pen('<circle cx="12" cy="8" r="3.4"/>')
    + pen('<path d="M12 4.6V2.6M9 2.6h6"/>')
    + ink('<circle cx="10.6" cy="7.4" r=".5"/><circle cx="13.4" cy="7.4" r=".5"/>'),
  ),

  computer: art(
    pen('<path d="M3.4 5.4h17.2v10.4H3.4z"/>')
    + pen('<path d="M8.4 19.4h7.2M12 15.8v3.6"/>'),
  ),

  television: art(
    pen('<path d="M4.4 6.4h15.2v10.4H4.4z"/>')
    + pen('<path d="M8.4 20.6h7.2M12 16.8v3.8"/>')
    + pen('<path d="M17.6 3.4 20 6.4"/>'),
  ),

  camera: art(
    pen('<path d="M3.4 8.4h4l1.6-2.4h6l1.6 2.4h4v10.2H3.4z"/>')
    + pen('<circle cx="12" cy="13.4" r="3.4"/>'),
  ),


  headphones: art(
    pen('<path d="M4.4 15.4v-3.4a7.6 7.6 0 0 1 15.2 0v3.4"/>')
    + pen('<path d="M2.6 15.4h4v4.6h-4zM17.4 15.4h4v4.6h-4z"/>'),
  ),

  radio: art(
    pen('<path d="M3.4 8.4h17.2v9.4H3.4z"/>')
    + pen('<circle cx="8.4" cy="13.1" r="2.2"/>')
    + pen('<path d="M13.4 11.4h5M13.4 14.8h5"/>'),
  ),

  telephone: art(
    pen('<path d="M6.4 3.4c1.6 0 2.6 1 2.6 2.4v1.4c0 1.4-1 2.4-2.6 2.4H5.2C4 9.6 3.4 8.6 3.4 7.4"/>')
    + pen('<path d="M3.4 7.4c0-1.2.8-2 2-2"/>')
    + pen('<path d="M4.6 9.6c2 3.4 6.4 7.8 9.8 9.8l1.8-1.8c.6-.6 1.6-.6 2.2 0l1.4 1.4c.6.6.6 1.6 0 2.2"/>'),
  ),

  't-shirt': art(
    pen('<path d="M8.4 3.4 4.6 6.4l1.4 4 2-.8V20.6h7.6V9.6l2 .8 1.4-4-3.8-3z"/>')
    + pen('<path d="M8.4 3.4h7.2c0 2-1.6 3.4-3.6 3.4S8.4 5.4 8.4 3.4z"/>'),
  ),

  pants: art(
    pen('<path d="M6.4 3.4h11.2v17.2L14 20.6l-2-8-2 8-3.6 0z"/>')
    + pen('<path d="M6.4 9.4h11.2"/>'),
  ),


  sock: art(
    pen('<path d="M8.4 3.4h4.2c1.4 0 2.4 1 2.4 2.4v6.2c0 1.4-1 2.4-2.4 2.4h-1.2"/>')
    + pen('<path d="M8.4 14.4c-1.4 0-2.4 1-2.4 2.4v2.4c0 1.4 1 2.4 2.4 2.4h6.2c1.4 0 2.4-1 2.4-2.4"/>'),
  ),

  hat: art(
    pen('<path d="M12 3.4c3.4 0 6.2 1.4 6.2 3.2 0 1.8-2.8 3.2-6.2 3.2s-6.2-1.4-6.2-3.2c0-1.8 2.8-3.2 6.2-3.2z"/>')
    + pen('<path d="M3.4 17.4c0-3.6 3.8-6.6 8.6-6.6s8.6 3 8.6 6.6z"/>')
    + pen('<path d="M3.4 17.4h17.2"/>'),
  ),

  eyeglasses: art(
    pen('<circle cx="6.6" cy="13.4" r="4"/><circle cx="17.4" cy="13.4" r="4"/>')
    + pen('<path d="M10.6 12.6c.8-.6 2-.6 2.8 0"/>')
    + pen('<path d="M2.6 11.4 4 10M21.4 11.4 20 10"/>'),
  ),

  wristwatch: art(
    pen('<circle cx="12" cy="12" r="5"/>')
    + pen('<path d="M9.4 7 10.4 3.4h3.2L14.6 7M9.4 17l1 3.6h3.2l1-3.6"/>')
    + pen('<path d="M12 9.6V12l2 1.4"/>'),
  ),

  crown: art(
    pen('<path d="M3.4 17.4h17.2v3.2H3.4z"/>')
    + pen('<path d="M3.4 17.4 5.4 7l4.2 4.4L12 4.6l2.4 6.8L18.6 7l2 10.4"/>')
    + ink('<circle cx="12" cy="19" r=".8"/>'),
  ),

  piano: art(
    pen('<path d="M3.4 5.4h17.2v10.4H3.4z"/>')
    + pen('<path d="M6.4 15.8v4.8M17.6 15.8v4.8"/>')
    + pen('<path d="M8.4 5.4v6.4M12 5.4v6.4M15.6 5.4v6.4"/>'),
  ),

  drums: art(
    pen('<ellipse cx="12" cy="9.4" rx="7.2" ry="2.8"/>')
    + pen('<path d="M4.8 9.4v6.2c0 1.6 3.2 2.8 7.2 2.8s7.2-1.2 7.2-2.8V9.4"/>')
    + pen('<path d="M4.8 12.4c0 1.6 3.2 2.8 7.2 2.8s7.2-1.2 7.2-2.8"/>')
    + pen('<path d="M2.6 6.4 5 8.4M21.4 6.4 19 8.4"/>'),
  ),

  trumpet: art(
    pen('<path d="M3.4 10.4h11.2l5.4-3.4v10l-5.4-3.4H3.4z"/>')
    + pen('<path d="M17.4 12.4c1 1 2 1.4 3 1.4"/>')
    + pen('<path d="M7.4 10.4v4.4"/>'),
  ),

  violin: art(
    pen('<path d="M12 4.4c-1.4 0-2.4 1-2.4 2.4 0 1 .6 1.8 1.6 2.4.8.5 1.2 1.1 1.2 1.9v1.5"/>')
    + pen('<path d="M12 4.4c1.4 0 2.4 1 2.4 2.4 0 1-.6 1.8-1.6 2.4-.8.5-1.2 1.1-1.2 1.9v1.5"/>')
    + pen('<path d="M9.8 13.4c-1 1-1 3 0 4s3 1 4 0 1-3 0-4-3-1-4 0z"/>')
    + pen('<path d="M8.4 18.4 10.6 21M15.6 18.4 13.4 21"/>'),
  ),

  saxophone: art(
    pen('<path d="M9.4 3.4h4.2v3.4"/>')
    + pen('<path d="M13.6 6.8c0 4-1 6-3 8-1.4 1.4-3.4 1.4-4.6 0"/>')
    + pen('<path d="M6 14.8c-1.4 1.4-1 3.4.8 4.4l3.4 1.4c1.4.6 3-.2 3.4-1.6"/>')
    + pen('<path d="M15.6 12.4c1.6 0 2.4 1 2.4 2.4"/>'),
  ),

  circle: art(pen('<circle cx="12" cy="12" r="8.6"/>')),
  square: art(pen('<path d="M4.4 4.4h15.2v15.2H4.4z"/>')),
  triangle: art(pen('<path d="M12 3.4 21.4 20.6H2.6z"/>')),
  diamond: art(pen('<path d="M12 3.4 20.6 12 12 20.6 3.4 12z"/>')),
  hexagon: art(pen('<path d="M12 3.4 19.6 7.7v8.6L12 20.6 4.4 16.3V7.7z"/>')),

  ear: art(
    pen('<path d="M15.4 4.4c-3.4 0-6.4 3-6.4 6.8 0 2.6 1 4.4 1 6.6 0 1.8 1.4 3 3 3s2.8-1.2 2.8-2.8"/>')
    + pen('<path d="M12.8 11.4c0-2 1.4-3.4 2.6-3"/>'),
  ),

  nose: art(
    pen('<path d="M12 3.4v9.4"/>')
    + pen('<path d="M12 12.8c-1.4 1-2.4 2.4-2 3.6.4 1 1.4 1.4 2.6 1.4"/>')
    + pen('<path d="M8.4 17.8c1.4 1 5.8 1 7.2 0"/>'),
  ),

  mouth: art(
    pen('<path d="M3.4 12c2.6 5 6 7.4 8.6 7.4s6-2.4 8.6-7.4c-2.6-3.4-5.4-5-8.6-5s-6 1.6-8.6 5z"/>')
    + pen('<path d="M3.4 12h17.2"/>'),
  ),

  foot: art(
    pen('<path d="M8.4 3.4h4.2c1.4 0 2.4 1.4 2.4 3.4v5.2c0 1.4 1 2.4 2.4 2.4h1.6c1.4 0 2.4 1 2.4 2.4v2.4c0 2.4-2 4.4-4.4 4.4H7.4C5 20.6 3.4 18.4 3.4 15.8c0-2.4 1.6-4.4 3.6-4.4"/>'),
  ),

  tooth: art(
    pen('<path d="M8.4 3.4c-2.6 0-4.4 2.4-4.4 5.6 0 4 1.4 6.6 2.6 9.4.6 1.4 1.4 2.2 2.6 2.2"/>')
    + pen('<path d="M15.6 3.4c2.6 0 4.4 2.4 4.4 5.6 0 4-1.4 6.6-2.6 9.4-.6 1.4-1.4 2.2-2.6 2.2"/>')
    + pen('<path d="M9.2 20.6c0-2.4 1.2-4 2.8-4s2.8 1.6 2.8 4"/>'),
  ),

  brain: art(
    pen('<path d="M12 4.4c-2.4 0-4 1.4-4.6 3.4-1.4.2-2.4 1.4-2.4 3 0 1 .4 1.8 1.2 2.4"/>')
    + pen('<path d="M12 4.4c2.4 0 4 1.4 4.6 3.4 1.4.2 2.4 1.4 2.4 3 0 1-.4 1.8-1.2 2.4"/>')
    + pen('<path d="M6.2 13.2c-.6 2.4.4 4.6 2.2 5.8M17.8 13.2c.6 2.4-.4 4.6-2.2 5.8"/>')
    + pen('<path d="M12 4.4v14.6M9 8.4h6M8.4 12.4h7.2"/>'),
  ),
};

export const LINE_ART_LABELS = Object.keys(LINE_ART);
export const LINE_ART_COUNT = LINE_ART_LABELS.length;
