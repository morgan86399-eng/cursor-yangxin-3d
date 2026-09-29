/**
 * 把國土測繪 BUILDX 橘色線框圖磚向量化成分戶多邊形。
 * 沿牆追蹤（非凸包），保留透天凹角，對準正射屋頂。
 */
export function tilePixelToLonLat(px, py, tileX0, tileY0, z) {
  const n = 2 ** z;
  const tx = tileX0 + px / 256;
  const ty = tileY0 + py / 256;
  const lon = (tx / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n)));
  return [lon, (latRad * 180) / Math.PI];
}

export function isBuildxInk(r, g, b, a) {
  if (a < 20) return false;
  return r > 70 && r >= g && g >= b && r - b > 25;
}

function idx(x, y, w) {
  return y * w + x;
}

function dilateMask(src, w, h) {
  const out = new Uint8Array(src.length);
  out.set(src);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!src[idx(x, y, w)]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) out[idx(x + dx, y + dy, w)] = 1;
      }
    }
  }
  return out;
}

function floodOutside(wall, w, h) {
  const out = new Uint8Array(w * h);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  function push(x, y) {
    const i = idx(x, y, w);
    if (x < 0 || y < 0 || x >= w || y >= h || wall[i] || out[i]) return;
    out[i] = 1;
    qx[tail] = x;
    qy[tail] = y;
    tail++;
  }
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (head < tail) {
    const x = qx[head];
    const y = qy[head];
    head++;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return out;
}

function labelInteriors(interior, w, h, minPix, maxPix) {
  const seen = new Uint8Array(w * h);
  const lots = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const start = idx(x, y, w);
      if (!interior[start] || seen[start]) continue;
      const q = [x, y];
      seen[start] = 1;
      const cells = [];
      let overflow = false;
      let qi = 0;
      for (; qi < q.length; qi += 2) {
        const cx = q[qi];
        const cy = q[qi + 1];
        cells.push(cx, cy);
        if (cells.length / 2 > maxPix) {
          overflow = true;
          break;
        }
        const neigh = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
        for (let k = 0; k < 8; k += 2) {
          const nx = neigh[k];
          const ny = neigh[k + 1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = idx(nx, ny, w);
          if (!interior[ni] || seen[ni]) continue;
          seen[ni] = 1;
          q.push(nx, ny);
        }
      }
      if (overflow) {
        for (; qi < q.length; qi += 2) {
          const cx = q[qi];
          const cy = q[qi + 1];
          const neigh = [cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1];
          for (let k = 0; k < 8; k += 2) {
            const nx = neigh[k];
            const ny = neigh[k + 1];
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = idx(nx, ny, w);
            if (!interior[ni] || seen[ni]) continue;
            seen[ni] = 1;
            q.push(nx, ny);
          }
        }
        continue;
      }
      if (cells.length / 2 < minPix) continue;
      lots.push(cells);
    }
  }
  return lots;
}

export function boundaryPixels(cells) {
  const set = new Set();
  for (let i = 0; i < cells.length; i += 2) set.add(`${cells[i]},${cells[i + 1]}`);
  const has = (x, y) => set.has(`${x},${y}`);
  const pts = [];
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i];
    const y = cells[i + 1];
    if (!has(x + 1, y) || !has(x - 1, y) || !has(x, y + 1) || !has(x, y - 1)) pts.push([x, y]);
  }
  return pts;
}

export function wallFollow(cells) {
  const set = new Set();
  let minY = Infinity;
  let minX = Infinity;
  for (let i = 0; i < cells.length; i += 2) {
    const x = cells[i];
    const y = cells[i + 1];
    set.add(`${x},${y}`);
    if (y < minY || (y === minY && x < minX)) {
      minY = y;
      minX = x;
    }
  }
  const has = (x, y) => set.has(`${x},${y}`);
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let x = minX;
  let y = minY;
  let dir = 0;
  for (let d = 0; d < 4; d++) {
    if (has(x + DX[d], y + DY[d])) {
      dir = d;
      break;
    }
  }
  const startX = x;
  const startY = y;
  const ring = [[x, y]];
  const seen = new Set();
  for (let step = 0; step < 24000; step++) {
    const left = (dir + 3) % 4;
    if (has(x + DX[left], y + DY[left])) {
      dir = left;
      x += DX[dir];
      y += DY[dir];
    } else if (has(x + DX[dir], y + DY[dir])) {
      x += DX[dir];
      y += DY[dir];
    } else {
      dir = (dir + 1) % 4;
      continue;
    }
    ring.push([x, y]);
    if (x === startX && y === startY && ring.length > 4) break;
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) break;
    seen.add(key);
  }
  if (ring.length < 6) return null;
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return dedupeRing(ring);
}

function dedupeRing(ring) {
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const p = ring[i];
    const q = out[out.length - 1];
    if (p[0] !== q[0] || p[1] !== q[1]) out.push(p);
  }
  if (out.length >= 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return out;
  }
  if (out.length) out.push([out[0][0], out[0][1]]);
  return out;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function ringArea(ring) {
  let area = 0;
  for (let k = 0; k < ring.length - 1; k++) {
    area += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
  }
  return Math.abs(area) * 0.5;
}

function ringAreaM2(ring) {
  const lat0 = ring[0][1];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  let area = 0;
  for (let k = 0; k < ring.length - 1; k++) {
    area += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
  }
  return Math.abs(area) * 0.5 * mLat * mLon;
}

function perpDist(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = a[0] + vx * t;
  const qy = a[1] + vy * t;
  return Math.hypot(p[0] - qx, p[1] - qy);
}

export const SIMPLIFY_EPS = 2.6;

function simplifyAdaptive(outline) {
  let eps = SIMPLIFY_EPS;
  let simple = simplifyRing(outline, eps);
  while (simple.length > 24 && eps < 7.5) {
    eps += 0.9;
    simple = simplifyRing(outline, eps);
  }
  return simple;
}

export function simplifyRing(ring, eps) {
  if (ring.length <= 5) return ring;
  const closed =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring.slice();
  function rec(start, end, keep) {
    let maxD = -1;
    let maxI = -1;
    const a = pts[start];
    const b = pts[end];
    for (let i = start + 1; i < end; i++) {
      const d = perpDist(pts[i], a, b);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > eps && maxI >= 0) {
      rec(start, maxI, keep);
      rec(maxI, end, keep);
    } else {
      keep.add(start);
      keep.add(end);
    }
  }
  const keep = new Set();
  rec(0, pts.length - 1, keep);
  const out = pts.filter((_, i) => keep.has(i));
  if (out.length < 3) return ring;
  out.push(out[0]);
  return out;
}

function outlineForGroup(cells) {
  const traced = wallFollow(cells);
  if (traced && traced.length >= 6) return traced;
  const hull = convexHull(boundaryPixels(cells));
  if (hull.length < 3) return null;
  hull.push(hull[0]);
  return hull;
}

export function vectorizeBuildxRgba(data, w, h, { tileX0, tileY0, zoom, minAreaM2 = 18, maxAreaM2 = 4500 } = {}) {
  const wall = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (isBuildxInk(data[o], data[o + 1], data[o + 2], data[o + 3])) wall[i] = 1;
  }
  const fat = dilateMask(wall, w, h);
  const outside = floodOutside(fat, w, h);
  const interior = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!fat[i] && !outside[i]) interior[i] = 1;
  }
  const mpp = (156543.03392 * Math.cos((25 * Math.PI) / 180)) / 2 ** (zoom || 20);
  const minPix = Math.max(40, Math.round(minAreaM2 / (mpp * mpp)));
  const maxPix = Math.round(maxAreaM2 / (mpp * mpp));
  const groups = labelInteriors(interior, w, h, minPix, maxPix);
  const lots = [];
  let failTrace = 0;
  let failSimple = 0;
  let failArea = 0;
  let usedHull = 0;
  const sampleAreas = [];
  for (let i = 0; i < groups.length; i++) {
    const traced = wallFollow(groups[i]);
    const usedFollow = Boolean(traced && traced.length >= 6);
    const outline = outlineForGroup(groups[i]);
    if (!usedFollow) usedHull++;
    if (!outline) {
      failTrace++;
      continue;
    }
    const simple = simplifyAdaptive(outline);
    if (simple.length < 4) {
      failSimple++;
      continue;
    }
    const ring = simple.map(([x, y]) => tilePixelToLonLat(x + 0.5, y + 0.5, tileX0, tileY0, zoom));
    const areaM2 = ringAreaM2(ring);
    if (sampleAreas.length < 8) {
      sampleAreas.push({ n: simple.length, outline: outline.length, areaM2: +areaM2.toFixed(1), follow: usedFollow });
    }
    if (areaM2 < minAreaM2 || areaM2 > maxAreaM2) {
      failArea++;
      continue;
    }
    lots.push({
      id: `nlsc/${i}`,
      ring,
      area: Math.round(areaM2),
      source: "nlsc-buildx",
    });
  }
  return {
    lots,
    stats: {
      minPix,
      maxPix,
      groups: groups.length,
      lots: lots.length,
      mpp,
      failTrace,
      failSimple,
      failArea,
      usedHull,
      sampleAreas,
    },
  };
}
