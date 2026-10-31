// PNG export.
//
// The drawing lives on two visible layers while the user works: permanent art
// holds accepted illustrations, while a separate overlay holds only the current
// rough sketch. Export composites both without mutating either canvas.
//
// The download click is dispatched synchronously inside the user's button-click
// gesture. Waiting for canvas.toBlob() before clicking an anchor can outlive the
// browser's transient user activation, so the actual save path takes a synchronous
// PNG data URL, converts it to a Blob, and clicks one attached download anchor.

export const EXPORT_FILENAME = 'sketchai-drawing.png';
export const DOWNLOAD_ANCHOR_REMOVE_DELAY_MS = 1000;
const TO_BLOB_FALLBACK_TIMEOUT_MS = 10000;

/** Composites visible layers onto an opaque or transparent canvas. */
export function compositeLayers({ width, height, layers = [], opaque = true }) {
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (opaque) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (const layer of layers) {
    if (!layer) continue; // a detached or not-yet-mounted layer
    ctx.drawImage(layer, 0, 0, width, height);
  }
  return out;
}

/**
 * Async Blob helper for callers that do not need to initiate a download gesture.
 * A null/throwing/unavailable toBlob always falls back to a PNG data URL.
 */
export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;
    const finish = (blob) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) clearTimeout(timeout);
      resolve(blob);
    };
    const fallback = () => {
      if (settled) return;
      try {
        finish(dataUrlToBlob(canvas.toDataURL('image/png')));
      } catch (error) {
        if (settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        reject(error);
      }
    };

    if (typeof canvas.toBlob === 'function') {
      timeout = setTimeout(fallback, TO_BLOB_FALLBACK_TIMEOUT_MS);
      try {
        canvas.toBlob((blob) => {
          if (blob && (!blob.type || blob.type === 'image/png')) finish(blob);
          else fallback();
        }, 'image/png');
        return;
      } catch {
        // Fall through to the synchronous PNG-data-URL path.
      }
    }
    fallback();
  });
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match) throw new TypeError('Canvas did not produce a base64 PNG data URL.');
  const mime = match[1].toLowerCase();
  if (mime !== 'image/png') throw new TypeError(`Expected image/png, got ${mime}.`);
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

function createObjectUrl(blob) {
  if (!blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    const url = URL.createObjectURL(blob);
    return typeof url === 'string' && url.length > 0 ? url : null;
  } catch {
    // Sandboxed/older browsers can expose createObjectURL but reject the call.
    return null;
  }
}

/**
 * Saves a canvas as a PNG while preserving the initiating user activation.
 *
 * This function is intentionally synchronous through anchor.click(). It returns
 * { method, url, filename, size, mime }; the URL remains alive so the UI can
 * expose a manual fallback link if the browser blocks the initial download.
 */
export function saveCanvasAsPng(canvas, { filename = EXPORT_FILENAME } = {}) {
  const dataUrl = canvas.toDataURL('image/png');
  let blob = null;
  try {
    blob = dataUrlToBlob(dataUrl);
  } catch {
    // The data URL itself remains a usable fallback if Blob construction fails.
  }

  const objectUrl = createObjectUrl(blob);
  const url = objectUrl ?? dataUrl;
  const method = objectUrl ? 'blob' : 'data-url';
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  // Keep the anchor attached and rendered (not display:none) for browsers that
  // reject synthetic clicks on detached/hidden elements.
  link.style.position = 'fixed';
  link.style.left = '-10000px';
  link.style.top = '0';
  link.style.width = '1px';
  link.style.height = '1px';
  link.style.opacity = '0';
  link.style.border = '0';
  link.style.padding = '0';

  const parent = document.body ?? document.documentElement;
  if (!parent) {
    if (objectUrl) releaseUrl(objectUrl);
    throw new Error('No document container is available for the PNG download link.');
  }
  parent.appendChild(link);
  let automaticClick = true;
  try {
    // Do this before yielding to a Promise: browsers can block downloads once
    // the transient activation from the user's button click has expired.
    link.click();
  } catch {
    // Keep the URL alive and return it to the UI: even if a browser rejects the
    // synthetic click, the visible manual-save link remains a user-initiated
    // fallback. A silent browser block is covered by the same visible link.
    automaticClick = false;
  }
  setTimeout(() => link.remove(), DOWNLOAD_ANCHOR_REMOVE_DELAY_MS);

  return {
    method,
    url,
    filename,
    size: blob?.size ?? 0,
    mime: 'image/png',
    automaticClick,
  };
}

export function releaseUrl(url) {
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already released or unavailable in this context */
    }
  }
}
