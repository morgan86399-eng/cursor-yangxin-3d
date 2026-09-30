import * as THREE from "three";
import { pointInRing, streetFacingEdge } from "./geo.js";

/**
 * 鎮撫宮以外的宮廟與里活動中心。
 * OSM 的 building:levels=1 會把朝陽宮壓成 3 公尺店屋殼；這裡改成可讀的廟宇／公共量體，
 * 輪廓仍用既有建物框，高度標成推估，不假裝是實測。
 */

const CJK = "'Noto Sans TC','WenQuanYi Micro Hei','Droid Sans Fallback',sans-serif";
const plaqueCache = new Map();

const shared = {};

function mat(key, color) {
  if (!shared[key]) {
    shared[key] = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  }
  return shared[key];
}

function materials() {
  return {
    taoistWall: mat("taoistWall", 0x8e241c),
    buddhistWall: mat("buddhistWall", 0xc4a882),
    stone: mat("stone", 0xb7b3ac),
    dark: mat("dark", 0x1a120e),
    gold: mat("gold", 0xe2b43a),
    lantern: mat("lantern", 0xd31820),
    civicWall: mat("civicWall", 0xd7d3cb),
    civicBand: mat("civicBand", 0xb7c3c8),
    civicGlass: mat("civicGlass", 0x6e8c9a),
    civicRoof: mat("civicRoof", 0x8e9390),
    marketAwning: mat("marketAwning", 0xc4552a),
    marketWall: mat("marketWall", 0xe6d3b0),
    roof: mat("roof", 0xffffff),
  };
}

materials().roof.vertexColors = true;

function plaqueTexture(text) {
  if (typeof document === "undefined") return null;
  if (plaqueCache.has(text)) return plaqueCache.get(text);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a120c";
  ctx.fillRect(0, 0, 1024, 280);
  ctx.strokeStyle = "#e2b43a";
  ctx.lineWidth = 16;
  ctx.strokeRect(12, 12, 1000, 256);
  ctx.fillStyle = "#f0d56a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = text.length > 10 ? 58 : text.length > 6 ? 78 : 108;
  ctx.font = `700 ${size}px ${CJK}`;
  ctx.fillText(text, 512, 148);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  plaqueCache.set(text, tex);
  return tex;
}

function plaqueMaterial(text) {
  const tex = plaqueTexture(text);
  if (!tex) return mat("plaqueFallback", 0x1a120c);
  const key = `plaque:${text}`;
  if (!shared[key]) {
    shared[key] = new THREE.MeshLambertMaterial({ map: tex, color: 0xffffff, side: THREE.DoubleSide });
  }
  return shared[key];
}

function openCount(pts) {
  if (!pts || pts.length < 2) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.z - b.z) < 1e-4) return pts.length - 1;
  return pts.length;
}

function frameFromEdge(edge) {
  const out = { x: edge.nx, z: edge.nz };
  const right = { x: out.z, z: -out.x };
  const mid = { x: edge.mx, z: edge.mz };
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(right.x, 0, right.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(out.x, 0, out.z)
  );
  const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
  function place(x, y, zOut) {
    return new THREE.Vector3(mid.x + right.x * x + out.x * zOut, y, mid.z + right.z * x + out.z * zOut);
  }
  function project(p) {
    const dx = p.x - mid.x;
    const dz = p.z - mid.z;
    return { x: dx * right.x + dz * right.z, z: dx * out.x + dz * out.z };
  }
  return { out, right, mid, place, project, quat };
}

function extentInFrame(pts, frame) {
  const n = openCount(pts);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = frame.project(pts[i]);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

function addPerimeter(parent, pts, y0, y1, material, name) {
  const n = openCount(pts);
  const positions = [];
  const indices = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.3) continue;
    positions.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z);
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addBox(parent, name, size, x, y, zOut, material, frame, userData) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.copy(frame.place(x, y, zOut));
  mesh.quaternion.copy(frame.quat);
  if (name) mesh.name = name;
  if (userData) mesh.userData = userData;
  parent.add(mesh);
  return mesh;
}

function addCurvedRoof(parent, frame, x0, x1, z0, z1, eaveY, rise, name) {
  const cols = 14;
  const rows = 8;
  const positions = [];
  const colors = [];
  const indices = [];
  const orange = new THREE.Color("#e07a2e");
  const gold = new THREE.Color("#f0c14a");
  const shadow = new THREE.Color("#a34d18");
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const z = z0 + (z1 - z0) * v;
    const along = Math.abs(v - 0.5) * 2;
    const ridgeT = 1 - along;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = x0 + (x1 - x0) * u;
      const end = Math.abs(u - 0.5) * 2;
      let y = eaveY + rise * ridgeT * (1 - end ** 1.6 * 0.35);
      y += end ** 1.4 * (1 - ridgeT) * 0.85;
      y += end ** 2.2 * ridgeT * 1.15;
      const p = frame.place(x, y, z);
      positions.push(p.x, p.y, p.z);
      const col = orange.clone();
      if (ridgeT > 0.86) col.lerp(gold, (ridgeT - 0.86) / 0.14);
      if (j % 2 === 1) col.multiplyScalar(0.9);
      if (j % 4 === 3) col.lerp(shadow, 0.22);
      colors.push(col.r, col.g, col.b);
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, materials().roof);
  mesh.name = name;
  parent.add(mesh);
  let peak = eaveY;
  for (let i = 1; i < positions.length; i += 3) peak = Math.max(peak, positions[i]);
  return { mesh, peak };
}

function makeCollider(id, pts, height, storey) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { id, points: pts, minX, maxX, minZ, maxZ, height, storey, isShop: false, shops: [] };
}

function viewFrom(edge, dist, y, lookY, side = 0) {
  const rx = edge.nz;
  const rz = -edge.nx;
  return {
    x: edge.mx + edge.nx * dist + rx * side,
    y,
    z: edge.mz + edge.nz * dist + rz * side,
    lookX: edge.mx - rx * side * 0.15,
    lookY,
    lookZ: edge.mz - rz * side * 0.15,
  };
}

export function worshipSpecFor(b) {
  if (!b) return null;
  const name = String(b.name || "");
  const amenity = String(b.tags?.amenity || "");
  const religious = b.building === "temple"
    || b.building === "religious"
    || amenity === "place_of_worship"
    || /宮|殿|蓮社/.test(name);
  if (!religious || !name || name === "鎮撫宮") return null;
  return {
    id: b.id,
    name,
    tradition: /殿|蓮社|佛/.test(name) ? "buddhist" : "taoist",
  };
}

export function civicSpecFor(b) {
  if (!b) return null;
  const name = String(b.name || "");
  const amenity = String(b.tags?.amenity || "");
  if (amenity === "police" || /派出所/.test(name)) return null;
  if (amenity !== "community_centre" && !/活動中心|集會所/.test(name)) return null;
  if (!name) return null;
  const height = Number(b.height) > 3 ? Number(b.height) : 6;
  return { id: b.id, name, height };
}

export function marketSpecFor(b) {
  if (!b) return null;
  const name = String(b.name || "");
  const amenity = String(b.tags?.amenity || "");
  if (amenity !== "marketplace" && !/市場/.test(name)) return null;
  if (!name) return null;
  const height = Number(b.height) > 4 ? Number(b.height) : 8;
  return { id: b.id, name, height };
}

export function createWorshipHall(pts, roads, spec) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || openCount(pts) < 3) return null;
  const m = materials();
  const frame = frameFromEdge(edge);
  const ext = extentInFrame(pts, frame);
  const width = Math.max(6, ext.maxX - ext.minX);
  const depth = Math.max(6, ext.maxZ - ext.minZ);
  const wallTop = spec.tradition === "buddhist" ? 5.4 : 5.15;
  const rise = Math.min(3.8, Math.max(1.9, Math.min(width, depth) * 0.18));
  const group = new THREE.Group();
  group.name = "worship-hall";
  const wallMat = spec.tradition === "buddhist" ? m.buddhistWall : m.taoistWall;
  addPerimeter(group, pts, 0.02, 0.72, m.stone, "worship-base");
  addPerimeter(group, pts, 0.72, wallTop, wallMat, "worship-walls");

  const half = Math.min(edge.len, width) / 2;
  const doorW = Math.min(2.4, Math.max(1.35, edge.len * 0.22));
  addBox(group, "worship-door", [doorW, 2.7, 0.12], 0, 0.72 + 1.35, 0.16, m.dark, frame);
  addBox(group, "worship-entrance", [doorW + 0.42, 3.05, 0.1], 0, 0.72 + 1.45, 0.28, m.gold, frame);
  addBox(group, "", [doorW + 0.28, 0.16, 0.16], 0, 0.72 + 2.78, 0.18, m.gold, frame);
  for (const side of [-1, 1]) {
    addBox(group, "worship-entrance", [0.28, 3.15, 0.28], side * (doorW / 2 + 0.32), 1.7, 0.55, m.stone, frame);
  }
  const censer = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.42, 8), m.gold);
  censer.position.copy(frame.place(0, 0.55, 1.85));
  censer.name = "worship-censer";
  group.add(censer);
  const plaqueW = Math.min(Math.max(3.2, spec.name.length * 0.72), Math.max(3.2, edge.len * 0.86));
  addBox(
    group,
    "worship-plaque",
    [plaqueW, 0.92, 0.1],
    0,
    wallTop - 0.15,
    0.28,
    plaqueMaterial(spec.name),
    frame,
    { role: "plaque", text: spec.name }
  );
  addBox(group, "", [width + 0.4, 0.22, 0.55], (ext.minX + ext.maxX) / 2, wallTop + 0.08, (ext.minZ + 0.2) / 2, m.gold, frame);

  const roof = addCurvedRoof(
    group,
    frame,
    ext.minX - 0.7,
    ext.maxX + 0.7,
    0.85,
    ext.minZ - 0.55,
    wallTop + 0.15,
    rise,
    "worship-roof"
  );
  const ridgeZ = (0.85 + ext.minZ - 0.55) / 2;
  const span = Math.min(half * 1.4, (ext.maxX - ext.minX) * 0.7);
  for (let i = 0; i < 5; i++) {
    const x = -span / 2 + (span * i) / 4;
    const fig = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 5), i % 2 ? m.gold : m.taoistWall);
    fig.position.copy(frame.place(x, roof.peak + 0.16, ridgeZ));
    fig.name = "worship-ridge";
    group.add(fig);
  }

  const lanternCount = width > 16 ? 4 : 2;
  const lanternXs = lanternCount === 2 ? [-half * 0.55, half * 0.55] : [-half * 0.72, -half * 0.28, half * 0.28, half * 0.72];
  for (const x of lanternXs) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), m.dark);
    cord.position.copy(frame.place(x, wallTop - 0.05, 0.85));
    group.add(cord);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), m.lantern);
    body.scale.set(1, 1.25, 1);
    body.position.copy(frame.place(x, wallTop - 0.42, 0.85));
    body.name = "worship-lantern";
    group.add(body);
  }

  addBox(group, "worship-steps", [Math.min(edge.len * 0.7, 6.5), 0.18, 1.15], 0, 0.1, 0.85, m.stone, frame);
  addBox(group, "worship-steps", [Math.min(edge.len * 0.5, 4.4), 0.16, 0.7], 0, 0.28, 1.45, m.stone, frame);
  addBox(group, "worship-eave", [Math.min(edge.len * 0.96, width + 0.6), 0.16, 0.72], 0, wallTop + 0.22, 0.55, m.gold, frame);

  const peak = roof.peak + 0.45;
  group.userData = {
    role: "worship",
    name: spec.name,
    tradition: spec.tradition,
    heightEstimated: true,
  };
  return {
    group,
    collider: makeCollider(spec.id, pts, peak, wallTop),
    view: viewFrom(edge, Math.max(20, Math.min(28, edge.len * 1.5)), 14, 4.2, Math.max(6, edge.len * 0.35)),
  };
}

export function createCivicHall(pts, roads, spec) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || openCount(pts) < 3) return null;
  const m = materials();
  const frame = frameFromEdge(edge);
  const height = spec.height;
  const group = new THREE.Group();
  group.name = "civic-hall";
  addPerimeter(group, pts, 0.02, 0.45, m.stone, "civic-base");
  addPerimeter(group, pts, 0.45, height - 0.28, m.civicWall, "civic-walls");
  addPerimeter(group, pts, height - 0.28, height, m.civicRoof, "civic-roof-edge");

  const n = openCount(pts);
  const positions = [];
  for (let i = 0; i < n; i++) positions.push(pts[i].x, height + 0.02, pts[i].z);
  if (positions.length >= 9) {
    const shapePts = [];
    for (let i = 0; i < n; i++) shapePts.push({ x: pts[i].x, z: pts[i].z });
    const shape = new THREE.Shape();
    shape.moveTo(shapePts[0].x, -shapePts[0].z);
    for (let i = 1; i < shapePts.length; i++) shape.lineTo(shapePts[i].x, -shapePts[i].z);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(geo, m.civicRoof);
    roof.position.y = height + 0.02;
    roof.name = "civic-roof";
    group.add(roof);
  }

  const doorW = Math.min(2.6, Math.max(1.4, edge.len * 0.18));
  addBox(group, "civic-door", [doorW, 2.4, 0.1], 0, 1.25, 0.14, m.civicGlass, frame);
  addBox(group, "civic-entrance", [doorW + 0.36, 2.7, 0.08], 0, 1.35, 0.22, m.civicBand, frame);
  for (const side of [-1, 1]) {
    addBox(group, "civic-entrance", [0.22, 2.7, 0.22], side * (doorW / 2 + 0.28), 1.35, 0.4, m.stone, frame);
  }
  addBox(group, "civic-steps", [Math.min(edge.len * 0.42, 5.2), 0.16, 1.2], 0, 0.1, 0.9, m.stone, frame);
  const plaqueW = Math.min(Math.max(4.2, spec.name.length * 0.48), Math.max(4.2, edge.len * 0.92));
  const plaqueY = Math.min(height - 0.7, Math.max(3.15, height * 0.62));
  addBox(
    group,
    "civic-plaque",
    [plaqueW, 0.72, 0.1],
    0,
    plaqueY,
    0.24,
    plaqueMaterial(spec.name),
    frame,
    { role: "plaque", text: spec.name }
  );
  const bays = Math.max(2, Math.min(5, Math.round(edge.len / 4.5)));
  for (let floor = 0; floor < Math.max(1, Math.round((height - 3.2) / 3)); floor++) {
    const y = 4.15 + floor * 2.7;
    if (y > height - 0.8) break;
    for (let i = 0; i < bays; i++) {
      const x = -edge.len * 0.36 + (edge.len * 0.72 * i) / Math.max(1, bays - 1);
      if (Math.abs(x) < doorW * 0.7 && floor === 0) continue;
      addBox(group, "civic-window", [1.15, 1.15, 0.08], x, y, 0.12, m.civicGlass, frame);
    }
  }
  addBox(group, "", [Math.min(edge.len * 0.55, 8), 0.12, 1.4], 0, 3.05, 0.7, m.civicBand, frame);

  group.userData = { role: "civic", name: spec.name, heightEstimated: true };
  return {
    group,
    collider: makeCollider(spec.id, pts, height + 0.04, 3.2),
    view: viewFrom(edge, Math.max(16, Math.min(28, edge.len * 1.2)), Math.max(6, height * 0.7), height * 0.4),
  };
}

export function createMarketHall(pts, roads, spec) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || openCount(pts) < 3) return null;
  const m = materials();
  const frame = frameFromEdge(edge);
  const height = spec.height;
  const group = new THREE.Group();
  group.name = "market-hall";
  addPerimeter(group, pts, 0.02, 0.4, m.stone, "market-base");
  addPerimeter(group, pts, 0.4, 3.35, m.marketWall, "market-walls");
  if (height > 3.7) addPerimeter(group, pts, 3.35, height - 0.28, m.civicWall, "market-upper");
  addPerimeter(group, pts, height - 0.28, height, m.civicRoof, "market-roof-edge");

  const n = openCount(pts);
  if (n >= 3) {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, -pts[0].z);
    for (let i = 1; i < n; i++) shape.lineTo(pts[i].x, -pts[i].z);
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(geo, m.civicRoof);
    roof.position.y = height + 0.02;
    roof.name = "market-roof";
    group.add(roof);
  }

  const doorW = Math.min(3.2, Math.max(1.6, edge.len * 0.22));
  addBox(group, "market-door", [doorW, 2.5, 0.1], 0, 1.3, 0.16, m.dark, frame);
  addBox(group, "market-entrance", [doorW + 0.4, 2.85, 0.08], 0, 1.4, 0.24, m.marketAwning, frame);
  const canopyW = Math.min(Math.max(4.2, edge.len * 0.86), 22);
  addBox(group, "market-canopy", [canopyW, 0.26, 2.8], 0, 3.2, 1.5, m.marketAwning, frame);
  const stallX = Math.max(2.2, Math.min(edge.len * 0.32, 8));
  const stall = frame.place(stallX, 0, 2.7);
  addBox(group, "market-stall", [1.7, 0.9, 0.72], stallX, 0.5, 2.7, m.marketWall, frame);
  addBox(group, "market-stall", [1.9, 0.1, 1.15], stallX, 1.55, 2.85, m.marketAwning, frame);
  addBox(
    group,
    "market-stall",
    [1.35, 0.42, 0.06],
    stallX,
    1.95,
    3.15,
    plaqueMaterial("熟食攤"),
    frame,
    { role: "stall", text: "熟食攤" }
  );
  const plaqueW = Math.min(Math.max(4.4, spec.name.length * 0.55), Math.max(4.4, edge.len * 0.9));
  addBox(
    group,
    "market-plaque",
    [plaqueW, 0.78, 0.1],
    0,
    Math.min(height - 0.7, Math.max(3.7, 4.4)),
    0.28,
    plaqueMaterial(spec.name),
    frame,
    { role: "plaque", text: spec.name }
  );
  const bays = Math.max(2, Math.min(6, Math.round(edge.len / 4.2)));
  const rows = Math.max(0, Math.min(5, Math.round((height - 4.6) / 3)));
  for (let floor = 0; floor < rows; floor++) {
    const y = 5.15 + floor * 2.8;
    if (y > height - 0.9) break;
    for (let i = 0; i < bays; i++) {
      const x = -edge.len * 0.36 + (edge.len * 0.72 * i) / Math.max(1, bays - 1);
      addBox(group, "market-window", [1.2, 1.15, 0.08], x, y, 0.14, m.civicGlass, frame);
    }
  }

  group.userData = { role: "market", name: spec.name, heightEstimated: true };
  return {
    group,
    collider: makeCollider(spec.id, pts, height + 0.04, 3.2),
    view: viewFrom(edge, Math.max(22, Math.min(36, edge.len * 0.9)), Math.max(10, height * 0.55), height * 0.35),
    stall: { x: stall.x, z: stall.z, name: "熟食攤" },
  };
}

export function createWaysideShrine(x, z, name) {
  const m = materials();
  const group = new THREE.Group();
  group.name = "wayside-shrine";
  group.position.set(x, 0, z);
  group.rotation.y = Math.atan2(-x, -z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.36, 1.45), m.stone);
  base.position.y = 0.18;
  base.name = "shrine-base";
  group.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.28, 1.48, 1.02), m.taoistWall);
  body.position.y = 1.1;
  body.name = "shrine-body";
  group.add(body);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.36, 0.06), plaqueMaterial(name));
  plaque.position.set(0, 1.32, 0.55);
  plaque.name = "worship-plaque";
  plaque.userData = { role: "plaque", text: name };
  group.add(plaque);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.38, 0.78, 4), m.gold);
  roof.position.y = 2.15;
  roof.rotation.y = Math.PI / 4;
  roof.name = "shrine-roof";
  group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.78, 0.06), m.dark);
  door.position.set(0, 1.02, 0.54);
  door.name = "shrine-door";
  group.add(door);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 0.48), m.stone);
  steps.position.set(0, 0.1, 0.95);
  steps.name = "shrine-steps";
  group.add(steps);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.42), m.gold);
  porch.position.set(0, 1.55, 0.62);
  porch.name = "shrine-porch";
  group.add(porch);
  for (const side of [-0.72, 0.72]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), m.lantern);
    lantern.position.set(side, 1.55, 0.72);
    lantern.name = "worship-lantern";
    group.add(lantern);
  }
  group.userData = { role: "shrine", name, heightEstimated: true };
  const s = 0.95;
  const points = [
    { x: x - s, z: z - s },
    { x: x + s, z: z - s },
    { x: x + s, z: z + s },
    { x: x - s, z: z + s },
    { x: x - s, z: z - s },
  ];
  return {
    group,
    collider: {
      id: `shrine/${name}`,
      points,
      minX: x - s,
      maxX: x + s,
      minZ: z - s,
      maxZ: z + s,
      height: 2.6,
      storey: 1.6,
      isShop: false,
      shops: [name],
      plaque: name,
      modelRole: "temple",
      heightIsEstimated: true,
    },
    view: { x: x + 8, y: 6.5, z: z + 8, lookX: x, lookY: 1.3, lookZ: z },
  };
}

export function createWaysideShrines(pois, project, colliders = []) {
  const group = new THREE.Group();
  group.name = "wayside-shrines";
  const built = [];
  const taken = new Set();
  for (const collider of colliders) {
    if (collider?.plaque) taken.add(collider.plaque);
    for (const name of collider?.shops || []) taken.add(name);
  }
  for (const poi of pois || []) {
    if (poi.amenity !== "place_of_worship" || !poi.name || taken.has(poi.name)) continue;
    const p = project.toLocal(poi.lat, poi.lon);
    if (colliders.some((collider) => collider.points && pointInRing(p.x, p.z, collider.points))) continue;
    const shrine = createWaysideShrine(p.x, p.z, poi.name);
    group.add(shrine.group);
    built.push(shrine);
    taken.add(poi.name);
  }
  return {
    group,
    colliders: built.map((item) => item.collider),
    views: Object.fromEntries(built.map((item) => [item.collider.plaque, item.view])),
    count: built.length,
  };
}

export function inspectLandmarkGroup(group) {
  const found = { roofs: 0, plaques: 0, lanterns: 0, plaqueText: "", name: group?.name || "", civicRoof: 0 };
  if (!group) return found;
  group.traverse((obj) => {
    if (obj.name === "worship-roof") found.roofs += 1;
    if (obj.name === "worship-plaque" || obj.name === "civic-plaque" || obj.name === "market-plaque") {
      found.plaques += 1;
      if (obj.userData?.text) found.plaqueText = obj.userData.text;
    }
    if (obj.name === "worship-lantern") found.lanterns += 1;
    if (obj.name === "civic-roof" || obj.name === "market-roof") found.civicRoof += 1;
  });
  return found;
}
