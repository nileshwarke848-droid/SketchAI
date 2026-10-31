import React, { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ACTIVE_COLOR,
  QUICK_COLOR_SWATCHES,
  hexToRgb,
  normalizeHexColor,
  parseRgbChannelInput,
  rgbToHex,
} from '../lib/color-utils.js';

const CHANNELS = [
  { key: 'r', name: 'Red' },
  { key: 'g', name: 'Green' },
  { key: 'b', name: 'Blue' },
];

/** One reusable, synchronized RGB control for the workspace Active Color. */
export default function ColorControl({ value, onChange }) {
  const normalizedValue = normalizeHexColor(value) ?? DEFAULT_ACTIVE_COLOR;
  const rgb = hexToRgb(normalizedValue);
  const [hexDraft, setHexDraft] = useState(normalizedValue);
  const [channelDrafts, setChannelDrafts] = useState(() => ({
    r: String(rgb.r),
    g: String(rgb.g),
    b: String(rgb.b),
  }));
  const focusedChannel = useRef(null);

  useEffect(() => {
    const nextRgb = hexToRgb(normalizedValue);
    setHexDraft(normalizedValue);
    setChannelDrafts((current) => ({
      r: focusedChannel.current === 'r' ? current.r : String(nextRgb.r),
      g: focusedChannel.current === 'g' ? current.g : String(nextRgb.g),
      b: focusedChannel.current === 'b' ? current.b : String(nextRgb.b),
    }));
  }, [normalizedValue]);

  const updateHexDraft = (event) => {
    const draft = event.currentTarget.value;
    setHexDraft(draft);
    const normalized = normalizeHexColor(draft);
    if (normalized) onChange(normalized);
  };

  const updateChannel = (key, rawValue) => {
    setChannelDrafts((current) => ({ ...current, [key]: rawValue }));
    const channel = parseRgbChannelInput(rawValue);
    if (channel === null) return;
    const currentRgb = hexToRgb(normalizedValue);
    const next = rgbToHex(
      key === 'r' ? channel : currentRgb.r,
      key === 'g' ? channel : currentRgb.g,
      key === 'b' ? channel : currentRgb.b,
    );
    if (next) onChange(next);
  };

  const restoreChannel = (key) => {
    focusedChannel.current = null;
    const currentRgb = hexToRgb(normalizedValue);
    setChannelDrafts((current) => ({ ...current, [key]: String(currentRgb[key]) }));
  };

  return <fieldset className="active-color-control" aria-label="Active color controls">
    <legend>ACTIVE COLOR</legend>
    <div className="active-color-editors">
      <label className="active-color-picker-label" title="Choose any RGB color">
        <input
          type="color"
          value={normalizedValue}
          onChange={(event) => {
            const next = normalizeHexColor(event.currentTarget.value);
            if (next) onChange(next);
          }}
          aria-label="Active color picker"
        />
      </label>
      <label className="color-hex-field">
        <span>HEX</span>
        <input
          type="text"
          value={hexDraft}
          onChange={updateHexDraft}
          onBlur={() => setHexDraft(normalizedValue)}
          maxLength={7}
          spellCheck="false"
          autoCapitalize="characters"
          aria-label="Hex color"
          inputMode="text"
        />
      </label>
      <div className="rgb-inputs" role="group" aria-label="Active color RGB channels">
        {CHANNELS.map(({ key, name }) => <label className="rgb-field" key={key}>
          <span aria-hidden="true">{key.toUpperCase()}</span>
          <input
            type="number"
            min="0"
            max="255"
            step="1"
            inputMode="numeric"
            value={channelDrafts[key]}
            onFocus={() => { focusedChannel.current = key; }}
            onChange={(event) => updateChannel(key, event.currentTarget.value)}
            onBlur={() => restoreChannel(key)}
            aria-label={name}
          />
        </label>)}
      </div>
      <output className="active-color-value" aria-label="Current active color">{normalizedValue}</output>
    </div>
    <div className="quick-color-swatches" role="group" aria-label="Quick color swatches">
      {QUICK_COLOR_SWATCHES.map(({ name, hex }) => <button
        key={hex}
        type="button"
        className={`color-swatch ${normalizedValue === hex ? 'active' : ''}`}
        style={{ '--swatch': hex }}
        onClick={() => onChange(hex)}
        aria-label={`Set active color ${name} ${hex}`}
        aria-pressed={normalizedValue === hex}
        title={`${name} ${hex}`}
      />)}
    </div>
  </fieldset>;
}
