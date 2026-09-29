// Matches the existing window module, not a surveyed facade dimension.
export const WINDOW_CUTOUT_WIDTH = 1.04;
export const WINDOW_CUTOUT_HEIGHT = 1.32;

// Partition a wall band around rectangular apertures. Returning uninterrupted
// panels rather than masking a texture leaves an actual hole in the wall mesh.
export function planWallPanels(length, y0, y1, openings = []) {
  if (!(length > 0) || !(y1 > y0)) return [];
  const holes = openings.map((opening) => ({
    x0: Math.max(0, opening.x - opening.w / 2),
    x1: Math.min(length, opening.x + opening.w / 2),
    y0: Math.max(y0, opening.y - opening.h / 2),
    y1: Math.min(y1, opening.y + opening.h / 2),
  })).filter((hole) => Number.isFinite(hole.x0 + hole.x1 + hole.y0 + hole.y1) &&
    hole.x1 > hole.x0 && hole.y1 > hole.y0);
  const xs = [...new Set([0, length, ...holes.flatMap((hole) => [hole.x0, hole.x1])])].sort((a, b) => a - b);
  const ys = [...new Set([y0, y1, ...holes.flatMap((hole) => [hole.y0, hole.y1])])].sort((a, b) => a - b);
  const panels = [];
  for (let row = 0; row < ys.length - 1; row++) {
    const low = ys[row]; const high = ys[row + 1];
    let start = null;
    for (let col = 0; col < xs.length - 1; col++) {
      const left = xs[col]; const right = xs[col + 1];
      const x = (left + right) / 2; const y = (low + high) / 2;
      const cut = holes.some((hole) => x > hole.x0 && x < hole.x1 && y > hole.y0 && y < hole.y1);
      if (!cut && start === null) start = left;
      if (start !== null && (cut || col === xs.length - 2)) {
        const end = cut ? left : right;
        if (end - start > 1e-8 && high - low > 1e-8) panels.push({ x0: start, x1: end, y0: low, y1: high });
        start = null;
      }
    }
  }
  return panels;
}
