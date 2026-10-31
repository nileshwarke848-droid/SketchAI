export const DEFAULT_ACTIVE_COLOR = '#000000';
export const DEFAULT_BACKGROUND_COLOR = '#FFFFFF';

export const QUICK_COLOR_SWATCHES = Object.freeze([
  Object.freeze({ name: 'Black', hex: '#000000' }),
  Object.freeze({ name: 'White', hex: '#FFFFFF' }),
  Object.freeze({ name: 'Gray', hex: '#808080' }),
  Object.freeze({ name: 'Red', hex: '#FF0000' }),
  Object.freeze({ name: 'Orange', hex: '#FF8000' }),
  Object.freeze({ name: 'Yellow', hex: '#FFFF00' }),
  Object.freeze({ name: 'Green', hex: '#00FF00' }),
  Object.freeze({ name: 'Cyan', hex: '#00FFFF' }),
  Object.freeze({ name: 'Blue', hex: '#0000FF' }),
  Object.freeze({ name: 'Purple', hex: '#8000FF' }),
  Object.freeze({ name: 'Pink', hex: '#FF0080' }),
]);

/** Accept only integral 8-bit channel values. Invalid channels return null. */
export function isValidRgbChannel(channel) {
  return Number.isInteger(channel) && channel >= 0 && channel <= 255;
}

/** Strict integer parser for editable RGB fields; decimals and blanks are invalid. */
export function parseRgbChannelInput(value) {
  if (typeof value === 'number') return isValidRgbChannel(value) ? value : null;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const channel = Number(value);
  return isValidRgbChannel(channel) ? channel : null;
}

/** Convert three 8-bit integer channels to canonical uppercase #RRGGBB. */
export function rgbToHex(red, green, blue) {
  if (![red, green, blue].every(isValidRgbChannel)) return null;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Normalize a valid six-digit RGB hex value, or return null for malformed input. */
export function normalizeHexColor(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return null;
  return value.toUpperCase();
}

export function isValidHexColor(value) {
  return normalizeHexColor(value) !== null;
}

/** Convert a valid six-digit RGB hex value to exact 8-bit channels, or return null. */
export function hexToRgb(value) {
  const hex = normalizeHexColor(value);
  if (!hex) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}
