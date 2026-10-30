import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Brush, Check, ChevronDown, CircleHelp, Eraser, Info, LockKeyhole, MousePointer2, Pencil, RotateCcw, Square, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { loadModel, predict } from './ai/model';
import { getSketchBounds } from './ai/preprocess';
import SuggestionBar from './components/SuggestionBar';
import { displayName, getArtworkVariants, variantToSvgString } from './data/artwork';
import { buildSuggestions } from './lib/suggestions';
import { compositeLayers, releaseUrl, saveCanvasAsPng, EXPORT_FILENAME } from './lib/download';
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
  const canvasRef = useRef(null), sketchRef = useRef(null), modelRef = useRef(null), timerRef = useRef(null), pointerRef = useRef(null);
  const historyRef = useRef([]), historyIndex = useRef(-1), revisionRef = useRef(0);
  const [tool, setTool] = useState('pencil'), [color, setColor] = useState(colors[0]), [size, setSize] = useState(7);
  const [status, setStatus] = useState('loading'), [recognition, setRecognition] = useState(IDLE), [hasInk, setHasInk] = useState(false);
  const [canUndo, setCanUndo] = useState(false), [canRedo, setCanRedo] = useState(false), [showHelp, setShowHelp] = useState(false), [message, setMessage] = useState('');
  const [showDebug, setShowDebug] = useState(DEBUG_AI), [backend, setBackend] = useState(''), [classCount, setClassCount] = useState(0);
  const [modelTier, setModelTier] = useState(''), [fallbackReason, setFallbackReason] = useState(null);
  const [transparentExport, setTransparentExport] = useState(false);
  const [saveLink, setSaveLink] = useState(null);
  const [exporting, setExporting] = useState(false);

  const updateHistoryButtons = () => { setCanUndo(historyIndex.current > 0); setCanRedo(historyIndex.current < historyRef.current.length - 1); };
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current, sketch = sketchRef.current;
    if (!canvas || !sketch) return;
    try {
      const entry = { art: canvas.getContext('2d').getImageData(0, 0, W, H), sketch: sketch.getContext('2d').getImageData(0, 0, W, H) };
      historyRef.current = historyRef.current.slice(0, historyIndex.current + 1);
      historyRef.current.push(entry);
      if (historyRef.current.length > 12) historyRef.current.shift();
      historyIndex.current = historyRef.current.length - 1;
      updateHistoryButtons();
    } catch (error) {
      console.error('Could not store this step in the undo history:', error);
    }
  }, []);
  const schedulePrediction = useCallback(() => {
    clearTimeout(timerRef.current);
    const sketch = sketchRef.current;
    if (!sketch) return;
    // Debounced: one inference ~600 ms after the user stops drawing, never on
    // every pointer move. Starting a new stroke cancels a pending prediction.
    timerRef.current = setTimeout(() => {
      const loaded = modelRef.current;
      if (!loaded) return;
      try {
        const result = predict(loaded.model, loaded.labels, sketch, { profile: loaded.profile });
        if (result.status === 'error') throw result.error ?? new Error('Inference failed');
        setHasInk(Boolean(result.debug?.bounds));
        setRecognition(result);
      } catch (error) {
        // A failed read (blocked pixel buffer, WebGL context loss, unexpected
        // input) must never take the drawing app down with it.
        console.error('Prediction failed:', error);
        setRecognition({ status: 'error', predictions: [] });
        setMessage('The AI could not read that sketch. Keep drawing and it will try again.');
      }
    }, 600);
  }, []);
  useEffect(() => {
    const sketch = document.createElement('canvas'); sketch.width = W; sketch.height = H; sketchRef.current = sketch;
    saveHistory();
    let active = true;
    loadModel({ onBackend: setBackend, onProfile: (info) => { if (info.tier) setModelTier(info.tier); if (info.fallbackReason !== undefined) setFallbackReason(info.fallbackReason); } }).then((loaded) => { if (!active) { loaded.model.dispose(); return; } modelRef.current = loaded; setClassCount(loaded.labels.length); setModelTier(loaded.tier); setFallbackReason(loaded.fallbackReason); setStatus('ready'); schedulePrediction(); }).catch((error) => { console.error('Model load failed:', error); if (!active) return; setStatus('error'); setMessage('The recognition model could not be loaded. Drawing and downloading still work.'); });
    return () => { active = false; clearTimeout(timerRef.current); modelRef.current?.model.dispose(); };
  }, [saveHistory, schedulePrediction]);

  const restore = useCallback((offset) => {
    const next = historyIndex.current + offset;
    if (next < 0 || next >= historyRef.current.length) return;
    clearTimeout(timerRef.current); pointerRef.current = null; revisionRef.current++;
    historyIndex.current = next;
    const entry = historyRef.current[next];
    canvasRef.current.getContext('2d').putImageData(entry.art, 0, 0);
    sketchRef.current.getContext('2d').putImageData(entry.sketch, 0, 0);
    setRecognition(IDLE); setMessage(''); updateHistoryButtons(); schedulePrediction();
  }, [schedulePrediction]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') setShowHelp(false);
      if (!(event.ctrlKey || event.metaKey) || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); restore(event.shiftKey ? 1 : -1); }
      else if (event.key.toLowerCase() === 'y') { event.preventDefault(); restore(1); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [restore]);

  const point = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  const drawSegment = (from, to) => {
    [canvasRef.current, sketchRef.current].forEach((canvas) => {
      const ctx = canvas.getContext('2d'); ctx.save();
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = canvas === sketchRef.current ? '#000' : color;
      ctx.lineWidth = tool === 'eraser' ? size * 3 : size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x + 0.01, to.y + 0.01); ctx.stroke(); ctx.restore();
    });
  };
  const onPointerDown = (e) => {
    if (pointerRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); revisionRef.current++; clearTimeout(timerRef.current); setMessage('');
    const p = point(e); pointerRef.current = { id: e.pointerId, p }; e.currentTarget.setPointerCapture(e.pointerId); drawSegment(p, p);
  };
  const onPointerMove = (e) => {
    if (!pointerRef.current || pointerRef.current.id !== e.pointerId) return;
    const p = point(e); drawSegment(pointerRef.current.p, p); pointerRef.current.p = p;
  };
  const onPointerEnd = (e) => {
    if (!pointerRef.current || pointerRef.current.id !== e.pointerId) return;
    pointerRef.current = null; saveHistory(); schedulePrediction();
  };
  const clear = () => {
    if (historyIndex.current > 5 && !window.confirm('Clear your entire canvas? You can still undo this action.')) return;
    revisionRef.current++; clearTimeout(timerRef.current); canvasRef.current.getContext('2d').clearRect(0, 0, W, H); sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
    setRecognition(IDLE); setHasInk(false); setMessage(''); saveHistory();
  };
  // Clicking a suggestion swaps the rough strokes for clean artwork in place:
  // the drawing lands where the sketch was, at roughly the sketch's size, so the
  // composition survives the swap. A tiny scribble still becomes a clearly
  // visible drawing rather than a speck. Undo restores the original strokes.
  //
  // Accepts either a suggestion card or a bare label.
  const insert = async (target) => {
    const label = typeof target === 'string' ? target : target.label;
    const variant = typeof target === 'string'
      ? getArtworkVariants(label)[0] ?? null
      : target.variant ?? null;
    const svg = variantToSvgString(variant, { size: 320, color });
    if (!svg) { setMessage('That guess has no illustration yet — try another suggestion.'); return; }
    const bounds = getSketchBounds(sketchRef.current);
    if (!bounds.width) { setMessage('Draw a sketch first, then add an illustration.'); return; }
    try {
      const revision = ++revisionRef.current;
      const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      if (revision !== revisionRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      const dimension = Math.min(320, Math.max(140, Math.max(bounds.width, bounds.height)));
      const x = Math.max(8, Math.min(W - dimension - 8, bounds.x + bounds.width / 2 - dimension / 2));
      const y = Math.max(8, Math.min(H - dimension - 8, bounds.y + bounds.height / 2 - dimension / 2));
      // sketchRef holds a faithful copy of just the rough strokes, so using it
      // as an erasing mask removes exactly those strokes and never any artwork
      // already placed on the canvas.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(sketchRef.current, 0, 0);
      ctx.restore();
      ctx.drawImage(image, x, y, dimension, dimension);
      sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
      clearTimeout(timerRef.current); setRecognition(IDLE); setHasInk(false);
      setMessage(`Swapped your sketch for a clean ${displayName(label)}. Keep drawing to add another.`);
      saveHistory();
    } catch (error) { console.error('Artwork insertion failed:', error); setMessage('Could not add that illustration. Please try again.'); }
  };
  const download = async () => {
    if (exporting) return;
    setExporting(true);
    setSaveLink(null);
    try {
      // Composite every visible layer (user strokes + inserted illustrations) and
      // never the temporary recognition overlay.
      const out = compositeLayers({
        width: W,
        height: H,
        layers: [canvasRef.current],
        opaque: !transparentExport,
      });
      const saved = await saveCanvasAsPng(out, { filename: EXPORT_FILENAME });
      setSaveLink({ url: saved.url, filename: saved.filename, mime: 'image/png' });
      setMessage(`Saved ${saved.filename} (${W} × ${H} PNG).`);
    } catch (error) {
      console.error('PNG export failed:', error);
      setMessage('The PNG could not be created. Please try again, or use a different browser.');
    } finally {
      setExporting(false);
    }
  };
  const predictions = recognition.predictions;
  const emptyState = status === 'loading' ? { title: 'Getting things ready', copy: 'Preparing the drawing categories…' }
    : status === 'error' ? { title: 'AI is taking a break', copy: 'The model could not load. You can still draw and download.' }
    : recognition.status === 'tiny' ? { title: 'Keep going', copy: 'The AI needs a little more drawing before it can guess.' }
    : recognition.status === 'error' ? { title: 'That one confused the AI', copy: 'Something went wrong reading the sketch. Keep drawing and it will try again.' }
    : { title: 'Waiting for your sketch', copy: 'Start drawing to see AI predictions.' };
  // Top 10 model probabilities. Cards are shown for every guess; those without an
  // honest icon render as typographic cards instead of a misleading picture.
  const suggestions = predictions
    .filter((p, i) => i === 0 || p.score >= 0.0005) // drop never-meaningful <0.05% tail
    .slice(0, 10)
    .map((p) => ({ ...p, name: displayName(p.label), illustrated: getArtworkVariants(p.label).length > 0 }));
  // The bar shows clean artwork, not a ranked list: one option per predicted
  // class first, then alternative renderings, so the intended object stays
  // findable even when top-1 is wrong.
  const cards = buildSuggestions(predictions);
  // How many different objects the bar is actually offering — the count the
  // footnote quotes, so it can never contradict what is on screen.
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
    <header className="topbar"><a className="brand" href="#" aria-label="SketchAI home"><span className="brand-icon"><Sparkles size={18}/></span><span>Sketch<span className="brand-ai">AI</span><small>DRAWING STUDIO</small></span></a><div className="header-right"><span className={`model-status ${status}`}><i/> {statusText}</span><button className="help-link" onClick={() => setShowHelp(true)}><CircleHelp size={17}/> How it works</button></div></header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR CREATIVE SPACE <span className="eyebrow-line"/></div><h1>Big ideas start <em>small.</em></h1><p>Draw something, and let a little AI magic bring it to life.</p></div><div className="intro-note"><Sparkles size={16}/><span>MADE FOR<br/><strong>CURIOUS MINDS</strong></span></div></section>
      <div className="workspace-heading"><div><span className="section-number">01 /</span><h2>Your canvas</h2><span className="heading-sub">A space to make your mark.</span></div><div className="workspace-actions"><button className="text-button" onClick={clear}><Trash2 size={16}/> Clear canvas</button><button className={`text-button export-option ${transparentExport ? 'on' : ''}`} onClick={() => setTransparentExport(!transparentExport)} aria-pressed={transparentExport} title="Export without the white background"><Square size={14}/> Transparent</button><button className="download-button" onClick={download} disabled={exporting}><ArrowDownToLine size={16}/> {exporting ? 'Saving…' : 'Download'} <span>{transparentExport ? 'PNG · transparent' : 'PNG'}</span></button></div></div>
      <div className="workspace">
        <div className="editor">
          <div className="editor-top"><div className="file-name"><span className="file-dot"/> Untitled sketch <span className="file-label">/ EDITING</span></div><div className="editor-top-right"><span><LockKeyhole size={13}/> PRIVATE BY DESIGN</span><span className="canvas-dim">1200 × 720</span></div></div>
            <SuggestionBar
              cards={cards}
              onInsert={insert}
              emptyCopy={barEmptyCopy}
              phase={status === 'loading' ? 'loading' : 'idle'}
            />
            <div className="drawing-area">
            <div className="tool-rail" aria-label="Drawing tools"><span className="rail-label">TOOLS</span><button className={`rail-button ${tool === 'pencil' ? 'selected' : ''}`} onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Pencil" title="Pencil"><Pencil size={19}/></button><button className={`rail-button ${tool === 'eraser' ? 'selected' : ''}`} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Eraser" title="Eraser"><Eraser size={19}/></button><div className="rail-divider"/><button className="rail-button" disabled={!canUndo} onClick={() => restore(-1)} aria-label="Undo" title="Undo (Ctrl or Cmd + Z)"><RotateCcw size={19}/></button><button className="rail-button flip" disabled={!canRedo} onClick={() => restore(1)} aria-label="Redo" title="Redo (Ctrl or Cmd + Shift + Z)"><RotateCcw size={19}/></button><div className="rail-spacer"/><span className="rail-label bottom-label">SKETCH<br/>AWAY</span></div>
            <div className="canvas-wrap"><canvas ref={canvasRef} width={W} height={H} aria-label="Drawing canvas. Use a pointer or touch to draw." onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}/>{!hasInk && !canUndo && <div className="canvas-hint"><div className="hint-icon"><Pencil size={20}/></div><strong>Your next idea starts here</strong><span>Pick a tool and start drawing</span></div>}<div className="canvas-corner">✳ &nbsp; MAKE SOMETHING WONDERFUL</div></div>
          </div>
          <div className="editor-bottom"><div className="palette"><span className="control-label">COLOR</span>{colors.map(c => <button key={c} className={`color-swatch ${color === c ? 'active' : ''}`} style={{'--swatch':c}} onClick={() => setColor(c)} aria-pressed={color === c} aria-label={`Brush color ${c}`} title={c}>{color === c && <Check size={12}/>}</button>)}</div><div className="brush-control"><span className="control-label">SIZE</span><div className="size-dot"/><input aria-label="Brush size" type="range" min="3" max="24" value={size} onChange={e => setSize(Number(e.target.value))}/><div className="size-dot big"/><span className="size-value">{size}px</span></div><div className="bottom-tip"><MousePointer2 size={14}/> Draw freely</div></div>
        </div>
        <aside className="insight-panel"><div className="panel-kicker"><span>YOUR CREATIVE COMPANION</span><Sparkles size={15}/></div><div className="panel-title-icon"><Sparkles size={19}/></div><h2>A little help<br/><em>from AI.</em></h2><p className="panel-intro">Every great drawing starts somewhere. Sketch an object and see what AI sees.</p><div className="panel-divider"/><div className="prediction-heading"><div><span className="section-number">02 /</span><h3>AI predictions</h3></div><span className="live-tag"><i/> LIVE</span></div><p className="prediction-caption">A peek inside the model’s mind.</p>
          {status === 'ready' && modelTier === 'basic' && <p className="model-note" title={fallbackReason ? `Reason: ${fallbackReason}` : undefined}><Info size={12}/> Extended AI unavailable — using 100-object model</p>}
          {recognition.status === 'ok' ? <div aria-live="polite">
            <p className="prediction-verdict">{lowConfidence ? 'AI isn’t completely sure. Maybe:' : 'AI thinks you might be drawing…'}</p>
            <div className="primary-guess"><span className="primary-name">{suggestions[0].name}</span><span className="primary-score">{Math.round(suggestions[0].score * 100)}%</span></div>
            <div className="progress primary"><span style={{width:`${suggestions[0].score * 100}%`}}/></div>
            {others.length > 0 && <div className="other-guesses"><span className="other-label">Other guesses</span><div className="other-chips">{others.map((p) => <button key={p.label} className="other-chip" onClick={() => insert(p.label)} title={`Insert ${displayName(p.label)}`}>{displayName(p.label)} <em>{formatScore(p.score)}</em></button>)}</div></div>}
            <p className="prediction-footnote">Top {shownClasses} guesses from the model. Confidence is an estimate, not a promise.</p>
          </div> : <div className="empty-predictions" aria-live="polite"><div className="empty-sparkle"><Sparkles size={20}/></div><strong>{emptyState.title}</strong><span>{emptyState.copy}</span></div>}
          {DEBUG_AI && recognition.debug && <DebugPanel sketch={sketchRef.current} debug={recognition.debug} open={showDebug} onToggle={() => setShowDebug(!showDebug)} backend={backend} predictions={predictions} profile={modelRef.current?.profile}/>}
          <div className="panel-bottom"><Info size={15}/><span>Confidence is the model’s estimate, not a guarantee. The more you draw, the more it can see.</span></div>
        </aside>
      </div>

      {message && <div className="notice" role="status">{message}{saveLink && <> <a className="notice-link" href={saveLink.url} download={saveLink.filename} onClick={() => setTimeout(() => releaseUrl(saveLink.url), 30000)}>Save the PNG again</a> if your browser blocked the download.</>}</div>}
      <div className="page-bottom"><span><span className="tiny-star">✳</span> Made for the joy of creating.</span><span>SKETCHAI — AI DRAWING RECOGNITION PROJECT</span></div>
    </main>
    {showHelp && <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close"><X size={20}/></button><div className="panel-title-icon"><Sparkles size={20}/></div><span className="section-number">THE LITTLE DETAILS</span><h2 id="help-title">How it works<span>.</span></h2><p>From a few lines to a little inspiration, in five simple steps.</p><ol><li>You draw an object on the canvas.</li><li>SketchAI crops, centers and resizes the sketch into a 28 × 28 image, matching the way its training data was drawn.</li><li>A neural network looks for patterns in the pixels.</li><li>A Quick, Draw! classifier trained for this project looks at the pixels and predicts the most likely objects with confidence scores. It knows {classCount || 345} categories, so unusual objects may be guessed as something similar.</li><li>Pick an available illustration to add it next to your sketch, then keep creating.</li></ol><div className="privacy-note"><LockKeyhole size={17}/> Recognition runs locally in your browser. Your drawing isn't uploaded.</div><button className="download-button modal-done" onClick={() => setShowHelp(false)}>Got it <ArrowRight size={16}/></button></section></div>}
  </div>;
}
export default App;
