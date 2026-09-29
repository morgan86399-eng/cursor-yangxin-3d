export function metersPerDegree(lat) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return { mLat, mLon };
}

export function createProjector(originLat, originLon) {
  const { mLat, mLon } = metersPerDegree(originLat);
  return {
    originLat,
    originLon,
    toLocal(lat, lon) {
      return {
        x: (lon - originLon) * mLon,
        z: (originLat - lat) * mLat,
      };
    },
    toLatLon(x, z) {
      return {
        lat: originLat - z / mLat,
        lon: originLon + x / mLon,
      };
    },
  };
}

export function centroid(ring) {
  let x = 0;
  let y = 0;
  const n = ring.length - (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
  const count = Math.max(n, 1);
  for (let i = 0; i < count; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / count, y / count];
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const hit = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// A building intersects a radius when any part of its footprint does, even if
// its centroid is outside. Keep this independent of the inset render polygon.
export function distanceToRing(x, z, ring) {
  if (!ring?.length) return Infinity;
  if (pointInRing(x, z, ring)) return 0;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const length2 = vx * vx + vz * vz;
    const t = length2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / length2)) : 0;
    const dx = x - (a.x + vx * t);
    const dz = z - (a.z + vz * t);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

export function nearestRoad(x, z, roads) {
  let best = { d: Infinity, ax: 1, az: 0, px: x, pz: z };
  for (const road of roads || []) {
    const pts = road.pts;
    if (!pts || pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t;
      const pz = a.z + vz * t;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < best.d) {
        const len = Math.hypot(vx, vz) || 1;
        best = { d, ax: vx / len, az: vz / len, px, pz };
      }
    }
  }
  return best;
}

export function outwardNormal(a, b, pts) {
  let nx = a.z - b.z;
  let nz = b.x - a.x;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  if (pointInRing(mx + nx * 0.25, mz + nz * 0.25, pts)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz, mx, mz };
}

export function streetFacingEdge(pts, roads) {
  if (!pts || pts.length < 3) return null;
  const last = pts.length - 1;
  const closed = pts[0].x === pts[last].x && pts[0].z === pts[last].z;
  const count = closed ? pts.length - 1 : pts.length;
  let best = null;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1.5) continue;
    const n = outwardNormal(a, b, pts);
    const road = nearestRoad(n.mx, n.mz, roads);
    const alignX = road.px - n.mx;
    const alignZ = road.pz - n.mz;
    const facingRoad = n.nx * alignX + n.nz * alignZ;
    const alignBonus = facingRoad > 0 ? 12 : 0.12;
    const score = (Math.min(len, 7.5) * alignBonus) / (0.45 + (Number.isFinite(road.d) ? road.d : 40));
    if (!best || score > best.score) {
      best = {
        index: i,
        a,
        b,
        len,
        score,
        nx: n.nx,
        nz: n.nz,
        mx: n.mx,
        mz: n.mz,
        yaw: Math.atan2(n.nx, n.nz),
        roadDist: road.d,
      };
    }
  }
  return best;
}

// Only a genuinely outward-facing edge may receive street-side details.
// This keeps party walls plain while allowing a corner lot to face two roads.
export function roadFacingEdges(pts, roads, maxDistance = 12) {
  if (!pts || pts.length < 3) return [];
  const last = pts.length - 1;
  const closed = pts[0].x === pts[last].x && pts[0].z === pts[last].z;
  const count = closed ? last : pts.length;
  const edges = [];
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 2.4) continue;
    const n = outwardNormal(a, b, pts);
    const road = nearestRoad(n.mx, n.mz, roads);
    const distance = Math.sqrt(road.d);
    if (!Number.isFinite(distance) || distance > maxDistance || distance < 0.1) continue;
    const facing = (n.nx * (road.px - n.mx) + n.nz * (road.pz - n.mz)) / distance;
    if (facing < 0.55) continue;
    edges.push({ index: i, a, b, len, nx: n.nx, nz: n.nz, mx: n.mx, mz: n.mz,
      yaw: Math.atan2(n.nx, n.nz), roadDist: road.d });
  }
  return edges;
}

// A projected awning or balcony must not bridge a narrow gap into a different
// footprint. This is a model-footprint check, not a claim about measured space.
export function exteriorStripClear(edge, lots, ownerId, depth, margin = 0.16) {
  if (!edge || !Number.isFinite(depth) || depth <= 0) return false;
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z);
  if (length < 1e-6) return false;
  const tx = (edge.b.x - edge.a.x) / length;
  const tz = (edge.b.z - edge.a.z) / length;
  const corner = (p, along, out) => ({ x: p.x + tx * along + edge.nx * out,
    z: p.z + tz * along + edge.nz * out });
  const strip = [corner(edge.a, -margin, -margin), corner(edge.b, margin, -margin),
    corner(edge.b, margin, depth + margin), corner(edge.a, -margin, depth + margin)];
  const bounds = {
    minX: Math.min(...strip.map((p) => p.x)), maxX: Math.max(...strip.map((p) => p.x)),
    minZ: Math.min(...strip.map((p) => p.z)), maxZ: Math.max(...strip.map((p) => p.z)),
  };
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const segmentTouches = (a, b, c, d) => {
    const abC = cross(a, b, c); const abD = cross(a, b, d);
    const cdA = cross(c, d, a); const cdB = cross(c, d, b);
    if (abC * abD < 0 && cdA * cdB < 0) return true;
    const on = (p, q, r, area) => Math.abs(area) < 1e-8 &&
      r.x >= Math.min(p.x, q.x) - 1e-8 && r.x <= Math.max(p.x, q.x) + 1e-8 &&
      r.z >= Math.min(p.z, q.z) - 1e-8 && r.z <= Math.max(p.z, q.z) + 1e-8;
    return on(a, b, c, abC) || on(a, b, d, abD) || on(c, d, a, cdA) || on(c, d, b, cdB);
  };
  for (const lot of lots || []) {
    if (lot.id === ownerId || !lot.pts || lot.pts.length < 3) continue;
    const points = lot.pts.at(-1).x === lot.pts[0].x && lot.pts.at(-1).z === lot.pts[0].z
      ? lot.pts.slice(0, -1) : lot.pts;
    if (points.length < 3) continue;
    const minX = lot.minX ?? Math.min(...points.map((p) => p.x));
    const maxX = lot.maxX ?? Math.max(...points.map((p) => p.x));
    const minZ = lot.minZ ?? Math.min(...points.map((p) => p.z));
    const maxZ = lot.maxZ ?? Math.max(...points.map((p) => p.z));
    if (bounds.maxX < minX || bounds.minX > maxX || bounds.maxZ < minZ || bounds.minZ > maxZ) continue;
    if (strip.some((p) => pointInRing(p.x, p.z, points)) ||
      points.some((p) => pointInRing(p.x, p.z, strip))) return false;
    for (let i = 0; i < strip.length; i++) {
      for (let j = 0; j < points.length; j++) {
        if (segmentTouches(strip[i], strip[(i + 1) % strip.length],
          points[j], points[(j + 1) % points.length])) return false;
      }
    }
  }
  return true;
}
