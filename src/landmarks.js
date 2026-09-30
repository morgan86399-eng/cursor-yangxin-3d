import * as THREE from "three";
import { streetFacingEdge } from "./geo.js";
import { makeFulongBoardTexture, makeVerticalSignTexture } from "./textures.js";

/** 110 縣道路口與鎮撫街這一段的特定建物。不含 46 號雅善圓。 */
const LANDMARKS = {
  "nlsc/341": { kind: "eightyfive", height: 8.4, storey: 3.4, ground: "black", upper: "black", ownsSign: true, skipGround: true },
  "nlsc/354": { kind: "fulong", height: 8.6, storey: 3.5, ground: "red", upper: "red", ownsSign: true, skipGround: true },
  // The 2019 image supports a shorter pale-tile silhouette; metre height is not surveyed.
  "nlsc/392": { kind: "sihai", height: 10.4, storey: 3.2, ground: "whiteTile", upper: "whiteTile",
    ownsSign: true, sourceImage: "Mapillary/516366592838568", sourceYear: 2019, currentHeightUnverified: true },
  "nlsc/407": { kind: "credit", height: 16.2, storey: 3.2, ground: "beige", upper: "beige", ownsSign: true },
  "nlsc/333": { kind: "corner-apt", height: 15.2, storey: 3.2, ground: "beige", upper: "beige" },
  "nlsc/352": { kind: "green-apt", height: 14.6, storey: 3.2, ground: "yellowgreen", upper: "yellowgreen" },
  "nlsc/337": { kind: "clinic", height: 12.4, storey: 3.2, ground: "beige", upper: "beige", ownsSign: true },
  "nlsc/327": { kind: "laundry", height: 11.8, storey: 3.2, ground: "beige", upper: "beige", ownsSign: true },
  "nlsc/343": { kind: "cambridge", height: 10.4, storey: 3.3, ground: "brick", upper: "brick", ownsSign: true, skipGround: true },
  "nlsc/403": { kind: "jian", height: 12.2, storey: 3.2, ground: "beige", upper: "beige", ownsSign: true },
  "way/363250888": { kind: "police", height: 5.4, storey: 3.6, ground: "grey", upper: "grey", ownsSign: true, skipGround: true },
};

const FACADE_SIGN_NAMES = new Set(["四海遊龍", "85度C", "青溪派出所"]);

export function landmarkFor(id) {
  return LANDMARKS[id] || null;
}

export function facadeOwnsListedSign(shop) {
  return FACADE_SIGN_NAMES.has(String(shop?.name || ""));
}

function place(edge, t, out) {
  const x = edge.a.x + (edge.b.x - edge.a.x) * t + edge.nx * out;
  const z = edge.a.z + (edge.b.z - edge.a.z) * t + edge.nz * out;
  return { x, z };
}

function addBox(group, x, y, z, sx, sy, sz, yaw, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
  return mesh;
}

function plainSignTexture(text, bg, ink) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 280);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 72px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
  ctx.fillText(text, 512, 148);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sihai2019Texture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  // MAP_003/004 show a light fascia at this corner, not a solid navy box.
  // Its exact shop-to-footprint alignment still needs a facade survey.
  ctx.fillStyle = "#eee9dc";
  ctx.fillRect(0, 0, 1024, 280);
  ctx.fillStyle = "#132d3e";
  ctx.fillRect(0, 0, 1024, 14);
  ctx.fillStyle = "#1c3445";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 102px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
  ctx.fillText("四海遊龍", 512, 132);
  ctx.fillStyle = "#a54a3e";
  ctx.fillRect(0, 242, 1024, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addHistoricalSihaiCanopy(group, edge, width) {
  const provenance = { kind: "historical-sihai-canopy", sourceImage: "Mapillary/505287670657351",
    sourceYear: 2019, placementEstimated: true, lotMatchEstimated: true,
    currentAppearanceUnverified: true };
  const w = Math.min(width, edge.len * 0.88);
  const p = place(edge, 0.5, 0.58);
  const steel = new THREE.MeshLambertMaterial({ color: 0x777878 });
  const fabric = new THREE.MeshLambertMaterial({ color: 0xddd9cf, side: THREE.DoubleSide });
  const canopy = addBox(group, p.x, 2.54, p.z, w, 0.055, 1.08, edge.yaw, fabric);
  canopy.userData = provenance;
  const lip = place(edge, 0.5, 1.14);
  const valance = addBox(group, lip.x, 2.43, lip.z, w, 0.17, 0.045, edge.yaw, fabric);
  valance.userData = provenance;
  for (const t of [0.17, 0.83]) {
    const anchor = place(edge, t, 0.55);
    const bar = addBox(group, anchor.x, 2.55, anchor.z, 0.035, 0.035, 1.05, edge.yaw, steel);
    bar.userData = provenance;
  }
  return w;
}

function addBoard(group, edge, { t = 0.5, y, w, h, tex, out = 0.42, name = "" }) {
  const p = place(edge, t, out);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.08),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  board.position.set(p.x, y, p.z);
  board.rotation.y = edge.yaw;
  board.userData = { kind: "fascia", name, y, h, w };
  group.add(board);
  return board;
}

// The round silhouette is visible in a 2019 Spring Road image. The lettering
// deliberately stays generic because the present-day storefront is unverified.
export function dressNear50HistoricalCorner(group, pts, roads, id) {
  if (id !== "nlsc/399") return false;
  const edge = streetFacingEdge(pts, roads);
  if (!edge || edge.len < 5.5 || Math.sqrt(edge.roadDist) > 9) return false;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ae2731";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f3eee5";
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a22630";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 61px 'Noto Sans TC','PingFang TC',sans-serif";
  ctx.fillText("彩券", 128, 132);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const t = 0.18;
  const y = 3.78;
  const p = place(edge, t, 0.72);
  const provenance = { kind: "near50-historical-round-sign", name: "彩券",
    sourceImage: "Mapillary/516366592838568", sourceYear: 2019,
    placementEstimated: true, lotMatchEstimated: true, currentAppearanceUnverified: true };
  const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.095, 32),
    new THREE.MeshLambertMaterial({ color: 0xc9c5be }));
  caseMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(edge.nx, 0, edge.nz));
  caseMesh.position.set(p.x, y, p.z);
  caseMesh.userData = { ...provenance, kind: "near50-historical-round-sign-case" };
  group.add(caseMesh);
  for (const back of [false, true]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 32),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
    disc.position.set(p.x + edge.nx * (back ? -0.065 : 0.065), y,
      p.z + edge.nz * (back ? -0.065 : 0.065));
    disc.rotation.y = edge.yaw + (back ? Math.PI : 0);
    disc.userData = provenance;
    group.add(disc);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 32),
    new THREE.MeshLambertMaterial({ color: 0xc9c5be }));
  rim.position.set(p.x, y, p.z);
  rim.rotation.y = edge.yaw;
  rim.userData = provenance;
  group.add(rim);
  const anchor = place(edge, t, 0.38);
  const mount = addBox(group, anchor.x, y, anchor.z, 0.055, 0.055, 0.62, edge.yaw,
    new THREE.MeshLambertMaterial({ color: 0x6c7073 }));
  mount.userData = { ...provenance, kind: "near50-historical-round-sign-anchor" };
  return true;
}

function addVertical(group, edge, { t, y, h, name, color }) {
  const tex = makeVerticalSignTexture(name, color);
  const p = place(edge, t, 0.55);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, h, 0.1),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  board.position.set(p.x, y, p.z);
  board.rotation.y = edge.yaw;
  board.userData = { kind: "blade", name, t, y, h };
  group.add(board);
}

function addShutter(group, edge, y, h, width) {
  const metal = new THREE.MeshLambertMaterial({ color: 0xb7b3ae });
  const p = place(edge, 0.55, 0.12);
  const door = addBox(group, p.x, y, p.z, width, h, 0.06, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xd5d2cc }));
  door.userData = { kind: "shutter" };
  const ribs = 7;
  for (let i = 0; i < ribs; i++) {
    const ry = y - h / 2 + ((i + 0.5) * h) / ribs;
    const rib = place(edge, 0.55, 0.16);
    addBox(group, rib.x, ry, rib.z, width * 0.96, 0.035, 0.03, edge.yaw, metal);
  }
}

function addAcRow(group, edge, floors) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xf4f7f8 });
  floors.forEach((y, floor) => {
    for (let i = 0; i < 2; i++) {
      const p = place(edge, 0.28 + i * 0.38, 0.28);
      addBox(group, p.x, y + floor * 0.15, p.z, 0.7, 0.36, 0.28, edge.yaw, mat);
    }
  });
}

function addPatrolCar(group, edge, t, out) {
  const p = place(edge, t, out);
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x243044 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9eb4c4 });
  addBox(group, p.x, 0.42, p.z, 1.7, 0.48, 0.78, edge.yaw, white);
  addBox(group, p.x, 0.78, p.z, 0.85, 0.36, 0.72, edge.yaw, glass);
  const stripe = place(edge, t, out + 0.4);
  addBox(group, stripe.x, 0.48, stripe.z, 1.72, 0.1, 0.02, edge.yaw, dark);
  const car = group.children[group.children.length - 1];
  car.userData = { kind: "patrol" };
}

function addTelecomTower(group, x, z) {
  const steel = new THREE.MeshLambertMaterial({ color: 0xb7bdc2 });
  const h = 26;
  const foot = 2.4;
  const legs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [sx, sz] of legs) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, h, 5), steel);
    leg.position.set(x + sx * foot * 0.35, h / 2, z + sz * foot * 0.35);
    group.add(leg);
  }
  for (let i = 1; i <= 6; i++) {
    const y = (h * i) / 7;
    const span = foot * (1.15 - i * 0.1);
    const band = new THREE.Mesh(new THREE.BoxGeometry(span, 0.06, span), steel);
    band.position.set(x, y, z);
    group.add(band);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 6, 5), steel);
  mast.position.set(x, h + 2, z);
  mast.userData = { kind: "tower" };
  group.add(mast);
}

function viewFrom(edge, dist, y, lookY) {
  return {
    x: edge.mx + edge.nx * dist,
    y,
    z: edge.mz + edge.nz * dist,
    lookX: edge.mx,
    lookY,
    lookZ: edge.mz,
  };
}

export function dressLandmark(group, pts, roads, spec) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge) return null;
  if (spec.kind === "eightyfive") {
    addShutter(group, edge, 1.35, 2.2, Math.min(edge.len * 0.7, 4.2));
    addBoard(group, edge, {
      y: 3.15,
      w: Math.min(edge.len * 0.8, 4.4),
      h: 0.7,
      tex: plainSignTexture("85°C", "#111111", "#e10600"),
      name: "85度C",
    });
    return { corner: viewFrom(edge, 16, 8, 4) };
  }
  if (spec.kind === "fulong") {
    addShutter(group, edge, 1.2, 2.1, Math.min(edge.len * 0.55, 4.6));
    addBoard(group, edge, {
      y: 3.35,
      w: Math.min(edge.len * 0.92, 7.2),
      h: 1.35,
      tex: makeFulongBoardTexture(),
      name: "福隆月台便當",
      out: 0.5,
    });
    return { corner: viewFrom(edge, 18, 7, 3.5) };
  }
  if (spec.kind === "sihai") {
    const width = Math.min(edge.len * 0.86, 5.2);
    const board = addBoard(group, edge, {
      y: 3.05,
      w: width,
      h: 0.72,
      tex: sihai2019Texture(),
      name: "四海遊龍",
    });
    board.userData = { ...board.userData, sourceImage: "Mapillary/516366592838568",
      sourceYear: 2019, placementEstimated: true, lotMatchEstimated: true,
      currentAppearanceUnverified: true };
    addHistoricalSihaiCanopy(group, edge, width);
    addAcRow(group, edge, [6.2, 9.3, 12.4].filter((y) => y < spec.height - 0.2));
    return null;
  }
  if (spec.kind === "credit") {
    addBoard(group, edge, {
      y: 3.2,
      w: Math.min(edge.len * 0.9, 6.4),
      h: 0.78,
      tex: plainSignTexture("桃園市第十九信用合作社", "#1f4e8a", "#f7f4ea"),
      name: "桃園市第十九信用合作社",
    });
    addAcRow(group, edge, [6.4, 9.6, 12.8]);
    return { corner: viewFrom(edge, 20, 10, 6) };
  }
  if (spec.kind === "corner-apt" || spec.kind === "green-apt") {
    addAcRow(group, edge, [6.2, 9.4, 12.4]);
    return null;
  }
  if (spec.kind === "clinic") {
    addVertical(group, edge, { t: 0.72, y: 4.2, h: 3.2, name: "中山西醫診所", color: "#1f4f86" });
    return null;
  }
  if (spec.kind === "laundry") {
    addVertical(group, edge, { t: 0.3, y: 3.4, h: 2.1, name: "洗衣", color: "#2a6f9a" });
    return null;
  }
  if (spec.kind === "cambridge") {
    addBoard(group, edge, {
      y: 3.4,
      w: Math.min(edge.len * 0.86, 6.8),
      h: 1.15,
      tex: plainSignTexture("劍橋文教機構", "#f0c84a", "#3a2412"),
      name: "劍橋文教機構",
    });
    return null;
  }
  if (spec.kind === "jian") {
    addVertical(group, edge, { t: 0.22, y: 4.4, h: 3.4, name: "吉安堂中醫", color: "#e2b423" });
    return null;
  }
  if (spec.kind === "police") {
    const span = Math.min(edge.len * 0.72, 10);
    const canopy = new THREE.MeshLambertMaterial({ color: 0xd9ddd8 });
    const slab = place(edge, 0.5, 1.15);
    const canopyMesh = addBox(group, slab.x, 3.42, slab.z, span, 0.28, 2.35, edge.yaw, canopy);
    canopyMesh.userData = { kind: "police-canopy", estimated: true };
    addBoard(group, edge, {
      y: 3.55,
      w: Math.min(span * 0.7, 5.4),
      h: 0.62,
      out: 1.15,
      tex: plainSignTexture("青溪派出所", "#4e565e", "#f4f6f4"),
      name: "青溪派出所",
    });
    const door = place(edge, 0.5, 0.16);
    const doorMesh = addBox(group, door.x, 1.45, door.z, 2.4, 2.5, 0.08, edge.yaw, new THREE.MeshLambertMaterial({ color: 0x8ea4b0 }));
    doorMesh.userData = { kind: "police-door", estimated: true };
    const jambMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a6 });
    for (const side of [-1.35, 1.35]) {
      const jamb = place(edge, 0.5 + side / edge.len, 0.28);
      const mesh = addBox(group, jamb.x, 1.5, jamb.z, 0.18, 2.85, 0.22, edge.yaw, jambMat);
      mesh.userData = { kind: "police-door-jamb", estimated: true };
    }
    const step = place(edge, 0.5, 0.85);
    const steps = addBox(group, step.x, 0.12, step.z, 3.2, 0.18, 1.15, edge.yaw, new THREE.MeshLambertMaterial({ color: 0xb7b3ac }));
    steps.userData = { kind: "police-steps", estimated: true };
    const emblem = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      new THREE.MeshLambertMaterial({ color: 0x2c3440 })
    );
    const em = place(edge, 0.5, 0.22);
    emblem.position.set(em.x, 2.35, em.z);
    emblem.rotation.y = edge.yaw;
    group.add(emblem);
    addPatrolCar(group, edge, 0.32, 4.2);
    addPatrolCar(group, edge, 0.68, 4.4);
    addTelecomTower(group, edge.mx - edge.nx * 14, edge.mz - edge.nz * 14);
    return { station: viewFrom(edge, 22, 7, 3) };
  }
  return null;
}
