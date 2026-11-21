import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Bold, BookOpen, Check, Circle, CircleHelp, Copy, Eraser, FlipHorizontal2, Hand, Info, Lasso, LockKeyhole, Maximize2, Minus, MousePointer2, PaintBucket, Pencil, RotateCcw, Sparkles, Square, Trash2, Type, X, ZoomIn, ZoomOut } from 'lucide-react';
import { loadModel, predict } from './ai/model';
import { getSketchBounds } from './ai/preprocess';
import SuggestionBar from './components/SuggestionBar';
import ColorControl from './components/ColorControl';
import { displayName, getArtworkVariants } from './data/artwork';
import { buildSuggestions } from './lib/suggestions';
import { SUGGESTION_SOURCE_PLAN } from './data/suggestion-source-plan';
import {
  DEFAULT_VIEWPORT,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  canvasToClientPoint,
  clampViewZoom,
  clientToCanvasPoint,
  clientToViewportPoint,
  zoomViewportAroundPoint,
  viewportTransformCss,
} from './lib/canvas-coordinates';
import { composeFillBoundary, fillCanvasRegion, fillRasterRegion } from './lib/raster-fill';
import { drawCanvasStrokeSegment } from './lib/canvas-drawing';
import { DEFAULT_ACTIVE_COLOR, DEFAULT_BACKGROUND_COLOR, normalizeHexColor } from './lib/color-utils';
import { beginTextCreation, beginTextEditing, cancelTextDraft, confirmTextDraft, updateTextDraftValue } from './lib/text-editor';
import { EditorHistory } from './lib/editor-history';
import {
  combineSelectionIds,
  isClosedSelectionDoodle,
  selectObjectsInDoodleLoop,
  selectObjectsTouchedByDoodle,
} from './lib/selection-doodle';
import {
  addSceneObject,
  createArtworkImageCache,
  createBitmapImageCache,
  createBitmapSceneObject,
  createSceneImageCache,
  createSceneObject,
  createSceneObjectId,
  createShapeSceneObject,
  createTextSceneObject,
  defaultSceneObjectColor,
  getEstimatedTextBounds,
  MAX_TEXT_FONT_SIZE,
  MIN_TEXT_FONT_SIZE,
  SAFE_TEXT_FAMILIES,
  deleteSceneObject,
  deleteSceneObjects,
  duplicateSceneObjects,
  flipSceneObjects,
  getGroupBounds,
  getSelectedSceneObjects,
  isThicknessEditable,
  moveSceneObjects,
  moveShapeEndpoint,
  recolorSceneObjects,
  reorderSceneObjects,
  resizeSceneObjectsGroup,
  selectObjectsInMarquee,
  rotateSceneObjectsGroup,
  getObjectCenter,
  getRotationFromPointer,
  getRotationHandle,
  getSceneObjectPlacement,
  getTransformedCorners,
  hitTestScene,
  objectLocalToWorld,
  renderScene,
  resizeSceneObject,
  updateSceneObject,
  updateSelectionForClick,
  worldToObjectLocal,
} from './lib/scene';
import {
  DOODLE_RADIUS_FACTOR,
  ERASE_PIXEL_SCALE,
  canvasToPngDataUrl,
  createEraseMask,
  eraseWithMask,
  maskOverlapsInk,
  measureRemaining,
  remnantPlacement,
  renderObjectRaster,
  sketchInkSheet,
  splitInkBlobs,
} from './lib/doodle-eraser';
import DebugPanel from './dev/DebugPanel';
import FaqPage from './components/FaqPage';

const W = 1200, H = 720;
const LIVE_PREDICTION_INTERVAL_MS = 220;
// After a lasso is released the dotted outline fades out over this long, and the
// selection is committed when the fade ends. Both are the same 120 ms so the
// outline never lingers over a finished selection.
const SELECT_DOODLE_SETTLE_MS = 120;
const FINAL_PREDICTION_DELAY_MS = 260;
const zoomSteps = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function constrainShapeEnd(start, end, shapeKind, constrain) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (!constrain || Math.hypot(dx, dy) < 0.01) return end;
  if (shapeKind === 'rectangle' || shapeKind === 'ellipse') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
  }
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
  return { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length };
}

const clearPredictionTimer = (timerRef) => {
  clearTimeout(timerRef.current);
  timerRef.current = null;
};

// The preprocessing inspector is a development tool. It opens automatically in
// dev builds and can be forced on a deployed build with ?debug=ai.
const DEBUG_AI = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === 'ai';
const IDLE = { status: 'idle', predictions: [] };
const GUESSING_STORAGE_KEY = 'sketchai:guessing-enabled';
function readGuessingPreference() {
  try {
    return window.localStorage.getItem(GUESSING_STORAGE_KEY) !== 'no';
  } catch {
    return true;
  }
}
// Cancel a pending lasso settle (the 120 ms fade + commit after pointer-up). A
// module-level helper because both the tool-switch effect and the pointer
// handlers need it, and it only touches a ref.
function cancelSelectionDoodleSettle(ref) {
  if (ref.current !== null) {
    window.clearTimeout(ref.current);
    ref.current = null;
  }
}

// A probability under half a percent is real but not meaningful to show as "0%".
const formatScore = (score) => (score < 0.005 ? '<1%' : `${Math.round(score * 100)}%`);

function App() {
  const canvasRef = useRef(null);
  const fillRef = useRef(null);
  const sketchRef = useRef(null);
  const recognitionCanvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const referenceCanvasRef = useRef(null);
  const fillSnapshotRef = useRef(null);
  const hasFillRef = useRef(false);
  const backgroundColorRef = useRef(DEFAULT_BACKGROUND_COLOR);
  const viewRef = useRef({ ...DEFAULT_VIEWPORT });
  const spacePressedRef = useRef(false);
  const modelRef = useRef(null);
  const timerRef = useRef(null);
  const lastPredictionAtRef = useRef(0);
  const pointerRef = useRef(null);
  const historyRef = useRef(new EditorHistory(24));
  const sceneObjectsRef = useRef([]);
  const selectedObjectIdsRef = useRef([]);
  const sketchSnapshotRef = useRef(null);
  const revisionRef = useRef(0);
  const imageCacheRef = useRef(null);
  if (!imageCacheRef.current) imageCacheRef.current = createArtworkImageCache();
  const bitmapCacheRef = useRef(null);
  if (!bitmapCacheRef.current) bitmapCacheRef.current = createBitmapImageCache();
  const doodleStrokeRef = useRef(null);
  const sceneImageCacheRef = useRef(null);
  if (!sceneImageCacheRef.current) {
    sceneImageCacheRef.current = createSceneImageCache(imageCacheRef.current, bitmapCacheRef.current);
  }

  const [tool, setTool] = useState('pencil');
  const [guessingEnabled, setGuessingEnabled] = useState(readGuessingPreference);
  const guessingEnabledRef = useRef(guessingEnabled);
  guessingEnabledRef.current = guessingEnabled;
  const [selectionDoodleColor, setSelectionDoodleColor] = useState('#4B8BF4');
  const [selectionDoodlePath, setSelectionDoodlePath] = useState(null);
  const [selectionDoodleSettling, setSelectionDoodleSettling] = useState(false);
  const selectDoodleTimerRef = useRef(null);
  const [shapePreview, setShapePreview] = useState(null);
  const [activeColor, setActiveColor] = useState(DEFAULT_ACTIVE_COLOR);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR);
  const [view, setView] = useState({ ...DEFAULT_VIEWPORT });
  const [textDraft, setTextDraft] = useState(null);
  const [size, setSize] = useState(7);
  const [defaultShapeFill, setDefaultShapeFill] = useState('none');
  const [thicknessDraft, setThicknessDraft] = useState(0);
  // Classic eraser (whole-object remove) vs doodle eraser (shave pixels, keep an editable remnant).
  const [eraserMode, setEraserMode] = useState('classic');
  const [sceneObjects, setSceneObjects] = useState([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [status, setStatus] = useState('loading');
  const [recognition, setRecognition] = useState(IDLE);
  const [hasInk, setHasInk] = useState(false);
  const [hasFill, setHasFill] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // The FAQ is a page, not a modal: it has its own #faq address and the editor
  // underneath keeps its state, so closing it never loses a drawing.
  const [showFaq, setShowFaq] = useState(() => (typeof window === 'undefined'
    ? false
    : window.location.hash.replace(/^#\/?/, '') === 'faq'));
  const [message, setMessage] = useState('');
  const [showDebug, setShowDebug] = useState(DEBUG_AI);
  const [backend, setBackend] = useState('');
  const [classCount, setClassCount] = useState(0);
  const [modelTier, setModelTier] = useState('');
  const [fallbackReason, setFallbackReason] = useState(null);

  useEffect(() => {
    const syncFromHash = () => setShowFaq(window.location.hash.replace(/^#\/?/, '') === 'faq');
    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
      window.removeEventListener('popstate', syncFromHash);
    };
  }, []);

  // The address bar says #faq while the page is open, so it can be linked and
  // reloaded, but the editor stays mounted underneath and keeps the drawing.
  const openFaq = () => {
    setShowFaq(true);
    if (window.location.hash !== '#faq') window.history.replaceState(null, '', '#faq');
  };

  const closeFaq = () => {
    setShowFaq(false);
    if (window.location.hash === '#faq') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  useEffect(() => {
    if (tool !== 'selectDoodle') {
      cancelSelectionDoodleSettle(selectDoodleTimerRef);
      setSelectionDoodlePath(null);
      setSelectionDoodleSettling(false);
    }
  }, [tool]);

  const syncScene = (next) => {
    sceneObjectsRef.current = next;
    setSceneObjects(next);
    const selected = new Set(selectedObjectIdsRef.current);
    const retained = next.filter((object) => selected.has(object.id)).map((object) => object.id);
    if (retained.length !== selectedObjectIdsRef.current.length
      || retained.some((id, index) => id !== selectedObjectIdsRef.current[index])) {
      selectedObjectIdsRef.current = retained;
      setSelectedObjectIds(retained);
    }
  };
  const chooseObjects = (ids) => {
    const selected = new Set(ids ?? []);
    const ordered = sceneObjectsRef.current.filter((object) => selected.has(object.id)).map((object) => object.id);
    const changed = ordered.length !== selectedObjectIdsRef.current.length
      || ordered.some((id, index) => id !== selectedObjectIdsRef.current[index]);
    selectedObjectIdsRef.current = ordered;
    setSelectedObjectIds(ordered);
    const thicknessValues = sceneObjectsRef.current
      .filter((object) => selected.has(object.id) && isThicknessEditable(object))
      .map((object) => object.thicknessDelta ?? 0);
    setThicknessDraft(thicknessValues.length && thicknessValues.every((value) => value === thicknessValues[0])
      ? thicknessValues[0] : 0);
    if (changed) schedulePrediction();
  };
  const chooseObject = (id) => chooseObjects(id ? [id] : []);
  const updateHistoryButtons = () => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  };
  const pushHistory = useCallback(({ captureSketch = false, captureFill = false } = {}) => {
    const sketch = sketchRef.current;
    const fill = fillRef.current;
    if (!sketch || !fill) return;
    try {
      if (captureSketch || !sketchSnapshotRef.current) {
        sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
      }
      if (captureFill || !fillSnapshotRef.current) {
        fillSnapshotRef.current = fill.getContext('2d').getImageData(0, 0, W, H);
      }
      historyRef.current.push({
        objects: sceneObjectsRef.current,
        sketch: sketchSnapshotRef.current,
        fill: fillSnapshotRef.current,
        hasFill: hasFillRef.current,
        canvasBackgroundColor: backgroundColorRef.current,
        selectedObjectIds: selectedObjectIdsRef.current,
      });
      updateHistoryButtons();
    } catch (error) {
      console.error('Could not store this step in the undo history:', error);
    }
  }, []);

  const composeRecognitionSketch = (userMarks = sceneObjectsRef.current.filter((object) => object.isSketchStroke), selectedOnly = false) => {
    const sketch = sketchRef.current;
    if (!sketch) return null;
    if (!recognitionCanvasRef.current) {
      recognitionCanvasRef.current = document.createElement('canvas');
      recognitionCanvasRef.current.width = W;
      recognitionCanvasRef.current.height = H;
    }
    const surface = recognitionCanvasRef.current;
    renderScene(userMarks, surface, sceneImageCacheRef.current);
    if (!selectedOnly) surface.getContext('2d').drawImage(sketch, 0, 0);
    return surface;
  };

  const runPrediction = useCallback(() => {
    if (!guessingEnabledRef.current) return;
    const loaded = modelRef.current;
    const sketch = sketchRef.current;
    if (!loaded || !sketch) return;
    lastPredictionAtRef.current = performance.now();
    try {
      const selectedIds = new Set(selectedObjectIdsRef.current);
      const allMarks = sceneObjectsRef.current.filter((object) => object.isSketchStroke);
      const selectedMarks = allMarks.filter((object) => selectedIds.has(object.id));
      const useSelectedMarks = selectedMarks.length > 0;
      const recognitionSketch = composeRecognitionSketch(useSelectedMarks ? selectedMarks : allMarks, useSelectedMarks);
      const result = predict(loaded.model, loaded.labels, recognitionSketch, { profile: loaded.profile });
      if (result.status === 'error') throw result.error ?? new Error('Inference failed');
      setHasInk(Boolean(result.debug?.bounds));
      setRecognition(result);
    } catch (error) {
      console.error('Prediction failed:', error);
      setRecognition({ status: 'error', predictions: [] });
      setMessage('The AI could not read that sketch. Keep drawing and it will try again.');
    }
  }, []);

  const schedulePrediction = useCallback(() => {
    clearPredictionTimer(timerRef);
    if (!guessingEnabledRef.current) return;
    // Refresh once shortly after a stroke ends so the final shape is always checked.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runPrediction();
    }, FINAL_PREDICTION_DELAY_MS);
  }, [runPrediction]);

  const scheduleLivePrediction = useCallback(() => {
    // Throttle live inference; never run a model pass on every pointer sample.
    if (!guessingEnabledRef.current || !modelRef.current || timerRef.current !== null) return;
    const elapsed = performance.now() - lastPredictionAtRef.current;
    const delay = Math.max(0, LIVE_PREDICTION_INTERVAL_MS - elapsed);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runPrediction();
    }, delay);
  }, [runPrediction]);

  const toggleGuessing = () => {
    const next = !guessingEnabledRef.current;
    guessingEnabledRef.current = next;
    setGuessingEnabled(next);
    setRecognition(IDLE);
    setMessage('');
    setStatus(next ? 'loading' : 'idle');
    try {
      window.localStorage.setItem(GUESSING_STORAGE_KEY, next ? 'yes' : 'no');
    } catch {
      // The toggle still works for this tab if browser storage is unavailable.
    }
    if (!next) clearPredictionTimer(timerRef);
  };

  useEffect(() => () => cancelSelectionDoodleSettle(selectDoodleTimerRef), []);

  useEffect(() => {
    const sketch = sketchRef.current;
    if (!sketch) return;
    sketch.getContext('2d').clearRect(0, 0, W, H);
    sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
    fillRef.current?.getContext('2d').clearRect(0, 0, W, H);
    fillSnapshotRef.current = fillRef.current?.getContext('2d').getImageData(0, 0, W, H) ?? null;
    pushHistory();
  }, [pushHistory]);

  useEffect(() => {
    if (!guessingEnabled) {
      setStatus('idle');
      return undefined;
    }
    let active = true;
    setStatus('loading');
    loadModel({
      onBackend: (nextBackend) => { if (active) setBackend(nextBackend); },
      onProfile: (info) => {
        if (!active) return;
        if (info.tier) setModelTier(info.tier);
        if (info.fallbackReason !== undefined) setFallbackReason(info.fallbackReason);
      },
    }).then((loaded) => {
      if (!active) { loaded.model.dispose(); return; }
      modelRef.current = loaded;
      lastPredictionAtRef.current = 0;
      setClassCount(loaded.labels.length);
      setModelTier(loaded.tier);
      setFallbackReason(loaded.fallbackReason);
      setStatus('ready');
      schedulePrediction();
    }).catch((error) => {
      console.error('Model load failed:', error);
      if (!active) return;
      setStatus('error');
      setMessage('The recognition model could not be loaded. Drawing and object editing still work.');
    });
    return () => {
      active = false;
      clearPredictionTimer(timerRef);
      if (modelRef.current) {
        modelRef.current.model.dispose();
        modelRef.current = null;
      }
    };
  }, [guessingEnabled, schedulePrediction]);

  useEffect(() => () => imageCacheRef.current?.clear(), []);

  /**
   * A bitmap remnant's PNG lives on the object (so undo stays serialisable),
   * while the decoded image is cached by id. Ensure everything visible is
   * decoded before painting; re-render once a decode lands.
   */
  const ensureSceneBitmaps = useCallback(async (objects) => {
    const bitmaps = objects.filter((object) => object.type === 'bitmap' && object.bitmap);
    if (!bitmaps.length) return;
    const pending = bitmaps.filter((object) => !bitmapCacheRef.current.has(object.bitmapId));
    if (!pending.length) return;
    try {
      await Promise.all(pending.map((object) => bitmapCacheRef.current.ensure(object.bitmapId, object.bitmap)));
      renderScene(sceneObjectsRef.current, canvasRef.current, sceneImageCacheRef.current);
    } catch (error) {
      console.error('Could not decode doodle remnant:', error);
    }
  }, []);

  useEffect(() => {
    const objects = sceneObjects;
    renderScene(objects, canvasRef.current, sceneImageCacheRef.current);
    ensureSceneBitmaps(objects);
  }, [sceneObjects, ensureSceneBitmaps]);

  const restore = useCallback((direction) => {
    clearPredictionTimer(timerRef);
    pointerRef.current = null;
    setMarquee(null);
    setSelectionDoodlePath(null);
    revisionRef.current += 1;
    const snapshot = direction < 0 ? historyRef.current.undo() : historyRef.current.redo();
    if (!snapshot) return;
    const restoredIds = new Set(snapshot.objects.map((object) => object.id));
    // Selection-only changes do not create history entries. Keep the current
    // selection when it still exists in the restored scene; otherwise use the
    // snapshot selection so undoing delete/clear can reselect recovered objects.
    const currentSelection = selectedObjectIdsRef.current.filter((id) => restoredIds.has(id));
    const snapshotSelection = snapshot.selectedObjectIds ?? (snapshot.selectedObjectId ? [snapshot.selectedObjectId] : []);
    syncScene(snapshot.objects);
    chooseObjects(currentSelection.length ? currentSelection : snapshotSelection);
    if (snapshot.sketch && sketchRef.current) {
      sketchRef.current.getContext('2d').putImageData(snapshot.sketch, 0, 0);
      sketchSnapshotRef.current = snapshot.sketch;
    }
    if (snapshot.fill && fillRef.current) {
      fillRef.current.getContext('2d').putImageData(snapshot.fill, 0, 0);
      fillSnapshotRef.current = snapshot.fill;
    }
    hasFillRef.current = Boolean(snapshot.hasFill);
    setHasFill(Boolean(snapshot.hasFill));
    const restoredBackground = normalizeHexColor(snapshot.canvasBackgroundColor) ?? DEFAULT_BACKGROUND_COLOR;
    backgroundColorRef.current = restoredBackground;
    setBackgroundColor(restoredBackground);
    const bounds = getSketchBounds(sketchRef.current);
    const sketchHasInk = Boolean(bounds.width);
    setHasInk(sketchHasInk);
    setRecognition(IDLE);
    setMessage('');
    updateHistoryButtons();
    if (sketchHasInk || snapshot.objects?.some((object) => object.isSketchStroke)) schedulePrediction();
  }, [schedulePrediction]);

  const deleteSelected = useCallback(() => {
    const ids = selectedObjectIdsRef.current;
    if (!ids.length) return;
    const next = deleteSceneObjects(sceneObjectsRef.current, ids);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    chooseObjects([]);
    pushHistory();
    schedulePrediction();
  }, [pushHistory, schedulePrediction]);

  useEffect(() => {
    const isTyping = (target) => target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable);
    const onKey = (event) => {
      if (event.defaultPrevented) return;
      const typing = isTyping(event.target);
      if (event.key === 'Escape') {
        if (textDraft) setTextDraft(cancelTextDraft());
        else {
          if (['marquee', 'selectDoodle'].includes(pointerRef.current?.kind)) {
            pointerRef.current = null;
            setMarquee(null);
            setSelectionDoodlePath(null);
          }
          if (selectedObjectIdsRef.current.length) chooseObjects([]);
          else setShowHelp(false);
        }
        return;
      }
      if (event.code === 'Space' && !typing) {
        spacePressedRef.current = true;
        event.preventDefault();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && selectedObjectIdsRef.current.length) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || typing) return;
      if (event.key.toLowerCase() === 'a') {
        if (sceneObjectsRef.current.length) {
          event.preventDefault();
          chooseObjects(sceneObjectsRef.current.map((object) => object.id));
        }
        return;
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restore(event.shiftKey ? 1 : -1);
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restore(1);
      }
    };
    const onKeyUp = (event) => {
      if (event.code === 'Space') spacePressedRef.current = false;
    };
    const onBlur = () => { spacePressedRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [deleteSelected, restore, textDraft]);

  // React installs wheel listeners as passive in several browsers, which makes
  // preventDefault ineffective and lets the page scroll during canvas zoom.
  useEffect(() => {
    const viewport = canvasWrapRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      const anchor = clientToViewportPoint(event.clientX, event.clientY, viewport);
      const next = zoomViewportAroundPoint(
        viewRef.current,
        viewRef.current.zoom * Math.exp(-event.deltaY * 0.0015),
        anchor,
      );
      viewRef.current = next;
      setView(next);
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  // One mapping for sketching, erasing, selection and every transform handle.
  // The wrapper is the exact shared viewport of both canvases and the SVG overlay.
  const point = (event) => clientToCanvasPoint(
    event.clientX,
    event.clientY,
    canvasWrapRef.current,
    canvasRef.current.width,
    canvasRef.current.height,
    viewRef.current,
  );
  const viewportPoint = (event) => clientToViewportPoint(
    event.clientX,
    event.clientY,
    canvasWrapRef.current,
  );

  const updateView = (next) => {
    const normalized = { ...next, zoom: clampViewZoom(next.zoom) };
    viewRef.current = normalized;
    setView(normalized);
  };

  const zoomAtClientPoint = (clientX, clientY, nextZoom) => {
    const anchor = clientToViewportPoint(clientX, clientY, canvasWrapRef.current);
    updateView(zoomViewportAroundPoint(viewRef.current, nextZoom, anchor));
  };

  const changeZoom = (direction) => {
    const current = viewRef.current.zoom;
    const target = direction > 0
      ? zoomSteps.find((step) => step > current + 0.001) ?? MAX_VIEW_ZOOM
      : [...zoomSteps].reverse().find((step) => step < current - 0.001) ?? MIN_VIEW_ZOOM;
    const rect = canvasWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, target);
  };

  const resetView = () => updateView({ ...DEFAULT_VIEWPORT });


  const drawSketchSegment = (from, to, erase = false) => {
    const context = sketchRef.current.getContext('2d');
    drawCanvasStrokeSegment(context, from, to, activeColor, erase ? size * 3 : size, { erase });
  };

  /** Soft-erase sketch ink with the doodle stroke (pixels, not whole strokes). */
  const eraseSketchAlong = (from, to) => {
    const context = sketchRef.current?.getContext('2d');
    if (!context) return false;
    drawCanvasStrokeSegment(context, from, to, activeColor, Math.max(2, size * DOODLE_RADIUS_FACTOR) * 2, { erase: true });
    return true;
  };

  const eraseObjectsAlong = (from, to) => {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(8, size * 1.5)));
    let changed = false;
    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const pointOnSegment = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      const hit = hitTestScene(sceneObjectsRef.current, pointOnSegment, size * 1.5);
      if (!hit) continue;
      syncScene(deleteSceneObject(sceneObjectsRef.current, hit.id));
      if (selectedObjectIdsRef.current.includes(hit.id)) {
        chooseObjects(selectedObjectIdsRef.current.filter((id) => id !== hit.id));
      }
      changed = true;
    }
    if (changed && pointerRef.current) pointerRef.current.changed = true;
  };

  /**
   * Doodle eraser: shave pixels off whatever illustration/remnant the stroke
   * crosses and leave the survivor as a normal, fully editable object.
   *
   * One gesture is applied as a single accumulated pass (`doodleStrokeRef`):
   * the stroke starts from the object's *original* geometry, so an object is
   * rendered and trimmed once per gesture instead of once per pointer move.
   * The trimmed rest is re-inserted at the same world position with the same
   * rotation, flip and stack order.
   */
  const applyDoodleErase = (stroke = doodleStrokeRef.current) => {
    if (!stroke?.points?.length) return false;
    const radius = Math.max(2, size * DOODLE_RADIUS_FACTOR);
    const ids = [...stroke.originals.keys()];
    let next = sceneObjectsRef.current;
    let erasedWhole = 0;
    let trimmed = 0;
    for (const id of ids) {
      const source = stroke.originals.get(id);
      if (!source) continue;
      // The original object is gone once this gesture has trimmed it; its
      // remnant is what the scene holds now.
      if (!next.some((object) => object.id === id || object.id === stroke.remnants.get(id))) continue;
      const image = source.type === 'bitmap'
        ? bitmapCacheRef.current.get(source.bitmapId)
        : source.type === 'text' ? null : imageCacheRef.current.get(source.artworkId, source.color);
      const raster = renderObjectRaster({ object: source, image });
      const mask = createEraseMask({
        width: raster.width,
        height: raster.height,
        points: stroke.points,
        radius: radius * ERASE_PIXEL_SCALE,
        worldToLocal: (point) => {
          const local = worldToObjectLocal(source, point);
          return {
            x: local.x * ERASE_PIXEL_SCALE + raster.width / 2,
            y: local.y * ERASE_PIXEL_SCALE + raster.height / 2,
          };
        },
      });
      if (!maskOverlapsInk({ canvas: raster, mask })) continue;
      const survivor = eraseWithMask({ canvas: raster, mask });
      next = deleteSceneObject(next, id);
      const previousRemnantId = stroke.remnants.get(id);
      if (previousRemnantId) {
        next = deleteSceneObject(next, previousRemnantId);
        bitmapCacheRef.current.delete(stroke.remnantBitmapIds.get(id));
      }
      if (!survivor.canvas) {
        erasedWhole += 1;
        continue;
      }
      trimmed += 1;
      const bitmapId = createSceneObjectId();
      const dataUrl = canvasToPngDataUrl(survivor.canvas);
      const remnant = createBitmapSceneObject({
        id: createSceneObjectId(),
        bitmapId,
        bitmap: dataUrl,
        bounds: survivor.bounds,
        label: source.label,
        color: source.type === 'bitmap' ? source.color : 'original',
        rotation: source.rotation,
        flipX: source.flipX,
        zIndex: source.zIndex,
        isSketchStroke: Boolean(source.isSketchStroke),
        ...remnantPlacement({ object: source, localBounds: survivor.bounds }),
      });
      // Insert synchronously into the bitmap cache so the very first repaint can
      // draw it; decoding never has to win a race against the next pointer move.
      bitmapCacheRef.current.put(bitmapId, survivor.canvas);
      // Keep the original stack position so erasing never changes layering.
      const index = Math.min(source.zIndex, next.length);
      next = [...next.slice(0, index), remnant, ...next.slice(index)];
      stroke.remnants.set(id, remnant.id);
      stroke.remnantBitmapIds.set(id, bitmapId);
      stroke.remnantIds.push(remnant.id);
    }
    if (!erasedWhole && !trimmed) return false;
    syncScene(next);
    if (selectedObjectIdsRef.current.some((id) => !next.some((object) => object.id === id))) {
      chooseObjects(selectedObjectIdsRef.current.filter((id) => next.some((object) => object.id === id)));
    }
    stroke.erasedWhole = erasedWhole;
    stroke.trimmed = trimmed;
    return true;
  };

  /** Start a doodle gesture from the current scene geometry. */
  const beginDoodleStroke = () => {
    doodleStrokeRef.current = {
      points: [],
      originals: new Map(sceneObjectsRef.current
        .filter((object) => ['artwork', 'bitmap', 'text'].includes(object.type))
        .map((object) => [object.id, object])),
      trimmed: 0,
      erasedWhole: 0,
      remnantIds: [],
      // original object id -> its current survivor, so a live stroke can be
      // replayed from the original geometry without stacking duplicates.
      remnants: new Map(),
      remnantBitmapIds: new Map(),
    };
  };

  /**
   * Sketch ink is a raw canvas until it becomes an object. When a doodle erase
   * gesture touches it, convert the surviving ink into editable doodle objects
   * so the remainder can still be selected, moved and recoloured.
   */
  const convertRemainingSketchToObjects = (label = 'Doodle') => {
    const sketch = sketchRef.current;
    if (!sketch) return 0;
    if (!getSketchBounds(sketch).width) return 0;
    const sheet = sketchInkSheet({ sketch });
    if (!measureRemaining({ canvas: sheet }).canvas) return 0;
    const blobs = splitInkBlobs({ canvas: sheet });
    if (!blobs.length) return 0;
    const created = blobs.map((blob) => {
      const bitmapId = createSceneObjectId();
      // Encode once and register the raster immediately so the first repaint
      // after the gesture can already draw it.
      const dataUrl = canvasToPngDataUrl(blob.canvas);
      bitmapCacheRef.current.put(bitmapId, blob.canvas);
      return createBitmapSceneObject({
        id: createSceneObjectId(),
        bitmapId,
        bitmap: dataUrl,
        label,
        color: 'original',
        x: blob.bounds.x,
        y: blob.bounds.y,
        width: blob.bounds.width,
        height: blob.bounds.height,
        zIndex: sceneObjectsRef.current.length,
      });
    });
    sketch.getContext('2d').clearRect(0, 0, W, H);
    sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
    setHasInk(false);
    setRecognition(IDLE);
    syncScene(created.reduce((objects, object) => addSceneObject(objects, object), sceneObjectsRef.current));
    chooseObjects(created.map((object) => object.id));
    setTool('select');
    setMessage(`Your doodle is now ${created.length} editable object${created.length === 1 ? '' : 's'}. Move, resize, rotate or recolour it.`);
    return created.length;
  };

  /** Turn one finished pencil drag into exactly one normal scene object. */
  const commitPencilStroke = () => {
    const sketch = sketchRef.current;
    const bounds = getSketchBounds(sketch);
    if (!bounds.width || !bounds.height) return false;
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.ceil(bounds.width));
    crop.height = Math.max(1, Math.ceil(bounds.height));
    crop.getContext('2d').drawImage(sketch, bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, crop.width, crop.height);
    const bitmapId = createSceneObjectId();
    const dataUrl = canvasToPngDataUrl(crop);
    bitmapCacheRef.current.put(bitmapId, crop);
    const object = createBitmapSceneObject({
      id: createSceneObjectId(),
      bitmapId,
      bitmap: dataUrl,
      bounds: { width: crop.width, height: crop.height },
      label: 'Pencil stroke',
      color: 'original',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      zIndex: sceneObjectsRef.current.length,
      isSketchStroke: true,
    });
    const next = addSceneObject(sceneObjectsRef.current, object);
    sketch.getContext('2d').clearRect(0, 0, W, H);
    sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
    setHasInk(false);
    syncScene(next);
    renderScene(next, canvasRef.current, sceneImageCacheRef.current);
    return true;
  };

  const setCanvasBackground = (nextColor) => {
    const normalizedColor = normalizeHexColor(nextColor);
    if (!normalizedColor || normalizedColor === backgroundColorRef.current) return;
    backgroundColorRef.current = normalizedColor;
    setBackgroundColor(normalizedColor);
    pushHistory();
  };

  const performFill = (seed) => {
    if (!fillRef.current || !canvasRef.current || !sketchRef.current) return;
    if (!referenceCanvasRef.current) {
      referenceCanvasRef.current = document.createElement('canvas');
      referenceCanvasRef.current.width = W;
      referenceCanvasRef.current.height = H;
    }
    composeFillBoundary(referenceCanvasRef.current, {
      backgroundColor: backgroundColorRef.current,
      fillCanvas: fillRef.current,
      sceneCanvas: canvasRef.current,
      sketchCanvas: sketchRef.current,
    });

    // When the click is on an editable object, try to apply the region to that
    // object's own raster. The object keeps its ID, placement and transforms,
    // so its selection box and normal edit actions remain available afterward.
    const ordinaryHit = hitTestScene(sceneObjectsRef.current, seed);
    const shapeInterior = ordinaryHit ? null : [...sceneObjectsRef.current].reverse().find((object) => {
      if (object.type !== 'shape' || !['rectangle', 'ellipse'].includes(object.shapeKind)) return false;
      const local = worldToObjectLocal(object, seed);
      const halfWidth = object.width / 2;
      const halfHeight = object.height / 2;
      if (object.shapeKind === 'rectangle') return Math.abs(local.x) <= halfWidth && Math.abs(local.y) <= halfHeight;
      return (local.x / Math.max(0.5, halfWidth)) ** 2 + (local.y / Math.max(0.5, halfHeight)) ** 2 <= 1;
    });
    const hit = ordinaryHit ?? shapeInterior;
    if (hit) {
      if (hit.type === 'shape' && ['rectangle', 'ellipse'].includes(hit.shapeKind)) {
        if (hit.fillColor === activeColor) return;
        const next = updateSceneObject(sceneObjectsRef.current, hit.id, { fillColor: activeColor });
        syncScene(next);
        chooseObject(hit.id);
        renderScene(next, canvasRef.current, sceneImageCacheRef.current);
        pushHistory();
        schedulePrediction();
        setMessage(`Filled ${hit.label} — its editable shape geometry and outline are preserved.`);
        return;
      }
      const image = hit.type === 'bitmap'
        ? bitmapCacheRef.current.get(hit.bitmapId)
        : hit.type === 'text' ? null : imageCacheRef.current.get(hit.artworkId, hit.color);
      const raster = renderObjectRaster({ object: hit, image, pixelScale: 2 });
      const local = worldToObjectLocal(hit, seed);
      const filled = fillRasterRegion({
        canvas: raster,
        seed: { x: local.x * 2 + raster.width / 2, y: local.y * 2 + raster.height / 2 },
        color: activeColor,
      });
      if (!filled.open && filled.count) {
        if (!filled.changed) return;
        const bitmapId = createSceneObjectId();
        const dataUrl = canvasToPngDataUrl(raster);
        bitmapCacheRef.current.put(bitmapId, raster);
        const replacement = createBitmapSceneObject({
          id: hit.id,
          bitmapId,
          bitmap: dataUrl,
          bounds: { width: raster.width, height: raster.height },
          label: hit.label,
          x: hit.x,
          y: hit.y,
          width: hit.width,
          height: hit.height,
          rotation: hit.rotation,
          color: 'original',
          flipX: hit.flipX,
          zIndex: hit.zIndex,
          isSketchStroke: Boolean(hit.isSketchStroke),
        });
        const next = sceneObjectsRef.current.map((object) => object.id === hit.id ? replacement : object);
        syncScene(next);
        chooseObject(hit.id);
        renderScene(next, canvasRef.current, sceneImageCacheRef.current);
        if (hit.isSketchStroke) schedulePrediction();
        pushHistory();
        setMessage(`Filled ${filled.count.toLocaleString()} pixels in ${hit.label || 'the object'} — it remains editable.`);
        return;
      }
    }

    // Empty-canvas fills remain on the dedicated raster layer underneath scene
    // objects, preserving the existing background-fill workflow.
    const result = fillCanvasRegion({
      referenceCanvas: referenceCanvasRef.current,
      fillCanvas: fillRef.current,
      seed,
      color: activeColor,
    });
    if (!result.changed) return;
    hasFillRef.current = true;
    setHasFill(true);
    fillSnapshotRef.current = fillRef.current.getContext('2d').getImageData(0, 0, W, H);
    pushHistory({ captureFill: true });
    setMessage(`Filled ${result.count.toLocaleString()} connected pixels.`);
  };

  const editTextObject = (object) => {
    const draft = beginTextEditing(object);
    if (draft) setTextDraft(draft);
  };

  const commitTextDraft = () => {
    const confirmed = confirmTextDraft(textDraft);
    if (!confirmed) { setTextDraft(cancelTextDraft()); return; }
    const draft = confirmed;
    const value = confirmed.text;
    setTextDraft(cancelTextDraft());
    if (draft.mode === 'create') {
      const object = createTextSceneObject({
        text: value,
        x: draft.x,
        y: draft.y,
        color: activeColor,
        zIndex: sceneObjectsRef.current.length,
      });
      object.x = Math.min(Math.max(0, object.x), Math.max(0, W - object.width));
      object.y = Math.min(Math.max(0, object.y), Math.max(0, H - object.height));
      syncScene(addSceneObject(sceneObjectsRef.current, object));
      chooseObject(object.id);
      setTool('select');
      pushHistory();
      setMessage('Text added. Select it to move, resize, rotate or style it.');
      return;
    }
    const existing = sceneObjectsRef.current.find((object) => object.id === draft.id && object.type === 'text');
    if (!existing || existing.text === value) return;
    const bounds = getEstimatedTextBounds(value, existing.fontSize, existing.fontWeight);
    const center = getObjectCenter(existing);
    syncScene(updateSceneObject(sceneObjectsRef.current, existing.id, {
      text: value,
      label: value,
      x: center.x - bounds.width / 2,
      y: center.y - bounds.height / 2,
      width: bounds.width,
      height: bounds.height,
    }));
    chooseObject(existing.id);
    pushHistory();
  };

  const changeSelectedText = (patch) => {
    if (selectedObjectIdsRef.current.length !== 1) return;
    const id = selectedObjectIdsRef.current[0];
    const object = sceneObjectsRef.current.find((candidate) => candidate.id === id && candidate.type === 'text');
    if (!object) return;
    let update = patch;
    if (Number.isFinite(patch.fontSize) && patch.fontSize !== object.fontSize) {
      const fontSize = Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, patch.fontSize));
      const scale = fontSize / object.fontSize;
      const center = getObjectCenter(object);
      update = {
        ...patch,
        fontSize,
        width: object.width * scale,
        height: object.height * scale,
        x: center.x - object.width * scale / 2,
        y: center.y - object.height * scale / 2,
      };
    }
    syncScene(updateSceneObject(sceneObjectsRef.current, id, update));
    pushHistory();
  };

  const applySelectedThickness = () => {
    const selectedIds = new Set(selectedObjectIdsRef.current);
    const amount = Math.max(-16, Math.min(16, Math.round(Number(thicknessDraft) || 0)));
    let changed = false;
    const next = sceneObjectsRef.current.map((object) => {
      if (!selectedIds.has(object.id) || !isThicknessEditable(object)
        || (object.thicknessDelta ?? 0) === amount) return object;
      changed = true;
      return { ...object, thicknessDelta: amount };
    });
    if (!changed) return;
    syncScene(next);
    renderScene(next, canvasRef.current, sceneImageCacheRef.current);
    pushHistory();
    if (next.some((object) => selectedIds.has(object.id) && object.isSketchStroke)) schedulePrediction();
    setMessage(`Applied ${amount > 0 ? '+' : ''}${amount}px thickness to the editable outlines in the selection.`);
  };

  const changeSelectedShape = (patch) => {
    if (selectedObjectIdsRef.current.length !== 1) return;
    const id = selectedObjectIdsRef.current[0];
    const object = sceneObjectsRef.current.find((candidate) => candidate.id === id && candidate.type === 'shape');
    if (!object) return;
    const safePatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(safePatch, 'fillColor')
      && safePatch.fillColor !== 'none') {
      safePatch.fillColor = normalizeHexColor(safePatch.fillColor) ?? object.fillColor;
    }
    if (Number.isFinite(safePatch.strokeWidth)) {
      safePatch.strokeWidth = Math.max(1, Math.min(100, safePatch.strokeWidth));
      safePatch.thicknessDelta = 0;
    }
    const next = updateSceneObject(sceneObjectsRef.current, id, safePatch);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    pushHistory();
    schedulePrediction();
  };

  const beginTransform = (event, kind, handle = null) => {
    const objects = getSelectedSceneObjects(sceneObjectsRef.current, selectedObjectIdsRef.current);
    if (!objects.length) return;
    const grouped = objects.length > 1;
    revisionRef.current += 1;
    event.preventDefault();
    event.stopPropagation();
    const p = point(event);
    pointerRef.current = {
      id: event.pointerId ?? 1,
      kind,
      startPoint: p,
      startObject: objects[0],
      startObjects: objects.map((object) => ({ ...object })),
      startBounds: grouped ? getGroupBounds(objects) : null,
      handle,
      changed: false,
    };
    try { event.currentTarget?.setPointerCapture?.(event.pointerId); } catch { /* synthetic or unsupported pointer capture */ }
  };

  const onPointerDown = (event) => {
    if (pointerRef.current) return;
    const pointerId = event.pointerId ?? 1;
    const isPrimaryButton = event.button === undefined || event.button === 0;
    const wantsPan = (event.pointerType === 'mouse' && event.button === 1)
      || (isPrimaryButton && (spacePressedRef.current || tool === 'pan'));
    if (wantsPan) {
      event.preventDefault();
      const startPoint = viewportPoint(event);
      pointerRef.current = {
        id: pointerId,
        kind: 'pan',
        startPoint,
        startView: { ...viewRef.current },
      };
      try { event.currentTarget?.setPointerCapture?.(pointerId); } catch { /* synthetic or unsupported pointer capture */ }
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handleElement = event.target?.closest?.('[data-transform-handle]');
    if (handleElement && tool === 'select') {
      const kind = handleElement.dataset.transformHandle;
      const handle = kind === 'resize'
        ? { signX: Number(handleElement.dataset.signX), signY: Number(handleElement.dataset.signY) }
        : kind === 'shapeEndpoint' ? { point: handleElement.dataset.point } : null;
      beginTransform(event, kind, handle);
      return;
    }
    // The wrapper is the authoritative full-size input surface. The visible art
    // canvas is pointer-transparent so no edge can be discarded because of a
    // child-layer hit target or sub-pixel rectangle rounding.
    event.preventDefault();
    const p = point(event);
    if (tool === 'text') {
      if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) return;
      setTextDraft(beginTextCreation(p));
      return;
    }
    if (tool === 'fill') {
      performFill(p);
      return;
    }
    if (tool.startsWith('shape-')) {
      const shapeKind = tool.slice('shape-'.length);
      const end = constrainShapeEnd(p, p, shapeKind, Boolean(event.shiftKey));
      pointerRef.current = { id: pointerId, kind: 'shape', shapeKind, startPoint: p, changed: false };
      setShapePreview({ shapeKind, start: p, end, constrain: Boolean(event.shiftKey) });
      return;
    }
    if (tool === 'select') {
      revisionRef.current += 1;
      const hit = hitTestScene(sceneObjectsRef.current, p);
      const currentIds = selectedObjectIdsRef.current;
      if (event.shiftKey && hit) {
        chooseObjects(updateSelectionForClick(sceneObjectsRef.current, currentIds, hit.id, { shiftKey: true }));
        return;
      }
      if (hit) {
        chooseObjects(updateSelectionForClick(sceneObjectsRef.current, currentIds, hit.id));
        const selected = getSelectedSceneObjects(sceneObjectsRef.current, selectedObjectIdsRef.current);
        pointerRef.current = {
          id: pointerId,
          kind: 'move',
          startPoint: p,
          startObject: selected[0],
          startObjects: selected.map((object) => ({ ...object })),
          startBounds: selected.length > 1 ? getGroupBounds(selected) : null,
          changed: false,
        };
      } else {
        const selected = getSelectedSceneObjects(sceneObjectsRef.current, currentIds);
        const bounds = selected.length > 1 ? getGroupBounds(selected) : null;
        const insideGroup = !event.shiftKey && bounds && p.x >= bounds.x && p.x <= bounds.right && p.y >= bounds.y && p.y <= bounds.bottom;
        if (insideGroup) {
          pointerRef.current = {
            id: pointerId,
            kind: 'move',
            startPoint: p,
            startObject: selected[0],
            startObjects: selected.map((object) => ({ ...object })),
            startBounds: bounds,
            clearOnClick: true,
            changed: false,
          };
        } else {
          pointerRef.current = {
            id: pointerId,
            kind: 'marquee',
            startPoint: p,
            additive: Boolean(event.shiftKey),
            changed: false,
          };
          setMarquee({ x: p.x, y: p.y, width: 0, height: 0 });
        }
      }
    } else if (tool === 'selectDoodle') {
      setMessage('');
      cancelSelectionDoodleSettle(selectDoodleTimerRef);
      setSelectionDoodleSettling(false);
      const points = [p];
      pointerRef.current = {
        id: pointerId,
        kind: 'selectDoodle',
        points,
        additive: Boolean(event.shiftKey),
      };
      setSelectionDoodlePath(points);
    } else if (tool === 'eraser' && eraserMode === 'doodle') {
      revisionRef.current += 1;
      clearPredictionTimer(timerRef);
      pointerRef.current = { id: pointerId, kind: 'doodle', previousPoint: p, changed: false };
      beginDoodleStroke();
      doodleStrokeRef.current.points.push(p);
      eraseSketchAlong(p, p);
      scheduleLivePrediction();
      pointerRef.current.changed = applyDoodleErase() || pointerRef.current.changed;
    } else if (tool === 'eraser') {
      revisionRef.current += 1;
      clearPredictionTimer(timerRef);
      pointerRef.current = { id: pointerId, kind: 'eraser', previousPoint: p, changed: false };
      drawSketchSegment(p, p, true);
      eraseObjectsAlong(p, p);
      scheduleLivePrediction();
    } else {
      clearPredictionTimer(timerRef);
      revisionRef.current += 1;
      setMessage('');
      pointerRef.current = { id: pointerId, kind: 'sketch', previousPoint: p, changed: true };
      drawSketchSegment(p, p);
      scheduleLivePrediction();
    }
    try { event.currentTarget?.setPointerCapture?.(pointerId); } catch { /* synthetic or unsupported pointer capture */ }
  };

  const onPointerMove = (event) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 1)) return;
    if (gesture.kind === 'pan') {
      const currentPoint = viewportPoint(event);
      updateView({
        ...gesture.startView,
        panX: gesture.startView.panX + currentPoint.x - gesture.startPoint.x,
        panY: gesture.startView.panY + currentPoint.y - gesture.startPoint.y,
      });
      return;
    }
    const p = point(event);
    if (gesture.kind === 'marquee') {
      const dx = p.x - gesture.startPoint.x;
      const dy = p.y - gesture.startPoint.y;
      if (Math.hypot(dx, dy) >= 3) gesture.changed = true;
      setMarquee({
        x: Math.min(gesture.startPoint.x, p.x),
        y: Math.min(gesture.startPoint.y, p.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    } else if (gesture.kind === 'selectDoodle') {
      const last = gesture.points[gesture.points.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
        gesture.points.push(p);
        setSelectionDoodlePath([...gesture.points]);
      }
    } else if (gesture.kind === 'sketch') {
      drawSketchSegment(gesture.previousPoint, p);
      gesture.previousPoint = p;
      gesture.changed = true;
      scheduleLivePrediction();
    } else if (gesture.kind === 'eraser') {
      drawSketchSegment(gesture.previousPoint, p, true);
      eraseObjectsAlong(gesture.previousPoint, p);
      gesture.previousPoint = p;
      gesture.changed = true;
      scheduleLivePrediction();
    } else if (gesture.kind === 'doodle') {
      eraseSketchAlong(gesture.previousPoint, p);
      scheduleLivePrediction();
      gesture.previousPoint = p;
      gesture.changed = true;
      const stroke = doodleStrokeRef.current;
      if (!stroke) return;
      // Coalesce near-identical pointer samples so long gestures stay cheap.
      const last = stroke.points[stroke.points.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      stroke.points.push(p);
      // Trim live so the drawing visibly disappears under the brush instead of
      // only updating when the stroke ends. The pass is always replayed from the
      // gesture's original geometry, so repeated calls cannot double-erase.
      if (applyDoodleErase()) {
        // Re-select the survivor so the selection box tracks the new shape.
        if (stroke.remnantIds.length === 1) chooseObject(stroke.remnantIds[0]);
        gesture.changed = true;
      }
    } else if (gesture.kind === 'shape') {
      gesture.changed = true;
      setShapePreview({
        shapeKind: gesture.shapeKind,
        start: gesture.startPoint,
        end: constrainShapeEnd(gesture.startPoint, p, gesture.shapeKind, Boolean(event.shiftKey)),
        constrain: Boolean(event.shiftKey),
      });
    } else if (gesture.kind === 'shapeEndpoint') {
      gesture.changed = true;
      const next = updateSceneObject(sceneObjectsRef.current, gesture.startObject.id,
        () => moveShapeEndpoint(gesture.startObject, gesture.handle.point, p));
      syncScene(next);
    } else if (gesture.kind === 'move') {
      const dx = p.x - gesture.startPoint.x;
      const dy = p.y - gesture.startPoint.y;
      if (Math.hypot(dx, dy) < 2) return;
      gesture.changed = true;
      syncScene(moveSceneObjects(sceneObjectsRef.current, gesture.startObjects, dx, dy));
    } else if (gesture.kind === 'resize') {
      gesture.changed = true;
      const next = gesture.startBounds
        ? resizeSceneObjectsGroup(sceneObjectsRef.current, gesture.startObjects, gesture.startBounds, gesture.handle, p)
        : updateSceneObject(sceneObjectsRef.current, gesture.startObject.id,
          () => resizeSceneObject(gesture.startObject, gesture.handle, p));
      syncScene(next);
    } else if (gesture.kind === 'rotate') {
      if (Math.hypot(p.x - gesture.startPoint.x, p.y - gesture.startPoint.y) < 2) return;
      gesture.changed = true;
      const next = gesture.startBounds
        ? rotateSceneObjectsGroup(sceneObjectsRef.current, gesture.startObjects, gesture.startBounds, gesture.startPoint, p)
        : updateSceneObject(sceneObjectsRef.current, gesture.startObject.id, {
          rotation: getRotationFromPointer(gesture.startObject, gesture.startObject.rotation, gesture.startPoint, p),
        });
      syncScene(next);
    }
  };

  const onPointerEnd = (event) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 1)) return;
    pointerRef.current = null;
    if (gesture.kind === 'marquee') {
      const p = point(event);
      const dx = p.x - gesture.startPoint.x;
      const dy = p.y - gesture.startPoint.y;
      const moved = gesture.changed || Math.hypot(dx, dy) >= 3;
      if (moved) {
        const rect = {
          x: Math.min(gesture.startPoint.x, p.x),
          y: Math.min(gesture.startPoint.y, p.y),
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
        chooseObjects(selectObjectsInMarquee(sceneObjectsRef.current, selectedObjectIdsRef.current, rect, {
          additive: gesture.additive,
        }));
      } else if (!gesture.additive) chooseObjects([]);
      setMarquee(null);
    } else if (gesture.kind === 'selectDoodle') {
      if (event.type === 'pointercancel') {
        // A cancelled gesture is not a selection: drop the outline, commit nothing.
        cancelSelectionDoodleSettle(selectDoodleTimerRef);
        setSelectionDoodlePath(null);
        setSelectionDoodleSettling(false);
        return;
      }
      const finalPoint = point(event);
      const last = gesture.points[gesture.points.length - 1];
      if (!last || Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) >= 1.5) gesture.points.push(finalPoint);
      const rect = canvasWrapRef.current?.getBoundingClientRect();
      const displayScale = Math.max(0.01, (rect?.width ?? W) / W * viewRef.current.zoom);
      const closes = isClosedSelectionDoodle(gesture.points, 16 / displayScale);
      const outline = [...gesture.points];
      const outlineEnd = outline[outline.length - 1];
      if (closes && Math.hypot(outline[0].x - outlineEnd.x, outline[0].y - outlineEnd.y) > 0.5) {
        outline.push(outline[0]);
      }
      // A closed loop selects what it encloses *and* what it crossed; an open
      // stroke only selects what it touched.
      const touchTolerance = 10 / displayScale;
      const ids = closes
        ? combineSelectionIds(
            sceneObjectsRef.current,
            selectObjectsInDoodleLoop(sceneObjectsRef.current, outline, selectedObjectIdsRef.current, { additive: gesture.additive }),
            selectObjectsTouchedByDoodle(sceneObjectsRef.current, outline, touchTolerance, selectedObjectIdsRef.current, { additive: gesture.additive }),
          )
        : selectObjectsTouchedByDoodle(sceneObjectsRef.current, outline, touchTolerance, selectedObjectIdsRef.current, { additive: gesture.additive });
      // Letting go starts the fade immediately; the selection lands when the
      // fade finishes, so the dotted outline never sits on top of a finished
      // selection and a fast second lasso supersedes this one cleanly.
      cancelSelectionDoodleSettle(selectDoodleTimerRef);
      setSelectionDoodlePath(outline);
      setSelectionDoodleSettling(true);
      const selectedCount = ids.length;
      selectDoodleTimerRef.current = window.setTimeout(() => {
        selectDoodleTimerRef.current = null;
        chooseObjects(ids);
        setSelectionDoodlePath(null);
        setSelectionDoodleSettling(false);
        setMessage(selectedCount
          ? `${selectedCount} object${selectedCount === 1 ? '' : 's'} selected. Use Delete or Backspace to remove them.`
          : 'No objects selected. Draw a loop around objects or scribble across them.');
      }, SELECT_DOODLE_SETTLE_MS);
    } else if (gesture.kind === 'doodle') {
      const stroke = doodleStrokeRef.current;
      if (stroke) {
        const last = stroke.points[stroke.points.length - 1];
        const end = point(event);
        if (!last || Math.hypot(end.x - last.x, end.y - last.y) >= 1) stroke.points.push(end);
      }
      applyDoodleErase();
      sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
      const bounds = getSketchBounds(sketchRef.current);
      setHasInk(Boolean(bounds.width));
      clearPredictionTimer(timerRef);
      setRecognition(IDLE);
      // Selecting the survivor makes the promise visible: it is a normal object
      // now. Only do it for a single remnant so a wide drag never steals a
      // multi-object selection.
      if (stroke?.remnants?.size === 1) chooseObject([...stroke.remnants.values()][0]);
      if (stroke?.trimmed) {
        setMessage(`Doodle eraser trimmed ${stroke.trimmed} object${stroke.trimmed === 1 ? '' : 's'} — the rest is still selectable and editable.`);
      } else if (stroke?.erasedWhole) {
        setMessage(`Doodle eraser removed ${stroke.erasedWhole} object${stroke.erasedWhole === 1 ? '' : 's'}.`);
      }
      // Turn whatever ink survived into freely editable objects.
      if (bounds.width) convertRemainingSketchToObjects();
      doodleStrokeRef.current = null;
      pushHistory();
      schedulePrediction();
    } else if (gesture.kind === 'shape') {
      setShapePreview(null);
      if (event.type !== 'pointercancel') {
        const end = constrainShapeEnd(gesture.startPoint, point(event), gesture.shapeKind, Boolean(event.shiftKey));
        const object = createShapeSceneObject({
          shapeKind: gesture.shapeKind,
          from: gesture.startPoint,
          to: end,
          color: activeColor,
          strokeWidth: size,
          fillColor: ['rectangle', 'ellipse'].includes(gesture.shapeKind) ? defaultShapeFill : 'none',
          zIndex: sceneObjectsRef.current.length,
        });
        const next = addSceneObject(sceneObjectsRef.current, object);
        syncScene(next);
        chooseObject(object.id);
        renderScene(next, canvasRef.current, sceneImageCacheRef.current);
        pushHistory();
        schedulePrediction();
        setMessage(`${object.label} added as an editable shape. Select an arrow or line to drag its endpoints.`);
      }
    } else if (gesture.kind === 'sketch') {
      commitPencilStroke();
      setRecognition(IDLE);
      pushHistory();
      schedulePrediction();
    } else if (gesture.kind === 'eraser') {
      sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
      const bounds = getSketchBounds(sketchRef.current);
      setHasInk(Boolean(bounds.width));
      setRecognition(IDLE);
      pushHistory();
      schedulePrediction();
    } else if (gesture.kind === 'move' && gesture.clearOnClick && !gesture.changed) {
      chooseObjects([]);
    } else if (gesture.changed) {
      pushHistory();
      schedulePrediction();
    }
  };

  const onCanvasDoubleClick = (event) => {
    if (tool !== 'select') return;
    const hit = hitTestScene(sceneObjectsRef.current, point(event));
    if (hit?.type !== 'text') return;
    event.preventDefault();
    chooseObject(hit.id);
    editTextObject(hit);
  };

  const clear = () => {
    const hasContent = sceneObjectsRef.current.length > 0
      || Boolean(getSketchBounds(sketchRef.current).width)
      || hasFillRef.current
      || backgroundColorRef.current !== DEFAULT_BACKGROUND_COLOR;
    if (!hasContent) return;
    if (historyRef.current.cursor > 5 && !window.confirm('Clear the entire canvas? You can still undo this action.')) return;
    revisionRef.current += 1;
    pointerRef.current = null;
    setMarquee(null);
    setSelectionDoodlePath(null);
    clearPredictionTimer(timerRef);
    syncScene([]);
    chooseObject(null);
    sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
    sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
    fillRef.current.getContext('2d').clearRect(0, 0, W, H);
    fillSnapshotRef.current = fillRef.current.getContext('2d').getImageData(0, 0, W, H);
    hasFillRef.current = false;
    setHasFill(false);
    backgroundColorRef.current = DEFAULT_BACKGROUND_COLOR;
    setBackgroundColor(DEFAULT_BACKGROUND_COLOR);
    setRecognition(IDLE);
    setHasInk(false);
    setMessage('');
    pushHistory();
  };

  const insert = async (target) => {
    const label = typeof target === 'string' ? target : target.label;
    const variant = typeof target === 'string' ? getArtworkVariants(label)[0] ?? null : target.variant ?? null;
    if (!variant) {
      setMessage('That guess has no illustration yet — try another suggestion.');
      return;
    }
    const bounds = getSketchBounds(composeRecognitionSketch());
    if (!bounds.width) {
      setMessage('Draw a sketch first, then add an illustration.');
      return;
    }
    try {
      const revision = ++revisionRef.current;
      const objectColor = defaultSceneObjectColor(variant, activeColor);
      await imageCacheRef.current.ensure(variant, objectColor);
      if (revision !== revisionRef.current) return;
      const placement = getSceneObjectPlacement(bounds, variant, W, H);
      if (!placement) throw new Error('The sketch bounds could not be measured.');
      const object = createSceneObject({
        id: createSceneObjectId(),
        artwork: variant,
        label,
        color: objectColor,
        ...placement,
        zIndex: sceneObjectsRef.current.length,
      });
      syncScene(addSceneObject(sceneObjectsRef.current, object));
      chooseObject(object.id);
      setTool('select');
      clearPredictionTimer(timerRef);
      sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
      sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
      setRecognition(IDLE);
      setHasInk(false);
      setMessage(`Added a clean ${displayName(label)} object. Select it to move, resize, rotate or recolor it.`);
      pushHistory();
      schedulePrediction();
    } catch (error) {
      console.error('Artwork insertion failed:', error);
      setMessage('Could not add that illustration. Please try again.');
    }
  };

  const duplicateSelected = () => {
    const ids = selectedObjectIdsRef.current;
    if (!ids.length) return;
    const result = duplicateSceneObjects(sceneObjectsRef.current, ids);
    if (!result.duplicates.length) return;
    syncScene(result.objects);
    chooseObjects(result.duplicates.map((object) => object.id));
    pushHistory();
  };

  const reorderSelected = (direction) => {
    const ids = selectedObjectIdsRef.current;
    if (!ids.length) return;
    const next = reorderSceneObjects(sceneObjectsRef.current, ids, direction);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    chooseObjects(ids);
    pushHistory();
  };

  const flipSelected = () => {
    const ids = selectedObjectIdsRef.current;
    if (!ids.length) return;
    const next = flipSceneObjects(sceneObjectsRef.current, ids);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    // Redraw synchronously so artwork reflects a flip without waiting for the
    // scene effect; the cached source artwork remains untouched.
    renderScene(next, canvasRef.current, sceneImageCacheRef.current);
    pushHistory();
  };

  const recolorSelected = async (nextColor) => {
    const normalizedColor = nextColor === 'original' ? 'original' : normalizeHexColor(nextColor);
    const ids = [...selectedObjectIdsRef.current];
    const objects = getSelectedSceneObjects(sceneObjectsRef.current, ids);
    if (!objects.length || !normalizedColor || objects.every((object) => object.color === normalizedColor)) return;
    try {
      await Promise.all(objects
        .filter((object) => object.type === 'artwork')
        .map((object) => imageCacheRef.current.ensure(object.artwork, normalizedColor)));
      const currentIds = selectedObjectIdsRef.current;
      if (currentIds.length !== ids.length || !ids.every((id) => currentIds.includes(id))) return;
      const next = recolorSceneObjects(sceneObjectsRef.current, ids, normalizedColor);
      if (next === sceneObjectsRef.current) return;
      syncScene(next);
      pushHistory();
    } catch (error) {
      console.error('Could not recolor selected objects:', error);
      setMessage('Could not change the selected objects’ color. Please try again.');
    }
  };

  const selectedObjects = getSelectedSceneObjects(sceneObjects, selectedObjectIds);
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null;
  const selectedObjectId = selectedObjectIds[0] ?? null;
  const selectedIndex = selectedObject ? sceneObjects.findIndex((object) => object.id === selectedObject.id) : -1;
  const groupBounds = selectedObjects.length > 1 ? getGroupBounds(selectedObjects) : null;
  const selectionCorners = selectedObject
    ? getTransformedCorners(selectedObject)
    : groupBounds ? [
      { x: groupBounds.x, y: groupBounds.y, signX: -1, signY: -1 },
      { x: groupBounds.right, y: groupBounds.y, signX: 1, signY: -1 },
      { x: groupBounds.right, y: groupBounds.bottom, signX: 1, signY: 1 },
      { x: groupBounds.x, y: groupBounds.bottom, signX: -1, signY: 1 },
    ] : [];
  const canvasRect = canvasWrapRef.current?.getBoundingClientRect();
  const displayScale = Math.max(0.01, (canvasRect?.width ?? W) / W * view.zoom);
  const handleRadius = 6 / displayScale;
  const handleHitRadius = 17 / displayScale;
  const transformBounds = groupBounds
    ? { ...groupBounds, rotation: 0, flipX: false }
    : selectedObject;
  const rotationHandle = transformBounds ? getRotationHandle(transformBounds, 30 / displayScale) : null;
  const rotationStem = selectedObject
    ? objectLocalToWorld(selectedObject, { x: 0, y: -selectedObject.height / 2 })
    : groupBounds ? { x: groupBounds.x + groupBounds.width / 2, y: groupBounds.y } : null;
  const selectedObjectLabel = selectedObject?.type === 'text' ? selectedObject.text : displayName(selectedObject?.label ?? '');
  const canMoveSelectionForward = selectedObjects.length > 0 && reorderSceneObjects(sceneObjects, selectedObjectIds, 1) !== sceneObjects;
  const canMoveSelectionBackward = selectedObjects.length > 0 && reorderSceneObjects(sceneObjects, selectedObjectIds, -1) !== sceneObjects;
  const entryClientPoint = textDraft && canvasWrapRef.current
    ? canvasToClientPoint(textDraft.x, textDraft.y, canvasWrapRef.current, W, H, view)
    : null;
  const textEntryPosition = entryClientPoint && canvasRect ? {
    left: Math.max(4, Math.min(canvasRect.width - 230, entryClientPoint.x - canvasRect.left)),
    top: Math.max(4, Math.min(canvasRect.height - 44, entryClientPoint.y - canvasRect.top)),
  } : null;
  const predictions = recognition.predictions;
  // Reuse the bundled, license-documented illustration set while additional
  // CC0/public-domain samples are reviewed for import from the source shortlist.
  const suggestions = predictions
    .filter((prediction, index) => index === 0 || prediction.score >= 0.0005)
    .slice(0, 10)
    .map((prediction) => ({ ...prediction, name: displayName(prediction.label), illustrated: getArtworkVariants(prediction.label).length > 0 }));
  const cards = buildSuggestions(predictions);
  const shownClasses = new Set(cards.map((card) => card.label)).size;
  const barEmptyCopy = status === 'loading' ? 'Getting the drawing ideas ready…'
    : status === 'error' ? 'Suggestions are unavailable — the model did not load.'
    : recognition.status === 'tiny' ? 'Keep going — a little more drawing and ideas will appear.'
    : recognition.status === 'error' ? 'That one confused the AI. Keep drawing and it will try again.'
    : 'Start drawing to see smart suggestions.';
  const primary = predictions[0];
  const others = predictions.slice(1, 5);
  const lowConfidence = primary && primary.score < 0.45;
  const statusText = status === 'loading' ? 'Loading drawing AI…' : status === 'error' ? 'AI unavailable' : `AI ready — ${classCount} objects`;
  const previewEnd = shapePreview
    ? constrainShapeEnd(shapePreview.start, shapePreview.end, shapePreview.shapeKind, shapePreview.constrain)
    : null;
  const selectedShapeEndpoints = selectedObject?.type === 'shape'
    && ['line', 'arrow'].includes(selectedObject.shapeKind)
    ? [
      { key: 'start', ...objectLocalToWorld(selectedObject, selectedObject.start) },
      { key: 'end', ...objectLocalToWorld(selectedObject, selectedObject.end) },
    ] : [];
  const selectedRecognitionCount = selectedObjects.filter((object) => object.isSketchStroke).length;
  const selectedThicknessObjects = selectedObjects.filter(isThicknessEditable);
  const thicknessAlreadyApplied = selectedThicknessObjects.length > 0
    && selectedThicknessObjects.every((object) => (object.thicknessDelta ?? 0) === thicknessDraft);
  const thicknessToolbar = selectedThicknessObjects.length > 0 && <div className="thickness-editor" role="group" aria-label="Selected line thickness controls">
    <label className="thickness-slider" htmlFor="selected-thickness-slider">
      <span className="control-label">LINE THICKNESS</span>
      <input id="selected-thickness-slider" type="range" min="-16" max="16" step="1" value={thicknessDraft}
        onChange={(event) => setThicknessDraft(Number(event.target.value))}
        aria-label="Thickness adjustment in pixels" aria-valuetext={`${thicknessDraft > 0 ? '+' : ''}${thicknessDraft} pixels`}/>
      <output aria-label="Thickness adjustment value">{thicknessDraft > 0 ? '+' : ''}{thicknessDraft}px</output>
    </label>
    <button className="object-action thickness-apply" onClick={applySelectedThickness} disabled={thicknessAlreadyApplied}
      aria-label="Apply thickness to selected objects" title="Apply this thickness adjustment to eligible outlines">
      <Check size={14}/> Apply
    </button>
    <span className="thickness-note">Hand-drawn marks, shape strokes and outlined artwork only</span>
  </div>;

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="SketchAI home"><span className="brand-icon"><Sparkles size={18}/></span><span>Sketch<span className="brand-ai">AI</span><small>DRAWING STUDIO</small></span></a>
      <div className="header-right"><span className={`model-status ${guessingEnabled ? status : 'off'}`}><i/> {guessingEnabled ? statusText : 'AI guessing off'}</span><button className="help-link" onClick={openFaq} aria-label="Open FAQ"><BookOpen size={16}/> FAQ</button><button className="help-link" onClick={() => setShowHelp(true)}><CircleHelp size={17}/> How it works</button></div>
    </header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR CREATIVE SPACE <span className="eyebrow-line"/></div><h1>Big ideas start <em>small.</em></h1><p>Draw something, and let a little AI magic bring it to life.</p></div><div className="intro-note"><Sparkles size={16}/><span>MADE FOR<br/><strong>CURIOUS MINDS</strong></span></div></section>
      <div className="workspace-heading"><div><span className="section-number">01 /</span><h2>Your canvas</h2><span className="heading-sub">A space to make your mark.</span></div><div className="workspace-actions">
        <div className="guessing-control"><span>Guessing</span><button type="button" role="switch" className={`guessing-switch ${guessingEnabled ? 'enabled' : ''}`} aria-label="AI guessing" aria-checked={guessingEnabled} onClick={toggleGuessing}><span className="guessing-switch-thumb"/></button><strong aria-live="polite">{guessingEnabled ? 'Yes' : 'No'}</strong></div>
        <button className="text-button" onClick={clear}><Trash2 size={16}/> Clear canvas</button>
      </div></div>
      <div className={`workspace ${guessingEnabled ? '' : 'workspace-no-guessing'}`}>
        <div className="editor">
          <div className="editor-top">
            <div className="file-name"><span className="file-dot"/> Untitled sketch <span className="file-label">/ EDITING</span></div>
            <div className="editor-top-right">
              <span><LockKeyhole size={13}/> PRIVATE BY DESIGN</span>
              <span className="canvas-dim">1200 × 720</span>
              <div className="zoom-controls" role="group" aria-label="Canvas zoom controls">
                <button className="zoom-button" onClick={() => changeZoom(-1)} disabled={view.zoom <= MIN_VIEW_ZOOM} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15}/></button>
                <span className="zoom-readout" data-zoom-level>{Math.round(view.zoom * 100)}%</span>
                <button className="zoom-button" onClick={() => changeZoom(1)} disabled={view.zoom >= MAX_VIEW_ZOOM} aria-label="Zoom in" title="Zoom in"><ZoomIn size={15}/></button>
                <button className="zoom-button reset-view" onClick={resetView} aria-label="Reset view" title="Reset view to 100%"><Maximize2 size={14}/></button>
              </div>
            </div>
          </div>
          {guessingEnabled && <SuggestionBar cards={cards} onInsert={insert} title={selectedRecognitionCount ? 'For your selected drawing…' : 'Did you mean…'} emptyCopy={barEmptyCopy} phase={status === 'loading' ? 'loading' : 'idle'}/>}
          <div className="drawing-area">
            <div className="tool-rail" aria-label="Drawing and object tools">
              <span className="rail-label">TOOLS</span>
              <button className={`rail-button ${tool === 'select' ? 'selected' : ''}`} onClick={() => setTool('select')} aria-pressed={tool === 'select'} aria-label="Select tool" title="Select and edit objects"><MousePointer2 size={19}/></button>
              <button className={`rail-button ${tool === 'selectDoodle' ? 'selected' : ''}`} onClick={() => setTool('selectDoodle')} aria-pressed={tool === 'selectDoodle'} aria-label="Select doodle mode" title="Draw a closed loop around objects or scribble across them to select without erasing" data-tool="select-doodle"><Lasso size={19}/></button>
              <button className={`rail-button ${tool === 'pencil' ? 'selected' : ''}`}  onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Pencil" title="Draw a rough sketch"><Pencil size={19}/></button>
              <button className={`rail-button ${tool === 'shape-line' ? 'selected' : ''}`} onClick={() => setTool('shape-line')} aria-pressed={tool === 'shape-line'} aria-label="Line tool" title="Draw an editable line"><Minus size={19}/></button>
              <button className={`rail-button ${tool === 'shape-rectangle' ? 'selected' : ''}`} onClick={() => setTool('shape-rectangle')} aria-pressed={tool === 'shape-rectangle'} aria-label="Rectangle tool" title="Draw an editable rectangle"><Square size={18}/></button>
              <button className={`rail-button ${tool === 'shape-ellipse' ? 'selected' : ''}`} onClick={() => setTool('shape-ellipse')} aria-pressed={tool === 'shape-ellipse'} aria-label="Ellipse tool" title="Draw an editable circle or ellipse"><Circle size={18}/></button>
              <button className={`rail-button ${tool === 'shape-arrow' ? 'selected' : ''}`} onClick={() => setTool('shape-arrow')} aria-pressed={tool === 'shape-arrow'} aria-label="Arrow tool" title="Draw an editable arrow"><ArrowUpRight size={18}/></button>
              <button className={`rail-button ${tool === 'text' ? 'selected' : ''}`} onClick={() => setTool('text')} aria-pressed={tool === 'text'} aria-label="Text tool" title="Add editable text"><Type size={19}/></button>
              <button className={`rail-button ${tool === 'fill' ? 'selected' : ''}`} onClick={() => setTool('fill')} aria-pressed={tool === 'fill'} aria-label="Fill tool" title="Fill a connected region"><PaintBucket size={19}/></button>
              <button className={`rail-button ${tool === 'eraser' ? 'selected' : ''}`} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Eraser" title="Eraser with Classic and Doodle modes"><Eraser size={19}/></button>
              <button className={`rail-button ${tool === 'pan' ? 'selected' : ''}`} onClick={() => setTool('pan')} aria-pressed={tool === 'pan'} aria-label="Pan tool" title="Pan the canvas"><Hand size={19}/></button>
              <div className="rail-divider"/>
              <button className="rail-button" disabled={!canUndo} onClick={() => restore(-1)} aria-label="Undo" title="Undo (Ctrl or Cmd + Z)"><RotateCcw size={19}/></button>
              <button className="rail-button flip" disabled={!canRedo} onClick={() => restore(1)} aria-label="Redo" title="Redo (Ctrl or Cmd + Shift + Z)"><RotateCcw size={19}/></button>
              <div className="rail-spacer"/><span className="rail-label bottom-label">SKETCH<br/>AWAY</span>
            </div>
            <div className={`canvas-wrap tool-${tool}${tool === 'eraser' ? ` eraser-${eraserMode}` : ''}`} data-eraser-mode={tool === 'eraser' ? eraserMode : undefined} ref={canvasWrapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onDoubleClick={onCanvasDoubleClick}>
              <div className="canvas-stage" style={{ transform: viewportTransformCss(view), backgroundColor }} data-view-zoom={view.zoom} data-view-pan-x={view.panX} data-view-pan-y={view.panY} data-background-color={backgroundColor}>
                <canvas ref={fillRef} className="fill-canvas" width={W} height={H} aria-hidden="true"/>
                <canvas ref={canvasRef} className="art-canvas" width={W} height={H} aria-label="Drawing canvas. Select objects, or use the pencil, line, rectangle, ellipse, arrow, text, fill or eraser tools. Hold Shift while drawing a shape to constrain its proportions or angle. Select Doodle mode selects by loop or scribble without erasing; the doodle eraser can remove part of a drawing and keep the remainder editable." data-scene-object-count={sceneObjects.length} data-selected-object-id={selectedObjectId ?? ''} data-selected-object-ids={selectedObjectIds.join(',')}/>
                <canvas ref={sketchRef} className="sketch-overlay" width={W} height={H} aria-hidden="true"/>
                {shapePreview && previewEnd && <svg className="shape-preview-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`${shapePreview.shapeKind} preview`}>
                  {shapePreview.shapeKind === 'rectangle'
                    ? <rect x={Math.min(shapePreview.start.x, previewEnd.x)} y={Math.min(shapePreview.start.y, previewEnd.y)} width={Math.abs(previewEnd.x - shapePreview.start.x)} height={Math.abs(previewEnd.y - shapePreview.start.y)} fill={defaultShapeFill === 'none' ? 'none' : defaultShapeFill} stroke={activeColor} strokeWidth={size}/>
                    : shapePreview.shapeKind === 'ellipse'
                      ? <ellipse cx={(shapePreview.start.x + previewEnd.x) / 2} cy={(shapePreview.start.y + previewEnd.y) / 2} rx={Math.abs(previewEnd.x - shapePreview.start.x) / 2} ry={Math.abs(previewEnd.y - shapePreview.start.y) / 2} fill={defaultShapeFill === 'none' ? 'none' : defaultShapeFill} stroke={activeColor} strokeWidth={size}/>
                      : <line x1={shapePreview.start.x} y1={shapePreview.start.y} x2={previewEnd.x} y2={previewEnd.y} stroke={activeColor} strokeWidth={size} markerEnd={shapePreview.shapeKind === 'arrow' ? 'url(#shape-arrowhead)' : undefined}/>}
                  <defs><marker id="shape-arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill={activeColor}/></marker></defs>
                </svg>}
                {(tool === 'select' || tool === 'selectDoodle') && (selectedObjects.length > 0 || (tool === 'select' && marquee) || (tool === 'selectDoodle' && selectionDoodlePath?.length > 1)) && <svg className="selection-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                  aria-label={selectedObjects.length > 1 ? `${selectedObjects.length} objects selected` : selectedObject ? `Selected ${selectedObjectLabel}` : tool === 'selectDoodle' ? 'Dotted selection doodle' : 'Selection marquee'}
                  data-selection-mode={tool === 'selectDoodle' ? 'doodle' : 'standard'}
                  data-selected-object-id={selectedObject?.id ?? ''} data-selected-object-ids={selectedObjectIds.join(',')} data-selection-count={selectedObjects.length}
                  data-object-type={selectedObject?.type ?? (selectedObjects.length > 1 ? 'group' : '')}
                  data-object-x={selectedObject?.x ?? groupBounds?.x ?? ''} data-object-y={selectedObject?.y ?? groupBounds?.y ?? ''}
                  data-object-width={selectedObject?.width ?? groupBounds?.width ?? ''} data-object-height={selectedObject?.height ?? groupBounds?.height ?? ''}
                  data-object-rotation={selectedObject?.rotation ?? ''} data-object-flip-x={selectedObject?.flipX ?? ''}
                  data-object-font-size={selectedObject?.fontSize ?? ''} data-object-font-family={selectedObject?.fontFamily ?? ''}
                  data-object-font-weight={selectedObject?.fontWeight ?? ''} data-object-text-align={selectedObject?.textAlign ?? ''}
                  data-object-color={selectedObject?.color ?? ''}
                  data-object-thickness-delta={selectedObject?.thicknessDelta ?? ''}
                  data-object-stroke-width={selectedObject?.type === 'shape' ? selectedObject.strokeWidth : ''}>
                  {tool === 'selectDoodle' && selectionDoodlePath?.length > 1 && <polyline
                    className="selection-doodle-path"
                    data-settling={selectionDoodleSettling ? 'true' : 'false'}
                    points={selectionDoodlePath.map(({ x, y }) => `${x},${y}`).join(' ')}
                    stroke={selectionDoodleColor}
                    strokeWidth={2.5}
                    aria-label="Selection doodle boundary"
                  />}
                  {tool === 'select' && marquee && <rect className="marquee-selection" x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height}/>}
                  {selectedObjects.length > 0 && <>
                    {groupBounds
                      ? <rect className="selection-box group-selection-box" strokeWidth={1.5 / displayScale} x={groupBounds.x} y={groupBounds.y} width={groupBounds.width} height={groupBounds.height}/>
                      : <polygon className="selection-box" strokeWidth={1.5 / displayScale} points={selectionCorners.map(({ x, y }) => `${x},${y}`).join(' ')}/>}
                    {selectedShapeEndpoints.map((endpoint) => <g key={endpoint.key} className="shape-endpoint-hit-area" data-transform-handle="shapeEndpoint" data-point={endpoint.key} role="button" tabIndex="0" aria-label={`Move line ${endpoint.key} endpoint`}>
                      <circle cx={endpoint.x} cy={endpoint.y} r={handleHitRadius}/><circle className="shape-endpoint-handle" cx={endpoint.x} cy={endpoint.y} r={handleRadius}/>
                    </g>)}
                    <line className="rotation-stem" strokeWidth={1.25 / displayScale} x1={rotationStem.x} y1={rotationStem.y} x2={rotationHandle.x} y2={rotationHandle.y}/>
                    <circle className="rotation-hit-area" cx={rotationHandle.x} cy={rotationHandle.y} r={handleHitRadius} data-transform-handle="rotate" aria-label={groupBounds ? 'Rotate selected objects' : 'Rotate selected object'} role="button" tabIndex="0"/>
                    <circle className="rotation-handle" cx={rotationHandle.x} cy={rotationHandle.y} r={handleRadius} strokeWidth={1.5 / displayScale} aria-hidden="true"/>
                    {selectionCorners.map((corner) => <g key={`${corner.signX}:${corner.signY}`} className="resize-hit-area" data-transform-handle="resize" data-sign-x={corner.signX} data-sign-y={corner.signY} aria-label={groupBounds ? 'Resize selected objects' : 'Resize selected object'} role="button" tabIndex="0">
                      <circle cx={corner.x} cy={corner.y} r={handleHitRadius}/>
                      <circle className="resize-handle" cx={corner.x} cy={corner.y} r={handleRadius} strokeWidth={1.5 / displayScale}/>
                    </g>)}
                  </>}
                </svg>}
                {sceneObjects.length === 0 && !hasInk && !hasFill && <div className="canvas-hint"><div className="hint-icon"><Pencil size={20}/></div><strong>Your next idea starts here</strong><span>Pick a tool and start drawing</span></div>}
                <div className="canvas-corner">✳ &nbsp; MAKE SOMETHING WONDERFUL</div>
              </div>
              {textDraft && textEntryPosition && <div className="text-entry" style={textEntryPosition} data-draft-value={textDraft.value} onPointerDown={(event) => event.stopPropagation()}>
                <input autoFocus maxLength={120} spellCheck="false" aria-label={textDraft.mode === 'create' ? 'Enter canvas text' : 'Edit text content'} placeholder="Type something…" value={textDraft.value} onChange={(event) => setTextDraft(updateTextDraftValue(textDraft, event.target.value))} onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); commitTextDraft(); }
                  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setTextDraft(cancelTextDraft()); }
                }}/>
                <button className="text-entry-confirm" onClick={commitTextDraft} aria-label="Confirm text"><Check size={15}/></button>
                <button className="text-entry-cancel" onClick={() => setTextDraft(cancelTextDraft())} aria-label="Cancel text"><X size={15}/></button>
              </div>}
            </div>
          </div>
          {selectedObject && <div className="object-toolbar" aria-label="Selected object editor">
            <div className="object-toolbar-title"><span className="control-label">EDITING</span><strong>{selectedObjectLabel}</strong><span className="object-position">Object {selectedIndex + 1} of {sceneObjects.length}</span></div>
            <div className="object-toolbar-actions">
              <div className="object-color-apply" role="group" aria-label="Selected object color">
                <span className="object-current-color">
                  <i style={{ '--object-color': selectedObject.color === 'original' ? '#FFFFFF' : selectedObject.color }} aria-hidden="true"/>
                  <output aria-label="Current selected object color">{selectedObject.color === 'original' ? 'Original colors' : selectedObject.color}</output>
                </span>
                <button className="object-action" onClick={() => recolorSelected(activeColor)}
                  disabled={selectedObject.color === activeColor} aria-label="Apply Active Color" title={`Apply ${activeColor}`}>
                  <Check size={14}/> Apply Active Color
                </button>
                {selectedObject.type === 'bitmap' && selectedObject.color !== 'original' && <button className="object-action" onClick={() => recolorSelected('original')} aria-label="Restore original doodle colors" title="Restore original colors">Original</button>}
              </div>
              {thicknessToolbar}
              {selectedObject.type === 'text' && <div className="text-object-controls" role="group" aria-label="Selected text controls">
                <button className="object-action" onClick={() => editTextObject(selectedObject)} aria-label="Edit text content" title="Edit text"><Type size={14}/> Edit text</button>
                <label className="text-setting"><span>SIZE</span><select aria-label="Text font size" value={Math.round(selectedObject.fontSize)} onChange={(event) => changeSelectedText({ fontSize: Number(event.target.value) })}>
                  {!([16, 24, 32, 48, 64, 80, 96, 128, 160, 200].includes(Math.round(selectedObject.fontSize))) && <option value={Math.round(selectedObject.fontSize)}>{Math.round(selectedObject.fontSize)}px</option>}
                  {[16, 24, 32, 48, 64, 80, 96, 128, 160, 200].map((fontSize) => <option key={fontSize} value={fontSize}>{fontSize}px</option>)}
                </select></label>
                <label className="text-setting font-family"><span>FONT</span><select aria-label="Text font family" value={selectedObject.fontFamily} onChange={(event) => changeSelectedText({ fontFamily: event.target.value })}>{SAFE_TEXT_FAMILIES.map((family) => <option key={family} value={family}>{family === 'Arial, sans-serif' ? 'Arial' : family === 'Georgia, serif' ? 'Georgia' : 'Monospace'}</option>)}</select></label>
                <button className={`object-action ${selectedObject.fontWeight === 'bold' ? 'pressed' : ''}`} onClick={() => changeSelectedText({ fontWeight: selectedObject.fontWeight === 'bold' ? 'normal' : 'bold' })} aria-label="Toggle bold text" aria-pressed={selectedObject.fontWeight === 'bold'} title="Bold"><Bold size={14}/></button>
                <div className="text-align-controls" role="group" aria-label="Text alignment">
                  <button className={`object-action icon-only ${selectedObject.textAlign === 'left' ? 'pressed' : ''}`} onClick={() => changeSelectedText({ textAlign: 'left' })} aria-label="Align text left" aria-pressed={selectedObject.textAlign === 'left'}><AlignLeft size={14}/></button>
                  <button className={`object-action icon-only ${selectedObject.textAlign === 'center' ? 'pressed' : ''}`} onClick={() => changeSelectedText({ textAlign: 'center' })} aria-label="Align text center" aria-pressed={selectedObject.textAlign === 'center'}><AlignCenter size={14}/></button>
                  <button className={`object-action icon-only ${selectedObject.textAlign === 'right' ? 'pressed' : ''}`} onClick={() => changeSelectedText({ textAlign: 'right' })} aria-label="Align text right" aria-pressed={selectedObject.textAlign === 'right'}><AlignRight size={14}/></button>
                </div>
              </div>}
              <span className="object-toolbar-divider"/>
              <button className="object-action" onClick={duplicateSelected} aria-label="Duplicate selected object" title="Duplicate"><Copy size={15}/> Duplicate</button>
              <button className="object-action" onClick={() => reorderSelected(1)} disabled={selectedIndex >= sceneObjects.length - 1} aria-label="Bring selected object forward" title="Bring forward one step"><ArrowUp size={15}/> Forward</button>
              <button className="object-action" onClick={() => reorderSelected(-1)} disabled={selectedIndex <= 0} aria-label="Send selected object backward" title="Send backward one step"><ArrowDown size={15}/> Back</button>
              {['artwork', 'bitmap'].includes(selectedObject.type) && <button className="object-action" onClick={flipSelected} aria-label="Flip selected object horizontally" title="Flip horizontally"><FlipHorizontal2 size={15}/> Flip</button>}
              <button className="object-action danger" onClick={deleteSelected} aria-label="Delete selected object" title="Delete"><Trash2 size={15}/> Delete</button>
            </div>
            <span className="object-edit-hint">Drag to move · corners resize proportionally · upper handle rotates · double-click text to edit</span>
          </div>}
          {selectedObjects.length > 1 && <div className="object-toolbar multi-object-toolbar" aria-label="Multiple selection toolbar" data-selection-count={selectedObjects.length}>
            <div className="object-toolbar-title"><span className="control-label">GROUP</span><strong>{selectedObjects.length} objects selected</strong><span className="object-position">Artwork and text</span></div>
            <div className="object-toolbar-actions">
              <button className="object-action" onClick={() => recolorSelected(activeColor)}
                disabled={selectedObjects.every((object) => object.color === activeColor)} aria-label="Apply Active Color" title={`Apply ${activeColor} to selected objects`}>
                <Check size={14}/> Apply Active Color
              </button>
              {thicknessToolbar}
              <span className="object-toolbar-divider"/>
              <button className="object-action" onClick={duplicateSelected} aria-label="Duplicate selected objects" title="Duplicate selected objects"><Copy size={15}/> Duplicate</button>
              <button className="object-action" onClick={() => reorderSelected(1)} disabled={!canMoveSelectionForward} aria-label="Bring selected objects forward" title="Bring selected set forward one step"><ArrowUp size={15}/> Forward</button>
              <button className="object-action" onClick={() => reorderSelected(-1)} disabled={!canMoveSelectionBackward} aria-label="Send selected objects backward" title="Send selected set backward one step"><ArrowDown size={15}/> Back</button>
              <button className="object-action" onClick={flipSelected} aria-label="Flip selected objects horizontally" title="Flip each selected object horizontally"><FlipHorizontal2 size={15}/> Flip</button>
              <button className="object-action danger" onClick={deleteSelected} aria-label="Delete selected objects" title="Delete selected objects"><Trash2 size={15}/> Delete</button>
            </div>
            <span className="object-edit-hint">Drag to move · corner handles resize proportionally · upper handle rotates · each object flips around its own center</span>
          </div>}
          {tool === 'fill' && <div className="fill-controls" aria-label="Paint bucket and canvas background controls">
            <div className="fill-active-color">
              <span className="control-label">BUCKET COLOR</span>
              <i style={{ '--object-color': activeColor }} aria-hidden="true"/>
              <output aria-label="Bucket uses active color">{activeColor}</output>
            </div>
            <span className="object-toolbar-divider"/>
            <div className="background-current">
              <span className="control-label">CANVAS BACKGROUND</span>
              <i style={{ '--object-color': backgroundColor }} aria-hidden="true"/>
              <output aria-label="Canvas background color">{backgroundColor}</output>
            </div>
            <button className="object-action" onClick={() => setCanvasBackground(activeColor)}
              disabled={backgroundColor === activeColor} aria-label="Set background to active color">Set Background to Active Color</button>
            <button className="object-action" onClick={() => setCanvasBackground(DEFAULT_BACKGROUND_COLOR)}
              aria-label="Reset canvas background to white">Reset White</button>
            <span className="fill-hint">Fill and background use the shared Active Color control.</span>
          </div>}
          <div className="editor-bottom">
            <ColorControl value={activeColor} onChange={setActiveColor}/>
            {tool === 'selectDoodle' && <div className="selection-doodle-controls" role="group" aria-label="Selection doodle outline settings">
              <label className="selection-doodle-color" htmlFor="selection-doodle-color">
                <span className="control-label">DOTTED LINE</span>
                <input id="selection-doodle-color" type="color" value={selectionDoodleColor} onChange={(event) => setSelectionDoodleColor(normalizeHexColor(event.target.value) ?? '#4B8BF4')} aria-label="Selection doodle outline color" />
                <output>{selectionDoodleColor}</output>
                <span className="selection-doodle-sample" style={{ '--selection-doodle-color': selectionDoodleColor }} aria-hidden="true" />
              </label>
              <button className="object-action" onClick={() => setSelectionDoodlePath(null)} disabled={!selectionDoodlePath} aria-label="Clear selection doodle outline">Clear outline</button>
            </div>}
            {tool.startsWith('shape-') && <div className="brush-control shape-defaults" role="group" aria-label="New shape defaults">
              <span className="control-label">OUTLINE</span><input type="color" aria-label="New shape outline color" value={activeColor} onChange={(event) => setActiveColor(event.target.value)}/>
              <span className="control-label">FILL</span><button className={`mode-button ${defaultShapeFill === 'none' ? 'selected' : ''}`} onClick={() => setDefaultShapeFill('none')} aria-pressed={defaultShapeFill === 'none'}>None</button>
              <input type="color" aria-label="New shape fill color" value={defaultShapeFill === 'none' ? activeColor : defaultShapeFill} onChange={(event) => setDefaultShapeFill(event.target.value)}/>
              <input aria-label="New shape stroke width" type="range" min="1" max="30" value={size} onChange={(event) => setSize(Number(event.target.value))}/><output>{size}px</output>
            </div>}
            {selectedObject?.type === 'shape' && tool === 'select' && <div className="brush-control shape-defaults" role="group" aria-label="Selected shape settings">
              <span className="control-label">OUTLINE</span><input type="color" aria-label="Selected shape outline color" value={selectedObject.color} onChange={(event) => changeSelectedShape({ color: event.target.value })}/>
              <span className="control-label">FILL</span><button className={`mode-button ${selectedObject.fillColor === 'none' ? 'selected' : ''}`} onClick={() => changeSelectedShape({ fillColor: selectedObject.fillColor === 'none' ? activeColor : 'none' })} aria-pressed={selectedObject.fillColor !== 'none'}>Fill</button>
              {selectedObject.fillColor !== 'none' && <input type="color" aria-label="Selected shape fill color" value={selectedObject.fillColor} onChange={(event) => changeSelectedShape({ fillColor: event.target.value })}/>}
              {selectedObject.shapeKind === 'arrow' && <select aria-label="Arrowhead style" value={selectedObject.arrowHead} onChange={(event) => changeSelectedShape({ arrowHead: event.target.value })}><option value="none">No head</option><option value="start">Start</option><option value="end">End</option><option value="both">Both</option></select>}
              <input aria-label="Selected shape stroke width" type="range" min="1" max="30" value={Math.max(1, Math.min(100, selectedObject.strokeWidth + (selectedObject.thicknessDelta ?? 0)))} onChange={(event) => changeSelectedShape({ strokeWidth: Number(event.target.value) })}/><output>{Math.max(1, Math.min(100, selectedObject.strokeWidth + (selectedObject.thicknessDelta ?? 0)))}px</output>
            </div>}
            {tool === 'eraser' && <div className="brush-control eraser-mode" role="group" aria-label="Eraser mode">
              <span className="control-label">MODE</span>
              <button className={`mode-button ${eraserMode === 'classic' ? 'selected' : ''}`} onClick={() => setEraserMode('classic')} aria-pressed={eraserMode === 'classic'} aria-label="Classic eraser mode: remove whole objects" title="Classic — erases sketch ink and removes the whole object it crosses">Classic</button>
              <button className={`mode-button ${eraserMode === 'doodle' ? 'selected' : ''}`} onClick={() => setEraserMode('doodle')} aria-pressed={eraserMode === 'doodle'} aria-label="Doodle eraser mode: erase part of a drawing and keep the rest editable" title="Doodle — brush-erase part of a drawing; the remainder stays selectable and editable">Doodle</button>
            </div>}
            {(tool === 'pencil' || tool === 'eraser') && <div className="brush-control">
              <span className="control-label">BRUSH SIZE</span>
              <input aria-label="Brush size" type="range" min="1" max="100" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))}/>
              <output className="size-value">{size}px logical</output>
            </div>}
            <div className="bottom-tip"><MousePointer2 size={14}/>{tool === 'select' ? 'Edit objects' : tool === 'selectDoodle' ? 'Draw a closed loop to lasso · scribble across objects to select · Shift adds' : tool === 'eraser' ? (eraserMode === 'doodle' ? 'Brush-erase a part · the rest stays editable' : 'Erase sketch or whole object') : tool === 'text' ? 'Click to add editable text' : tool === 'fill' ? 'Click a connected region to fill' : tool === 'pan' ? 'Drag to pan · Space + drag also works' : tool.startsWith('shape-') ? 'Drag to draw · Shift constrains the proportions or angle' : 'Draw freely'}</div>
          </div>
        </div>
        {guessingEnabled && <aside className="insight-panel"><div className="panel-kicker"><span>YOUR CREATIVE COMPANION</span><Sparkles size={15}/></div><div className="panel-title-icon"><Sparkles size={19}/></div><h2>A little help<br/><em>from AI.</em></h2><p className="panel-intro">Every great drawing starts somewhere. Sketch an object and see what AI sees.</p><div className="panel-divider"/><div className="prediction-heading"><div><span className="section-number">02 /</span><h3>AI predictions</h3></div><span className="live-tag"><i/> LIVE</span></div><p className="prediction-caption">Guesses update while you draw. Choose a clean illustration from the strip above.</p>
          {status === 'ready' && fallbackReason && <p className="model-note" title={`Reason: ${fallbackReason}`}><Info size={12}/> Using fallback model — {classCount} objects</p>}
          {recognition.status === 'ok' ? <div aria-live="polite"><p className="prediction-verdict">{lowConfidence ? 'AI isn’t completely sure. Maybe:' : 'AI thinks you might be drawing…'}</p><div className="primary-guess"><span className="primary-name">{suggestions[0].name}</span><span className="primary-score">{Math.round(suggestions[0].score * 100)}%</span></div><div className="progress primary"><span style={{width:`${suggestions[0].score * 100}%`}}/></div>{others.length > 0 && <div className="other-guesses"><span className="other-label">Other guesses</span><div className="other-chips">{others.map((prediction) => <span key={prediction.label} className="other-chip" title={`${displayName(prediction.label)} · ${formatScore(prediction.score)}`}>{displayName(prediction.label)} <em>{formatScore(prediction.score)}</em></span>)}</div></div>}<p className="prediction-footnote">Top {shownClasses} guesses from the model. Confidence is an estimate, not a promise.</p></div> : <div className="empty-predictions" aria-live="polite"><div className="empty-sparkle"><Sparkles size={20}/></div><strong>{status === 'loading' ? 'Getting things ready' : status === 'error' ? 'AI is taking a break' : recognition.status === 'tiny' ? 'Keep going' : 'Waiting for your sketch'}</strong><span>{status === 'loading' ? 'Preparing the drawing categories…' : status === 'error' ? 'The model could not load. You can still draw and edit objects.' : recognition.status === 'tiny' ? 'The AI needs a little more drawing before it can guess.' : 'Start drawing to see AI predictions.'}</span></div>}
          <div className="source-roadmap artwork-refresh-state" aria-label="Next artwork sources">
            <strong>Next source additions</strong>
            <span>Current suggestions use the bundled, license-documented artwork. These sources are under review for additional assets:</span>
            <ul className="artwork-source-list">
              {SUGGESTION_SOURCE_PLAN.map((source) => (
                <li key={source.name}>
                  <a href={source.url} target="_blank" rel="noreferrer" title={source.reason}>{source.name}</a>
                </li>
              ))}
            </ul>
          </div>
          {DEBUG_AI && recognition.debug && <DebugPanel sketch={sketchRef.current} debug={recognition.debug} open={showDebug} onToggle={() => setShowDebug(!showDebug)} backend={backend} predictions={predictions} profile={modelRef.current?.profile}/>}
          <div className="panel-bottom"><Info size={15}/><span>Current suggestions use bundled artwork with documented licenses. New source files are added only after item-level reuse checks.</span></div>
        </aside>}
      </div>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="page-bottom"><span><span className="tiny-star">✳</span> Made by Punit Nilesh Warke — for the joy of creating.</span><span>SKETCHAI — AI DRAWING RECOGNITION PROJECT</span></div>
    </main>
    {showFaq && <FaqPage onClose={closeFaq} />}
    {showHelp && <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close"><X size={20}/></button><div className="panel-title-icon"><Sparkles size={20}/></div><span className="section-number">THE LITTLE DETAILS</span><h2 id="help-title">How it works<span>.</span></h2><p>From a few lines to a little inspiration, in five simple steps.</p><ol><li>Sketch with the pencil, add editable text with the Text tool, or use Fill on a connected region. Select Doodle draws a closed loop or an open stroke to select objects without erasing; hold Shift to add to a selection. Sketch ink, fills and objects stay on separate layers.</li><li>SketchAI crops, centers and normalizes the sketch for the active model: 96 × 96 for the supplied 333-class model, or 28 × 28 for the retained fallback models.</li><li>A neural network looks for patterns in the pixels.</li><li>The active drawing classifier looks at the pixels and predicts the most likely objects with confidence scores. It knows {classCount || 345} categories, so unusual objects may be guessed as something similar.</li><li>Choose an illustration to add an editable object. Select artwork or text to move, resize, rotate, recolor, duplicate, reorder or delete it. Text can be edited inline and artwork can be flipped. Zoom with the controls or wheel, and pan with Space + drag or the Hand tool; view changes never alter document coordinates.</li></ol><div className="privacy-note"><LockKeyhole size={17}/> Recognition runs locally in your browser. Your rough sketch stays separate from clean objects.</div><button className="primary-button modal-done" onClick={() => setShowHelp(false)}>Got it <ArrowRight size={16}/></button></section></div>}
  </div>;
}

export default App;
