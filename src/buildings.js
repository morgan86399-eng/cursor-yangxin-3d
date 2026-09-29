import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { centroid, dist2, distanceToRing, exteriorStripClear, nearestRoad, outwardNormal, streetFacingEdge } from "./geo.js";
import { applyAerialUVs, createAerialColorSampler } from "./aerial.js";
import { displayHeightForLot } from "./lots.js";
import { localFloorEvidenceForLot } from "./local-floor-evidence.js";
import { localizeShops, matchShopsToLots, splitShopFloors } from "./shop-match.js";
import { isChainStore } from "./brands.js";
import { dressNeighborFacade, dressShopLot, facingNeighborLots, shouldSkipArcade, shouldSkipHouseAwning } from "./shop-dress.js";
import { dressLandmark, dressNear50HistoricalCorner, landmarkFor } from "./landmarks.js";
import { createFacadeDepth, planBuildingOpenings } from "./facade-depth.js";
import { planWallPanels, WINDOW_CUTOUT_WIDTH, WINDOW_CUTOUT_HEIGHT } from "./wall-panels.js";
import { claddingNormalAsset, createCladdingMaterial } from "./cladding-material.js";
import { createDrainpipeDetail, drainpipeCenterClear } from "./drainpipe-detail.js";
import { createZhenfuAnnex, createZhenfuHall, isZhenfuAnnex, isZhenfuHall } from "./temple.js";
import {
  makeStorefrontTexture,
  makeUpperFloorTexture,
  makeMetalCapTexture,
  makeYashanYuanStorefrontTexture,
  makeYangxinUpperTexture,
  makeBrownTileTexture,
  makePaleCladdingTexture,
  makeNo46UpperTexture,
  makeBrandStorefrontTexture,
  makeNamedStorefrontTexture,
  makeNeighborShellTexture,
  makeSolidWallTexture,
  paletteColor,
  classifyFacade,
  hash01,
} from "./textures.js";

export function localRing(ring, project) {
  return ring.map(([lon, lat]) => {
    const p = project.toLocal(lat, lon);
    return { x: p.x, z: p.z };
  });
}

export function resolveBuildingProfile(b, extra = {}, isShop = false) {
  const height = displayHeightForLot(b, isShop, extra);
  const name = extra.label || b.name || "";
  const kind = isShop
    ? "shop"
    : b.building === "temple" || /宮|殿|蓮社/.test(name)
      ? "temple"
      : /市場/.test(name)
        ? "market"
        : b.building === "government" || /派出所|活動中心/.test(name)
          ? "civic"
          : "house";
  const storey = height >= 8 ? 3.28 : Math.min(3.12, Math.max(2.55, height * 0.48));
  const upperH = Math.max(height - storey, 0.35);
  const upperFloors = Math.max(1, Math.round(upperH / 3.15));
  const color = extra.color || paletteColor(b.id || name, kind);
  return { height, storey, upperH, upperFloors, kind, color, isShop, name };
}

// Decorative cladding must fit inside the estimated roofline, never create an extra storey.
export function decorativeCapHeight(height, enabled) {
  return enabled && height > 5 ? Math.min(0.6, height * 0.08) : 0;
}

export const NEAR_DETAIL_RADIUS_METERS = 50;

export function shouldPlaceEstimatedRoofFurniture(nearDetail, area) {
  // A tank or solar panel chosen by a hash looks like a surveyed object up close.
  // Until roof evidence is attached to the lot, omit it in the near-field ring.
  return !nearDetail && area > 70;
}

function shapeFromRing(pts) {
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].z);
  return shape;
}

function insetRing(pts, dist) {
  const closed =
    pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].z === pts[pts.length - 1].z;
  const n = closed ? pts.length - 1 : pts.length;
  if (n < 3) return pts;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += pts[i].x;
    cz += pts[i].z;
  }
  cx /= n;
  cz /= n;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const dx = cx - pts[i].x;
    const dz = cz - pts[i].z;
    const len = Math.hypot(dx, dz);
    if (len < dist * 3) return pts;
    out.push({ x: pts[i].x + (dx / len) * dist, z: pts[i].z + (dz / len) * dist });
  }
  return out;
}

function ringCentroid(pts) {
  const closed =
    pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].z === pts[pts.length - 1].z;
  const n = closed ? pts.length - 1 : pts.length;
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    x += pts[i].x;
    z += pts[i].z;
  }
  return { x: x / Math.max(n, 1), z: z / Math.max(n, 1) };
}

export function makeWallGeometry(pts, y0, y1, uPerMeter, vRepeat, includeEdge = null, openingsByEdge = null) {
  const positions = [];
  const uvs = [];
  const indices = [];
  let v = 0;
  const last = pts.length - 1;
  const closed = pts[0].x === pts[last].x && pts[0].z === pts[last].z;
  const count = closed ? pts.length - 1 : pts.length;
  for (let i = 0; i < count; i++) {
    if (includeEdge && !includeEdge(i)) continue;
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.12) continue;
    const n = outwardNormal(a, b, pts);
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const uRight = tx * n.nz - tz * n.nx;
    const u = Math.max(0.28, len / uPerMeter);
    const panels = planWallPanels(len, y0, y1, openingsByEdge?.get(i) || []);
    for (const panel of panels) {
      const left = panel.x0 / len; const right = panel.x1 / len;
      const ax = a.x + tx * left; const az = a.z + tz * left;
      const bx = a.x + tx * right; const bz = a.z + tz * right;
      positions.push(ax, panel.y0, az, bx, panel.y0, bz, bx, panel.y1, bz, ax, panel.y1, az);
      const ul = uRight >= 0 ? u * left : u * (1 - left);
      const ur = uRight >= 0 ? u * right : u * (1 - right);
      const vb = (panel.y0 - y0) / (y1 - y0) * vRepeat;
      const vt = (panel.y1 - y0) / (y1 - y0) * vRepeat;
      uvs.push(ul, vb, ur, vb, ur, vt, ul, vt);
      indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wallMat(map) {
  return new THREE.MeshLambertMaterial({
    map,
    color: "#ffffff",
    side: THREE.DoubleSide,
  });
}

// CC0 materials provide surface detail; the material choice and tint remain
// estimates until a photograph is tied to this particular building edge.
export function near50CladdingAsset(style, level = "upper") {
  if (level === "ground") return "Plaster003_Color.jpg";
  if (style === "brick") return "Bricks060_Color.jpg";
  if (["tile", "pinkTile", "greenMosaic", "mosaic", "arcade"].includes(style)) return "Tiles107_Color.jpg";
  return "Plaster003_Color.jpg";
}

const near50Textures = new Map();
const near50Materials = new Map();
function near50CladdingMat(style, color, level) {
  const asset = near50CladdingAsset(style, level);
  const normalAsset = claddingNormalAsset(asset);
  for (const file of [asset, normalAsset]) {
    if (near50Textures.has(file)) continue;
    const texture = new THREE.TextureLoader().load(new URL(`./data/facade-materials/${file}`, document.baseURI).href);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = file === asset ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 8;
    texture.repeat.set(asset === "Bricks060_Color.jpg" ? 2 : 1, 1);
    texture.userData = { asset: file, source: "ambientCG", estimated: true };
    near50Textures.set(file, texture);
  }
  const key = `${asset}:${color}`;
  if (!near50Materials.has(key)) {
    near50Materials.set(key, createCladdingMaterial(near50Textures.get(asset), near50Textures.get(normalAsset), color));
  }
  return near50Materials.get(key);
}

function addEstimatedResidentialEntry(group, edge, storey, id) {
  if (!edge || edge.len < 2.8) return false;
  const width = Math.min(0.95, edge.len * 0.24);
  const height = Math.min(2.16, storey - 0.24);
  if (height < 1.8) return false;
  const make = (w, h, d, out, color) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(edge.mx + edge.nx * out, h / 2 + 0.02, edge.mz + edge.nz * out);
    mesh.rotation.y = edge.yaw;
    mesh.userData = { id, kind: "near50-residential-entry", estimated: true };
    group.add(mesh);
    return mesh;
  };
  make(width + 0.14, height + 0.08, 0.07, 0.075, 0x8f8a82);
  make(width, height, 0.08, 0.13, 0x464a49);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.035), new THREE.MeshLambertMaterial({ color: 0xb9ad8b }));
  handle.position.set(edge.mx + edge.nx * 0.19 + Math.sin(edge.yaw + Math.PI / 2) * width * 0.3,
    1.02, edge.mz + edge.nz * 0.19 + Math.cos(edge.yaw + Math.PI / 2) * width * 0.3);
  handle.rotation.y = edge.yaw;
  group.add(handle);
  return true;
}

function addAerialRoof(group, pts, height, aerialMat, uvAt) {
  const shape = shapeFromRing(pts);
  if (!shape) return;
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  applyAerialUVs(geo, uvAt);
  const mesh = new THREE.Mesh(geo, aerialMat);
  mesh.position.y = height + 0.02;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
}

function addParapet(group, pts, height, color) {
  const rim = insetRing(pts, 0.18);
  const geo = makeWallGeometry(rim, height, height + 0.42, 4.8, 1);
  if (!geo) return;
  const mat = new THREE.MeshLambertMaterial({
    color,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(geo, mat));
}

function addRoofFurniture(group, pts, height, seed) {
  const c = ringCentroid(pts);
  if (hash01(seed, 4) > 0.34) {
    const th = 1.05 + hash01(seed, 17) * 0.4;
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 + hash01(seed, 16) * 0.18, 0.55, th, 10),
      new THREE.MeshLambertMaterial({ color: 0xb9c0c4 })
    );
    const tx = c.x + (hash01(seed, 5) - 0.5) * 2.2;
    const tz = c.z + (hash01(seed, 6) - 0.5) * 2.2;
    tank.position.set(tx, height + th / 2, tz);
    group.add(tank);
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.46, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0x8e969b })
    );
    lid.position.set(tx, height + th + 0.04, tz);
    group.add(lid);
  }
  if (hash01(seed, 7) > 0.5) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 + hash01(seed, 18) * 0.8, 1.15, 1.05),
      new THREE.MeshLambertMaterial({ color: hash01(seed, 19) > 0.5 ? 0x8a9096 : 0xc9c2b6 })
    );
    box.position.set(c.x - 1.1 + hash01(seed, 20), height + 0.78, c.z + 0.6);
    group.add(box);
  }
  if (hash01(seed, 14) > 0.7) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.06, 1.15),
      new THREE.MeshLambertMaterial({ color: 0x1a2740 })
    );
    panel.position.set(c.x + 0.4, height + 0.1, c.z - 0.5);
    panel.rotation.y = (hash01(seed, 15) - 0.5) * 0.8;
    group.add(panel);
  }
}

const arcadeColMat = new THREE.MeshLambertMaterial({ color: 0xc4b8a4 });
const arcadeCeilMat = new THREE.MeshLambertMaterial({ color: 0xb7aa98 });

function addArcade(group, pts, roads, storey) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || Math.sqrt(edge.roadDist) > 10 || edge.len < 2.4) return;
  const depth = 1.42;
  const colMat = arcadeColMat;
  const cols = Math.max(2, Math.min(5, Math.round(edge.len / 3.4)));
  for (let i = 0; i < cols; i++) {
    const t = cols === 1 ? 0.5 : 0.08 + (0.84 * i) / (cols - 1);
    const x = edge.a.x + (edge.b.x - edge.a.x) * t + edge.nx * depth;
    const z = edge.a.z + (edge.b.z - edge.a.z) * t + edge.nz * depth;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, storey - 0.16, 0.28), colMat);
    col.position.set(x, (storey - 0.16) / 2, z);
    col.rotation.y = edge.yaw;
    group.add(col);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), colMat);
    base.position.set(x, 0.08, z);
    base.rotation.y = edge.yaw;
    group.add(base);
  }
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(edge.len * 0.92, 9.5), 0.18, depth + 0.2),
    arcadeCeilMat
  );
  beam.position.set(edge.mx + edge.nx * (depth * 0.48), storey - 0.1, edge.mz + edge.nz * (depth * 0.48));
  beam.rotation.y = edge.yaw;
  group.add(beam);
}

function addBalcony(group, pts, roads, storey, seed) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || Math.sqrt(edge.roadDist) > 10 || edge.len < 2.8) return;
  const w = Math.min(edge.len * 0.52, 3.1);
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.1, 0.82),
    new THREE.MeshLambertMaterial({ color: 0xc8c2b6 })
  );
  const y = storey + 0.08 + hash01(seed, 23) * 0.4;
  slab.position.set(edge.mx + edge.nx * 0.55, y, edge.mz + edge.nz * 0.55);
  slab.rotation.y = edge.yaw;
  group.add(slab);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x8d9398 });
  const bars = Math.max(4, Math.round(w / 0.16));
  const railParts = [
    new THREE.BoxGeometry(w, 0.045, 0.04),
    new THREE.BoxGeometry(0.045, 0.78, 0.04),
    new THREE.BoxGeometry(0.045, 0.78, 0.04),
  ];
  railParts[0].translate(0, 0.74, 0);
  railParts[1].translate(-w / 2 + 0.03, 0.36, 0);
  railParts[2].translate(w / 2 - 0.03, 0.36, 0);
  for (let i = 1; i < bars - 1; i++) {
    const bar = new THREE.BoxGeometry(0.02, 0.7, 0.02);
    bar.translate(-w / 2 + (w * i) / (bars - 1), 0.36, 0);
    railParts.push(bar);
  }
  const rail = new THREE.Mesh(mergeGeometries(railParts), railMat);
  rail.position.set(edge.mx + edge.nx * 0.92, y, edge.mz + edge.nz * 0.92);
  rail.rotation.y = edge.yaw;
  group.add(rail);
}

function streetPlinthEdge(pts, roads) {
  if (!roads?.length) return null;
  const last = pts.length - 1;
  const closed = pts[0].x === pts[last].x && pts[0].z === pts[last].z;
  const count = closed ? pts.length - 1 : pts.length;
  let best = null;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 2.6) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const seg = nearestRoad(mx, mz, roads);
    const dist = Math.sqrt(seg.d);
    if (!Number.isFinite(dist) || dist > 7.2) continue;
    if (best && len <= best.len) continue;
    let ox = mx - seg.px;
    let oz = mz - seg.pz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    best = { len, mx, mz, ox, oz, yaw: Math.atan2(dx, dz) };
  }
  return best;
}

function addDrainpipe(group, pts, height, seed, nearContext = null) {
  const c = ringCentroid(pts);
  const a = pts[Math.floor(hash01(seed, 25) * Math.max(pts.length - 1, 1))];
  if (!a) return;
  const nx = a.x - c.x;
  const nz = a.z - c.z;
  const len = Math.hypot(nx, nz) || 1;
  const x = a.x + (nx / len) * 0.08;
  const z = a.z + (nz / len) * 0.08;
  if (nearContext) {
    // The fittings are no larger than a 65mm radius, so check the whole disk
    // against neighboring footprints, not just a few samples around the pipe.
    if (!drainpipeCenterClear(x, z, nearContext.lots, nearContext.id)) return "omitted";
    const detail = createDrainpipeDetail(height, nearContext.id);
    if (!detail) return "omitted";
    detail.position.set(x, 0, z);
    group.add(detail);
    return "detailed";
  }
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, height, 6),
    new THREE.MeshLambertMaterial({ color: 0x8b9094 })
  );
  pipe.position.set(x, height / 2, z);
  group.add(pipe);
  return "legacy";
}

function addAwnings(group, pts, roads, color, nearContext = null) {
  if (!roads?.length) return 0;
  let rejected = 0;
  const last = pts.length - 1;
  const closed = pts[0].x === pts[last].x && pts[0].z === pts[last].z;
  const count = closed ? pts.length - 1 : pts.length;
  const awningMat = new THREE.MeshLambertMaterial({ color: color || 0xb08968 });
  const barMat = new THREE.MeshLambertMaterial({ color: 0x3a342e });
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 3.2 || len > 22) continue;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const seg = nearestRoad(mx, mz, roads);
    if (Math.sqrt(seg.d) > 9) continue;
    let nearNormal = null;
    if (nearContext) {
      const n = outwardNormal(a, b, pts);
      nearNormal = n;
      const roadFacing = n.nx * (seg.px - mx) + n.nz * (seg.pz - mz) > 0;
      const edge = { a, b, nx: n.nx, nz: n.nz };
      if (!roadFacing || !exteriorStripClear(edge, nearContext.lots, nearContext.id, 1.65)) {
        rejected += 1;
        continue;
      }
    }
    let ox = nearNormal?.nx ?? mx - seg.px;
    let oz = nearNormal?.nz ?? mz - seg.pz;
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    const yaw = Math.atan2(ox, oz);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(Math.min(len - 0.4, 8.5), 0.06, 1.45), awningMat);
    awning.position.set(mx + ox * 0.9, 3.18, mz + oz * 0.9);
    awning.rotation.y = yaw;
    group.add(awning);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(len - 0.4, 8.5), 0.04, 0.04), barMat);
    bar.position.set(mx + ox * 1.52, 3.14, mz + oz * 1.52);
    bar.rotation.y = yaw;
    group.add(bar);
  }
  return rejected;
}

export function createDetailedBuildings(osm, config, project, edits, roofMat, frame, roads, lotData, aerialTex, shops) {
  const group = new THREE.Group();
  group.name = "buildings";
  const colliders = [];
  const radius = config.radiusMeters;
  const r2 = (radius + 35) ** 2;
  const buildingEdits = edits?.buildings || {};
  const buildings = lotData?.buildings?.length ? lotData.buildings : osm.buildings || [];
  const shopId = lotData?.shopId || buildings.find((b) => b.isShop)?.id || null;
  const sampler = createAerialColorSampler(aerialTex, frame.uvAt);
  const plinthMat = new THREE.MeshLambertMaterial({ color: 0x6a645c });
  const facadeStats = { unique: new Set(), styles: {}, metalCaps: 0, arcades: 0, branded: 0, fascia: 0 };
  const facadeDepth = createFacadeDepth();
  const brandViews = [];

  const lots = [];
  for (const b of buildings) {
    const raw = localRing(b.ring, project);
    if (raw.length < 4) continue;
    const [clon, clat] = centroid(b.ring);
    const c = project.toLocal(clat, clon);
    if (dist2(c.x, c.z, 0, 0) > r2) continue;
    const pts = insetRing(raw, (b.area || 80) < 70 ? 0.06 : 0.1);
    if (pts.length < 4) continue;
    const isShop = Boolean(b.isShop) || b.id === shopId;
    lots.push({ b, pts, c, isShop, id: b.id,
      minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
      minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)),
      nearDetail: distanceToRing(0, 0, raw) <= NEAR_DETAIL_RADIUS_METERS });
  }

  facadeStats.near50Footprints = lots.filter((lot) => lot.nearDetail).length;
  facadeStats.near50PlainUpper = 0;
  facadeStats.near50RoofEquipmentOmitted = 0;
  facadeStats.near50RepeatedNameTexturesAvoided = 0;
  facadeStats.near50PlainSideGround = 0;
  facadeStats.near50PlainSideUpper = 0;
  facadeStats.near50DistantRoadFrontsSuppressed = 0;
  facadeStats.near50Cc0Cladding = 0;
  facadeStats.near50NeutralEntries = 0;
  facadeStats.near50HistoricalCornerSigns = 0;
  facadeStats.near50GapProjectionsRejected = 0;
  facadeStats.near50RecessedWindows = 0;
  facadeStats.near50RecessedBuildings = 0;
  facadeStats.near50NormalMappedBuildings = 0;
  facadeStats.near50DetailedDrainpipes = 0;
  facadeStats.near50DrainpipesOmitted = 0;

  const localShops = localizeShops(shops, project);
  const matched = matchShopsToLots(localShops, lots);
  const shopLot = lots.find((lot) => lot.isShop);
  const neighbors = shopLot ? facingNeighborLots(shopLot.pts, lots, roads) : { left: null, right: null, edge: null };
  const neighborById = new Map();
  if (neighbors.left) neighborById.set(neighbors.left.id, neighbors.left);
  if (neighbors.right) neighborById.set(neighbors.right.id, neighbors.right);
  const neighborViews = [];
  const landmarkViews = {};
  let zhenfu = null;

  for (const lot of lots) {
    const b = lot.b;
    const pts = lot.pts;
    if (isZhenfuHall(b)) {
      const built = createZhenfuHall(pts, roads);
      if (built) {
        group.add(built.group);
        colliders.push({ ...built.collider, observedFloors: null, heightIsEstimated: true, modelRole: "temple" });
        zhenfu = built.frame;
        continue;
      }
    }
    if (isZhenfuAnnex(b)) {
      const built = createZhenfuAnnex(pts, roads);
      if (built) {
        group.add(built.group);
        colliders.push({ ...built.collider, observedFloors: null, heightIsEstimated: true, modelRole: "temple" });
        continue;
      }
    }
    const c = lot.c;
    const isShop = lot.isShop;
    const extra = buildingEdits[b.id] || (isShop ? buildingEdits.shop : null) || {};
    const profile = resolveBuildingProfile(b, extra, isShop);
    let { height, storey, kind } = profile;
    const localFloorEvidence = localFloorEvidenceForLot(b, project);
    const road = nearestRoad(c.x, c.z, roads);
    const roadDist = Number.isFinite(road.d) ? Math.sqrt(road.d) : 12;
    const roofHex = sampler?.hexAverage?.(c.x, c.z, 2) || sampler?.hexAt(c.x, c.z);
    const facade = classifyFacade(b, {
      kind,
      isShop,
      area: b.area,
      distRoad: roadDist,
      roofHex,
      color: extra.color,
    });
    const color = extra.color || facade.wallHex || profile.color;
    const seed = facade.layout;
    const floors = splitShopFloors(matched.byLot.get(b.id) || []);
    const groundShop = floors.ground;
    const upperShop = floors.upper;
    const neighbor = neighborById.get(b.id) || null;
    const landmark = !isShop && !neighbor ? landmarkFor(b.id) : null;
    const normalMapped = lot.nearDetail && !isShop && !neighbor && !landmark;
    if (normalMapped) facadeStats.near50NormalMappedBuildings += 1;
    const hasMetalCap = !isShop && !neighbor && !landmark && !isChainStore(groundShop?.brand) && facade.metalCap;
    if (isShop) {
      height = localFloorEvidence?.estimatedHeightMeters ?? 9.9;
      storey = 3.15;
    } else if (neighbor?.role === "shutter") {
      height = localFloorEvidence?.estimatedHeightMeters ?? 12.6;
      storey = 3.2;
    } else if (neighbor?.role === "brick") {
      height = 12.4;
      storey = 3.2;
    }
    if (landmark) {
      height = landmark.height;
      storey = landmark.storey;
    }
    const capH = decorativeCapHeight(height, hasMetalCap);
    const bodyH = height - capH;
    const upperH = Math.max(bodyH - storey, 0.35);
    const upperFloors = Math.max(1, Math.round(upperH / 3.15));
    const canAddOpenings = !neighbor && !isShop && landmark?.kind !== "police";
    const openingPlans = canAddOpenings ? planBuildingOpenings({
        pts,
        roads,
        storey,
        bodyH,
        seed,
        skipGround: Boolean(groundShop) || Boolean(landmark?.skipGround),
        hero: lot.nearDetail,
      }) : [];
    const recessed = lot.nearDetail && !isShop && !neighbor && !landmark;
    const physicalOpenings = canAddOpenings
      ? facadeDepth.addBuilding({ plans: openingPlans, hero: lot.nearDetail, recessed }) : 0;
    const wallOpenings = recessed ? new Map(openingPlans.map(({ edge, openings }) => [edge.index,
      openings.map((opening) => ({ x: edge.len * opening.t, y: opening.y,
        w: WINDOW_CUTOUT_WIDTH * opening.sx, h: WINDOW_CUTOUT_HEIGHT * opening.sy }))])) : null;
    const recessedWindows = recessed ? physicalOpenings : 0;
    let projectionOmissions = 0;
    if (recessedWindows) {
      facadeStats.near50RecessedWindows += recessedWindows;
      facadeStats.near50RecessedBuildings += 1;
    }
    const plainNearUpper = lot.nearDetail && physicalOpenings > 0;
    const bay = isShop
      ? 5.4
      : kind === "market"
        ? 6.4
        : Math.min(5.2, Math.max(3.4, Math.sqrt(b.area || 80) * 0.42 + (seed % 5) * 0.12));
    const lotLabel = {
      id: b.id,
      label: extra.label || groundShop?.name || b.name || (isShop ? "雅善圓蔬食館" : ""),
      isShop,
      style: facade.style,
    };
    const addBand = (y0, y1, map, userData) => {
      const geo = makeWallGeometry(pts, y0, y1, bay, 1);
      if (!geo) return false;
      const mesh = new THREE.Mesh(geo, wallMat(map));
      if (userData) mesh.userData = userData;
      group.add(mesh);
      return true;
    };
    if (isShop) {
      if (!addBand(0.01, storey, makeYashanYuanStorefrontTexture(), lotLabel)) continue;
      addBand(storey, storey * 2, makeBrownTileTexture());
      addBand(storey * 2, height, makeNo46UpperTexture());
    } else if (neighbor?.role === "shutter") {
      if (!addBand(0.01, storey, makeNeighborShellTexture("#e7eef2", "pale"), lotLabel)) continue;
      addBand(storey, height - 3.05, makeNeighborShellTexture("#c5c8c4", "grey"));
      addBand(height - 3.05, height, makePaleCladdingTexture());
    } else if (neighbor?.role === "brick") {
      if (!addBand(0.01, storey, makeNeighborShellTexture("#a8483c", "brick"), lotLabel)) continue;
      addBand(storey, height, makeNeighborShellTexture("#9a4034", "brick"));
    } else if (landmark) {
      const wallTex = {
        black: ["#1c1e22", "#2a2d32"],
        red: ["#c4342a", "#a82822"],
        grey: ["#c5c8c6", "#b0b4b2"],
        brick: ["#a8483c", "#9a4034"],
        yellowgreen: ["#d4d27a", "#c5c86a"],
        beige: ["#e7d3b4", "#efe0cc"],
        whiteTile: ["#d7e2e3", "#e1e8e7"],
      }[landmark.ground] || ["#e7d3b4", "#efe0cc"];
      const upperKey = landmark.upper || landmark.ground;
      const upperHex = {
        black: "#2a2d32",
        red: "#a82822",
        grey: "#b7bbb8",
        brick: "#9a4034",
        yellowgreen: "#c9ce78",
        beige: "#efe0cc",
        whiteTile: "#e1e8e7",
      }[upperKey] || wallTex[1];
      const groundMap = landmark.ground === "grey"
        ? makeNeighborShellTexture(wallTex[0], "grey")
        : landmark.ground === "brick"
          ? makeNeighborShellTexture("#a8483c", "brick")
          : landmark.ground === "beige" || landmark.ground === "yellowgreen" || landmark.ground === "whiteTile"
            ? makeNeighborShellTexture(wallTex[0], "pale")
            : makeSolidWallTexture(wallTex[0]);
      if (!addBand(0.01, Math.min(storey, height - 0.3), groundMap, lotLabel)) continue;
      if (height - storey > 0.45) {
        const upperMap = upperKey === "brick"
          ? makeNeighborShellTexture(upperHex, "brick")
          : upperKey === "grey" || upperKey === "beige" || upperKey === "yellowgreen" || upperKey === "whiteTile"
            ? makeNeighborShellTexture(upperHex, upperKey === "grey" ? "grey" : "pale")
            : makeSolidWallTexture(upperHex);
        addBand(storey, height, upperMap);
      }
    } else {
      const nearEdge = lot.nearDetail ? streetFacingEdge(pts, roads) : null;
      const frontEdgeIndex = nearEdge && Math.sqrt(nearEdge.roadDist) <= 12 ? nearEdge.index : null;
      if (lot.nearDetail && nearEdge && frontEdgeIndex === null) {
        facadeStats.near50DistantRoadFrontsSuppressed += 1;
      }
      const splitUpper = Number.isInteger(frontEdgeIndex);
      const storeGeo = makeWallGeometry(pts, 0.01, storey, bay, 1,
        (i) => !lot.nearDetail || i !== frontEdgeIndex, wallOpenings);
      const frontStoreGeo = splitUpper
        ? makeWallGeometry(pts, 0.01, storey, bay, 1, (i) => i === frontEdgeIndex, wallOpenings)
        : null;
      const upperGeo = bodyH - storey > 0.4
        ? makeWallGeometry(pts, storey, bodyH, bay, upperFloors, (i) => !splitUpper || i !== frontEdgeIndex, wallOpenings)
        : null;
      const frontUpperGeo = splitUpper
        ? makeWallGeometry(pts, storey, bodyH, bay, upperFloors, (i) => i === frontEdgeIndex, wallOpenings)
        : null;
      const capGeo = capH > 0.4 ? makeWallGeometry(pts, bodyH, height, bay, 1, null, wallOpenings) : null;
      if (!storeGeo && !frontStoreGeo) continue;
      let storeMap;
      if (lot.nearDetail && groundShop) {
        // A single business name repeated on every side of a merged footprint
        // misrepresents the other shopfronts. Physical fascia owns the name.
        storeMap = makeStorefrontTexture(groundShop.color || color, seed, kind, facade.style);
        facadeStats.near50RepeatedNameTexturesAvoided += 1;
      } else if (groundShop && isChainStore(groundShop.brand)) {
        storeMap = makeBrandStorefrontTexture(groundShop.brand, seed);
        facadeStats.branded += 1;
      } else if (groundShop?.name) {
        storeMap = makeNamedStorefrontTexture(groundShop.name, groundShop.color || color, seed, groundShop.kind);
      } else {
        storeMap = makeStorefrontTexture(color, seed, kind, facade.style);
      }
      if (storeGeo) {
        const sideMat = lot.nearDetail
          ? near50CladdingMat(facade.style, groundShop?.color || color, "ground")
          : wallMat(storeMap);
        const storeMesh = new THREE.Mesh(storeGeo, sideMat);
        storeMesh.userData = lot.nearDetail
          ? { ...lotLabel, kind: "near50-side-wall", level: "ground", estimated: true }
          : lotLabel;
        group.add(storeMesh);
        if (lot.nearDetail) {
          facadeStats.near50PlainSideGround += 1;
          facadeStats.near50Cc0Cladding += 1;
        }
      }
      if (frontStoreGeo) {
        const frontMat = lot.nearDetail && !groundShop
          ? near50CladdingMat(facade.style, color, "ground")
          : wallMat(storeMap);
        const frontMesh = new THREE.Mesh(frontStoreGeo, frontMat);
        frontMesh.userData = lotLabel;
        group.add(frontMesh);
        if (lot.nearDetail && !groundShop && addEstimatedResidentialEntry(group, nearEdge, storey, b.id)) {
          facadeStats.near50NeutralEntries += 1;
        }
      }
      if (upperGeo || frontUpperGeo) {
        const upperMap = lot.nearDetail
          ? makeUpperFloorTexture(color, seed, kind, facade.style, false)
          : upperShop?.brand === "yangxin"
          ? makeYangxinUpperTexture()
          : makeUpperFloorTexture(color, seed, kind, facade.style);
        if (upperGeo) {
          const sideMesh = new THREE.Mesh(upperGeo, lot.nearDetail
            ? near50CladdingMat(facade.style, color, "upper") : wallMat(upperMap));
          if (lot.nearDetail) {
            sideMesh.userData = { ...lotLabel, kind: "near50-side-wall", level: "upper", estimated: true };
            facadeStats.near50PlainSideUpper += 1;
          }
          group.add(sideMesh);
        }
        if (frontUpperGeo) {
          const frontMap = upperShop?.brand === "yangxin"
            ? makeYangxinUpperTexture()
            : makeUpperFloorTexture(color, seed, kind, facade.style, !plainNearUpper);
          const frontUpper = new THREE.Mesh(frontUpperGeo, lot.nearDetail && plainNearUpper
            ? near50CladdingMat(facade.style, color, "upper") : wallMat(frontMap));
          frontUpper.userData = { ...lotLabel, kind: "near50-front-wall", level: "upper", estimated: true };
          group.add(frontUpper);
          if (plainNearUpper && upperShop?.brand !== "yangxin") facadeStats.near50PlainUpper += 1;
        }
      }
      if (capGeo) group.add(new THREE.Mesh(capGeo, wallMat(makeMetalCapTexture(color, seed))));
    }
    addAerialRoof(group, pts, height, roofMat, frame.uvAt);
    addParapet(group, pts, height, color);
    if (shouldPlaceEstimatedRoofFurniture(lot.nearDetail, b.area || 120)) {
      addRoofFurniture(group, pts, height, seed + 1);
    } else if (lot.nearDetail && (b.area || 120) > 70) {
      facadeStats.near50RoofEquipmentOmitted += 1;
    }
    if (!neighbor && !landmark && !shouldSkipHouseAwning(isShop, groundShop)) {
      projectionOmissions += addAwnings(group, pts, roads, 0xb08968,
        lot.nearDetail ? { lots, id: lot.id } : null);
    }
    const projectionEdge = lot.nearDetail ? streetFacingEdge(pts, roads) : null;
    const projectionClear = !lot.nearDetail || exteriorStripClear(projectionEdge, lots, lot.id, 1.65);
    if (!neighbor && !landmark && facade.arcade && !shouldSkipArcade(isShop, groundShop)) {
      if (projectionClear) addArcade(group, pts, roads, storey);
      else projectionOmissions += 1;
    }
    if (!neighbor && facade.balcony && !groundShop) {
      if (projectionClear) addBalcony(group, pts, roads, storey, seed);
      else projectionOmissions += 1;
    }
    facadeStats.near50GapProjectionsRejected += projectionOmissions;
    let detailedDrainpipe = false;
    if (hash01(seed, 27) > 0.42) {
      const pipe = addDrainpipe(group, pts, height, seed, normalMapped ? { lots, id: lot.id } : null);
      detailedDrainpipe = pipe === "detailed";
      if (detailedDrainpipe) facadeStats.near50DetailedDrainpipes += 1;
      if (pipe === "omitted") facadeStats.near50DrainpipesOmitted += 1;
    }
    const plinthEdge = streetPlinthEdge(pts, roads);
    if (plinthEdge) {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, plinthEdge.len * 0.94), plinthMat);
      plinth.position.set(
        plinthEdge.mx + plinthEdge.ox * 0.1,
        0.12,
        plinthEdge.mz + plinthEdge.oz * 0.1
      );
      plinth.rotation.y = plinthEdge.yaw;
      group.add(plinth);
    }
    if (neighbor) {
      const dressedN = dressNeighborFacade(group, neighbor.edge, neighbor.role, storey, bodyH, neighbors.edge);
      facadeStats.fascia += dressedN.fascia;
      if (dressedN.view) {
        neighborViews.push({
          id: b.id,
          role: neighbor.role,
          ...dressedN.view,
        });
      }
    } else if ((isShop || groundShop || upperShop) && !landmark?.ownsSign) {
      const dressed = dressShopLot(group, pts, roads, storey, { groundShop, upperShop, isShop, color });
      facadeStats.fascia += dressed.fascia;
      if (dressed.view && (isShop || isChainStore(groundShop?.brand))) {
        brandViews.push({
          name: groundShop?.name || (isShop ? "雅善圓蔬食館" : ""),
          brand: groundShop?.brand || (isShop ? "yashanyuan" : ""),
          upper: upperShop?.name || (isShop ? "養心推拿" : ""),
          ...dressed.view,
        });
      }
    }
    if (landmark) {
      const framed = dressLandmark(group, pts, roads, landmark);
      if (framed?.corner && !landmarkViews.corner) landmarkViews.corner = framed.corner;
      if (framed?.station) landmarkViews.station = framed.station;
    }
    if (lot.nearDetail && dressNear50HistoricalCorner(group, pts, roads, b.id)) {
      facadeStats.near50HistoricalCornerSigns += 1;
    }

    const key = `${facade.style}:${seed}:${color}:${groundShop?.brand || ""}`;
    facadeStats.unique.add(key);
    facadeStats.styles[facade.style] = (facadeStats.styles[facade.style] || 0) + 1;
    if (capH > 0) facadeStats.metalCaps += 1;
    if (facade.arcade) facadeStats.arcades += 1;

    colliders.push({
      id: b.id,
      points: pts,
      minX: Math.min(...pts.map((p) => p.x)),
      maxX: Math.max(...pts.map((p) => p.x)),
      minZ: Math.min(...pts.map((p) => p.z)),
      maxZ: Math.max(...pts.map((p) => p.z)),
      height,
      storey,
      observedFloors: localFloorEvidence?.floors ?? null,
      floorEvidence: localFloorEvidence?.source ?? null,
      heightIsEstimated: true,
      modelRole: isShop ? "shop" : neighbor ? "neighbor" : landmark ? "landmark" : "generic",
      normalMapped,
      detailedDrainpipe,
      recessedWindows,
      projectionOmissions,
      isShop,
      shops: floors.all.map((s) => s.name),
    });
  }

  const depthStats = facadeDepth.finish(group);
  landmarkViews.corner = {
    x: 38,
    y: 11,
    z: -52,
    lookX: 46,
    lookY: 3.2,
    lookZ: -34,
  };
  landmarkViews.station = {
    x: -64.3,
    y: 4.8,
    z: -7.9,
    lookX: -58.8,
    lookY: 2.4,
    lookZ: -10.2,
  };

  return {
    group,
    colliders,
    shopId,
    matchedShops: matched.matched,
    brandViews,
    neighborViews,
    landmarkViews,
    zhenfu,
    facadeStats: {
      unique: facadeStats.unique.size,
      styles: facadeStats.styles,
      metalCaps: facadeStats.metalCaps,
      arcades: facadeStats.arcades,
      branded: facadeStats.branded,
      fascia: facadeStats.fascia,
      windows: depthStats.windows,
      grilles: depthStats.grilles,
      near50Footprints: facadeStats.near50Footprints,
      near50PlainUpper: facadeStats.near50PlainUpper,
      near50RoofEquipmentOmitted: facadeStats.near50RoofEquipmentOmitted,
      near50PhysicalWindows: depthStats.heroWindows,
      near50RepeatedNameTexturesAvoided: facadeStats.near50RepeatedNameTexturesAvoided,
      near50PlainSideGround: facadeStats.near50PlainSideGround,
      near50PlainSideUpper: facadeStats.near50PlainSideUpper,
      near50DistantRoadFrontsSuppressed: facadeStats.near50DistantRoadFrontsSuppressed,
      near50Cc0Cladding: facadeStats.near50Cc0Cladding,
      near50NeutralEntries: facadeStats.near50NeutralEntries,
      near50HistoricalCornerSigns: facadeStats.near50HistoricalCornerSigns,
      near50GapProjectionsRejected: facadeStats.near50GapProjectionsRejected,
      near50RecessedWindows: depthStats.recessedWindows,
      near50RecessedBuildings: facadeStats.near50RecessedBuildings,
      near50NormalMappedBuildings: facadeStats.near50NormalMappedBuildings,
      near50DetailedDrainpipes: facadeStats.near50DetailedDrainpipes,
      near50DrainpipesOmitted: facadeStats.near50DrainpipesOmitted,
    },
  };
}
