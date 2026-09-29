import assert from "node:assert/strict";
import {
  boundaryPixels,
  convexHull,
  ringArea,
  simplifyRing,
  SIMPLIFY_EPS,
  vectorizeBuildxRgba,
  wallFollow,
} from "./vectorize-buildx.mjs";

function cellsFromPred(w, h, pred) {
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pred(x, y)) cells.push(x, y);
    }
  }
  return cells;
}

const L = cellsFromPred(
  80,
  80,
  (x, y) => (x >= 10 && x < 55 && y >= 10 && y < 28) || (x >= 10 && x < 28 && y >= 10 && y < 62)
);
assert.ok(L.length / 2 > 100);
const traced = wallFollow(L);
assert.ok(traced && traced.length >= 8, "wallFollow traces L");
const hull = convexHull(boundaryPixels(L));
hull.push(hull[0]);
const followArea = ringArea(traced);
const hullArea = ringArea(hull);
assert.ok(followArea < hullArea * 0.82, `L contour should stay concave: follow=${followArea} hull=${hullArea}`);
const simple = simplifyRing(traced, SIMPLIFY_EPS);
assert.ok(simple.length >= 6, `simplified L keeps the notch, n=${simple.length}`);

const rect = cellsFromPred(40, 30, (x, y) => x >= 6 && x < 34 && y >= 5 && y < 24);
const rectRing = wallFollow(rect);
assert.ok(rectRing && rectRing.length >= 8);
const rectSimple = simplifyRing(rectRing, SIMPLIFY_EPS);
assert.ok(rectSimple.length >= 4 && rectSimple.length <= 8, `rectangle simplifies to a box, n=${rectSimple.length}`);

function paintOrange(data, w, x, y) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  data[i] = 210;
  data[i + 1] = 90;
  data[i + 2] = 30;
  data[i + 3] = 255;
}

const w = 160;
const h = 160;
const rgba = new Uint8Array(w * h * 4);
for (let y = 18; y <= 70; y++) {
  for (let x = 18; x <= 110; x++) {
    const onL = (x >= 18 && x <= 110 && y >= 18 && y <= 42) || (x >= 18 && x <= 48 && y >= 18 && y <= 70);
    const inset = (x >= 22 && x <= 106 && y >= 22 && y <= 38) || (x >= 22 && x <= 44 && y >= 22 && y <= 66);
    if (onL && !inset) paintOrange(rgba, w, x, y);
  }
}

const vec = vectorizeBuildxRgba(rgba, w, h, {
  tileX0: 877635,
  tileY0: 449042,
  zoom: 20,
  minAreaM2: 4,
  maxAreaM2: 8000,
});
assert.ok(vec.lots.length >= 1, `synthetic L should vectorize, lots=${vec.lots.length} stats=${JSON.stringify(vec.stats)}`);
assert.ok(vec.stats.usedHull === 0 || vec.stats.usedHull < vec.stats.groups, "prefer wall-follow over hull");
console.log("vectorize ok", {
  lFollow: +followArea.toFixed(1),
  lHull: +hullArea.toFixed(1),
  rectN: rectSimple.length,
  lots: vec.lots.length,
  usedHull: vec.stats.usedHull,
});
