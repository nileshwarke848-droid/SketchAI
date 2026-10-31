import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, CircleHelp, Copy, Eraser, FlipHorizontal2, Info, LockKeyhole, MousePointer2, Pencil, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { loadModel, predict } from './ai/model';
import { getSketchBounds } from './ai/preprocess';
import SuggestionBar from './components/SuggestionBar';
import { displayName, getArtworkVariants } from './data/artwork';
import { buildSuggestions } from './lib/suggestions';
import { clientToCanvasPoint } from './lib/canvas-coordinates';
import { EditorHistory } from './lib/editor-history';
import {
  addSceneObject,
  createArtworkImageCache,
  createSceneObject,
  createSceneObjectId,
  defaultSceneObjectColor,
  deleteSceneObject,
  duplicateSceneObject,
  getObjectCenter,
  getRotationFromPointer,
  getRotationHandle,
  getSceneObjectPlacement,
  getTransformedCorners,
  hitTestScene,
  objectLocalToWorld,
  renderScene,
  resizeSceneObject,
  shiftSceneObject,
  updateSceneObject,
} from './lib/scene';
import DebugPanel from './dev/DebugPanel';

const W = 1200, H = 720;
const colors = ['#242422', '#e26755', '#e9ab45', '#799b79', '#6590bd', '#a282b5'];

// The preprocessing inspector is a development tool. It opens automatically in
// dev builds and can be forced on a deployed build with ?debug=ai.
const DEBUG_AI = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === 'ai';
const IDLE = { status: 'idle', predictions: [] };
// A probability under half a percent is real but not meaningful to show as "0%".
const formatScore = (score) => (score < 0.005 ? '<1%' : `${Math.round(score * 100)}%`);

function App() {
  const canvasRef = useRef(null);
  const sketchRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const modelRef = useRef(null);
  const timerRef = useRef(null);
  const pointerRef = useRef(null);
  const historyRef = useRef(new EditorHistory(24));
  const sceneObjectsRef = useRef([]);
  const selectedObjectIdRef = useRef(null);
  const sketchSnapshotRef = useRef(null);
  const revisionRef = useRef(0);
  const imageCacheRef = useRef(null);
  if (!imageCacheRef.current) imageCacheRef.current = createArtworkImageCache();

  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState(colors[0]);
  const [size, setSize] = useState(7);
  const [sceneObjects, setSceneObjects] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [status, setStatus] = useState('loading');
  const [recognition, setRecognition] = useState(IDLE);
  const [hasInk, setHasInk] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [message, setMessage] = useState('');
  const [showDebug, setShowDebug] = useState(DEBUG_AI);
  const [backend, setBackend] = useState('');
  const [classCount, setClassCount] = useState(0);
  const [modelTier, setModelTier] = useState('');
  const [fallbackReason, setFallbackReason] = useState(null);

  const syncScene = (next) => {
    sceneObjectsRef.current = next;
    setSceneObjects(next);
  };
  const chooseObject = (id) => {
    selectedObjectIdRef.current = id;
    setSelectedObjectId(id);
  };
  const updateHistoryButtons = () => {
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
  };
  const pushHistory = useCallback(({ captureSketch = false } = {}) => {
    const sketch = sketchRef.current;
    if (!sketch) return;
    try {
      if (captureSketch || !sketchSnapshotRef.current) {
        sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
      }
      historyRef.current.push({
        objects: sceneObjectsRef.current,
        sketch: sketchSnapshotRef.current,
        selectedObjectId: selectedObjectIdRef.current,
      });
      updateHistoryButtons();
    } catch (error) {
      console.error('Could not store this step in the undo history:', error);
    }
  }, []);

  const schedulePrediction = useCallback(() => {
    clearTimeout(timerRef.current);
    const sketch = sketchRef.current;
    if (!sketch) return;
    // One inference after the user stops drawing, never on every pointer move.
    timerRef.current = setTimeout(() => {
      const loaded = modelRef.current;
      if (!loaded) return;
      try {
        const result = predict(loaded.model, loaded.labels, sketch, { profile: loaded.profile });
        if (result.status === 'error') throw result.error ?? new Error('Inference failed');
        setHasInk(Boolean(result.debug?.bounds));
        setRecognition(result);
      } catch (error) {
        console.error('Prediction failed:', error);
        setRecognition({ status: 'error', predictions: [] });
        setMessage('The AI could not read that sketch. Keep drawing and it will try again.');
      }
    }, 600);
  }, []);

  useEffect(() => {
    const sketch = sketchRef.current;
    if (sketch) {
      sketch.getContext('2d').clearRect(0, 0, W, H);
      sketchSnapshotRef.current = sketch.getContext('2d').getImageData(0, 0, W, H);
      pushHistory();
    }
    let active = true;
    loadModel({
      onBackend: setBackend,
      onProfile: (info) => {
        if (info.tier) setModelTier(info.tier);
        if (info.fallbackReason !== undefined) setFallbackReason(info.fallbackReason);
      },
    }).then((loaded) => {
      if (!active) { loaded.model.dispose(); return; }
      modelRef.current = loaded;
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
      clearTimeout(timerRef.current);
      modelRef.current?.model.dispose();
      imageCacheRef.current?.clear();
    };
  }, [pushHistory, schedulePrediction]);

  useEffect(() => {
    renderScene(sceneObjects, canvasRef.current, imageCacheRef.current);
  }, [sceneObjects]);

  const restore = useCallback((direction) => {
    clearTimeout(timerRef.current);
    pointerRef.current = null;
    revisionRef.current += 1;
    const snapshot = direction < 0 ? historyRef.current.undo() : historyRef.current.redo();
    if (!snapshot) return;
    syncScene(snapshot.objects);
    chooseObject(snapshot.selectedObjectId);
    if (snapshot.sketch && sketchRef.current) {
      sketchRef.current.getContext('2d').putImageData(snapshot.sketch, 0, 0);
      sketchSnapshotRef.current = snapshot.sketch;
    }
    const bounds = getSketchBounds(sketchRef.current);
    const sketchHasInk = Boolean(bounds.width);
    setHasInk(sketchHasInk);
    setRecognition(IDLE);
    setMessage('');
    updateHistoryButtons();
    if (sketchHasInk) schedulePrediction();
  }, [schedulePrediction]);

  const deleteSelected = useCallback(() => {
    const id = selectedObjectIdRef.current;
    if (!id) return;
    const next = deleteSceneObject(sceneObjectsRef.current, id);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    chooseObject(null);
    pushHistory();
  }, [pushHistory]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setShowHelp(false);
      const target = event.target;
      const typing = target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable);
      if ((event.key === 'Delete' || event.key === 'Backspace') && !typing && selectedObjectIdRef.current) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || typing) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restore(event.shiftKey ? 1 : -1);
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restore(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelected, restore]);

  // One mapping for sketching, erasing, selection and every transform handle.
  // The wrapper is the exact shared viewport of both canvases and the SVG overlay.
  const point = (event) => clientToCanvasPoint(
    event.clientX,
    event.clientY,
    canvasWrapRef.current,
    canvasRef.current.width,
    canvasRef.current.height,
  );

  const drawSketchSegment = (from, to, erase = false) => {
    const context = sketchRef.current.getContext('2d');
    context.save();
    context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    context.strokeStyle = erase ? '#000' : color;
    context.lineWidth = erase ? size * 3 : size;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x + 0.01, to.y + 0.01);
    context.stroke();
    context.restore();
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
      if (selectedObjectIdRef.current === hit.id) chooseObject(null);
      changed = true;
    }
    if (changed && pointerRef.current) pointerRef.current.changed = true;
  };

  const beginTransform = (event, kind, handle = null) => {
    const id = selectedObjectIdRef.current;
    const object = sceneObjectsRef.current.find((candidate) => candidate.id === id);
    if (!object) return;
    revisionRef.current += 1;
    event.preventDefault();
    event.stopPropagation();
    const p = point(event);
    pointerRef.current = {
      id: event.pointerId ?? 1,
      kind,
      startPoint: p,
      startObject: { ...object },
      handle,
      changed: false,
    };
    try { event.currentTarget?.setPointerCapture?.(event.pointerId); } catch { /* synthetic or unsupported pointer capture */ }
  };

  const onPointerDown = (event) => {
    if (pointerRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const handleElement = event.target?.closest?.('[data-transform-handle]');
    if (handleElement && tool === 'select') {
      const kind = handleElement.dataset.transformHandle;
      const handle = kind === 'resize'
        ? { signX: Number(handleElement.dataset.signX), signY: Number(handleElement.dataset.signY) }
        : null;
      beginTransform(event, kind, handle);
      return;
    }
    // The wrapper is the authoritative full-size input surface. The visible art
    // canvas is pointer-transparent so no edge can be discarded because of a
    // child-layer hit target or sub-pixel rectangle rounding.
    event.preventDefault();
    const p = point(event);
    const pointerId = event.pointerId ?? 1;
    if (tool === 'select') {
      revisionRef.current += 1;
      const hit = hitTestScene(sceneObjectsRef.current, p);
      if (!hit) { chooseObject(null); return; }
      chooseObject(hit.id);
      pointerRef.current = { id: pointerId, kind: 'move', startPoint: p, startObject: { ...hit }, changed: false };
    } else if (tool === 'eraser') {
      revisionRef.current += 1;
      clearTimeout(timerRef.current);
      pointerRef.current = { id: pointerId, kind: 'eraser', previousPoint: p, changed: false };
      drawSketchSegment(p, p, true);
      eraseObjectsAlong(p, p);
    } else {
      clearTimeout(timerRef.current);
      revisionRef.current += 1;
      setMessage('');
      pointerRef.current = { id: pointerId, kind: 'sketch', previousPoint: p, changed: true };
      drawSketchSegment(p, p);
    }
    try { event.currentTarget?.setPointerCapture?.(pointerId); } catch { /* synthetic or unsupported pointer capture */ }
  };

  const onPointerMove = (event) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 1)) return;
    const p = point(event);
    if (gesture.kind === 'sketch') {
      drawSketchSegment(gesture.previousPoint, p);
      gesture.previousPoint = p;
      gesture.changed = true;
    } else if (gesture.kind === 'eraser') {
      drawSketchSegment(gesture.previousPoint, p, true);
      eraseObjectsAlong(gesture.previousPoint, p);
      gesture.previousPoint = p;
      gesture.changed = true;
    } else if (gesture.kind === 'move') {
      const dx = p.x - gesture.startPoint.x;
      const dy = p.y - gesture.startPoint.y;
      if (Math.hypot(dx, dy) < 2) return;
      gesture.changed = true;
      syncScene(updateSceneObject(sceneObjectsRef.current, gesture.startObject.id, {
        x: gesture.startObject.x + dx,
        y: gesture.startObject.y + dy,
      }));
    } else if (gesture.kind === 'resize') {
      gesture.changed = true;
      syncScene(updateSceneObject(sceneObjectsRef.current, gesture.startObject.id,
        () => resizeSceneObject(gesture.startObject, gesture.handle, p)));
    } else if (gesture.kind === 'rotate') {
      if (Math.hypot(p.x - gesture.startPoint.x, p.y - gesture.startPoint.y) < 2) return;
      gesture.changed = true;
      const rotation = getRotationFromPointer(
        gesture.startObject,
        gesture.startObject.rotation,
        gesture.startPoint,
        p,
      );
      syncScene(updateSceneObject(sceneObjectsRef.current, gesture.startObject.id, { rotation }));
    }
  };

  const onPointerEnd = (event) => {
    const gesture = pointerRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 1)) return;
    pointerRef.current = null;
    if (gesture.kind === 'sketch' || gesture.kind === 'eraser') {
      sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
      const bounds = getSketchBounds(sketchRef.current);
      setHasInk(Boolean(bounds.width));
      setRecognition(IDLE);
      pushHistory();
      schedulePrediction();
    } else if (gesture.changed) {
      pushHistory();
    }
  };

  const clear = () => {
    const hasContent = sceneObjectsRef.current.length > 0 || Boolean(getSketchBounds(sketchRef.current).width);
    if (!hasContent) return;
    if (historyRef.current.cursor > 5 && !window.confirm('Clear the entire canvas? You can still undo this action.')) return;
    revisionRef.current += 1;
    clearTimeout(timerRef.current);
    syncScene([]);
    chooseObject(null);
    sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
    sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
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
    const bounds = getSketchBounds(sketchRef.current);
    if (!bounds.width) {
      setMessage('Draw a sketch first, then add an illustration.');
      return;
    }
    try {
      const revision = ++revisionRef.current;
      const objectColor = defaultSceneObjectColor(variant, color);
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
      clearTimeout(timerRef.current);
      sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
      sketchSnapshotRef.current = sketchRef.current.getContext('2d').getImageData(0, 0, W, H);
      setRecognition(IDLE);
      setHasInk(false);
      setMessage(`Added a clean ${displayName(label)} object. Select it to move, resize, rotate or recolor it.`);
      pushHistory();
    } catch (error) {
      console.error('Artwork insertion failed:', error);
      setMessage('Could not add that illustration. Please try again.');
    }
  };

  const duplicateSelected = () => {
    const id = selectedObjectIdRef.current;
    if (!id) return;
    const result = duplicateSceneObject(sceneObjectsRef.current, id);
    if (!result.duplicate) return;
    syncScene(result.objects);
    chooseObject(result.duplicate.id);
    pushHistory();
  };

  const reorderSelected = (direction) => {
    const id = selectedObjectIdRef.current;
    if (!id) return;
    const next = shiftSceneObject(sceneObjectsRef.current, id, direction);
    if (next === sceneObjectsRef.current) return;
    syncScene(next);
    pushHistory();
  };

  const flipSelected = () => {
    const id = selectedObjectIdRef.current;
    if (!id) return;
    const next = updateSceneObject(sceneObjectsRef.current, id, (object) => ({ flipX: !object.flipX }));
    syncScene(next);
    // Redraw synchronously from the new scene snapshot so a flipped image is
    // visible immediately; the scene effect will then deterministically render it again.
    renderScene(next, canvasRef.current, imageCacheRef.current);
    pushHistory();
  };

  const recolorSelected = async (nextColor) => {
    const id = selectedObjectIdRef.current;
    const object = sceneObjectsRef.current.find((candidate) => candidate.id === id);
    if (!object || object.color === nextColor) return;
    try {
      await imageCacheRef.current.ensure(object.artwork, nextColor);
      if (selectedObjectIdRef.current !== id) return;
      syncScene(updateSceneObject(sceneObjectsRef.current, id, { color: nextColor }));
      pushHistory();
    } catch (error) {
      console.error('Could not recolor artwork:', error);
      setMessage('Could not change that object’s color. Please try again.');
    }
  };

  const changeBrushColor = (nextColor) => {
    setColor(nextColor);
    if (tool === 'select' && selectedObjectIdRef.current) recolorSelected(nextColor);
  };

  const selectedObject = sceneObjects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedIndex = selectedObject ? sceneObjects.findIndex((object) => object.id === selectedObject.id) : -1;
  const selectionCorners = selectedObject ? getTransformedCorners(selectedObject) : [];
  const rotationHandle = selectedObject ? getRotationHandle(selectedObject) : null;
  const rotationStem = selectedObject ? objectLocalToWorld(selectedObject, { x: 0, y: -selectedObject.height / 2 }) : null;
  const predictions = recognition.predictions;
  const emptyState = status === 'loading' ? { title: 'Getting things ready', copy: 'Preparing the drawing categories…' }
    : status === 'error' ? { title: 'AI is taking a break', copy: 'The model could not load. You can still draw and edit objects.' }
    : recognition.status === 'tiny' ? { title: 'Keep going', copy: 'The AI needs a little more drawing before it can guess.' }
    : recognition.status === 'error' ? { title: 'That one confused the AI', copy: 'Something went wrong reading the sketch. Keep drawing and it will try again.' }
    : { title: 'Waiting for your sketch', copy: 'Start drawing to see AI predictions.' };
  // Top 10 model probabilities. Cards are shown for every guess; those without an
  // honest icon render as typographic cards instead of a misleading picture.
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

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" aria-label="SketchAI home"><span className="brand-icon"><Sparkles size={18}/></span><span>Sketch<span className="brand-ai">AI</span><small>DRAWING STUDIO</small></span></a>
      <div className="header-right"><span className={`model-status ${status}`}><i/> {statusText}</span><button className="help-link" onClick={() => setShowHelp(true)}><CircleHelp size={17}/> How it works</button></div>
    </header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR CREATIVE SPACE <span className="eyebrow-line"/></div><h1>Big ideas start <em>small.</em></h1><p>Draw something, and let a little AI magic bring it to life.</p></div><div className="intro-note"><Sparkles size={16}/><span>MADE FOR<br/><strong>CURIOUS MINDS</strong></span></div></section>
      <div className="workspace-heading"><div><span className="section-number">01 /</span><h2>Your canvas</h2><span className="heading-sub">A space to make your mark.</span></div><div className="workspace-actions"><button className="text-button" onClick={clear}><Trash2 size={16}/> Clear canvas</button></div></div>
      <div className="workspace">
        <div className="editor">
          <div className="editor-top"><div className="file-name"><span className="file-dot"/> Untitled sketch <span className="file-label">/ EDITING</span></div><div className="editor-top-right"><span><LockKeyhole size={13}/> PRIVATE BY DESIGN</span><span className="canvas-dim">1200 × 720</span></div></div>
          <SuggestionBar cards={cards} onInsert={insert} emptyCopy={barEmptyCopy} phase={status === 'loading' ? 'loading' : 'idle'}/>
          <div className="drawing-area">
            <div className="tool-rail" aria-label="Drawing and object tools">
              <span className="rail-label">TOOLS</span>
              <button className={`rail-button ${tool === 'select' ? 'selected' : ''}`} onClick={() => setTool('select')} aria-pressed={tool === 'select'} aria-label="Select tool" title="Select and edit objects"><MousePointer2 size={19}/></button>
              <button className={`rail-button ${tool === 'pencil' ? 'selected' : ''}`} onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Pencil" title="Draw a rough sketch"><Pencil size={19}/></button>
              <button className={`rail-button ${tool === 'eraser' ? 'selected' : ''}`} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Eraser" title="Erase sketch marks or remove an object"><Eraser size={19}/></button>
              <div className="rail-divider"/>
              <button className="rail-button" disabled={!canUndo} onClick={() => restore(-1)} aria-label="Undo" title="Undo (Ctrl or Cmd + Z)"><RotateCcw size={19}/></button>
              <button className="rail-button flip" disabled={!canRedo} onClick={() => restore(1)} aria-label="Redo" title="Redo (Ctrl or Cmd + Shift + Z)"><RotateCcw size={19}/></button>
              <div className="rail-spacer"/><span className="rail-label bottom-label">SKETCH<br/>AWAY</span>
            </div>
            <div className={`canvas-wrap tool-${tool}`} ref={canvasWrapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
              <canvas ref={canvasRef} className="art-canvas" width={W} height={H} aria-label="Drawing canvas. Select objects, or use the pencil or eraser tools." data-scene-object-count={sceneObjects.length} data-selected-object-id={selectedObjectId ?? ''}/>
              <canvas ref={sketchRef} className="sketch-overlay" width={W} height={H} aria-hidden="true"/>
              {tool === 'select' && selectedObject && <svg className="selection-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`Selected ${displayName(selectedObject.label)}`} data-selected-object-id={selectedObject.id} data-object-x={selectedObject.x} data-object-y={selectedObject.y} data-object-width={selectedObject.width} data-object-height={selectedObject.height} data-object-rotation={selectedObject.rotation} data-object-flip-x={selectedObject.flipX}>
                <polygon className="selection-box" points={selectionCorners.map(({ x, y }) => `${x},${y}`).join(' ')}/>
                <line className="rotation-stem" x1={rotationStem.x} y1={rotationStem.y} x2={rotationHandle.x} y2={rotationHandle.y}/>
                <circle className="rotation-hit-area" cx={rotationHandle.x} cy={rotationHandle.y} r="18" data-transform-handle="rotate" aria-label="Rotate selected object" role="button" tabIndex="0"/>
                <circle className="rotation-handle" cx={rotationHandle.x} cy={rotationHandle.y} r="6" aria-hidden="true"/>
                {selectionCorners.map((corner) => <g key={`${corner.signX}:${corner.signY}`} className="resize-hit-area" data-transform-handle="resize" data-sign-x={corner.signX} data-sign-y={corner.signY} aria-label="Resize selected object" role="button" tabIndex="0">
                  <circle cx={corner.x} cy={corner.y} r="16"/>
                  <circle className="resize-handle" cx={corner.x} cy={corner.y} r="6"/>
                </g>)}
              </svg>}
              {sceneObjects.length === 0 && !hasInk && <div className="canvas-hint"><div className="hint-icon"><Pencil size={20}/></div><strong>Your next idea starts here</strong><span>Pick a tool and start drawing</span></div>}
              <div className="canvas-corner">✳ &nbsp; MAKE SOMETHING WONDERFUL</div>
            </div>
          </div>
          {selectedObject && <div className="object-toolbar" aria-label="Selected object editor">
            <div className="object-toolbar-title"><span className="control-label">EDITING</span><strong>{displayName(selectedObject.label)}</strong><span className="object-position">Object {selectedIndex + 1} of {sceneObjects.length}</span></div>
            <div className="object-toolbar-actions">
              <div className="object-colors" role="group" aria-label="Recolor selected object">{colors.map((swatch) => <button key={swatch} className={`color-swatch ${selectedObject.color === swatch ? 'active' : ''}`} style={{'--swatch':swatch}} onClick={() => recolorSelected(swatch)} aria-pressed={selectedObject.color === swatch} aria-label={`Recolor selected object ${swatch}`} title={`Recolor ${swatch}`}>{selectedObject.color === swatch && <Check size={12}/>}</button>)}</div>
              <span className="object-toolbar-divider"/>
              <button className="object-action" onClick={duplicateSelected} aria-label="Duplicate selected object" title="Duplicate"><Copy size={15}/> Duplicate</button>
              <button className="object-action" onClick={() => reorderSelected(1)} disabled={selectedIndex >= sceneObjects.length - 1} aria-label="Bring selected object forward" title="Bring forward one step"><ArrowUp size={15}/> Forward</button>
              <button className="object-action" onClick={() => reorderSelected(-1)} disabled={selectedIndex <= 0} aria-label="Send selected object backward" title="Send backward one step"><ArrowDown size={15}/> Back</button>
              <button className="object-action" onClick={flipSelected} aria-label="Flip selected object horizontally" title="Flip horizontally"><FlipHorizontal2 size={15}/> Flip</button>
              <button className="object-action danger" onClick={deleteSelected} aria-label="Delete selected object" title="Delete"><Trash2 size={15}/> Delete</button>
            </div>
            <span className="object-edit-hint">Drag the object to move · corners resize · upper handle rotates</span>
          </div>}
          <div className="editor-bottom"><div className="palette"><span className="control-label">BRUSH</span>{colors.map((swatch) => <button key={swatch} className={`color-swatch ${color === swatch ? 'active' : ''}`} style={{'--swatch':swatch}} onClick={() => changeBrushColor(swatch)} aria-pressed={color === swatch} aria-label={`Brush color ${swatch}`} title={swatch}>{color === swatch && <Check size={12}/>}</button>)}</div><div className="brush-control"><span className="control-label">SIZE</span><div className="size-dot"/><input aria-label="Brush size" type="range" min="3" max="24" value={size} onChange={(event) => setSize(Number(event.target.value))}/><div className="size-dot big"/><span className="size-value">{size}px</span></div><div className="bottom-tip"><MousePointer2 size={14}/>{tool === 'select' ? 'Edit objects' : tool === 'eraser' ? 'Erase sketch or object' : 'Draw freely'}</div></div>
        </div>
        <aside className="insight-panel"><div className="panel-kicker"><span>YOUR CREATIVE COMPANION</span><Sparkles size={15}/></div><div className="panel-title-icon"><Sparkles size={19}/></div><h2>A little help<br/><em>from AI.</em></h2><p className="panel-intro">Every great drawing starts somewhere. Sketch an object and see what AI sees.</p><div className="panel-divider"/><div className="prediction-heading"><div><span className="section-number">02 /</span><h3>AI predictions</h3></div><span className="live-tag"><i/> LIVE</span></div><p className="prediction-caption">A peek inside the model’s mind.</p>
          {status === 'ready' && modelTier === 'basic' && <p className="model-note" title={fallbackReason ? `Reason: ${fallbackReason}` : undefined}><Info size={12}/> Extended AI unavailable — using 100-object model</p>}
          {recognition.status === 'ok' ? <div aria-live="polite"><p className="prediction-verdict">{lowConfidence ? 'AI isn’t completely sure. Maybe:' : 'AI thinks you might be drawing…'}</p><div className="primary-guess"><span className="primary-name">{suggestions[0].name}</span><span className="primary-score">{Math.round(suggestions[0].score * 100)}%</span></div><div className="progress primary"><span style={{width:`${suggestions[0].score * 100}%`}}/></div>{others.length > 0 && <div className="other-guesses"><span className="other-label">Other guesses</span><div className="other-chips">{others.map((prediction) => <button key={prediction.label} className="other-chip" onClick={() => insert(prediction.label)} title={`Insert ${displayName(prediction.label)}`}>{displayName(prediction.label)} <em>{formatScore(prediction.score)}</em></button>)}</div></div>}<p className="prediction-footnote">Top {shownClasses} guesses from the model. Confidence is an estimate, not a promise.</p></div> : <div className="empty-predictions" aria-live="polite"><div className="empty-sparkle"><Sparkles size={20}/></div><strong>{emptyState.title}</strong><span>{emptyState.copy}</span></div>}
          {DEBUG_AI && recognition.debug && <DebugPanel sketch={sketchRef.current} debug={recognition.debug} open={showDebug} onToggle={() => setShowDebug(!showDebug)} backend={backend} predictions={predictions} profile={modelRef.current?.profile}/>}
          <div className="panel-bottom"><Info size={15}/><span>Confidence is the model’s estimate, not a guarantee. The more you draw, the more it can see.</span></div>
        </aside>
      </div>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="page-bottom"><span><span className="tiny-star">✳</span> Made for the joy of creating.</span><span>SKETCHAI — AI DRAWING RECOGNITION PROJECT</span></div>
    </main>
    {showHelp && <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close"><X size={20}/></button><div className="panel-title-icon"><Sparkles size={20}/></div><span className="section-number">THE LITTLE DETAILS</span><h2 id="help-title">How it works<span>.</span></h2><p>From a few lines to a little inspiration, in five simple steps.</p><ol><li>You sketch an object on the temporary drawing layer.</li><li>SketchAI crops, centers and resizes the sketch into a 28 × 28 image, matching the way its training data was drawn.</li><li>A neural network looks for patterns in the pixels.</li><li>A Quick, Draw! classifier trained for this project looks at the pixels and predicts the most likely objects with confidence scores. It knows {classCount || 345} categories, so unusual objects may be guessed as something similar.</li><li>Choose an illustration to add an editable object. Select it to move, resize, rotate, recolor, duplicate, flip, reorder or delete it.</li></ol><div className="privacy-note"><LockKeyhole size={17}/> Recognition runs locally in your browser. Your rough sketch stays separate from clean objects.</div><button className="primary-button modal-done" onClick={() => setShowHelp(false)}>Got it <ArrowRight size={16}/></button></section></div>}
  </div>;
}

export default App;
