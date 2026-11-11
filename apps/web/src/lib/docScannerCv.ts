export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

export interface DocumentDetection {
  /** Normalized [0..1] quadrilateral of the detected sheet, or null when using full-frame mode. */
  quad: Quad | null;
  /** Confidence in [0..1] that a clear document/page is in view. */
  confidence: number;
  /** True when the frame contains crisp readable content (edges/text) even without visible outer borders. */
  hasContent: boolean;
  /** Mean edge/sharpness score for blur rejection. */
  sharpness: number;
}

export type EnhanceMode = "document" | "grayscale" | "original";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function defaultFullQuad(margin = 0.04): Quad {
  return {
    tl: { x: margin, y: margin },
    tr: { x: 1 - margin, y: margin },
    br: { x: 1 - margin, y: 1 - margin },
    bl: { x: margin, y: 1 - margin },
  };
}

export function smoothQuad(prev: Quad | null, next: Quad | null, alpha = 0.35): Quad | null {
  if (!next) return null;
  if (!prev) return next;
  const lerp = (a: Point, b: Point): Point => ({
    x: a.x + (b.x - a.x) * alpha,
    y: a.y + (b.y - a.y) * alpha,
  });
  return {
    tl: lerp(prev.tl, next.tl),
    tr: lerp(prev.tr, next.tr),
    br: lerp(prev.br, next.br),
    bl: lerp(prev.bl, next.bl),
  };
}

export function quadArea(q: Quad): number {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

export function isConvexQuad(q: Quad): boolean {
  const pts = [q.tl, q.tr, q.br, q.bl];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

function orderQuadPoints(pts: Point[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const remaining = bySum.slice(1, -1);
  // Sort remaining two by (x - y): tr has larger x - y, bl has smaller x - y
  remaining.sort((a, b) => b.x - b.y - (a.x - a.y));
  const tr = remaining[0];
  const bl = remaining[1];
  return { tl, tr, br, bl };
}

function convexHull(points: Point[]): Point[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Simplify a convex hull polygon down to 4 dominant vertices by iteratively dropping the vertex
 *  that removes the least triangle area. */
function simplifyHullToQuad(hull: Point[]): Point[] | null {
  if (hull.length < 4) return null;
  const pts = [...hull];
  while (pts.length > 4) {
    let minArea = Infinity;
    let minIdx = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const area = Math.abs(
        (prev.x * (curr.y - next.y) + curr.x * (next.y - prev.y) + next.x * (prev.y - curr.y)) * 0.5
      );
      if (area < minArea) {
        minArea = area;
        minIdx = i;
      }
    }
    pts.splice(minIdx, 1);
  }
  return pts;
}

function otsuThreshold(hist: Int32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

export function extractLuma(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const n = width * height;
  const luma = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    luma[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return luma;
}

export function computeMotionScore(prevLuma: Uint8Array, currLuma: Uint8Array): number {
  const len = Math.min(prevLuma.length, currLuma.length);
  if (len === 0) return 1;
  let diffSum = 0;
  // Sample every 2nd pixel for speed
  let count = 0;
  for (let i = 0; i < len; i += 2) {
    diffSum += Math.abs(prevLuma[i] - currLuma[i]);
    count++;
  }
  return diffSum / (count * 255);
}

/**
 * Compute a compact 16x16 zero-mean unit-variance signature + 8x8 edge energy map
 * for reliable page-change detection even under exposure shifts.
 */
export function computeFrameSignature(imageData: ImageData, quad?: Quad | null): Float32Array {
  const { data, width, height } = imageData;
  const grid = 16;
  const sig = new Float32Array(grid * grid + 64);

  const minX = quad ? clamp(Math.min(quad.tl.x, quad.bl.x), 0, 0.9) : 0.1;
  const maxX = quad ? clamp(Math.max(quad.tr.x, quad.br.x), minX + 0.05, 1) : 0.9;
  const minY = quad ? clamp(Math.min(quad.tl.y, quad.tr.y), 0, 0.9) : 0.1;
  const maxY = quad ? clamp(Math.max(quad.bl.y, quad.br.y), minY + 0.05, 1) : 0.9;

  let sum = 0;
  for (let gy = 0; gy < grid; gy++) {
    const ny = minY + ((gy + 0.5) / grid) * (maxY - minY);
    const py = clamp(Math.round(ny * (height - 1)), 0, height - 1);
    for (let gx = 0; gx < grid; gx++) {
      const nx = minX + ((gx + 0.5) / grid) * (maxX - minX);
      const px = clamp(Math.round(nx * (width - 1)), 0, width - 1);
      // 3x3 local average to avoid pixel aliasing
      let acc = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = clamp(py + dy, 0, height - 1);
        for (let dx = -1; dx <= 1; dx++) {
          const xx = clamp(px + dx, 0, width - 1);
          const idx = (yy * width + xx) * 4;
          acc += (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
          cnt++;
        }
      }
      const val = acc / cnt;
      sig[gy * grid + gx] = val;
      sum += val;
    }
  }

  const mean = sum / (grid * grid);
  let varSum = 0;
  for (let i = 0; i < grid * grid; i++) {
    const d = sig[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / (grid * grid)) || 1;
  for (let i = 0; i < grid * grid; i++) {
    sig[i] = (sig[i] - mean) / std;
  }

  // 8x8 local gradient contrast descriptors
  const eGrid = 8;
  const base = grid * grid;
  for (let ey = 0; ey < eGrid; ey++) {
    const ny = minY + ((ey + 0.5) / eGrid) * (maxY - minY);
    const py = clamp(Math.round(ny * (height - 2)), 1, height - 2);
    for (let ex = 0; ex < eGrid; ex++) {
      const nx = minX + ((ex + 0.5) / eGrid) * (maxX - minX);
      const px = clamp(Math.round(nx * (width - 2)), 1, width - 2);
      const idxL = (py * width + (px - 1)) * 4;
      const idxR = (py * width + (px + 1)) * 4;
      const idxT = ((py - 1) * width + px) * 4;
      const idxB = ((py + 1) * width + px) * 4;
      const lum = (i: number) => (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      const gx = Math.abs(lum(idxR) - lum(idxL));
      const gy = Math.abs(lum(idxB) - lum(idxT));
      sig[base + ey * eGrid + ex] = Math.min(1, (gx + gy) / 160);
    }
  }

  return sig;
}

/**
 * Returns normalized distance [0..1] between two page signatures.
 * Values > ~0.24 strongly indicate a different page or moved sheet.
 */
export function compareSignatures(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n < 256) return 1;
  // Cosine distance on the 256-dim normalized luma vector + L1 diff on 64-dim gradient vector
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 256; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const cosSim = dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1);
  const lumaDist = clamp((1 - cosSim) * 0.5, 0, 1);

  let gradDiff = 0;
  for (let i = 256; i < n; i++) {
    gradDiff += Math.abs(a[i] - b[i]);
  }
  const gradDist = clamp(gradDiff / Math.max(1, n - 256), 0, 1);
  return lumaDist * 0.72 + gradDist * 0.28;
}

/**
 * Detect a document sheet quadrilateral in a downscaled camera frame.
 */
export function detectDocumentQuad(imageData: ImageData): DocumentDetection {
  const { data, width, height } = imageData;
  const total = width * height;
  if (width < 40 || height < 40) {
    return { quad: null, confidence: 0, hasContent: false, sharpness: 0 };
  }

  const luma = new Uint8Array(total);
  const whiteness = new Uint8Array(total);
  const hist = new Int32Array(256);

  let p5 = 0;
  let p95 = 0;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = (r * 77 + g * 150 + b * 29) >> 8;
    const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    const sat = maxC - minC;
    const w = clamp(Math.round(y - sat * 0.45), 0, 255);
    luma[i] = y;
    whiteness[i] = w;
    hist[w]++;
  }

  // Find 5th and 95th percentile of whiteness to measure contrast spread
  let cum = 0;
  for (let t = 0; t < 256; t++) {
    cum += hist[t];
    if (p5 === 0 && cum >= total * 0.05) p5 = t;
    if (cum >= total * 0.95) {
      p95 = t;
      break;
    }
  }

  // Compute Sobel gradient magnitude + central sharpness/content energy
  const grad = new Uint8Array(total);
  let centerSharpSum = 0;
  let centerHighEdges = 0;
  let centerCount = 0;
  const cx0 = Math.floor(width * 0.18);
  const cx1 = Math.floor(width * 0.82);
  const cy0 = Math.floor(height * 0.18);
  const cy1 = Math.floor(height * 0.82);

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const gx =
        -luma[i - width - 1] +
        luma[i - width + 1] -
        2 * luma[i - 1] +
        2 * luma[i + 1] -
        luma[i + width - 1] +
        luma[i + width + 1];
      const gy =
        -luma[i - width - 1] -
        2 * luma[i - width] -
        luma[i - width + 1] +
        luma[i + width - 1] +
        2 * luma[i + width] +
        luma[i + width + 1];
      const mag = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 2);
      grad[i] = mag;
      if (x >= cx0 && x <= cx1 && y >= cy0 && y <= cy1) {
        centerSharpSum += mag;
        if (mag > 22) centerHighEdges++;
        centerCount++;
      }
    }
  }

  const avgSharp = centerCount > 0 ? centerSharpSum / centerCount : 0;
  const edgeDensity = centerCount > 0 ? centerHighEdges / centerCount : 0;
  const sharpness = clamp(avgSharp / 28, 0, 1);
  // Readable document page (even held close-up) has sharp text/lines OR high bright contrast
  const hasContent = edgeDensity > 0.032 || (avgSharp > 6.5 && p95 > 110);

  // Need meaningful foreground/background contrast to isolate paper edges
  if (p95 - p5 < 24) {
    return {
      quad: null,
      confidence: hasContent ? 0.58 : 0.1,
      hasContent,
      sharpness,
    };
  }

  const thresh = Math.max(70, otsuThreshold(hist, total));
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    mask[i] = whiteness[i] >= thresh ? 1 : 0;
  }

  // 3x3 morphological close (dilate then erode) to fill text/diagrams inside the paper
  const dilated = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      dilated[i] =
        mask[i] |
        mask[i - 1] |
        mask[i + 1] |
        mask[i - width] |
        mask[i + width] |
        mask[i - width - 1] |
        mask[i - width + 1] |
        mask[i + width - 1] |
        mask[i + width + 1];
    }
  }
  const closed = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      closed[i] =
        dilated[i] &
        dilated[i - 1] &
        dilated[i + 1] &
        dilated[i - width] &
        dilated[i + width];
    }
  }

  // Find largest connected component
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let bestPixels: number[] = [];
  const minRegion = Math.floor(total * 0.12);

  for (let i = 0; i < total; i++) {
    if (closed[i] !== 1 || visited[i]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    const comp: number[] = [];

    while (head < tail) {
      const curr = queue[head++];
      comp.push(curr);
      const cx = curr % width;
      const cy = (curr / width) | 0;
      if (cx > 0) {
        const n = curr - 1;
        if (closed[n] === 1 && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cx < width - 1) {
        const n = curr + 1;
        if (closed[n] === 1 && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy > 0) {
        const n = curr - width;
        if (closed[n] === 1 && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
      if (cy < height - 1) {
        const n = curr + width;
        if (closed[n] === 1 && !visited[n]) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    if (comp.length > bestPixels.length) {
      bestPixels = comp;
    }
  }

  const regionRatio = bestPixels.length / total;
  if (bestPixels.length < minRegion || regionRatio > 0.94) {
    return {
      quad: null,
      confidence: hasContent ? 0.6 : 0.15,
      hasContent,
      sharpness,
    };
  }

  // Extract boundary pixels of best component
  const inBest = new Uint8Array(total);
  for (let k = 0; k < bestPixels.length; k++) inBest[bestPixels[k]] = 1;

  const boundary: Point[] = [];
  for (let k = 0; k < bestPixels.length; k++) {
    const idx = bestPixels[k];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (
      x === 0 ||
      x === width - 1 ||
      y === 0 ||
      y === height - 1 ||
      !inBest[idx - 1] ||
      !inBest[idx + 1] ||
      !inBest[idx - width] ||
      !inBest[idx + width]
    ) {
      boundary.push({ x: x / (width - 1), y: y / (height - 1) });
    }
  }

  if (boundary.length < 16) {
    return { quad: null, confidence: hasContent ? 0.55 : 0.1, hasContent, sharpness };
  }

  const hull = convexHull(boundary);
  const quadPts = simplifyHullToQuad(hull);
  if (!quadPts) {
    return { quad: null, confidence: hasContent ? 0.55 : 0.1, hasContent, sharpness };
  }

  const quad = orderQuadPoints(quadPts);
  const area = quadArea(quad);
  if (!isConvexQuad(quad) || area < 0.14 || area > 0.94) {
    return { quad: null, confidence: hasContent ? 0.55 : 0.1, hasContent, sharpness };
  }

  // Check minimum edge lengths to reject sliver triangles/bars
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const minEdge = Math.min(
    dist(quad.tl, quad.tr),
    dist(quad.tr, quad.br),
    dist(quad.br, quad.bl),
    dist(quad.bl, quad.tl)
  );
  if (minEdge < 0.22) {
    return { quad: null, confidence: hasContent ? 0.52 : 0.1, hasContent, sharpness };
  }

  // Score how strongly Sobel edges support the 4 detected sides
  const sides: [Point, Point][] = [
    [quad.tl, quad.tr],
    [quad.tr, quad.br],
    [quad.br, quad.bl],
    [quad.bl, quad.tl],
  ];
  let edgeHits = 0;
  let edgeSamples = 0;
  for (const [a, b] of sides) {
    for (let s = 1; s < 16; s++) {
      const t = s / 16;
      const sx = Math.round((a.x + (b.x - a.x) * t) * (width - 1));
      const sy = Math.round((a.y + (b.y - a.y) * t) * (height - 1));
      // Check 3x3 neighborhood max gradient
      let localMax = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = clamp(sy + dy, 0, height - 1);
        for (let dx = -2; dx <= 2; dx++) {
          const xx = clamp(sx + dx, 0, width - 1);
          const gVal = grad[yy * width + xx];
          if (gVal > localMax) localMax = gVal;
        }
      }
      if (localMax > 18) edgeHits++;
      edgeSamples++;
    }
  }
  const edgeSupport = edgeSamples > 0 ? edgeHits / edgeSamples : 0;
  const fillRatio = clamp(bestPixels.length / (area * total), 0, 1);
  const confidence = clamp(edgeSupport * 0.55 + fillRatio * 0.25 + (hasContent ? 0.2 : 0.05), 0, 1);

  if (confidence < 0.42) {
    return {
      quad: null,
      confidence: hasContent ? 0.55 : confidence,
      hasContent,
      sharpness,
    };
  }

  return {
    quad,
    confidence,
    hasContent: true,
    sharpness,
  };
}

/** Solve 8x8 linear system A * x = b via Gaussian elimination with partial pivoting. */
function solveLinear8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    let maxAbs = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > maxAbs) {
        maxAbs = v;
        pivot = r;
      }
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const diag = M[col][col] || 1e-12;
    for (let j = col; j <= n; j++) M[col][j] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) M[r][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Compute 3x3 homography H mapping destination rect (0,0)-(dstW,0)-(dstW,dstH)-(0,dstH)
 * to source quad coordinates.
 */
function computeInverseHomography(
  dstW: number,
  dstH: number,
  srcPts: [Point, Point, Point, Point]
): number[] {
  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: dstW, y: 0 },
    { x: dstW, y: dstH },
    { x: 0, y: dstH },
  ];
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = dstPts[i];
    const { x: x, y: y } = srcPts[i];
    A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
    b.push(y);
  }
  const h = solveLinear8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Perspective-warp and crop a source image/canvas using a normalized Quad.
 */
export function warpPerspectiveQuad(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
  maxLongEdge = 1800
): HTMLCanvasElement {
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  const sTL = { x: quad.tl.x * sw, y: quad.tl.y * sh };
  const sTR = { x: quad.tr.x * sw, y: quad.tr.y * sh };
  const sBR = { x: quad.br.x * sw, y: quad.br.y * sh };
  const sBL = { x: quad.bl.x * sw, y: quad.bl.y * sh };

  const topW = Math.hypot(sTR.x - sTL.x, sTR.y - sTL.y);
  const botW = Math.hypot(sBR.x - sBL.x, sBR.y - sBL.y);
  const leftH = Math.hypot(sBL.x - sTL.x, sBL.y - sTL.y);
  const rightH = Math.hypot(sBR.x - sTR.x, sBR.y - sTR.y);

  let dstW = Math.max(120, Math.round(Math.max(topW, botW)));
  let dstH = Math.max(120, Math.round(Math.max(leftH, rightH)));

  const longEdge = Math.max(dstW, dstH);
  if (longEdge > maxLongEdge) {
    const scale = maxLongEdge / longEdge;
    dstW = Math.round(dstW * scale);
    dstH = Math.round(dstH * scale);
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = dstW;
  outCanvas.height = dstH;
  const outCtx = outCanvas.getContext("2d")!;
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;
  const outImg = outCtx.createImageData(dstW, dstH);
  const dstData = outImg.data;

  const H = computeInverseHomography(dstW, dstH, [sTL, sTR, sBR, sBL]);
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;

  for (let y = 0; y < dstH; y++) {
    const rowOff = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const denom = h6 * x + h7 * y + h8;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;

      const x0 = clamp(Math.floor(sx), 0, sw - 2);
      const y0 = clamp(Math.floor(sy), 0, sh - 2);
      const fx = clamp(sx - x0, 0, 1);
      const fy = clamp(sy - y0, 0, 1);

      const i00 = (y0 * sw + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + sw * 4;
      const i11 = i01 + 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const di = (rowOff + x) * 4;
      dstData[di] =
        srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[di + 1] =
        srcData[i00 + 1] * w00 +
        srcData[i10 + 1] * w10 +
        srcData[i01 + 1] * w01 +
        srcData[i11 + 1] * w11;
      dstData[di + 2] =
        srcData[i00 + 2] * w00 +
        srcData[i10 + 2] * w10 +
        srcData[i01 + 2] * w01 +
        srcData[i11 + 2] * w11;
      dstData[di + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

export function rotateCanvas(source: HTMLCanvasElement, degrees: 0 | 90 | 180 | 270): HTMLCanvasElement {
  if (degrees === 0) return source;
  const out = document.createElement("canvas");
  const swap = degrees === 90 || degrees === 270;
  out.width = swap ? source.height : source.width;
  out.height = swap ? source.width : source.height;
  const ctx = out.getContext("2d")!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

/**
 * Apply real-time visual enhancement preview on a canvas (matching Google Files clean document scan look).
 */
export function applyEnhanceFilterToCanvas(
  source: HTMLCanvasElement,
  mode: EnhanceMode
): HTMLCanvasElement {
  if (mode === "original") return source;
  const w = source.width;
  const h = source.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Estimate smooth background illumination on a small grid (e.g. 24x24) for shadow removal
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = 24;
  bgCanvas.height = 24;
  const bgCtx = bgCanvas.getContext("2d")!;
  bgCtx.filter = "blur(2px)";
  bgCtx.drawImage(source, 0, 0, 24, 24);
  const bgUp = document.createElement("canvas");
  bgUp.width = w;
  bgUp.height = h;
  const bgUpCtx = bgUp.getContext("2d", { willReadFrequently: true })!;
  bgUpCtx.drawImage(bgCanvas, 0, 0, w, h);
  const bg = bgUpCtx.getImageData(0, 0, w, h).data;

  const n = w * h;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];

    const br = Math.max(48, bg[p]);
    const bgG = Math.max(48, bg[p + 1]);
    const bb = Math.max(48, bg[p + 2]);

    if (mode === "document") {
      // Illumination-normalized white paper + crisp ink contrast
      let nr = (r / br) * 242;
      let ng = (g / bgG) * 242;
      let nb = (b / bb) * 242;
      // Soft S-curve contrast boost around midtones
      nr = clamp((nr - 128) * 1.24 + 134, 0, 255);
      ng = clamp((ng - 128) * 1.24 + 134, 0, 255);
      nb = clamp((nb - 128) * 1.24 + 134, 0, 255);
      d[p] = nr;
      d[p + 1] = ng;
      d[p + 2] = nb;
    } else if (mode === "grayscale") {
      const y = (r * 77 + g * 150 + b * 29) >> 8;
      const by = Math.max(48, (br * 77 + bgG * 150 + bb * 29) >> 8);
      let ny = (y / by) * 245;
      ny = clamp((ny - 128) * 1.45 + 136, 0, 255);
      d[p] = ny;
      d[p + 1] = ny;
      d[p + 2] = ny;
    }
  }

  ctx.putImageData(img, 0, 0);
  return out;
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas JPEG encoding failed."))),
      "image/jpeg",
      quality
    );
  });
}
