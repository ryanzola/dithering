import './style.css';

function bayer(n) {
  if (n === 2)
    return [
      [0, 2],
      [3, 1]
    ];
  const p = bayer(n / 2);
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n / 2; y++) {
    for (let x = 0; x < n / 2; x++) {
      const v = p[y][x] * 4;
      out[y][x] = v + 0;
      out[y][x + n / 2] = v + 2;
      out[y + n / 2][x] = v + 3;
      out[y + n / 2][x + n / 2] = v + 1;
    }
  }
  return out;
}

/*
 0 32  8 40  2 34 10 42
48 16 56 24 50 18 58 26
12 44  4 36 14 46  6 38
60 28 52 20 62 30 54 22
 3 35 11 43  1 33  9 41
51 19 59 27 49 17 57 25
15 47  7 39 13 45  5 37
63 31 55 23 61 29 53 21
*/
const BAYER8 = bayer(8);

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { willReadFrequently: true });

const $ = id => document.getElementById(id);
const 
  cA = $('cA'), cB = $('cB'), 
  scale = $('scale'), 
  angle = $('angle'), 
  contrast = $('contrast'),
  anim = $('anim'),
  pause = $('pause');

// Convert #RGB or #RRGGBB to [r,g,b]
function hexToRGB(hex) {
  const n = hex.replace('#', '');
  const v = n.length === 3 ? n.split('').map(x => x + x).join('') : n;
  const i = parseInt(v, 16);
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
}

// Linear interpolation helper
function lerp(a, b, t) { return a + (b - a) * t; }
function setCanvas(scaleHint = 4) {
  const W = window.innerWidth | 0;
  const H = window.innerHeight | 0;
  const s = Math.max(1, Math.floor(scaleHint));   // any integer scale

  // internal bitmap size
  cv.width  = Math.max(1, Math.floor(W / s));
  cv.height = Math.max(1, Math.floor(H / s));

  // upscale by the SAME integer in both axes -> square pixels, no warp
  const up = Math.min(
    Math.floor(W / cv.width),
    Math.floor(H / cv.height)
  );
  cv.style.width  = `${cv.width  * up}px`;
  cv.style.height = `${cv.height * up}px`;
}

// Compute a 0..1 gradient value at (x,y) for a given angle
function grad01(x, y, w, h, deg) {
  const rad = deg * Math.PI / 180;
  const nx = Math.cos(rad), ny = Math.sin(rad);
  // normalize coords to [-.5,.5] space for stable scaling
  const X = (x / (w - 1)) - 0.5;
  const Y = (y / (h - 1)) - 0.5;
  const v = (X * nx + Y * ny) + 0.5; // back to 0..1
  return Math.min(1, Math.max(0, v));
}

// Perform 1-bit ordered dither with selectable animation effects
function renderDitherTwoColor(ts = 0) {
  // 1) sizing (integer upscaling; may letterbox)
  const scaleHint = Math.max(1, Math.min(128, parseInt(scale.value || '4', 10)));
  setCanvas(scaleHint);

  const w = cv.width, h = cv.height;

  // 2) inputs
  const [rA, gA, bA] = hexToRGB(cA.value);
  const [rB, gB, bB] = hexToRGB(cB.value);
  const angBase = parseFloat(angle.value || '90');
  const kBase   = parseFloat(contrast.value || '1');
  const mode    = (anim?.value || 'off');

  // 3) time
  const tsec = ts * 0.001;

  // 4) effect parameters (tiny, tasteful defaults)
  // shimmer: slide Bayer mask tile indices
  const ox = ((Math.floor(tsec * 2) % 8) + 8) % 8;  // 2 px/sec
  const oy = ((Math.floor(tsec * 3) % 8) + 8) % 8;  // 3 px/sec

  // breathe: small angle + contrast sway
  const ang2 = mode === 'breathe' ? (angBase + 5 * Math.sin(tsec * 0.5)) : angBase;
  const k2   = mode === 'breathe' ? (kBase  * (1 + 0.06 * Math.sin(tsec * 1.3))) : kBase;

  // flicker: micro jitter on threshold (±1%) using stable spatial hash
  const jitterAmp = mode === 'flicker' ? 0.02 : 0; // 0.02 => ±1% shift around mid
  const jitterPhase = Math.sin(tsec * 3);          // gentle temporal oscillation

  // 5) render
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // gradient value (with breathing if enabled)
      let t = grad01(x, y, w, h, ang2);
      t = Math.min(1, Math.max(0, 0.5 + (t - 0.5) * k2));

      // threshold from Bayer (optionally scrolled for shimmer)
      const by = mode === 'shimmer' ? ( (y + oy) & 7 ) : (y & 7);
      const bx = mode === 'shimmer' ? ( (x + ox) & 7 ) : (x & 7);
      let th = (BAYER8[by][bx] + 0.5) / 64;

      // optional flicker: per-pixel stable hash mixed with time
      if (jitterAmp) {
        const h8 = ((x * 127 + y * 31337) & 255) / 255; // 0..1 (fast, stable)
        th = Math.min(1, Math.max(0, th + (h8 - 0.5) * jitterAmp * jitterPhase));
      }

      const useB = t >= th;
      const i = (y * w + x) * 4;
      d[i + 0] = useB ? rB : rA;
      d[i + 1] = useB ? gB : gA;
      d[i + 2] = useB ? bB : bA;
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function tick(ts) {
  if (!pause?.checked) renderDitherTwoColor(ts);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Recompute on resize (next frame will draw)
window.addEventListener('resize', () => {}, { passive: true });