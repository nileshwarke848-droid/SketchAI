import React from 'react';
import { getIconData } from '../data/artwork';

// Renders a bundled vector icon for a category, or a typographic card body when
// no honest icon exists (tier C). Kept deliberately small: the icon bodies are
// plain SVG markup from src/data/icons.js.
export default function SuggestionIcon({ label, size = 34, className = '' }) {
  const icon = getIconData(label);
  if (!icon) return null;
  return <svg
    className={className}
    width={size}
    height={size}
    viewBox={`0 0 ${icon.w} ${icon.h}`}
    aria-hidden="true"
    focusable="false"
    dangerouslySetInnerHTML={{ __html: icon.b }}
  />;
}
