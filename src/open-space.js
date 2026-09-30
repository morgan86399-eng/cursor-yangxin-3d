import * as THREE from "three";
import { distanceToRing, pointInRing } from "./geo.js";

/** Walk clamp for the park slice. The decorative 200 m ring stays; this only lets feet reach 朝陽公園. */
export const PARK_WALK_REACH = 258;
const PARK_PAD_LIMIT = PARK_WALK_REACH - 14;

export function planParkWaypoints(ring, parking, options = {}) {
  const pts = openPts(ring);
  const limit = Number.isFinite(options.limit) ? options.limit : PARK_PAD_LIMIT;
  const colliders = options.colliders || [];
  if (pts.length < 3 || !Number.isFinite(parking?.x) || !Number.isFinite(parking?.z)) return null;
  if (Math.hypot(parking.x, parking.z) > limit) return null;
  const gate = pickGate(pts, limit, colliders);
  if (!gate) return null;
  const far = pickFar(pts, gate, parking, limit, colliders);
  if (!far) return null;
  return {
    ring: pts.map((point) => ({ x: point.x, z: point.z })),
    waypoints: [
      { id: "gate", label: "公園入口", x: gate.x, z: gate.z },
      { id: "far", label: "公園另一側", x: far.x, z: far.z },
      { id: "parking", label: "停車場", x: parking.x, z: parking.z },
    ],
  };
}

function withinPadLimit(x, z, limit) {
  return Math.hypot(x, z) <= limit;
}

function pickGate(pts, limit, colliders) {
  const boundary = closestBoundaryPoint(pts, 0, 0);
  const center = centroidOf(pts);
  if (!boundary) return null;
  const dx = center.x - boundary.x;
  const dz = center.z - boundary.z;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  for (let inset = 3.5; inset <= 16; inset += 0.5) {
    for (const side of [0, 2.4, -2.4, 4.6, -4.6]) {
      const x = boundary.x + ux * inset + px * side;
      const z = boundary.z + uz * inset + pz * side;
      if (!withinPadLimit(x, z, limit)) continue;
      if (!pointInRing(x, z, pts) || edgeDistance(x, z, pts) < 2.2) continue;
      if (blocked(x, z, colliders, 1.1)) continue;
      return { x, z, ux, uz, px, pz };
    }
  }
  return null;
}

function pickFar(pts, gate, parking, limit, colliders) {
  const dirs = [
    { x: gate.ux, z: gate.uz },
    { x: gate.ux * 0.75 + gate.px * 0.66, z: gate.uz * 0.75 + gate.pz * 0.66 },
    { x: gate.ux * 0.75 - gate.px * 0.66, z: gate.uz * 0.75 - gate.pz * 0.66 },
    { x: gate.px, z: gate.pz },
    { x: -gate.px, z: -gate.pz },
  ];
  let best = null;
  for (const dir of dirs) {
    const len = Math.hypot(dir.x, dir.z) || 1;
    const ux = dir.x / len;
    const uz = dir.z / len;
    const inward = ux * gate.ux + uz * gate.uz;
    for (let step = 14; step <= 80; step += 2) {
      const x = gate.x + ux * step;
      const z = gate.z + uz * step;
      if (!withinPadLimit(x, z, limit)) break;
      if (!pointInRing(x, z, pts) || edgeDistance(x, z, pts) < 3) break;
      if (blocked(x, z, colliders, 1.1)) continue;
      if (Math.hypot(x - parking.x, z - parking.z) < 8) continue;
      const ranked = inward * 1000 + step;
      if (!best || ranked > best.ranked) best = { x, z, ranked };
    }
  }
  return best;
}

function lotInteriorPoint(pts, limit) {
  const ring = openPts(pts);
  const near = closestBoundaryPoint(ring, 0, 0);
  const center = centroidOf(ring);
  if (
    pointInRing(center.x, center.z, ring)
    && withinPadLimit(center.x, center.z, limit)
    && edgeDistance(center.x, center.z, ring) >= 2
  ) {
    return center;
  }
  if (!near) return null;
  const dx = center.x - near.x;
  const dz = center.z - near.z;
  const len = Math.hypot(dx, dz) || 1;
  let best = null;
  for (let dist = 4; dist <= 48; dist += 1) {
    const x = near.x + (dx / len) * dist;
    const z = near.z + (dz / len) * dist;
    if (!withinPadLimit(x, z, limit)) break;
    if (!pointInRing(x, z, ring) || edgeDistance(x, z, ring) < 2) continue;
    best = { x, z };
  }
  return best;
}

/**
 * 朝陽公園與朝陽公園平面停車場。
 * 公園框是 OSM leisure=park（name 朝陽森林公園；桃園區公所導覽稱朝陽公園）。
 * 停車場框是 OSM way/540119340，operator 朝陽公園平面停車場。
 * 步道與車格是框內的示意配置，方便街景尺度辨認，不是實測座標。
 */

const CJK = "'Noto Sans TC','WenQuanYi Micro Hei','Droid Sans Fallback',sans-serif";
const shared = {};

function mat(key, color, extra = {}) {
  if (!shared[key]) shared[key] = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra });
  return shared[key];
}

function materials() {
  return {
    lawn: mat("lawn", 0x3f8a45),
    path: mat("path", 0xc6b48a),
    curb: mat("curb", 0x9aa097),
    trunk: mat("trunk", 0x5a4030),
    leaf: mat("leaf", 0x2f6b34),
    asphalt: mat("asphalt", 0x3c4046),
    stall: mat("stall", 0xe7e4dc),
    sign: mat("sign", 0x1d4c32),
  };
}

function hash01(i, j = 0) {
  const n = Math.sin(Number(i) * 127.1 + Number(j) * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function localRing(ring, project) {
  return (ring || []).map(([lon, lat]) => {
    const p = project.toLocal(lat, lon);
    return { x: p.x, z: p.z };
  });
}

function openPts(pts) {
  if (!pts || pts.length < 4) return [];
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.z - b.z) < 1e-4) return pts.slice(0, -1);
  return pts.slice();
}

function shapeFromPts(pts) {
  const ring = openPts(pts);
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(ring[0].x, -ring[0].z);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, -ring[i].z);
  return shape;
}

function centroidOf(pts) {
  const ring = openPts(pts);
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p.x;
    z += p.z;
  }
  const n = Math.max(ring.length, 1);
  return { x: x / n, z: z / n };
}

function edgeDistance(x, z, pts) {
  const ring = openPts(pts);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)));
  }
  return best;
}

function axesOf(pts) {
  const ring = openPts(pts);
  const c = centroidOf(pts);
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const p of ring) {
    const x = p.x - c.x;
    const z = p.z - c.z;
    xx += x * x;
    zz += z * z;
    xz += x * z;
  }
  const ang = 0.5 * Math.atan2(2 * xz, xx - zz);
  const major = { x: Math.cos(ang), z: Math.sin(ang) };
  const minor = { x: -major.z, z: major.x };
  let majorSpan = 0;
  let minorSpan = 0;
  for (const p of ring) {
    majorSpan = Math.max(majorSpan, Math.abs((p.x - c.x) * major.x + (p.z - c.z) * major.z));
    minorSpan = Math.max(minorSpan, Math.abs((p.x - c.x) * minor.x + (p.z - c.z) * minor.z));
  }
  if (minorSpan > majorSpan) return { c, major: minor, minor: major, majorSpan: minorSpan, minorSpan: majorSpan };
  return { c, major, minor, majorSpan, minorSpan };
}

function closestBoundaryPoint(pts, x, z) {
  const ring = openPts(pts);
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + vx * t;
    const pz = a.z + vz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (!best || d < best.d) best = { d, x: px, z: pz };
  }
  return best;
}

function addSurface(parent, pts, y, material, name) {
  const shape = shapeFromPts(pts);
  if (!shape) return null;
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function ribbon(samples, width, y) {
  const positions = [];
  const indices = [];
  let v = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.4 || len > 8) continue;
    const nx = (a.z - b.z) / len;
    const nz = (b.x - a.x) / len;
    const hw = width / 2;
    positions.push(
      a.x + nx * hw, y, a.z + nz * hw,
      a.x - nx * hw, y, a.z - nz * hw,
      b.x - nx * hw, y, b.z - nz * hw,
      b.x + nx * hw, y, b.z + nz * hw
    );
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function sampleAxis(pts, origin, dir, half, inset) {
  const out = [];
  for (let t = -half; t <= half; t += 2.4) {
    const x = origin.x + dir.x * t;
    const z = origin.z + dir.z * t;
    if (!pointInRing(x, z, pts)) continue;
    if (edgeDistance(x, z, pts) < inset) continue;
    out.push({ x, z });
  }
  return out;
}

function blocked(x, z, colliders, rad = 1.2) {
  for (const c of colliders || []) {
    if (x < c.minX - rad || x > c.maxX + rad || z < c.minZ - rad || z > c.maxZ + rad) continue;
    if (pointInRing(x, z, c.points || [])) return true;
    if (distanceToRing(x, z, c.points || []) < rad) return true;
  }
  return false;
}

function pathDistance(x, z, samples) {
  let best = Infinity;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (Math.hypot(b.x - a.x, b.z - a.z) > 8) continue;
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz || 1;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t)));
  }
  return best;
}

function addSign(parent, text, x, y, z, yaw, name) {
  const m = materials();
  let boardMat = m.sign;
  if (typeof document !== "undefined") {
    const key = `board:${text}`;
    if (!shared[key]) {
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#1d4c32";
      ctx.fillRect(0, 0, 768, 256);
      ctx.strokeStyle = "#f3efe4";
      ctx.lineWidth = 12;
      ctx.strokeRect(10, 10, 748, 236);
      ctx.fillStyle = "#f7f3e8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${text.length > 8 ? 58 : 76}px ${CJK}`;
      ctx.fillText(text, 384, 136);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      shared[key] = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    }
    boardMat = shared[key];
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(Math.min(7.2, 1.1 + text.length * 0.42), 1.15, 0.1), boardMat);
  board.position.set(x, y, z);
  board.rotation.y = yaw;
  board.name = name;
  board.userData = { text, estimated: true };
  parent.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, y, 0.12), m.curb);
  post.position.set(x, y / 2, z);
  parent.add(post);
  return board;
}

export function isDetailedPark(green) {
  const kind = String(green?.kind || "");
  return kind === "park" || kind === "garden";
}

export function parkDisplayName(green) {
  if (!isDetailedPark(green)) return "";
  if (/朝陽/.test(green?.name || "")) return "朝陽公園";
  return green.name || "公園";
}

export function parkingDisplayName(lot) {
  const blob = `${lot?.name || ""} ${lot?.operator || ""}`.trim();
  if (/朝陽公園/.test(blob)) return "朝陽公園停車場";
  if (lot?.name) return lot.name;
  if (/停車/.test(lot?.operator || "")) return lot.operator;
  if (lot?.ring?.length >= 4) return "停車場";
  return "";
}

function addPark(parent, green, project, radius, colliders) {
  const label = parkDisplayName(green);
  if (!label) return null;
  const pts = localRing(green.ring, project);
  if (openPts(pts).length < 3) return null;
  if (distanceToRing(0, 0, pts) > radius + 80) return null;
  const m = materials();
  const group = new THREE.Group();
  group.name = label === "朝陽公園" ? "chaoyang-park" : "park";
  addSurface(group, pts, 0.045, m.lawn, "park-lawn");

  const n = openPts(pts).length;
  const curbPos = [];
  const curbIdx = [];
  let v = 0;
  const ring = openPts(pts);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.4) continue;
    if (Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2) > radius + 70) continue;
    curbPos.push(a.x, 0.05, a.z, b.x, 0.05, b.z, b.x, 0.22, b.z, a.x, 0.22, a.z);
    curbIdx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  if (curbPos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(curbPos, 3));
    geo.setIndex(curbIdx);
    geo.computeVertexNormals();
    const curb = new THREE.Mesh(geo, m.curb);
    curb.name = "park-curb";
    group.add(curb);
  }

  const axes = axesOf(pts);
  const majorSamples = sampleAxis(pts, axes.c, axes.major, axes.majorSpan, 3.2);
  const minorSamples = sampleAxis(pts, axes.c, axes.minor, axes.minorSpan, 3.2);
  const pathSamples = majorSamples.concat(minorSamples);
  const pathGeo = ribbon(majorSamples, 2.5, 0.07);
  const crossGeo = ribbon(minorSamples, 1.8, 0.075);
  let pathSegments = 0;
  if (pathGeo) {
    const mesh = new THREE.Mesh(pathGeo, m.path);
    mesh.name = "park-path";
    group.add(mesh);
    pathSegments += majorSamples.length;
  }
  if (crossGeo) {
    const mesh = new THREE.Mesh(crossGeo, m.path);
    mesh.name = "park-path";
    group.add(mesh);
    pathSegments += minorSamples.length;
  }

  const spots = [];
  const reach = radius + 55;
  for (let i = -axes.majorSpan; i <= axes.majorSpan; i += 9) {
    for (let j = -axes.minorSpan; j <= axes.minorSpan; j += 9) {
      const jitter = (hash01(i + 3, j) - 0.5) * 2.2;
      const x = axes.c.x + axes.major.x * i + axes.minor.x * (j + jitter);
      const z = axes.c.z + axes.major.z * i + axes.minor.z * (j + jitter);
      if (x * x + z * z > reach * reach) continue;
      if (!pointInRing(x, z, pts) || edgeDistance(x, z, pts) < 3.4) continue;
      if (pathDistance(x, z, pathSamples) < 2.3) continue;
      if (blocked(x, z, colliders, 1.4)) continue;
      spots.push({ x, z, s: 0.85 + hash01(i, j + 1) * 0.45, d: x * x + z * z });
    }
  }
  spots.sort((a, b) => a.d - b.d);
  spots.splice(42);
  if (spots.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.16, 1.7, 5);
    const leafGeo = new THREE.SphereGeometry(1.05, 6, 5);
    const trunks = new THREE.InstancedMesh(trunkGeo, m.trunk, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, m.leaf, spots.length);
    trunks.name = "park-trees";
    leaves.name = "park-trees";
    const dummy = new THREE.Object3D();
    spots.forEach((spot, index) => {
      dummy.position.set(spot.x, 0.85, spot.z);
      dummy.scale.set(spot.s, 0.9 + hash01(index, 2) * 0.35, spot.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(spot.x, 2.15 * spot.s, spot.z);
      dummy.scale.set(spot.s, spot.s * 0.72, spot.s);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    group.add(trunks);
    group.add(leaves);
  }

  const near = closestBoundaryPoint(pts, 0, 0);
  const c = centroidOf(pts);
  if (near) {
    const dx = c.x - near.x;
    const dz = c.z - near.z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const sx = near.x + ux * 4.2;
    const sz = near.z + uz * 4.2;
    if (pointInRing(sx, sz, pts)) {
      const yaw = Math.atan2(-ux, -uz);
      addSign(group, label, sx, 1.7, sz, yaw, "park-sign");
    }
    const px = -uz;
    const pz = ux;
    for (const side of [-1.55, 1.55]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.35, 0.24), m.sign);
      post.position.set(near.x + px * side, 1.18, near.z + pz * side);
      post.name = "park-gate";
      group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.18), m.sign);
    beam.position.set(near.x, 2.28, near.z);
    beam.rotation.y = Math.atan2(px, pz);
    beam.name = "park-gate";
    group.add(beam);
  }

  group.userData = {
    name: label,
    osmName: green.name || "朝陽森林公園",
    osmId: green.id,
    role: "park",
    trees: spots.length,
    paths: pathSegments,
    pathsEstimated: true,
  };
  const focus = spots[Math.min(6, Math.max(spots.length - 1, 0))] || near || c;
  const view = {
    x: focus.x + 34,
    y: 28,
    z: focus.z + 26,
    lookX: focus.x - 10,
    lookY: 1.2,
    lookZ: focus.z - 6,
  };
  parent.add(group);
  return { group, view, ring: pts };
}

function addParking(parent, lot, project, radius) {
  const label = parkingDisplayName(lot);
  if (!label) return null;
  const pts = localRing(lot.ring, project);
  if (openPts(pts).length < 3) return null;
  if (distanceToRing(0, 0, pts) > radius + 80) return null;
  const m = materials();
  const group = new THREE.Group();
  group.name = "chaoyang-parking";
  addSurface(group, pts, 0.05, m.asphalt, "parking-surface");

  const axes = axesOf(pts);
  const positions = [];
  const indices = [];
  let stalls = 0;
  let v = 0;
  for (let t = -axes.majorSpan + 2.2; t <= axes.majorSpan - 2.2; t += 2.55) {
    const ox = axes.c.x + axes.major.x * t;
    const oz = axes.c.z + axes.major.z * t;
    let lo = 0;
    let hi = 0;
    for (const dir of [-1, 1]) {
      let reach = 0;
      for (let s = 0.4; s < axes.minorSpan; s += 0.4) {
        const x = ox + axes.minor.x * dir * s;
        const z = oz + axes.minor.z * dir * s;
        if (!pointInRing(x, z, pts) || edgeDistance(x, z, pts) < 0.45) break;
        reach = s;
      }
      if (dir < 0) lo = reach;
      else hi = reach;
    }
    if (lo + hi < 4.2) continue;
    const a = { x: ox - axes.minor.x * lo, z: oz - axes.minor.z * lo };
    const b = { x: ox + axes.minor.x * hi, z: oz + axes.minor.z * hi };
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = (a.z - b.z) / len;
    const nz = (b.x - a.x) / len;
    const hw = 0.07;
    const y = 0.08;
    positions.push(
      a.x + nx * hw, y, a.z + nz * hw,
      a.x - nx * hw, y, a.z - nz * hw,
      b.x - nx * hw, y, b.z - nz * hw,
      b.x + nx * hw, y, b.z + nz * hw
    );
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
    stalls += 1;
  }
  if (positions.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const lines = new THREE.Mesh(geo, m.stall);
    lines.name = "parking-stalls";
    lines.userData = { stalls, estimated: true };
    group.add(lines);
  }

  const near = closestBoundaryPoint(pts, 0, 0);
  const c = centroidOf(pts);
  const marker = lotInteriorPoint(pts, PARK_PAD_LIMIT);
  if (marker && near) {
    const dx = near.x - marker.x;
    const dz = near.z - marker.z;
    const len = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx / len, dz / len);
    addSign(group, label, marker.x, 1.55, marker.z, yaw, "parking-sign");
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8), m.sign);
    pole.position.set(marker.x, 1.3, marker.z);
    pole.name = "parking-marker";
    pole.userData = { role: "parking", text: label, estimated: true };
    group.add(pole);
  }
  group.userData = {
    name: label,
    operator: lot.operator || "",
    osmId: lot.id,
    role: "parking",
    stalls,
    stallsEstimated: true,
  };
  const view = {
    x: (near?.x ?? c.x) + 32,
    y: 26,
    z: (near?.z ?? c.z) + 24,
    lookX: c.x + 6,
    lookY: 0.2,
    lookZ: c.z,
  };
  parent.add(group);
  return { group, view, stalls, marker };
}

export function createOpenSpace(osm, parkingLots, project, radius, colliders = []) {
  const group = new THREE.Group();
  group.name = "open-space";
  const views = {};
  let trees = 0;
  let stalls = 0;
  let parkName = "";
  let parkingName = "";
  let parkRing = null;
  let parkingMarker = null;
  for (const green of osm?.greens || []) {
    const built = addPark(group, green, project, radius, colliders);
    if (!built) continue;
    parkName = built.group.userData.name;
    trees += built.group.userData.trees || 0;
    if (built.view) views.park = built.view;
    if (built.ring && built.group.userData.name === "朝陽公園") parkRing = built.ring;
  }
  for (const lot of parkingLots || []) {
    const built = addParking(group, lot, project, radius);
    if (!built) continue;
    parkingName = built.group.userData.name;
    stalls += built.stalls || 0;
    if (built.view && !views.parking) views.parking = built.view;
    if (built.marker && built.group.userData.name === "朝陽公園停車場") parkingMarker = built.marker;
  }
  const quest = planParkWaypoints(parkRing, parkingMarker, { colliders });
  group.userData = { parkName, parkingName, trees, stalls, quest };
  return { group, views, parkName, parkingName, trees, stalls, quest };
}
