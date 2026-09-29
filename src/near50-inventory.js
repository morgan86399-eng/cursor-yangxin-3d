import { distanceToRing, nearestRoad, streetFacingEdge } from "./geo.js";
import { localRing } from "./buildings.js";

export const NEAR50_RADIUS_METERS = 50;

function ringPoints(ring) {
  const closed = ring.length > 1 && ring[0].x === ring.at(-1).x && ring[0].z === ring.at(-1).z;
  return closed ? ring.slice(0, -1) : ring;
}

function segmentsCross(a, b, c, d) {
  const orient = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const abC = orient(a, b, c);
  const abD = orient(a, b, d);
  const cdA = orient(c, d, a);
  const cdB = orient(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

export function footprintGapMeters(a, b) {
  const ap = ringPoints(a);
  const bp = ringPoints(b);
  if (!ap.length || !bp.length) return Infinity;
  let gap = Infinity;
  for (const p of ap) gap = Math.min(gap, distanceToRing(p.x, p.z, b));
  for (const p of bp) gap = Math.min(gap, distanceToRing(p.x, p.z, a));
  if (gap === 0) return 0;
  for (let i = 0; i < ap.length; i++) {
    for (let j = 0; j < bp.length; j++) {
      if (segmentsCross(ap[i], ap[(i + 1) % ap.length], bp[j], bp[(j + 1) % bp.length])) return 0;
    }
  }
  return gap;
}

function labelFor(building) {
  if (building.id === "nlsc/414") return "鎮撫街 46 號";
  if (building.id === "nlsc/410") return "鎮撫街 48 號所在輪廓";
  return building.name || building.id;
}

const HISTORICAL_VISUAL_NOTES = {
  "nlsc/392": "2019 影像：四海遊龍橫牌可見；此輪廓對位仍為推估",
  "nlsc/399": "2019 影像：彩券圓牌可見；此輪廓對位仍為推估",
  "nlsc/354": "2019 周邊影像與目前模型招牌的棟別對位待核",
};

export function createNear50Inventory(buildings, colliders, project) {
  const modeled = new Map((colliders || []).map((entry) => [entry.id, entry]));
  const footprints = (buildings || []).map((building) => ({ building, ring: localRing(building.ring, project) }));
  return footprints
    .map(({ building, ring }) => {
      const distance = distanceToRing(0, 0, ring);
      if (distance > NEAR50_RADIUS_METERS) return null;
      const points = ringPoints(ring);
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const z = points.reduce((sum, p) => sum + p.z, 0) / points.length;
      const model = modeled.get(building.id) || null;
      let nearestBuildingId = null;
      let gapMeters = Infinity;
      for (const other of footprints) {
        if (other.building.id === building.id) continue;
        const gap = footprintGapMeters(ring, other.ring);
        if (gap < gapMeters) {
          gapMeters = gap;
          nearestBuildingId = other.building.id;
        }
      }
      return {
        id: building.id,
        label: labelFor(building),
        distance,
        x,
        z,
        modeled: Boolean(model),
        modelRole: model?.modelRole || "unknown",
        recessedWindows: model?.recessedWindows || 0,
        projectionOmissions: model?.projectionOmissions || 0,
        normalMapped: model?.normalMapped === true,
        detailedDrainpipe: model?.detailedDrainpipe === true,
        height: model?.height ?? null,
        heightEstimated: model?.heightIsEstimated !== false,
        observedFloors: model?.observedFloors ?? null,
        shops: model?.shops || [],
        gapMeters,
        nearestBuildingId,
        ring: points,
        source: building.source || "NLSC／OSM 建物輪廓",
        facadeCalibrated: false,
        historicalVisualNote: HISTORICAL_VISUAL_NOTES[building.id] || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}

export function near50CameraPose(item, roads = [], colliders = []) {
  if (!item?.modeled || !Number.isFinite(item.x) || !Number.isFinite(item.z)) return null;
  const front = streetFacingEdge(item.ring, roads);
  if (front && Math.sqrt(front.roadDist) <= 12) {
    const roadDistance = Math.sqrt(nearestRoad(front.mx, front.mz, roads).d);
    const offsets = [Math.max(12, (item.height || 8) * 1.1), 11, 9, Math.max(roadDistance, 7)];
    for (const offset of offsets) {
      const x = front.mx + front.nx * offset;
      const z = front.mz + front.nz * offset;
      const clear = [0.35, 0.6, 0.85, 1].every((t) => colliders.every((other) =>
        other.id === item.id || distanceToRing(front.mx + front.nx * offset * t,
          front.mz + front.nz * offset * t, other.points) >= 0.6));
      if (!clear) continue;
      const h = item.height || 8;
      return {
        x, y: Math.min(Math.max(h * 0.48, 4.5), 8.5), z,
        lookX: front.mx, lookY: Math.min(Math.max(h * 0.5, 3.5), 8), lookZ: front.mz,
      };
    }
  }
  const len = Math.hypot(item.x, item.z);
  const ux = len > 0.5 ? item.x / len : 0;
  const uz = len > 0.5 ? item.z / len : 1;
  const lookY = Math.min(Math.max((item.height || 8) * 0.46, 2.4), 6.2);
  const directions = [[ux, uz], [-uz, ux], [uz, -ux], [-ux, -uz]];
  for (const radius of [Math.max(18, (item.height || 8) * 1.25), 24, 32, 40]) {
    for (const [dx, dz] of directions) {
      const x = item.x + dx * radius;
      const z = item.z + dz * radius;
      if (colliders.some((other) => distanceToRing(x, z, other.points) < 0.6)) continue;
      return { x, y: Math.min(Math.max((item.height || 8) + 6, 13), 24), z,
        lookX: item.x, lookY, lookZ: item.z };
    }
  }
  // The last resort stays above the roof, even where dense footprints leave
  // no valid horizontal camera location.
  return {
    x: item.x + ux * 13,
    y: Math.min(Math.max((item.height || 8) + 10, 16), 28),
    z: item.z + uz * 13,
    lookX: item.x,
    lookY,
    lookZ: item.z,
  };
}
