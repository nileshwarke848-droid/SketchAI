/** Pure single-line text-entry state helpers shared by UI and regression tests. */
export function beginTextCreation(point) {
  return { mode: 'create', x: point.x, y: point.y, value: '' };
}

export function beginTextEditing(object) {
  if (!object || object.type !== 'text') return null;
  return { mode: 'edit', id: object.id, x: object.x, y: object.y, value: object.text };
}

export function updateTextDraftValue(draft, value) {
  return draft ? { ...draft, value: String(value ?? '').replace(/[\r\n]+/g, ' ') } : null;
}

export function cancelTextDraft() {
  return null;
}

/** Empty input confirms as no-op; valid input is always a trimmed single line. */
export function confirmTextDraft(draft) {
  const text = String(draft?.value ?? '').replace(/[\r\n]+/g, ' ').trim();
  return text ? { ...draft, text } : null;
}
