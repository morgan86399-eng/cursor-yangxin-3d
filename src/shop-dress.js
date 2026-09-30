import * as THREE from "three";
import { streetFacingEdge } from "./geo.js";
import { brandOf, isChainStore } from "./brands.js";
import { createDrainpipeDetail } from "./drainpipe-detail.js";
import {
  makeShopSignTexture,
  makeYashanyuanFasciaTexture,
  makeVerticalSignTexture,
  makeYangxinPlaqueTexture,
  makeRoadWordTexture,
  hash01,
} from "./textures.js";

function alongPoint(edge, t) {
  return {
    x: edge.a.x + (edge.b.x - edge.a.x) * t,
    z: edge.a.z + (edge.b.z - edge.a.z) * t,
  };
}

function addBox(group, x, y, z, sx, sy, sz, yaw, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
  return mesh;
}

const signHardwareMat = new THREE.MeshStandardMaterial({ color: 0x756e64, roughness: 0.58, metalness: 0.48 });
const signAnchorMat = new THREE.MeshStandardMaterial({ color: 0x49433e, roughness: 0.67, metalness: 0.4 });

function isNearSign(edge) {
  return edge.mx * edge.mx + edge.mz * edge.mz <= 50 * 50;
}

// 金屬收邊與牆面固定件是推估的通用施工細節，不代表現場招牌的實測樣式。
function addNearFasciaHardware(group, edge, { t = 0.5, y, w, h, out, depth }) {
  if (!isNearSign(edge)) return;
  const face = placeOnEdge(edge, t, out + depth / 2 + 0.06);
  for (const side of [-1, 1]) {
    addBox(group, face.x, y + side * (h / 2 + 0.034), face.z,
      w + 0.07, 0.025, 0.032, edge.yaw, signHardwareMat);
  }
  if (out > 0.8) return; // 連鎖店的遮棚已承托牌體，避免額外金屬桿穿過棚面。
  for (const side of [-1, 1]) {
    const anchorT = t + side * Math.min(w * 0.32, edge.len * 0.3) / edge.len;
    const wall = placeOnEdge(edge, anchorT, 0.06);
    const rodOut = Math.max(0.08, out - depth / 2 - 0.06);
    const rod = placeOnEdge(edge, anchorT, 0.06 + rodOut / 2);
    addBox(group, rod.x, y, rod.z, 0.045, 0.045, rodOut, edge.yaw, signAnchorMat);
    addBox(group, wall.x, y, wall.z, 0.15, 0.12, 0.035, edge.yaw, signHardwareMat);
  }
}

function addFasciaBoard(group, edge, opts) {
  const { y, w: requestedW, h, shop, out = 0.28, depth = 0.1 } = opts;
  const w = isNearSign(edge) ? Math.min(requestedW, edge.len * 0.86) : requestedW;
  const tex = makeShopSignTexture(shop);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: false,
  });
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.1, h + 0.1, depth),
    new THREE.MeshLambertMaterial({ color: 0x3a2a18 })
  );
  rim.position.set(edge.mx + edge.nx * out, y, edge.mz + edge.nz * out);
  rim.rotation.y = edge.yaw;
  group.add(rim);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth + 0.04), mat);
  board.position.set(edge.mx + edge.nx * (out + 0.03), y, edge.mz + edge.nz * (out + 0.03));
  board.rotation.y = edge.yaw;
  group.add(board);
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.96, 0.045, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xffe7b8, toneMapped: false })
  );
  glow.position.set(edge.mx + edge.nx * (out + 0.05), y - h / 2 + 0.04, edge.mz + edge.nz * (out + 0.05));
  glow.rotation.y = edge.yaw;
  group.add(glow);
  board.userData = {
    kind: "fascia",
    floor: opts.floor || 1,
    y,
    h,
    name: shop?.name || "",
    estimated: true,
  };
  addNearFasciaHardware(group, edge, { y, w, h, out, depth });
  return board;
}

function addValanceAwning(group, edge, y, color, width, fit = null) {
  const w = width || Math.min(edge.len * 0.92, 8.2);
  const depth = fit?.depth ?? 1.05;
  const out = fit?.out ?? 0.62;
  const mat = new THREE.MeshLambertMaterial({ color });
  const barMat = new THREE.MeshLambertMaterial({ color: 0x3a342e });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, depth), mat);
  awning.position.set(edge.mx + edge.nx * out, y, edge.mz + edge.nz * out);
  awning.rotation.y = edge.yaw;
  // A deep canopy keeps the original tilt. A board-backed valance stays flat
  // so the slab cannot tip through the lettering.
  if (!fit) awning.rotation.x = -0.12;
  awning.userData = { kind: "awning", estimated: true };
  group.add(awning);
  const outer = fit ? out + depth / 2 : 1.12;
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, 0.05), mat);
  lip.position.set(edge.mx + edge.nx * outer, y - 0.12, edge.mz + edge.nz * outer);
  lip.rotation.y = edge.yaw;
  lip.userData = { kind: "awning-lip", estimated: true };
  group.add(lip);
  const barOut = fit ? outer + 0.02 : 1.14;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.03), barMat);
  bar.position.set(edge.mx + edge.nx * barOut, y - 0.24, edge.mz + edge.nz * barOut);
  bar.rotation.y = edge.yaw;
  group.add(bar);
}

/** Width and height of the fascia boards dressShopLot will extrude for this frontage. */
export function reservedFasciaSlots(edge, storey, opts = {}) {
  if (!edge || edge.len < 1.8) return [];
  const { groundShop, upperShop, isShop } = opts;
  const paired = Boolean(isShop || groundShop?.brand === "yashanyuan" || upperShop?.brand === "yangxin");
  if (paired) return [];
  const slots = [];
  const w = Math.min(Math.max(edge.len * 0.78, 2.35), 4.6);
  if (groundShop && isChainStore(groundShop.brand)) {
    slots.push({
      edgeIndex: edge.index, len: edge.len, t: 0.5,
      width: Math.min(Math.max(edge.len * 0.88, 3.4), 6.4),
      y: 3.18, height: 0.78, name: groundShop.name || "",
    });
  } else if (groundShop?.name) {
    slots.push({
      edgeIndex: edge.index, len: edge.len, t: 0.5, width: w, y: 2.48, height: 0.78,
      name: groundShop.name,
    });
    if ((groundShop.name || "").length <= 6) {
      const bladeT = Math.max(0.31 / edge.len, Math.min(1 - 0.31 / edge.len, 0.08));
      slots.push({
        edgeIndex: edge.index, len: edge.len, t: isNearSign(edge) ? bladeT : 0.08,
        width: 0.62, y: 2.05, height: 1.45, name: groundShop.name,
      });
    }
  }
  if (upperShop?.name) {
    slots.push({
      edgeIndex: edge.index, len: edge.len, t: 0.5, width: w * 0.88,
      y: (storey || 3.12) + 0.95, height: 0.7, name: upperShop.name,
    });
  }
  return slots;
}

function addBrandCanopy(group, edge, brand) {
  const w = Math.min(Math.max(edge.len * 0.96, 4.2), 9.4);
  const palette = {
    seven: { top: 0xe87722, mid: 0x007548, bot: 0xd0121a },
    simplemart: { top: 0xd91e18, mid: 0xf0c400, bot: 0xd91e18 },
    familymart: { top: 0x00a0e9, mid: 0xffffff, bot: 0x009845 },
    hilife: { top: 0xe87722, mid: 0x007548, bot: 0xe87722 },
    pxmart: { top: 0xe85d04, mid: 0xff7a26, bot: 0xc44500 },
    shopee: { top: 0xee4d2d, mid: 0xff6a4a, bot: 0xc62828 },
  }[brand] || { top: 0x2f9e44, mid: 0x1f7a32, bot: 0x146338 };

  const y = 3.18;
  const out = 0.82;
  addBox(group, edge.mx + edge.nx * out, y + 0.22, edge.mz + edge.nz * out, w, 0.16, 1.7, edge.yaw, new THREE.MeshLambertMaterial({ color: palette.top }));
  addBox(group, edge.mx + edge.nx * out, y, edge.mz + edge.nz * out, w, 0.28, 1.7, edge.yaw, new THREE.MeshLambertMaterial({ color: palette.mid }));
  addBox(group, edge.mx + edge.nx * out, y - 0.2, edge.mz + edge.nz * out, w, 0.12, 1.7, edge.yaw, new THREE.MeshLambertMaterial({ color: palette.bot }));

  const light = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.96, 0.03, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false })
  );
  light.position.set(edge.mx + edge.nx * out, y - 0.3, edge.mz + edge.nz * out);
  light.rotation.y = edge.yaw;
  group.add(light);
}

function addCornerVertical(group, edge, shop, y, h, t = 0.08) {
  const safeT = isNearSign(edge) ? Math.max(0.31 / edge.len, Math.min(1 - 0.31 / edge.len, t)) : t;
  const p = alongPoint(edge, safeT);
  const tex = makeVerticalSignTexture(shop.name, shop.color || shop.fascia);
  const w = 0.48;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const out = 0.48;
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x2a1c12 })
  );
  frame.position.set(p.x + edge.nx * (out - 0.03), y, p.z + edge.nz * (out - 0.03));
  frame.rotation.y = edge.yaw;
  group.add(frame);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), mat);
  board.position.set(p.x + edge.nx * out, y, p.z + edge.nz * out);
  board.rotation.y = edge.yaw;
  board.userData = { kind: "blade", name: shop?.name || "", t: safeT, y, h, estimated: true };
  group.add(board);
  if (isNearSign(edge)) {
    for (const offsetY of [-h * 0.3, h * 0.3]) {
      const rod = placeOnEdge(edge, safeT, 0.26);
      addBox(group, rod.x, y + offsetY, rod.z, 0.045, 0.045, 0.42, edge.yaw, signAnchorMat);
      const anchor = placeOnEdge(edge, safeT, 0.06);
      addBox(group, anchor.x, y + offsetY, anchor.z, 0.13, 0.12, 0.035, edge.yaw, signHardwareMat);
    }
  }
}

function addSevenExtras(group, edge) {
  const freezerMat = new THREE.MeshLambertMaterial({ color: 0xf2f4f6 });
  const green = new THREE.MeshLambertMaterial({ color: 0x007548 });
  const p = alongPoint(edge, 0.22);
  const y = 0.55;
  const out = 1.05;
  addBox(group, p.x + edge.nx * out, y, p.z + edge.nz * out, 1.15, 1.05, 0.72, edge.yaw, freezerMat);
  addBox(group, p.x + edge.nx * out, y + 0.42, p.z + edge.nz * out, 1.16, 0.12, 0.74, edge.yaw, green);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.62, 0.04),
    new THREE.MeshBasicMaterial({ color: 0x9ec4c8, transparent: true, opacity: 0.35, toneMapped: false })
  );
  glass.position.set(p.x + edge.nx * (out + 0.36), y + 0.02, p.z + edge.nz * (out + 0.36));
  glass.rotation.y = edge.yaw;
  group.add(glass);

  const atmP = alongPoint(edge, 0.78);
  addBox(group, atmP.x + edge.nx * 0.55, 0.72, atmP.z + edge.nz * 0.55, 0.42, 1.42, 0.28, edge.yaw, new THREE.MeshLambertMaterial({ color: 0x2a2e32 }));
  addBox(group, atmP.x + edge.nx * 0.7, 0.92, atmP.z + edge.nz * 0.7, 0.32, 0.28, 0.04, edge.yaw, new THREE.MeshBasicMaterial({ color: 0x7ad0ff, toneMapped: false }));

  const poleP = alongPoint(edge, 0.04);
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 3.8, 8),
    new THREE.MeshLambertMaterial({ color: 0x3a3a38 })
  );
  pole.position.set(poleP.x + edge.nx * 1.15, 1.9, poleP.z + edge.nz * 1.15);
  group.add(pole);
  const flag = makeShopSignTexture({ name: "7-ELEVEN", brand: "seven", kind: "convenience" });
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.15, 0.72),
    new THREE.MeshBasicMaterial({ map: flag, toneMapped: false })
  );
  blade.position.set(poleP.x + edge.nx * 1.15, 3.35, poleP.z + edge.nz * 1.15);
  blade.rotation.y = edge.yaw;
  group.add(blade);
}

function addSimpleMartExtras(group, edge) {
  const crate = new THREE.MeshLambertMaterial({ color: 0xf0c400 });
  const p = alongPoint(edge, 0.18);
  addBox(group, p.x + edge.nx * 1.0, 0.38, p.z + edge.nz * 1.0, 0.85, 0.72, 0.55, edge.yaw, crate);
  addBox(group, p.x + edge.nx * 1.0, 0.72, p.z + edge.nz * 1.0, 0.86, 0.08, 0.56, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xd91e18 }));
}

function addPxmartExtras(group, edge) {
  const p = alongPoint(edge, 0.2);
  addBox(group, p.x + edge.nx * 1.05, 0.55, p.z + edge.nz * 1.05, 0.7, 1.05, 0.48, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xe85d04 }));
}

function addShopeeExtras(group, edge) {
  const orange = new THREE.MeshLambertMaterial({ color: 0xee4d2d });
  const p = alongPoint(edge, 0.3);
  for (let i = 0; i < 3; i++) {
    const q = alongPoint(edge, 0.28 + i * 0.12);
    addBox(group, q.x + edge.nx * 0.55, 0.55 + (i % 2) * 0.35, q.z + edge.nz * 0.55, 0.38, 0.32, 0.28, edge.yaw, orange);
  }
}

export function shouldSkipArcade(isShop, groundShop) {
  return Boolean(isShop || groundShop);
}

export function shouldSkipHouseAwning(isShop, groundShop) {
  return Boolean(isShop || groundShop);
}

export function dressOwnsShopSign(shop) {
  const brand = shop?.brand || brandOf(shop || {});
  return brand === "yangxin" || brand === "yashanyuan";
}

/** 1F 布條與 2F 招牌不可佔同一段高度。 */
export function shopFasciaLayout(storey = 3.12) {
  const s = storey || 3.12;
  const ground = { y: Math.min(2.58, s - 0.52), h: 0.42, floor: 1 };
  const upperH = 0.58;
  const upperY = s + 1.76;
  return { ground, upper: { y: upperY, h: upperH, floor: 2 } };
}

function placeOnEdge(edge, t, out) {
  const p = alongPoint(edge, t);
  return { x: p.x + edge.nx * out, z: p.z + edge.nz * out };
}

// 推估的近景暗縫僅貼街向正面，寬度退讓兩端，厚度不超過既有門窗的外緣。
function addEstimatedFrontSeam(group, edge, t, y, w, h, out, mat, detail) {
  const safeW = Math.min(w, 2 * edge.len * Math.min(t - 0.08, 0.92 - t));
  if (safeW <= 0) return;
  const p = placeOnEdge(edge, t, out);
  const seam = addBox(group, p.x, y, p.z, safeW, h, 0.018, edge.yaw, mat);
  seam.userData = { kind: "estimated-front-seam", detail, estimated: true };
}

function addTextBoard(group, edge, opts) {
  const { y, w: requestedW, h, tex, out = 0.36, floor = 1, name = "", t = 0.5, depth = 0.08 } = opts;
  const w = isNearSign(edge) ? Math.min(requestedW, edge.len * 0.86) : requestedW;
  const p = placeOnEdge(edge, t, out);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.06, h + 0.06, depth),
    new THREE.MeshLambertMaterial({ color: 0x3a2a18 })
  );
  rim.position.set(p.x, y, p.z);
  rim.rotation.y = edge.yaw;
  group.add(rim);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, depth + 0.03),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  const front = placeOnEdge(edge, t, out + 0.03);
  board.position.set(front.x, y, front.z);
  board.rotation.y = edge.yaw;
  board.userData = { kind: "fascia", floor, y, h, w, name, estimated: true };
  group.add(board);
  addNearFasciaHardware(group, edge, { t, y, w, h, out, depth });
  return board;
}

function addGrille(group, edge, t, y, w, h, out) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x2c2e30 });
  const cols = Math.max(3, Math.round(w / 0.16));
  const rows = Math.max(3, Math.round(h / 0.22));
  for (let i = 0; i < cols; i++) {
    const p = placeOnEdge(edge, t + ((i / (cols - 1) - 0.5) * w) / edge.len, out);
    addBox(group, p.x, y, p.z, 0.025, h, 0.02, edge.yaw, iron);
  }
  for (let i = 0; i < rows; i++) {
    const p = placeOnEdge(edge, t, out);
    addBox(group, p.x, y - h / 2 + (h * i) / (rows - 1), p.z, w, 0.02, 0.02, edge.yaw, iron);
  }
}

function addBarredWindow(group, edge, t, y, w, h, out = 0.16) {
  const p = placeOnEdge(edge, t, out);
  const frame = new THREE.MeshLambertMaterial({ color: 0xd5d8dc });
  const glass = new THREE.MeshBasicMaterial({
    color: 0x6f8794,
    transparent: true,
    opacity: 0.72,
    toneMapped: false,
  });
  addBox(group, p.x, y, p.z, w + 0.1, h + 0.1, 0.06, edge.yaw, frame);
  const g = placeOnEdge(edge, t, out + 0.03);
  addBox(group, g.x, y, g.z, w, h, 0.03, edge.yaw, glass);
  addGrille(group, edge, t, y, w * 0.92, h * 0.88, out + 0.06);
  const sill = placeOnEdge(edge, t, out + 0.05);
  addBox(group, sill.x, y - h / 2 - 0.04, sill.z, w + 0.16, 0.06, 0.12, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xc8c2b4 }));
}

// Only 46 uses an open frame: the shared window helper also dresses approved
// neighbors, whose geometry must remain unchanged in this review round.
function addNo46RecessedWindow(group, edge, t, y, w, h) {
  const address = "鎮撫街46號";
  const cavity = placeOnEdge(edge, t, 0.095);
  const recess = addBox(group, cavity.x, y, cavity.z, w + 0.09, h + 0.09, 0.025, edge.yaw,
    new THREE.MeshLambertMaterial({ color: 0x292f32 }));
  recess.userData = { kind: "upper-window-recess", address, estimated: true };

  const panePos = placeOnEdge(edge, t, 0.155);
  const pane = addBox(group, panePos.x, y, panePos.z, w, h, 0.015, edge.yaw,
    new THREE.MeshStandardMaterial({
      color: 0x7694a1, roughness: 0.23, metalness: 0.04,
      transparent: true, opacity: 0.65, depthWrite: false,
    }));
  pane.userData = { kind: "upper-window-glazing", address, estimated: true };

  const frame = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.58, metalness: 0.04 });
  for (const side of [-1, 1]) {
    const jamb = placeOnEdge(edge, t + side * (w / 2 + 0.0275) / edge.len, 0.22);
    const jambMesh = addBox(group, jamb.x, y, jamb.z, 0.055, h + 0.11, 0.08, edge.yaw, frame);
    const rail = placeOnEdge(edge, t, 0.22);
    const railMesh = addBox(group, rail.x, y + side * (h / 2 + 0.0275), rail.z,
      w + 0.11, 0.055, 0.08, edge.yaw, frame);
    jambMesh.userData = railMesh.userData = { kind: "upper-window-frame", address, estimated: true };
  }
  addGrille(group, edge, t, y, w * 0.92, h * 0.88, 0.28);
  const sill = placeOnEdge(edge, t, 0.24);
  const sillMesh = addBox(group, sill.x, y - h / 2 - 0.04, sill.z,
    w + 0.16, 0.06, 0.12, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xc8c2b4 }));
  sillMesh.userData = { kind: "upper-window-sill", address, estimated: true };
}

function addAcUnit(group, edge, t, y, out = 0.34) {
  const p = placeOnEdge(edge, t, out);
  const body = new THREE.MeshLambertMaterial({ color: 0xf4f7f8 });
  const slot = new THREE.MeshLambertMaterial({ color: 0x8d9498 });
  addBox(group, p.x, y, p.z, 0.72, 0.42, 0.28, edge.yaw, body);
  const f = placeOnEdge(edge, t, out + 0.15);
  addBox(group, f.x, y - 0.02, f.z, 0.58, 0.16, 0.02, edge.yaw, slot);
}

function addPaperLantern(group, edge, t, y, out = 0.38) {
  const p = placeOnEdge(edge, t, out);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xd3222c })
  );
  body.scale.set(1, 0.78, 1);
  body.position.set(p.x, y, p.z);
  body.userData = { kind: "lantern" };
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.045, 8),
    new THREE.MeshLambertMaterial({ color: 0xf0c14a })
  );
  band.position.set(p.x, y, p.z);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.07, 0.07, 6),
    new THREE.MeshLambertMaterial({ color: 0xc9a24a })
  );
  cap.position.set(p.x, y + 0.15, p.z);
  group.add(body, band, cap);
}

/** 46 號以材質框線、入口及門牌作為全圖的視覺錨點；不改建物地理輪廓。 */
function dressYashanFront(group, edge, storey, layout) {
  const s = storey || 3.12;
  const nearHero = Math.max(Math.hypot(edge.a.x, edge.a.z), Math.hypot(edge.b.x, edge.b.z)) + 0.2 <= 50;
  const span = Math.min(edge.len * 0.9, edge.len - 0.15);
  const wood = new THREE.MeshLambertMaterial({ color: 0x4a3424 });
  const brick = new THREE.MeshLambertMaterial({ color: 0xa8483c });
  const pier = placeOnEdge(edge, 0.07, 0.14);
  addBox(group, pier.x, s + 0.55, pier.z, 0.42, s * 2 - 0.2, 0.22, edge.yaw, brick);

  const stone = new THREE.MeshStandardMaterial({ color: 0xc8b393, roughness: 0.86, metalness: 0 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x705239, roughness: 0.58, metalness: 0.2 });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffe1a5, toneMapped: false });
  const back = placeOnEdge(edge, 0.52, 0.11);
  const upperField = addBox(group, back.x, s + 1.77, back.z, span * 0.84, 0.9, 0.07, edge.yaw, bronze);
  upperField.userData = { kind: "feature-frame", address: "鎮撫街46號", estimated: true };
  for (const t of [0.13, 0.89]) {
    const lower = placeOnEdge(edge, t, 0.23);
    addBox(group, lower.x, 1.48, lower.z, 0.12, 2.92, 0.12, edge.yaw, stone);
    const upper = placeOnEdge(edge, t, 0.21);
    addBox(group, upper.x, s + 1.55, upper.z, 0.12, 3.1, 0.12, edge.yaw, stone);
    const top = placeOnEdge(edge, t, 0.2);
    addBox(group, top.x, (s * 2 + 9.9) / 2, top.z, 0.1, 9.9 - s * 2, 0.11, edge.yaw, stone);
  }
  for (const y of [s + 0.04, s * 2 + 0.07, 9.82]) {
    const band = placeOnEdge(edge, 0.51, 0.23);
    addBox(group, band.x, y, band.z, span * 0.91, 0.13, 0.16, edge.yaw, stone);
  }

  const lintelY = layout.ground.y + layout.ground.h / 2 + 0.18;
  const beam = placeOnEdge(edge, 0.52, 0.16);
  addBox(group, beam.x, lintelY, beam.z, span * 0.86, 0.22, 0.16, edge.yaw, wood);
  const canopy = placeOnEdge(edge, 0.52, 0.62);
  const canopyMesh = addBox(group, canopy.x, lintelY + 0.16, canopy.z, span * 0.84, 0.18, 0.92, edge.yaw, bronze);
  canopyMesh.userData = { kind: "awning", address: "鎮撫街46號", estimated: true };
  const canopyEdge = placeOnEdge(edge, 0.52, 1.08);
  addBox(group, canopyEdge.x, lintelY + 0.08, canopyEdge.z, span * 0.8, 0.05, 0.045, edge.yaw, warm);

  const glassY = (lintelY - 0.2) * 0.48;
  const glassH = lintelY - 0.28;
  const interior = new THREE.MeshLambertMaterial({
    color: 0x514b43,
    emissive: 0x6a5033,
    emissiveIntensity: 0.18,
  });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x3a3028 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x78939d,
    transparent: true,
    opacity: 0.58,
    roughness: 0.2,
    metalness: 0.04,
    depthWrite: false,
  });
  const reveal = new THREE.MeshLambertMaterial({ color: 0x211a16 });
  const shopFront = placeOnEdge(edge, 0.55, 0.08);
  addBox(group, shopFront.x, glassY, shopFront.z, span * 0.78, glassH, 0.06, edge.yaw, interior);
  for (const t of [0.38, 0.7]) {
    const winW = Math.min(0.85, span * 0.22);
    // A solid frame slab made the glass look like grey concrete. Keep an open
    // aperture and set its pane behind the frame, in front of the dark recess.
    for (const side of [-1, 1]) {
      const jamb = placeOnEdge(edge, t + side * (winW / 2 + 0.02) / edge.len, 0.18);
      const jambMesh = addBox(group, jamb.x, glassY, jamb.z, 0.06, glassH * 0.86, 0.09, edge.yaw, frameMat);
      const rail = placeOnEdge(edge, t, 0.18);
      const railMesh = addBox(group, rail.x, glassY + side * glassH * 0.43, rail.z,
        winW + 0.08, 0.04, 0.07, edge.yaw, frameMat);
      jambMesh.userData = railMesh.userData = { kind: "storefront-frame", address: "鎮撫街46號", estimated: true };
    }
    const g = placeOnEdge(edge, t, 0.14);
    const pane = addBox(group, g.x, glassY, g.z, winW, glassH * 0.74, 0.015, edge.yaw, glassMat);
    pane.userData = { kind: "storefront-glazing", address: "鎮撫街46號", estimated: true };
    const outerSide = t < 0.54 ? -1 : 1;
    addEstimatedFrontSeam(group, edge, t + outerSide * (winW / 2 + 0.025) / edge.len,
      glassY, 0.018, glassH * 0.82, 0.19, reveal, "46-window");
    const outerGlassT = t + outerSide * (winW / 2 - 0.01) / edge.len;
    const innerGlassT = t - outerSide * (winW / 2 - 0.01) / edge.len;
    const doorEdgeT = 0.54 + outerSide * (0.39 + 0.025) / edge.len;
    const safeInnerT = outerSide < 0 ? Math.min(innerGlassT, doorEdgeT) : Math.max(innerGlassT, doorEdgeT);
    addEstimatedFrontSeam(group, edge, (outerGlassT + safeInnerT) / 2, glassY - glassH * 0.39,
      Math.abs(outerGlassT - safeInnerT) * edge.len, 0.018, 0.19, reveal, "46-window");
    // 只給既有窗框一條薄收水線，不憑空增加門窗或佔用騎樓地面。
    if (nearHero) addEstimatedFrontSeam(group, edge, t, glassY + glassH * 0.43,
      winW + 0.1, 0.025, 0.18, stone, "46-window-head");
  }
  const doorY = glassY - 0.04;
  const doorH = glassH * 0.96;
  for (const side of [-1, 1]) {
    const jamb = placeOnEdge(edge, 0.54 + side * 0.36 / edge.len, 0.18);
    const jambMesh = addBox(group, jamb.x, doorY, jamb.z, 0.06, doorH, 0.07, edge.yaw, frameMat);
    const rail = placeOnEdge(edge, 0.54, 0.18);
    const railMesh = addBox(group, rail.x, doorY + side * doorH * 0.48, rail.z,
      0.78, 0.045, 0.07, edge.yaw, frameMat);
    jambMesh.userData = railMesh.userData = { kind: "storefront-frame", address: "鎮撫街46號", estimated: true };
  }
  if (nearHero) for (const side of [-1, 1]) {
    addEstimatedFrontSeam(group, edge, 0.54 + side * 0.42 / edge.len,
      glassY - 0.04, 0.035, glassH * 0.95, 0.18, stone, "46-entry-jamb");
  }
  addEstimatedFrontSeam(group, edge, 0.54, glassY - 0.04 + glassH * 0.46,
    0.72, 0.022, 0.19, reveal, "46-door-head");
  const doorGlass = placeOnEdge(edge, 0.54, 0.14);
  const doorPane = addBox(group, doorGlass.x, glassY - 0.02, doorGlass.z,
    0.62, glassH * 0.82, 0.015, edge.yaw, glassMat);
  doorPane.userData = { kind: "storefront-glazing", address: "鎮撫街46號", estimated: true };
  const doorKick = placeOnEdge(edge, 0.54, 0.24);
  addBox(group, doorKick.x, 0.27, doorKick.z, 0.65, 0.2, 0.025, edge.yaw, bronze);
  for (const side of [-1, 1]) {
    const mullion = placeOnEdge(edge, 0.54 + side * 0.25 / edge.len, 0.245);
    addBox(group, mullion.x, glassY, mullion.z, 0.025, glassH * 0.78, 0.028, edge.yaw, bronze);
  }
  const handle = placeOnEdge(edge, 0.54 + 0.16 / edge.len, 0.29);
  const handleMesh = addBox(group, handle.x, 1.16, handle.z, 0.025, 0.27, 0.045, edge.yaw, warm);
  handleMesh.userData = { kind: "entry-handle", address: "鎮撫街46號", estimated: true };
  const threshold = placeOnEdge(edge, 0.54, 0.42);
  addBox(group, threshold.x, 0.08, threshold.z, 0.96, 0.12, 0.4, edge.yaw, stone);
  for (const t of [0.29, 0.78]) {
    const sconce = placeOnEdge(edge, t, 0.43);
    addBox(group, sconce.x, 2.08, sconce.z, 0.12, 0.32, 0.1, edge.yaw, bronze);
    const glow = placeOnEdge(edge, t, 0.5);
    addBox(group, glow.x, 2.08, glow.z, 0.055, 0.22, 0.025, edge.yaw, warm);
  }
  const numberPos = placeOnEdge(edge, 0.89, 0.47);
  const numberBack = addBox(group, numberPos.x, 1.54, numberPos.z, 0.38, 0.35, 0.075, edge.yaw, bronze);
  numberBack.userData = { kind: "address-plaque", number: "46", estimated: true };
  const numberFace = placeOnEdge(edge, 0.89, 0.54);
  addBox(group, numberFace.x, 1.54, numberFace.z, 0.32, 0.28, 0.025, edge.yaw,
    new THREE.MeshBasicMaterial({ map: makeRoadWordTexture("46"), transparent: true, toneMapped: false }));

  const bannerW = Math.min(span * 0.78, 3.15);
  addTextBoard(group, edge, {
    y: layout.ground.y,
    w: bannerW,
    h: layout.ground.h,
    t: 0.55,
    out: 0.48,
    depth: 0.18,
    floor: 1,
    name: "雅善圓蔬食館",
    tex: makeYashanyuanFasciaTexture(bannerW / layout.ground.h),
  });

  const winY = s + 0.95;
  const winH = 1.02;
  const winW = Math.min(0.5, edge.len * 0.15);
  for (const t of [0.36, 0.55, 0.74]) {
    addNo46RecessedWindow(group, edge, t, winY, winW, winH);
    if (nearHero) addEstimatedFrontSeam(group, edge, t, winY + winH / 2 + 0.06,
      winW + 0.12, 0.035, 0.18, stone, "46-upper-window-head");
  }
  // No facade photo confirms the two AC units or wide horizontal trim;
  // both covered the surveyed three-storey shop's second-floor windows.
  const plaqueW = Math.min(span * 0.86, 3.3);
  const plaqueT = 0.55;
  const plaque = placeOnEdge(edge, plaqueT, 0.28);
  const plaqueRim = new THREE.Mesh(
    new THREE.BoxGeometry(plaqueW + 0.08, layout.upper.h + 0.08, 0.18),
    new THREE.MeshLambertMaterial({ color: 0x5b3927 })
  );
  plaqueRim.position.set(plaque.x, layout.upper.y, plaque.z);
  plaqueRim.rotation.y = edge.yaw;
  group.add(plaqueRim);
  const plaqueMesh = new THREE.Mesh(
    new THREE.BoxGeometry(plaqueW, layout.upper.h, 0.14),
    new THREE.MeshBasicMaterial({ map: makeYangxinPlaqueTexture(), toneMapped: false })
  );
  const plaqueFace = placeOnEdge(edge, plaqueT, 0.34);
  plaqueMesh.position.set(plaqueFace.x, layout.upper.y, plaqueFace.z);
  plaqueMesh.rotation.y = edge.yaw;
  plaqueMesh.userData = {
    kind: "fascia",
    floor: 2,
    y: layout.upper.y,
    h: layout.upper.h,
    w: plaqueW,
    name: "桃園養心推拿",
    estimated: true,
  };
  group.add(plaqueMesh);
  const signLight = placeOnEdge(edge, plaqueT, 0.38);
  addBox(group, signLight.x, layout.upper.y + layout.upper.h / 2 + 0.065, signLight.z,
    plaqueW * 0.94, 0.025, 0.03, edge.yaw, warm);

  const signH = 3.7;
  const signY = 3.15;
  addCornerVertical(group, edge, { name: "雅善圓蔬食館", color: "#e2185a" }, signY, signH, 0.1);
  const darkP = placeOnEdge(edge, 0.02, 0.62);
  const dark = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.72, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x241c16 })
  );
  dark.position.set(darkP.x, signY + 0.85, darkP.z);
  dark.rotation.y = edge.yaw;
  dark.userData = { kind: "blade", name: "", t: 0.02, y: signY + 0.85, h: 0.72, estimated: true };
  group.add(dark);
  const gold = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.48, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xe6c15a, toneMapped: false })
  );
  const goldP = placeOnEdge(edge, 0.02, 0.67);
  gold.position.set(goldP.x, signY + 0.85, goldP.z);
  gold.rotation.y = edge.yaw;
  group.add(gold);

  const railY = s * 2 + 0.08;
  const railW = Math.min(edge.len * 0.82, 3.2);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x5e666c });
  const cornice = placeOnEdge(edge, 0.55, 0.2);
  addBox(group, cornice.x, s * 2 - 0.06, cornice.z, Math.min(edge.len * 0.9, 3.3), 0.12, 0.22, edge.yaw, new THREE.MeshLambertMaterial({ color: 0x6a5648 }));
  const slabP = placeOnEdge(edge, 0.55, 0.5);
  addBox(group, slabP.x, railY, slabP.z, railW, 0.1, 0.72, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xd5dbe0 }));
  const railP = placeOnEdge(edge, 0.55, 0.82);
  addBox(group, railP.x, railY + 0.55, railP.z, railW, 0.05, 0.05, edge.yaw, railMat);
  for (let i = 0; i < 8; i++) {
    const rt = 0.55 + ((i / 7 - 0.5) * railW) / edge.len;
    const bar = placeOnEdge(edge, rt, 0.82);
    addBox(group, bar.x, railY + 0.28, bar.z, 0.03, 0.52, 0.03, edge.yaw, railMat);
  }
  const topWindowW = Math.min(1.35, edge.len * 0.4);
  addNo46RecessedWindow(group, edge, 0.55, railY + 1.15, topWindowW, 1.05);
  if (nearHero) addEstimatedFrontSeam(group, edge, 0.55, railY + 1.15 + 1.05 / 2 + 0.06,
    topWindowW + 0.12, 0.035, 0.18, stone, "46-top-window-head");

  if (nearHero) {
    for (const t of [0.18, 0.86]) {
      const pier = placeOnEdge(edge, t, 1.05);
      const column = addBox(group, pier.x, 1.28, pier.z, 0.28, 2.5, 0.28, edge.yaw, stone);
      column.userData = { kind: "arcade-column", address: "鎮撫街46號", estimated: true };
      const base = placeOnEdge(edge, t, 1.05);
      addBox(group, base.x, 0.08, base.z, 0.4, 0.16, 0.4, edge.yaw, stone);
      const capital = placeOnEdge(edge, t, 1.05);
      addBox(group, capital.x, 2.58, capital.z, 0.38, 0.1, 0.38, edge.yaw, bronze);
    }
    const pipe = createDrainpipeDetail(9.9, "nlsc/414");
    if (pipe) {
      const at = placeOnEdge(edge, 0.04, 0.18);
      pipe.position.set(at.x, 0, at.z);
      group.add(pipe);
    }
  }

  return { fascia: 2, extras: 0 };
}

export function dressShopLot(group, pts, roads, storey, opts) {
  const { groundShop, upperShop, isShop } = opts;
  const edge = streetFacingEdge(pts, roads);
  if (!edge || edge.len < 1.8) return { fascia: 0, extras: 0, edge: null };
  let fascia = 0;
  let extras = 0;
  const w = Math.min(Math.max(edge.len * 0.78, 2.35), 4.6);
  const paired = isShop || groundShop?.brand === "yashanyuan" || upperShop?.brand === "yangxin";
  const layout = shopFasciaLayout(storey);

  if (paired && (isShop || groundShop?.brand === "yashanyuan" || upperShop?.brand === "yangxin")) {
    const built = dressYashanFront(group, edge, storey || 3.12, layout);
    fascia += built.fascia;
    extras += built.extras;
  } else if (groundShop && isChainStore(groundShop.brand)) {
    addBrandCanopy(group, edge, groundShop.brand);
    addFasciaBoard(group, edge, {
      y: 3.18,
      w: Math.min(Math.max(edge.len * 0.88, 3.4), 6.4),
      h: 0.78,
      shop: groundShop,
      out: 1.66,
      depth: 0.1,
    });
    fascia += 1;
    if (groundShop.brand === "seven") {
      addSevenExtras(group, edge);
      extras += 3;
    } else if (groundShop.brand === "simplemart") {
      addSimpleMartExtras(group, edge);
      extras += 1;
    } else if (groundShop.brand === "pxmart") {
      addPxmartExtras(group, edge);
      extras += 1;
    } else if (groundShop.brand === "shopee") {
      addShopeeExtras(group, edge);
      extras += 1;
    }
  } else if (groundShop?.name) {
    const seed = hash01(groundShop.name, 2);
    const awningTones = [0xb08968, 0x8b2c24, 0x2c4a7a, 0x2d6a4f, 0xc45c26];
    // The lettered board sits at out ≈ 0.41. Keep the valance on the wall
    // behind that face and below the lettering so it cannot pierce the name.
    const fasciaY = 2.48;
    const fasciaH = 0.78;
    addValanceAwning(
      group,
      edge,
      fasciaY - fasciaH / 2 - 0.18,
      awningTones[Math.floor(seed * awningTones.length)],
      Math.min(edge.len * 0.92, 8.2),
      { depth: 0.22, out: 0.16 },
    );
    addFasciaBoard(group, edge, {
      y: 2.48,
      w,
      h: 0.78,
      shop: groundShop,
      out: 0.3,
      depth: 0.12,
    });
    fascia += 1;
    if ((groundShop.name || "").length <= 6) {
      addCornerVertical(group, edge, groundShop, 2.05, 1.45);
      extras += 1;
    }
  }

  if (!paired && upperShop?.name) {
    addFasciaBoard(group, edge, {
      y: storey + 0.95,
      w: w * 0.88,
      h: 0.7,
      shop: upperShop,
      out: 0.26,
      depth: 0.1,
    });
    fascia += 1;
  }

  const dist = paired ? 9.6 : 8.2;
  return {
    fascia,
    extras,
    edge,
    view: {
      x: edge.mx + edge.nx * dist,
      z: edge.mz + edge.nz * dist,
      lookX: edge.mx,
      lookZ: edge.mz,
      y: paired ? 6.4 : 3.4,
      lookY: paired ? 4.5 : 2.4,
    },
  };
}

function ringMinDist(pts, q) {
  let best = Infinity;
  const n = pts.length;
  const closed = n > 2 && pts[0].x === pts[n - 1].x && pts[0].z === pts[n - 1].z;
  const count = closed ? n - 1 : n;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    let t = ((q.x - a.x) * vx + (q.z - a.z) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(q.x - (a.x + vx * t), q.z - (a.z + vz * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * 站在馬路上看店面時，左右緊鄰的臨街地。
 * 店面邊 a→b 指向觀者左側（Three.js 相機 right = up × backward）。
 */
export function facingNeighborLots(shopPts, lots, roads) {
  const edge = streetFacingEdge(shopPts, roads);
  if (!edge) return { left: null, right: null, edge: null };
  let left = null;
  let right = null;
  for (const lot of lots || []) {
    if (!lot?.pts || lot.isShop) continue;
    const face = streetFacingEdge(lot.pts, roads);
    if (!face || Math.sqrt(face.roadDist) > 12 || face.len < 1.6) continue;
    const dLeft = ringMinDist(lot.pts, edge.b);
    const dRight = ringMinDist(lot.pts, edge.a);
    if (dLeft < 2.8 && (!left || dLeft < left.d)) {
      left = { id: lot.id, lot, d: dLeft, edge: face, role: "shutter" };
    }
    if (dRight < 2.8 && (!right || dRight < right.d)) {
      right = { id: lot.id, lot, d: dRight, edge: face, role: "brick" };
    }
  }
  if (left && right && left.id === right.id) {
    if (left.d <= right.d) right = null;
    else left = null;
  }
  return { left, right, edge };
}

function viewFromEdge(edge, dist = 6.4) {
  return {
    x: edge.mx + edge.nx * dist,
    z: edge.mz + edge.nz * dist,
    lookX: edge.mx,
    lookZ: edge.mz,
  };
}

/** 只改 46 號左右兩棟：左側淺色鐵門，右側紅磚接到綠棚餐食店。 */
export function dressNeighborFacade(group, edge, role, storey, bodyH, shopEdge) {
  if (!edge || edge.len < 1.6) return { fascia: 0, view: null };
  const floorH = storey || 3.2;
  if (role === "shutter") {
    dressShutterNeighbor(group, edge, floorH, bodyH);
    return { fascia: 0, view: viewFromEdge(edge, 7.4) };
  }
  dressBrickBakery(group, edge, floorH, bodyH, shopEdge);
  return { fascia: 0, view: viewFromEdge(edge, 6.6) };
}

function dressShutterNeighbor(group, edge, floorH, bodyH) {
  const pale = new THREE.MeshLambertMaterial({ color: 0xe7eef2 });
  const metal = new THREE.MeshLambertMaterial({ color: 0xb7c3c8 });
  const recess = new THREE.MeshLambertMaterial({ color: 0x76868d });
  const span = Math.min(edge.len * 0.72, 3.4);
  const front = placeOnEdge(edge, 0.5, 0.1);
  const shutter = addBox(group, front.x, floorH * 0.42, front.z, span, floorH * 0.72, 0.08, edge.yaw, pale);
  shutter.userData = { kind: "shutter" };
  const ribs = Math.max(6, Math.round(span / 0.12));
  for (let i = 0; i < ribs; i++) {
    const y = 0.35 + (i * (floorH * 0.62)) / ribs;
    const rib = placeOnEdge(edge, 0.5, 0.16);
    addBox(group, rib.x, y, rib.z, span * 0.96, 0.035, 0.04, edge.yaw, metal);
  }
  for (const side of [-1, 1]) {
    addEstimatedFrontSeam(group, edge, 0.5 + side * span * 0.48 / edge.len,
      floorH * 0.42, 0.025, floorH * 0.72, 0.17, recess, "shutter-edge");
  }
  addEstimatedFrontSeam(group, edge, 0.5, floorH * 0.78,
    span * 0.96, 0.025, 0.17, recess, "shutter-head");
  const bladeP = placeOnEdge(edge, 0.22, 0.55);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.95, 0.42),
    new THREE.MeshLambertMaterial({ color: 0xf4f7f8 })
  );
  blade.position.set(bladeP.x, 2.15, bladeP.z);
  blade.rotation.y = edge.yaw + Math.PI / 2;
  blade.userData = { kind: "blade", name: "", t: 0.22, y: 2.15, h: 0.95 };
  group.add(blade);
  const pot = placeOnEdge(edge, 0.12, 0.7);
  addBox(group, pot.x, 0.22, pot.z, 0.28, 0.28, 0.28, edge.yaw, new THREE.MeshLambertMaterial({ color: 0x8d5a3c }));
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x2f6a38 })
  );
  leaf.position.set(pot.x, 0.55, pot.z);
  group.add(leaf);
  addPaperLantern(group, edge, 0.86, floorH - 0.15, 0.4);
  const lintel = placeOnEdge(edge, 0.5, 0.62);
  const awning = addBox(group, lintel.x, floorH * 0.82, lintel.z, span * 0.96, 0.18, 1.05, edge.yaw,
    new THREE.MeshLambertMaterial({ color: 0xc5ced4 }));
  awning.userData = { kind: "awning", address: "鎮撫街48號", estimated: true };
  if (isNearSign(edge)) {
    for (const t of [0.14, 0.86]) {
      const pier = placeOnEdge(edge, t, 0.95);
      const column = addBox(group, pier.x, floorH * 0.4, pier.z, 0.26, floorH * 0.78, 0.26, edge.yaw, metal);
      column.userData = { kind: "arcade-column", address: "鎮撫街48號", estimated: true };
    }
    const pipe = createDrainpipeDetail(bodyH || 14.6, "nlsc/410");
    if (pipe) {
      const at = placeOnEdge(edge, 0.96, 0.16);
      pipe.position.set(at.x, 0, at.z);
      group.add(pipe);
    }
  }
  let y = floorH + 1.35;
  let guard = 0;
  while (y < (bodyH || floorH + 6) - 0.8 && guard < 4) {
    const slab = placeOnEdge(edge, 0.5, 0.48);
    addBox(group, slab.x, y - 0.7, slab.z, Math.min(edge.len * 0.7, 3.2), 0.08, 0.7, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xc8c2b6 }));
    const rail = placeOnEdge(edge, 0.5, 0.78);
    addBox(group, rail.x, y - 0.28, rail.z, Math.min(edge.len * 0.7, 3.2), 0.04, 0.04, edge.yaw, new THREE.MeshLambertMaterial({ color: 0x8d9398 }));
    addBarredWindow(group, edge, 0.32, y, 0.7, 1.05, 0.16);
    addBarredWindow(group, edge, 0.68, y, 0.7, 1.05, 0.16);
    y += 3.05;
    guard += 1;
  }
}

function dressBrickBakery(group, edge, floorH, bodyH) {
  const span = Math.min(edge.len * 0.92, 4.2);
  const mortar = new THREE.MeshLambertMaterial({ color: 0x463930 });
  for (const t of [0.18, 0.84]) {
    addEstimatedFrontSeam(group, edge, t, floorH * 0.41,
      0.025, floorH * 0.7, 0.08, mortar, "brick-reveal");
  }
  addValanceAwning(group, edge, floorH - 0.35, 0x2f8f4e, span);
  const awning = group.children[group.children.length - 1];
  awning.userData = { kind: "awning" };
  const caseP = placeOnEdge(edge, 0.55, 0.7);
  const frame = new THREE.MeshLambertMaterial({ color: 0xf7f4ee });
  const glass = new THREE.MeshBasicMaterial({
    color: 0xd5e4ea,
    transparent: true,
    opacity: 0.45,
    toneMapped: false,
  });
  const foodCase = addBox(group, caseP.x, 0.72, caseP.z, Math.min(span * 0.7, 1.6), 1.15, 0.55, edge.yaw, frame);
  foodCase.userData = { kind: "food-case" };
  const face = placeOnEdge(edge, 0.55, 0.98);
  addBox(group, face.x, 0.78, face.z, Math.min(span * 0.62, 1.4), 0.85, 0.04, edge.yaw, glass);
  const bunMat = new THREE.MeshLambertMaterial({ color: 0xe6c48a });
  for (let i = 0; i < 3; i++) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), bunMat);
    const bp = placeOnEdge(edge, 0.48 + i * 0.06, 0.72);
    bun.position.set(bp.x, 0.95, bp.z);
    group.add(bun);
  }
  addPaperLantern(group, edge, 0.2, floorH - 0.05, 0.55);
  addPaperLantern(group, edge, 0.8, floorH + 0.15, 0.4);
  let y = floorH + 1.35;
  let guard = 0;
  while (y < (bodyH || floorH + 6) - 0.7 && guard < 3) {
    addBarredWindow(group, edge, 0.45, y, Math.min(0.85, edge.len * 0.35), 1.05, 0.14);
    if (guard === 0) addAcUnit(group, edge, 0.78, y, 0.36);
    y += 3.05;
    guard += 1;
  }
}
