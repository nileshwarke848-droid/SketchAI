// PNG export.
//
// The drawing lives on more than one canvas while the user works: the visible
// art canvas holds strokes plus inserted illustrations, and a separate overlay
// holds the temporary recognition sketch. Export must composite every *visible*
// layer into one fresh canvas and never leak the recognition overlay.
//
// Saving itself is deliberately defensive. `a[download]` is the only way to name
// a file without a server, but it is silently ignored in some embeddings
// (sandboxed iframes without allow-downloads), in old Safari, and when the page
// is opened from a blob: origin. So the export always returns a fallback URL the
// UI can offer as a real link.

export const EXPORT_FILENAME = 'sketchai-drawing.png';

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

/** Promise wrapper with a data-URL fallback for browsers without canvas.toBlob. */
export function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      try {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
        }, 'image/png');
        return;
      } catch {
        /* fall through to the data-URL path */
      }
    }
    resolve(dataUrlToBlob(canvas.toDataURL('image/png')));
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, payload] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/png';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Saves a canvas as a PNG without a server.
 * Returns { method, url, filename } so the caller can offer the URL as a manual
 * save link. `url` is a blob: URL that stays valid (they are revoked by the
 * caller after a while) or a data: URL in the fallback path.
 */
export async function saveCanvasAsPng(canvas, { filename = EXPORT_FILENAME } = {}) {
  const blob = await canvasToBlob(canvas);
  let url;
  let method = 'blob';
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    url = URL.createObjectURL(blob);
  } else {
    url = canvas.toDataURL('image/png');
    method = 'data-url';
  }
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  // Firefox and older Safari ignore clicks on anchors that are not in the
  // document, so attach it first and clean up afterwards.
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  return { method, url, filename, size: blob.size };
}

export function releaseUrl(url) {
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* already released */
    }
  }
}
