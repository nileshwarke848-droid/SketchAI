import React, { useEffect, useRef } from 'react';
import { Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { INPUT_SIZE } from '../ai/preprocess';

// Developer-only inspection of the exact image handed to the network:
// original canvas -> cropped+centred region -> 28x28 model input.
// Enabled in development builds, or on a deployed build with ?debug=ai.
export default function DebugPanel({ sketch, debug, open, onToggle, backend, predictions = [] }) {
  const originalRef = useRef(null), cropRef = useRef(null), inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const original = originalRef.current, crop = cropRef.current;
    if (original && sketch) {
      const ctx = original.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, original.width, original.height);
      ctx.drawImage(sketch, 0, 0, original.width, original.height);
    }
    if (crop && sketch && debug?.square) {
      const ctx = crop.getContext('2d');
      const { x, y, side } = debug.square;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, crop.width, crop.height);
      ctx.drawImage(sketch, x, y, side, side, 0, 0, crop.width, crop.height);
    }
    if (inputRef.current && debug?.ok) {
      const canvas = inputRef.current;
      const ctx = canvas.getContext('2d');
      const image = ctx.createImageData(INPUT_SIZE, INPUT_SIZE);
      for (let i = 0; i < debug.ink.length; i += 1) {
        const value = Math.round(debug.ink[i] * 255);
        image.data[i * 4] = value;
        image.data[i * 4 + 1] = value;
        image.data[i * 4 + 2] = value;
        image.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    }
  }, [sketch, debug, open]);

  const stats = debug?.diagnostics;
  return <section className="debug-panel">
    <button className="debug-toggle" onClick={onToggle} aria-expanded={open}>
      <Bug size={13}/> Preprocessing inspector {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
    </button>
    {open && <div className="debug-body">
      {!debug ? <p className="debug-note">Draw something to inspect the pipeline.</p>
        : !debug.ok ? <p className="debug-note">{debug.reason === 'tiny' ? 'Sketch is too small for inference — nothing was sent to the model.' : 'Canvas is blank — inference was skipped.'}</p>
        : <>
          <div className="debug-stages">
            <figure><canvas ref={originalRef} width={150} height={90}/><figcaption>1 · Canvas</figcaption></figure>
            <figure><canvas ref={cropRef} width={112} height={112}/><figcaption>2 · Crop + centre</figcaption></figure>
            <figure><canvas ref={inputRef} width={INPUT_SIZE} height={INPUT_SIZE} className="pixel"/><figcaption>3 · Model input 28×28</figcaption></figure>
          </div>
          <dl className="debug-stats">
            <div><dt>Bounds</dt><dd>{Math.round(debug.bounds.width)}×{Math.round(debug.bounds.height)} @ {Math.round(debug.bounds.x)},{Math.round(debug.bounds.y)}</dd></div>
            <div><dt>Crop side</dt><dd>{debug.square.side.toFixed(1)}px (×{debug.padding})</dd></div>
            <div><dt>Ink peak → gamma</dt><dd>{stats.peak.toFixed(2)} → {stats.gamma.toFixed(2)}</dd></div>
            <div><dt>Ink coverage</dt><dd>{(stats.coverage * 100).toFixed(1)}%</dd></div>
            <div><dt>Backend</dt><dd>{backend || '—'}</dd></div>
          </dl>
          {predictions.length > 0 && <p className="debug-note">Output index → label: {predictions.map(p => `${p.index}→${p.label}`).join(' · ')}</p>}
        </>}
    </div>}
  </section>;
}
