import { cloneSceneObjects } from './scene.js';
import { DEFAULT_BACKGROUND_COLOR, normalizeHexColor } from './color-utils.js';

/** Bounded history of editor snapshots; a snapshot is one completed action. */
export class EditorHistory {
  constructor(limit = 60) {
    this.limit = Math.max(2, limit);
    this.entries = [];
    this.cursor = -1;
  }

  get canUndo() {
    return this.cursor > 0;
  }

  get canRedo() {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1;
  }

  get current() {
    return this.cursor >= 0 ? this.entries[this.cursor] : null;
  }

  push(snapshot) {
    const entry = cloneEditorSnapshot(snapshot);
    this.entries = this.entries.slice(0, this.cursor + 1);
    this.entries.push(entry);
    if (this.entries.length > this.limit) this.entries.shift();
    this.cursor = this.entries.length - 1;
    return entry;
  }

  undo() {
    if (!this.canUndo) return null;
    this.cursor -= 1;
    return cloneEditorSnapshot(this.entries[this.cursor]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.cursor += 1;
    return cloneEditorSnapshot(this.entries[this.cursor]);
  }

  clear() {
    this.entries = [];
    this.cursor = -1;
  }
}

export function cloneEditorSnapshot(snapshot) {
  const selectedObjectIds = Array.isArray(snapshot.selectedObjectIds)
    ? [...new Set(snapshot.selectedObjectIds)]
    : snapshot.selectedObjectId ? [snapshot.selectedObjectId] : [];
  return {
    objects: cloneSceneObjects(snapshot.objects ?? []),
    sketch: snapshot.sketch ?? null,
    fill: snapshot.fill ?? null,
    hasFill: Boolean(snapshot.hasFill),
    canvasBackgroundColor: normalizeHexColor(snapshot.canvasBackgroundColor) ?? DEFAULT_BACKGROUND_COLOR,
    selectedObjectIds,
    selectedObjectId: selectedObjectIds.length === 1 ? selectedObjectIds[0] : null,
  };
}
