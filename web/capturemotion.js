/*
 * NightSeam Web - camera motion for the capture's overlay calibration.
 *
 * Runs as a worker. It reads the camera's frames, shrinks each to a 108-pixel
 * wide grey picture in memory, and reports only how far the picture moved
 * since the frame before (sideways and up-down, in those small pixels) with
 * the times. Each frame is closed at once; no picture is kept, stored or sent.
 * capture.js compares the motion with the gyroscope to find how late the
 * camera image is and how wide it is (core matchMotion).
 *
 * The module is imported by capture.js only for its own address (so it is
 * part of the cache-token graph); its work starts only inside a worker.
 */

/** This module's address, cache token included, to start it as a worker. */
export const MOTION_WORKER_URL = import.meta.url;

const W = 108;          // analysis width; the height follows the frame's shape
const MAX_SHIFT = 30;   // pixels between two analysed frames
const MAX_GAP_MS = 1000; // capture timestamps further apart than this are not trusted

/** Normalized cross-correlation of profile b shifted by k against a. */
function score(a, b, k) {
  const n = a.length, lo = Math.max(0, -k), hi = Math.min(n, n - k);
  let ma = 0, mb = 0;
  for (let i = lo; i < hi; i++) { ma += a[i]; mb += b[i + k]; }
  ma /= hi - lo; mb /= hi - lo;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = lo; i < hi; i++) { const x = a[i] - ma, y = b[i + k] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb || 1);
}

/** Milliseconds between two frames for their motion: from the camera's own
 *  capture timestamps (microseconds), since frames reach the worker unevenly
 *  and a short gap in arrival would read as fast motion. Falls back to the
 *  arrival gap where the timestamps give no plausible gap (missing, not
 *  increasing, or a second or more). */
export function captureGap(prevStamp, stamp, arrivedMs) {
  const gap = (stamp - prevStamp) / 1000;
  return Number.isFinite(gap) && gap > 0 && gap < MAX_GAP_MS ? gap : arrivedMs;
}

/** The shift (sub-pixel) that best lines profile b up with a, and how well. */
function shift(a, b) {
  let best = 0, bestScore = -Infinity;
  for (let d = -MAX_SHIFT; d <= MAX_SHIFT; d++) {
    const s = score(a, b, d);
    if (s > bestScore) { bestScore = s; best = d; }
  }
  const l = score(a, b, best - 1), r = score(a, b, best + 1), den = l - 2 * bestScore + r;
  return [den < 0 ? best + 0.5 * (l - r) / den : best, bestScore];
}

async function run(readable) {
  const reader = readable.getReader();
  let ctx = null, h = 0, prevCols = null, prevRows = null, prevAt = 0, prevStamp = NaN;
  for (;;) {
    const { value: frame, done } = await reader.read();
    if (done) return;
    const t = performance.timeOrigin + performance.now();
    const stamp = frame.timestamp;   // capture time, microseconds
    try {
      if (!ctx) {
        h = Math.max(2, Math.round(W * frame.displayHeight / frame.displayWidth));
        ctx = new OffscreenCanvas(W, h).getContext('2d', { willReadFrequently: true });
        postMessage({ size: [frame.displayWidth, frame.displayHeight, W, h] });
      }
      ctx.drawImage(frame, 0, 0, W, h);
    } finally {
      frame.close();
    }
    const px = ctx.getImageData(0, 0, W, h).data;
    const cols = new Float32Array(W), rows = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, g = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        cols[x] += g;
        rows[y] += g;
      }
    }
    if (prevCols) {
      const [dx, sx] = shift(prevCols, cols), [dy, sy] = shift(prevRows, rows);
      // The pair ends when this frame arrived and lasts as long as the camera
      // took between the two captures.
      const prevT = t - captureGap(prevStamp, stamp, t - prevAt);
      postMessage({ f: [prevT, t, dx, sx, dy, sy] });
    }
    prevCols = cols;
    prevRows = rows;
    prevAt = t;
    prevStamp = stamp;
  }
}

const inWorker = typeof WorkerGlobalScope === 'function' && globalThis instanceof WorkerGlobalScope;
if (inWorker) {
  globalThis.onmessage = ({ data }) => { if (data && data.readable) run(data.readable); };
}
