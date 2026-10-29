import React, { useCallback, useEffect, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Brush, Check, ChevronDown, CircleHelp, Eraser, Info, LockKeyhole, MousePointer2, Pencil, RotateCcw, Star, Sparkles, Trash2, X, Zap } from 'lucide-react';
import { getInkBounds, loadModel, predict } from './ai/model';
import { artwork } from './data/artwork';

const W = 1200, H = 720;
const colors = ['#242422', '#e26755', '#e9ab45', '#799b79', '#6590bd', '#a282b5'];
const display = (s) => s ? s[0].toUpperCase() + s.slice(1) : '';

function App() {
  const canvasRef = useRef(null), sketchRef = useRef(null), modelRef = useRef(null), timerRef = useRef(null), pointerRef = useRef(null);
  const historyRef = useRef([]), historyIndex = useRef(-1), revisionRef = useRef(0);
  const [tool, setTool] = useState('pencil'), [color, setColor] = useState(colors[0]), [size, setSize] = useState(7);
  const [status, setStatus] = useState('loading'), [predictions, setPredictions] = useState([]), [hasInk, setHasInk] = useState(false);
  const [canUndo, setCanUndo] = useState(false), [canRedo, setCanRedo] = useState(false), [showHelp, setShowHelp] = useState(false), [message, setMessage] = useState('');

  const updateHistoryButtons = () => { setCanUndo(historyIndex.current > 0); setCanRedo(historyIndex.current < historyRef.current.length - 1); };
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current, sketch = sketchRef.current;
    if (!canvas || !sketch) return;
    const entry = { art: canvas.getContext('2d').getImageData(0, 0, W, H), sketch: sketch.getContext('2d').getImageData(0, 0, W, H) };
    historyRef.current = historyRef.current.slice(0, historyIndex.current + 1);
    historyRef.current.push(entry);
    if (historyRef.current.length > 12) historyRef.current.shift();
    historyIndex.current = historyRef.current.length - 1;
    updateHistoryButtons();
  }, []);
  const schedulePrediction = useCallback(() => {
    clearTimeout(timerRef.current);
    const sketch = sketchRef.current;
    if (!sketch) return;
    timerRef.current = setTimeout(() => {
      try {
        if (!getInkBounds(sketch)) { setPredictions([]); setHasInk(false); return; }
        setHasInk(true);
        if (modelRef.current) setPredictions(predict(modelRef.current.model, modelRef.current.labels, sketch));
      } catch (error) { console.error('Prediction failed:', error); setPredictions([]); setMessage('Could not recognize this sketch. Try drawing again.'); }
    }, 600);
  }, []);
  useEffect(() => {
    const sketch = document.createElement('canvas'); sketch.width = W; sketch.height = H; sketchRef.current = sketch;
    saveHistory();
    let active = true;
    loadModel().then((loaded) => { if (!active) { loaded.model.dispose(); return; } modelRef.current = loaded; setStatus('ready'); schedulePrediction(); }).catch((error) => { console.error('Model load failed:', error); if (active) setStatus('error'); });
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
    setPredictions([]); setMessage(''); updateHistoryButtons(); schedulePrediction();
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
    setPredictions([]); setHasInk(false); setMessage(''); saveHistory();
  };
  const insert = async (label, variant) => {
    const Icon = artwork[label]; const bounds = getInkBounds(sketchRef.current);
    if (!Icon || !bounds) { setMessage('No illustration is available for this prediction yet.'); return; }
    try {
      const revision = ++revisionRef.current;
      const svg = renderToStaticMarkup(<Icon xmlns="http://www.w3.org/2000/svg" size={160} color={color} strokeWidth={variant === 1 ? 2.5 : variant === 2 ? 1.2 : 1.8} />);
      const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await image.decode();
      if (revision !== revisionRef.current) return;
      const dimension = Math.min(230, Math.max(110, Math.max(bounds.width, bounds.height)));
      let x = bounds.x + bounds.width + 35; if (x + dimension > W - 20) x = Math.max(20, bounds.x - dimension - 35);
      const y = Math.max(20, Math.min(H - dimension - 20, bounds.y + bounds.height / 2 - dimension / 2));
      canvasRef.current.getContext('2d').drawImage(image, x, y, dimension, dimension);
      sketchRef.current.getContext('2d').clearRect(0, 0, W, H);
      clearTimeout(timerRef.current); setPredictions([]); setHasInk(false); setMessage('Illustration added! Keep drawing to start a new guess.'); saveHistory();
    } catch (error) { console.error('Artwork insertion failed:', error); setMessage('Could not add that illustration. Please try again.'); }
  };
  const download = () => {
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ctx = out.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(canvasRef.current, 0, 0);
    const link = document.createElement('a'); link.download = 'sketchai-drawing.png'; link.href = out.toDataURL('image/png'); link.click();
  };
  const available = predictions.filter(p => artwork[p.label]);
  const suggestions = available.length ? [ ...available.map(p => ({ ...p, variant: 0 })), ...Array.from({ length: Math.max(0, 3 - available.length) }, (_, i) => ({ ...available[0], variant: i + 1 })) ].slice(0, 3) : [];
  const statusText = status === 'loading' ? 'Loading AI model' : status === 'error' ? 'AI unavailable' : 'AI model ready';
  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" aria-label="SketchAI home"><span className="brand-icon"><Sparkles size={18}/></span><span>Sketch<span className="brand-ai">AI</span><small>DRAWING STUDIO</small></span></a><div className="header-right"><span className={`model-status ${status}`}><i/> {statusText}</span><button className="help-link" onClick={() => setShowHelp(true)}><CircleHelp size={17}/> How it works</button></div></header>
    <main>
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR CREATIVE SPACE <span className="eyebrow-line"/></div><h1>Big ideas start <em>small.</em></h1><p>Draw something, and let a little AI magic bring it to life.</p></div><div className="intro-note"><Sparkles size={16}/><span>MADE FOR<br/><strong>CURIOUS MINDS</strong></span></div></section>
      <div className="workspace-heading"><div><span className="section-number">01 /</span><h2>Your canvas</h2><span className="heading-sub">A space to make your mark.</span></div><div className="workspace-actions"><button className="text-button" onClick={clear}><Trash2 size={16}/> Clear canvas</button><button className="download-button" onClick={download}><ArrowDownToLine size={16}/> Download <span>PNG</span></button></div></div>
      <div className="workspace">
        <div className="editor">
          <div className="editor-top"><div className="file-name"><span className="file-dot"/> Untitled sketch <span className="file-label">/ EDITING</span></div><div className="editor-top-right"><span><LockKeyhole size={13}/> PRIVATE BY DESIGN</span><span className="canvas-dim">1200 × 720</span></div></div>
          <div className="drawing-area">
            <div className="tool-rail" aria-label="Drawing tools"><span className="rail-label">TOOLS</span><button className={`rail-button ${tool === 'pencil' ? 'selected' : ''}`} onClick={() => setTool('pencil')} aria-pressed={tool === 'pencil'} aria-label="Pencil" title="Pencil"><Pencil size={19}/></button><button className={`rail-button ${tool === 'eraser' ? 'selected' : ''}`} onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} aria-label="Eraser" title="Eraser"><Eraser size={19}/></button><div className="rail-divider"/><button className="rail-button" disabled={!canUndo} onClick={() => restore(-1)} aria-label="Undo" title="Undo (Ctrl or Cmd + Z)"><RotateCcw size={19}/></button><button className="rail-button flip" disabled={!canRedo} onClick={() => restore(1)} aria-label="Redo" title="Redo (Ctrl or Cmd + Shift + Z)"><RotateCcw size={19}/></button><div className="rail-spacer"/><span className="rail-label bottom-label">SKETCH<br/>AWAY</span></div>
            <div className="canvas-wrap"><canvas ref={canvasRef} width={W} height={H} aria-label="Drawing canvas. Use a pointer or touch to draw." onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}/>{!hasInk && !canUndo && <div className="canvas-hint"><div className="hint-icon"><Pencil size={20}/></div><strong>Your next idea starts here</strong><span>Pick a tool and start drawing</span></div>}<div className="canvas-corner">✳ &nbsp; MAKE SOMETHING WONDERFUL</div></div>
          </div>
          <div className="editor-bottom"><div className="palette"><span className="control-label">COLOR</span>{colors.map(c => <button key={c} className={`color-swatch ${color === c ? 'active' : ''}`} style={{'--swatch':c}} onClick={() => setColor(c)} aria-pressed={color === c} aria-label={`Brush color ${c}`} title={c}>{color === c && <Check size={12}/>}</button>)}</div><div className="brush-control"><span className="control-label">SIZE</span><div className="size-dot"/><input aria-label="Brush size" type="range" min="3" max="24" value={size} onChange={e => setSize(Number(e.target.value))}/><div className="size-dot big"/><span className="size-value">{size}px</span></div><div className="bottom-tip"><MousePointer2 size={14}/> Draw freely</div></div>
        </div>
        <aside className="insight-panel"><div className="panel-kicker"><span>YOUR CREATIVE COMPANION</span><Sparkles size={15}/></div><div className="panel-title-icon"><Sparkles size={19}/></div><h2>A little help<br/><em>from AI.</em></h2><p className="panel-intro">Every great drawing starts somewhere. Sketch an object and see what AI sees.</p><div className="panel-divider"/><div className="prediction-heading"><div><span className="section-number">02 /</span><h3>AI predictions</h3></div><span className="live-tag"><i/> LIVE</span></div><p className="prediction-caption">A peek inside the model's mind.</p>
          {predictions.length ? <div className="prediction-list" aria-live="polite">{predictions.map((p, i) => <div className="prediction-row" key={p.label}><div><span><b className="rank">0{i+1}</b> {display(p.label)}</span><strong>{Math.round(p.score * 100)}%</strong></div><div className="progress"><span style={{width:`${p.score * 100}%`}}/></div></div>)}</div> : <div className="empty-predictions"><div className="empty-sparkle"><Sparkles size={20}/></div><strong>{status === 'loading' ? 'Getting things ready' : status === 'error' ? 'AI is taking a break' : 'Waiting for your sketch'}</strong><span>{status === 'loading' ? 'Loading the recognition model…' : status === 'error' ? 'The model could not load. You can still draw and download.' : 'Start drawing to see predictions appear here.'}</span></div>}
          <div className="panel-bottom"><Info size={15}/><span>Confidence is the model’s estimate, not a guarantee. The more you draw, the more it can see.</span></div>
        </aside>
      </div>
      <section className="suggestions"><div className="suggestion-copy"><span className="section-number">03 /</span><h2>Do you mean<span>?</span></h2><p>Turn your doodle into something delightful.</p></div><div className="suggestion-content">{suggestions.length ? <div className="suggestion-cards">{suggestions.map((s, i) => { const Icon = artwork[s.label]; return <button className="suggestion-card" key={`${s.label}-${i}`} onClick={() => insert(s.label, s.variant)} title={`Add ${s.label} illustration`}><Icon size={35} strokeWidth={s.variant === 1 ? 2.5 : s.variant === 2 ? 1.2 : 1.8}/><span>{display(s.label)}{s.variant ? (s.variant === 1 ? ' · bold' : ' · fine') : ''}</span><span className="add-sign">+</span></button>; })}</div> : <div className="suggestion-empty"><div className="mini-icons"><span><Star size={20}/></span><span><Flower2Placeholder/></span><span><SunPlaceholder/></span></div><div><strong>{predictions.length ? 'No matching illustrations yet' : 'Suggestions will appear here'}</strong><p>{predictions.length ? 'Try a different sketch to see available artwork.' : 'Draw an object above and see what pops up.'}</p></div></div>}<span className="suggestion-note"><Sparkles size={14}/> CLICK TO ADD TO CANVAS</span></div></section>
      {message && <div className="notice" role="status">{message}</div>}
      <div className="page-bottom"><span><span className="tiny-star">✳</span> Made for the joy of creating.</span><span>SKETCHAI — AI DRAWING RECOGNITION PROJECT</span></div>
    </main>
    {showHelp && <div className="modal-backdrop" onMouseDown={() => setShowHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowHelp(false)} aria-label="Close"><X size={20}/></button><div className="panel-title-icon"><Sparkles size={20}/></div><span className="section-number">THE LITTLE DETAILS</span><h2 id="help-title">How it works<span>.</span></h2><p>From a few lines to a little inspiration, in five simple steps.</p><ol><li>You draw an object on the canvas.</li><li>SketchAI crops, centers and resizes the sketch into a 28 × 28 image.</li><li>A neural network looks for patterns in the pixels.</li><li>The model predicts the most likely objects and their confidence scores.</li><li>Pick an available illustration to add it next to your sketch, then keep creating.</li></ol><div className="privacy-note"><LockKeyhole size={17}/> Recognition runs locally in your browser. Your drawing isn't uploaded.</div><button className="download-button modal-done" onClick={() => setShowHelp(false)}>Got it <ArrowRight size={16}/></button></section></div>}
  </div>;
}
function Flower2Placeholder() { return <span className="placeholder-flower">✿</span>; }
function SunPlaceholder() { return <span className="placeholder-sun">☼</span>; }
export default App;
