import * as THREE from "three";
import { makeRoadWordTexture } from "./textures.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { nearestRoad } from "./geo.js";

export function roadWidth(highway) {
  if (highway === "secondary") return 12;
  if (highway === "tertiary") return 9.2;
  if (highway === "residential" || highway === "unclassified") return 6.6;
  if (highway === "living_street" || highway === "pedestrian") return 5.5;
  if (highway === "service") return 4.2;
  return 0;
}

export function segmentIntersect(a, b, c, d) {
  const ax = b.x - a.x;
  const az = b.z - a.z;
  const cx = d.x - c.x;
  const cz = d.z - c.z;
  const den = ax * cz - az * cx;
  if (Math.abs(den) < 1e-8) return null;
  const t = ((c.x - a.x) * cz - (c.z - a.z) * cx) / den;
  const u = ((c.x - a.x) * az - (c.z - a.z) * ax) / den;
  if (t < -0.02 || t > 1.02 || u < -0.02 || u > 1.02) return null;
  return {
    x: a.x + ax * t,
    z: a.z + az * t,
    t,
    ax: ax / (Math.hypot(ax, az) || 1),
    az: az / (Math.hypot(ax, az) || 1),
    bx: cx / (Math.hypot(cx, cz) || 1),
    bz: cz / (Math.hypot(cx, cz) || 1),
  };
}

export function findIntersections(roads) {
  const usable = (roads || []).filter((r) => roadWidth(r.highway) >= 5.4);
  const raw = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i];
      const b = usable[j];
      const ap = a.pts || [];
      const bp = b.pts || [];
      for (let ai = 0; ai < ap.length - 1; ai++) {
        for (let bi = 0; bi < bp.length - 1; bi++) {
          const hit = segmentIntersect(ap[ai], ap[ai + 1], bp[bi], bp[bi + 1]);
          if (hit) raw.push({ ...hit, a, b });
        }
      }
    }
  }
  const clustered = [];
  for (const p of raw) {
    const near = clustered.find((q) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 8 * 8);
    if (near) continue;
    clustered.push(p);
  }
  return clustered;
}

function markMat(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    toneMapped: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

function addBox(group, x, z, y, sx, sy, sz, yaw, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  mesh.renderOrder = 3;
  group.add(mesh);
  return mesh;
}

/** ax,az 是沿路方向。Three.js 的 rotation.y = atan2(ax,az) 時，盒子局部 Z 沿著 (ax,az)，局部 X 橫過馬路。 */
export function zebraLayout(cx, cz, ax, az, roadW) {
  const len = Math.hypot(ax, az) || 1;
  const ux = ax / len;
  const uz = az / len;
  const yaw = Math.atan2(ux, uz);
  const thick = 0.45;
  const gap = 0.4;
  const n = 7;
  const across = Math.min(Math.max(roadW, 3.6), 10.5);
  const stripes = [];
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * (thick + gap);
    const wobble = Math.sin(cx * 0.17 + cz * 0.13 + i * 1.7) * 0.03;
    stripes.push({
      x: cx + ux * t,
      z: cz + uz * t,
      sx: across + wobble,
      sz: thick,
      yaw,
    });
  }
  return stripes;
}

export function pairZebraCrossings(points) {
  const zebras = (points || []).filter((p) => p.markings === "zebra");
  const used = new Set();
  const pairs = [];
  for (let i = 0; i < zebras.length; i++) {
    if (used.has(i)) continue;
    let best = null;
    for (let j = i + 1; j < zebras.length; j++) {
      if (used.has(j)) continue;
      const d = Math.hypot(zebras[i].x - zebras[j].x, zebras[i].z - zebras[j].z);
      if (d < 5.5 || d > 16) continue;
      if (!best || d < best.d) best = { j, d };
    }
    if (!best) continue;
    used.add(i);
    used.add(best.j);
    const a = zebras[i];
    const b = zebras[best.j];
    const px = b.x - a.x;
    const pz = b.z - a.z;
    const span = Math.hypot(px, pz) || 1;
    pairs.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      ax: -pz / span,
      az: px / span,
      roadW: Math.min(Math.max(span * 0.78, 3.6), 10.5),
    });
  }
  return { pairs, singles: zebras.filter((_, i) => !used.has(i)) };
}

export function shopFrontHasZebra(points, radius = 12) {
  const r2 = radius * radius;
  return (points || []).some((p) => p.x * p.x + p.z * p.z < r2);
}

export function addZebraCrossing(group, cx, cz, ax, az, roadW, white, tactile) {
  const stripes = zebraLayout(cx, cz, ax, az, roadW);
  for (const s of stripes) addBox(group, s.x, s.z, 0.034, s.sx, 0.012, s.sz, s.yaw, white);
  if (tactile && stripes[0]) {
    const len = Math.hypot(ax, az) || 1;
    const ux = ax / len;
    const uz = az / len;
    const yaw = stripes[0].yaw;
    const acrossX = uz;
    const acrossZ = -ux;
    const across = stripes[0].sx;
    const along = (stripes.length - 1) * 0.85 + 0.45;
    for (const side of [-1, 1]) {
      addBox(
        group,
        cx + acrossX * side * (across / 2 + 0.2),
        cz + acrossZ * side * (across / 2 + 0.2),
        0.028,
        0.34,
        0.01,
        along,
        yaw,
        tactile
      );
    }
  }
  return stripes.length;
}

/** 路緣石貼在柏油邊緣。高度只有 12 公分，不參與走路碰撞。 */
export function createCurbs(roads, config) {
  const geoms = [];
  const radius = config.radiusMeters || 200;
  const r2 = (radius + 15) ** 2;
  for (const road of roads || []) {
    if (road.highway === "pedestrian" || road.highway === "footway" || road.highway === "path") continue;
    const full = roadWidth(road.highway);
    if (full < 4) continue;
    const half = Math.max(3.1, full * 0.7) / 2;
    const pts = road.pts || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1.6) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (mx * mx + mz * mz > r2) continue;
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const yaw = Math.atan2(ux, uz);
      const nx = -uz;
      const nz = ux;
      for (const side of [-1, 1]) {
        const geo = new THREE.BoxGeometry(0.16, 0.12, Math.max(len - 0.2, 0.4));
        geo.translate(0, 0.075, 0);
        geo.rotateY(yaw);
        geo.translate(mx + nx * side * (half + 0.04), 0, mz + nz * side * (half + 0.04));
        geoms.push(geo);
      }
    }
  }
  const group = new THREE.Group();
  group.name = "curbs";
  if (!geoms.length) return group;
  const merged = mergeGeometries(geoms, false);
  for (const geo of geoms) geo.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: 0xcfc8bc }));
  mesh.name = "curb-mesh";
  group.add(mesh);
  return group;
}

const ROAD_CORNER = { x: 41.4, z: -26.1 };

// 2019-11-29 Mapillary 824649271764118 shows a weathered double-yellow line
// beyond the 春日路/鎮撫街 junction, looking north. This is a short, estimated
// OSM-aligned rendering there, NOT a survey of the #46 frontage or 2026 paint.
const SPRING_SOURCE_WAY = "way/5118000";
const SPRING_NORTH = { x: -0.325, z: -0.946 };
const SPRING_LINE_WINDOWS = [[18, 32], [44, 58]]; // keep the 110 road text clear

/** Conservative paint plan: only the documented 春日路 corridor, never 鎮撫街. */
export function planSpringCenterline(roads, zebraPoints = []) {
  const strips = [];
  for (const road of roads || []) {
    if (road.id !== SPRING_SOURCE_WAY || road.name !== "春日路" || road.highway !== "tertiary") continue;
    const pts = road.pts || [];
    // If the OSM line moves materially, fail closed instead of painting an unrelated street.
    if (!pts.some((p) => Math.hypot(p.x - ROAD_CORNER.x, p.z - ROAD_CORNER.z) < 2.5)) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const da = (a.x - ROAD_CORNER.x) * SPRING_NORTH.x + (a.z - ROAD_CORNER.z) * SPRING_NORTH.z;
      const db = (b.x - ROAD_CORNER.x) * SPRING_NORTH.x + (b.z - ROAD_CORNER.z) * SPRING_NORTH.z;
      if (Math.abs(db - da) < 0.01) continue;
      for (const [from, to] of SPRING_LINE_WINDOWS) {
        const startD = Math.max(Math.min(da, db), from);
        const endD = Math.min(Math.max(da, db), to);
        if (endD - startD < 2) continue;
        const lerp = (d) => {
          const t = (d - da) / (db - da);
          return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        };
        const start = lerp(startD);
        const end = lerp(endD);
        const len = Math.hypot(end.x - start.x, end.z - start.z);
        if (len < 2) continue;
        const cx = (start.x + end.x) / 2;
        const cz = (start.z + end.z) / 2;
        const calibratedX = ROAD_CORNER.x + SPRING_NORTH.x * (startD + endD) / 2;
        const calibratedZ = ROAD_CORNER.z + SPRING_NORTH.z * (startD + endD) / 2;
        if (Math.hypot(cx - calibratedX, cz - calibratedZ) > 4) continue;
        // A new or moved crossing must remove the entire patch rather than paint through it.
        if (zebraPoints.some((p) => Math.hypot(p.x - cx, p.z - cz) < len / 2 + 9)) continue;
        const ux = (end.x - start.x) / len;
        const uz = (end.z - start.z) / len;
        for (const side of [-1, 1]) {
          strips.push({
            x: cx - uz * side * 0.13,
            z: cz + ux * side * 0.13,
            yaw: Math.atan2(ux, uz),
            length: len,
            width: 0.08,
            fromMeters: startD,
            toMeters: endD,
            roadId: road.id,
          });
        }
      }
    }
  }
  return strips;
}

function addSpringCenterline(group, strips) {
  if (!strips.length) return;
  const geoms = strips.map((s) => {
    const geo = new THREE.BoxGeometry(s.width, 0.006, s.length);
    geo.rotateY(s.yaw);
    geo.translate(s.x, -0.014, s.z); // 3 mm above the y=-0.02 ground plane; no zebra overlap
    return geo;
  });
  const merged = mergeGeometries(geoms, false);
  for (const geo of geoms) geo.dispose();
  const mesh = new THREE.Mesh(merged, markMat(0xbba35b, 0.78));
  mesh.name = "spring-road-centerline-2019-estimate";
  mesh.renderOrder = 3;
  mesh.userData = { kind: "estimated-road-line", source: "Mapillary 824649271764118, 2019-11-29", location: "春日路" };
  group.add(mesh);
}

/** 110 只出現在春日路與鎮撫街路口附近；鎮撫只出現在鎮撫街靠近 46 號的這一段。 */
export function planRoadWords(roads) {
  const words = [];
  for (const road of roads || []) {
    const name = road.name || "";
    const pts = road.pts || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 8) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      if (name === "春日路" && Math.hypot(mx - ROAD_CORNER.x, mz - ROAD_CORNER.z) < 42) {
        words.push({ text: "110", x: mx, z: mz, yaw });
      }
      if (name === "鎮撫街" && Math.hypot(mx, mz) < 78) {
        const copies = Math.max(1, Math.min(4, Math.round(len / 32)));
        for (let k = 0; k < copies; k++) {
          const t = (k + 0.5) / copies;
          words.push({
            text: "鎮撫",
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
            yaw,
          });
        }
      }
    }
  }
  return words;
}

export function createRoadMarkings(roads, config, crossings = []) {
  const group = new THREE.Group();
  group.name = "road-markings";
  const radius = config.radiusMeters || 200;
  const r2 = (radius + 40) ** 2;
  const white = markMat(0xd8d4cc, 0.92);
  const tactile = markMat(0xd6ae3a, 0.9);
  let stripes = 0;
  const zebraPoints = [];

  const local = (crossings || []).filter(
    (p) => p.markings === "zebra" && Number.isFinite(p.x) && Number.isFinite(p.z) && p.x * p.x + p.z * p.z <= r2
  );
  const { pairs, singles } = pairZebraCrossings(local);

  function occupied(x, z) {
    return zebraPoints.some((s) => (s.x - x) ** 2 + (s.z - z) ** 2 < 4.2 * 4.2);
  }

  for (const p of pairs) {
    if (occupied(p.x, p.z)) continue;
    stripes += addZebraCrossing(group, p.x, p.z, p.ax, p.az, p.roadW, white, tactile);
    zebraPoints.push({ x: p.x, z: p.z });
  }

  for (const s of singles) {
    if (occupied(s.x, s.z)) continue;
    const road = nearestRoad(s.x, s.z, roads);
    const dist = Math.sqrt(road.d);
    if (!Number.isFinite(dist) || dist > 14) continue;
    stripes += addZebraCrossing(group, s.x, s.z, road.ax, road.az, 5.2, white, tactile);
    zebraPoints.push({ x: s.x, z: s.z });
  }

  const centerlineStrips = planSpringCenterline(roads, zebraPoints);
  addSpringCenterline(group, centerlineStrips);

  let words = 0;
  if (typeof document !== "undefined") {
    for (const word of planRoadWords(roads)) {
      const tex = makeRoadWordTexture(word.text);
      const width = word.text === "110" ? 7.2 : 8.4;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, 2.6),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -word.yaw;
      mesh.position.set(word.x, 0.09, word.z);
      mesh.userData = { kind: "road-text", text: word.text };
      group.add(mesh);
      words += 1;
    }
  }

  return {
    group,
    crossings: zebraPoints.length,
    stripes,
    dashes: 0,
    arrows: 0,
    words,
    centerlineStrips: centerlineStrips.length,
    zebraPoints,
    shopZebra: shopFrontHasZebra(zebraPoints, 12),
  };
}
