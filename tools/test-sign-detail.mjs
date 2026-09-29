import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createProjector, streetFacingEdge } from "../src/geo.js";
import { createSigns, modeledSignShopIds } from "../src/signs.js";
import { dressShopLot, reservedFasciaSlots } from "../src/shop-dress.js";
import { localRing } from "../src/buildings.js";
import { dressLandmark, dressNear50HistoricalCorner } from "../src/landmarks.js";
import { localizeShops, matchShopsToLots } from "../src/shop-match.js";

function canvasContext() {
  return new Proxy({}, { get(target, key) {
    if (key in target) return target[key];
    if (key === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return () => {};
  }, set(target, key, value) { target[key] = value; return true; } });
}
globalThis.document = { createElement: () => ({ width: 16, height: 16, getContext: canvasContext }) };

const project = { toLocal(lat, lon) { return { x: lon, z: lat }; } };
const roads = [{ highway: "residential", pts: [{ x: -30, z: -4 }, { x: 80, z: -4 }] }];
const pts = [
  { x: -3, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 6 }, { x: -3, z: 6 }, { x: -3, z: 0 },
];
const shops = [
  { id: "drawn", name: "甲店", lat: 2, lon: 0, floor: 1 },
  { id: "second", name: "乙店", lat: 2, lon: 1, floor: 1 },
  { id: "orphan", name: "丙店", lat: 2, lon: 40, floor: 1 },
];
const colliders = [{ id: "lot-1", points: pts, shops: ["甲店", "乙店"], storey: 3.1, isShop: false }];
assert.deepEqual([...modeledSignShopIds(shops, roads, project, colliders, 50)], ["drawn"],
  "only the shop actually rendered as fascia may suppress a standalone board");
assert.equal(modeledSignShopIds(shops, roads, project, [{ ...colliders[0], shops: [] }]).size, 0,
  "unknown model ownership must not hide a shop point");

const created = createSigns(shops, roads, project, 50, colliders);
assert.equal(created.count, 1);
assert.deepEqual(created.names, ["丙店"]);
assert.deepEqual(created.pending.map((s) => s.name), ["乙店"],
  "a secondary shop with no safe road-facing edge must be marked for calibration");
const solo = createSigns(shops.filter((s) => s.id !== "drawn"), roads, project, 50,
  [{ ...colliders[0], shops: [] }]);
assert.equal(solo.count, 2);
assert.equal(solo.group.children[0].userData.evidence, "estimated");
assert.ok(solo.group.children[0].children.length >= 8,
  "near board attached to a facade needs a frame, two brackets and metal edging");
assert.ok(solo.group.children[0].children.some((m) => m.position.z < -0.8),
  "near sign brackets must reach the facade plane");

const dressedGroup = new THREE.Group();
const dressed = dressShopLot(dressedGroup, pts, roads, 3.1, { groundShop: { name: "甲店", brand: "shop" }, upperShop: null, isShop: false });
const fascia = dressedGroup.children.find((m) => m.userData?.kind === "fascia");
assert.ok(fascia);
assert.ok(fascia.geometry.parameters.width <= dressed.edge.len * 0.86 + 1e-6,
  "near shop fascia must not overrun the modeled lot and erase a building gap");
assert.ok(dressedGroup.children.length >= 10, "near fascia needs visible physical mounts");

const historicalShopGroup = new THREE.Group();
dressLandmark(historicalShopGroup, pts, roads, { kind: "sihai", height: 10.4 });
const historicalBoard = historicalShopGroup.children.find((mesh) => mesh.userData?.name === "四海遊龍");
const historicalCanopy = historicalShopGroup.children.filter((mesh) =>
  mesh.userData?.kind === "historical-sihai-canopy");
assert.ok(historicalBoard?.userData?.lotMatchEstimated && historicalBoard.userData.sourceYear === 2019,
  "the 2019 corner fascia must not imply a surveyed shop-to-lot match");
assert.equal(historicalCanopy.length, 4, "the historical cream fascia needs a physical canopy and brackets");
assert.ok(historicalCanopy.every((mesh) => mesh.userData?.currentAppearanceUnverified));

const lotteryGroup = new THREE.Group();
assert.equal(dressNear50HistoricalCorner(lotteryGroup, pts, roads, "nlsc/399"), true);
const lotteryCase = lotteryGroup.children.find((mesh) =>
  mesh.userData?.kind === "near50-historical-round-sign-case");
assert.ok(lotteryCase,
  "the historical round lottery sign needs a three-dimensional metal case");
const caseAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(lotteryCase.quaternion);
assert.ok(Math.abs(caseAxis.length() - 1) < 1e-6 && Math.abs(caseAxis.y) < 1e-6,
  "the round case must face outward rather than slice across its lettering");
const letterDiscs = lotteryGroup.children.filter((mesh) =>
  mesh.geometry instanceof THREE.CircleGeometry && mesh.userData?.kind === "near50-historical-round-sign");
assert.equal(letterDiscs.length, 2, "the historical round sign needs a readable face on each side");
for (const disc of letterDiscs) {
  const faceOffset = new THREE.Vector3().subVectors(disc.position, lotteryCase.position).dot(caseAxis);
  assert.ok(Math.abs(faceOffset) > lotteryCase.geometry.parameters.height / 2 + 0.01,
    "the lettered discs must sit in front of the metal case rather than inside it");
}
assert.equal(lotteryGroup.children.filter((mesh) =>
  mesh.userData?.kind === "near50-historical-round-sign-anchor").length, 1);
assert.ok(lotteryGroup.children.filter((mesh) =>
  mesh.userData?.kind?.startsWith("near50-historical-round-sign")).every((mesh) =>
  mesh.userData.lotMatchEstimated && mesh.userData.currentAppearanceUnverified));

const no46Group = new THREE.Group();
const no46 = dressShopLot(no46Group, pts, roads, 3.15, {
  groundShop: { name: "雅善圓蔬食館", brand: "yashanyuan" },
  upperShop: { name: "桃園養心推拿", brand: "yangxin" },
  isShop: true,
});
const panes = no46Group.children.filter((mesh) => mesh.userData?.kind === "storefront-glazing");
const frames = no46Group.children.filter((mesh) => mesh.userData?.kind === "storefront-frame");
assert.equal(panes.length, 3, "46號正面應有兩片櫥窗與一片入口玻璃");
assert.equal(frames.length, 12, "每片玻璃應由四條立體框料圍成，不可用不透明實心板代替");
const outward = (mesh) => (mesh.position.x - no46.edge.a.x) * no46.edge.nx
  + (mesh.position.z - no46.edge.a.z) * no46.edge.nz;
for (const pane of panes) {
  assert.equal(pane.userData.estimated, true, "未校正立面不可標成實測");
  assert.ok(pane.material instanceof THREE.MeshStandardMaterial, "46號玻璃應受場景照明影響");
  assert.ok(pane.material.transparent && pane.material.opacity < 1);
  assert.ok(Math.abs(outward(pane) - 0.14) < 1e-5);
}
for (const frame of frames) assert.ok(outward(frame) > outward(panes[0]) + 0.03,
  "玻璃需退在框料後面，不能貼在正面成為灰色實心板");
const upperRecesses = no46Group.children.filter((mesh) => mesh.userData?.kind === "upper-window-recess");
const upperPanes = no46Group.children.filter((mesh) => mesh.userData?.kind === "upper-window-glazing");
const upperFrames = no46Group.children.filter((mesh) => mesh.userData?.kind === "upper-window-frame");
assert.equal(upperRecesses.length, 4, "46號應維持二樓三窗、三樓一窗");
assert.equal(upperPanes.length, 4, "上層玻璃不可被實心窗框取代");
assert.equal(upperFrames.length, 16, "每扇上層窗需用四條開放框料，不得使用整片不透明窗框");
for (let i = 0; i < upperPanes.length; i++) {
  const pane = upperPanes[i];
  const recess = upperRecesses[i];
  assert.equal(pane.userData.estimated, true, "上層窗未取得立面照片，必須維持推估標記");
  assert.equal(recess.userData.estimated, true);
  assert.ok(pane.material instanceof THREE.MeshStandardMaterial && pane.material.transparent);
  assert.ok(outward(recess) < outward(pane) - 0.04, "深色窗洞應位於玻璃後面");
  assert.ok(upperFrames.slice(i * 4, i * 4 + 4).every((frame) => frame.userData.estimated),
    "上層窗框不可標成實測");
  assert.ok(upperFrames.slice(i * 4, i * 4 + 4).every((frame) => outward(frame) > outward(pane) + 0.04),
    "上層玻璃需退在立體框料後面");
}

const base = join(dirname(fileURLToPath(import.meta.url)), "../public/data");
const actualShops = JSON.parse(readFileSync(join(base, "shops.json"), "utf8")).shops;
const actualLots = JSON.parse(readFileSync(join(base, "buildings-nlsc.json"), "utf8"));
const actualOsm = JSON.parse(readFileSync(join(base, "osm-200m.json"), "utf8"));
const actualProject = createProjector(24.997987, 121.3146923);
const actualRoads = (actualOsm.roads || []).map((road) => ({ ...road, pts: localRing(road.path, actualProject) }));
// Match buildings.js inset so the edge check exercises the geometry used on screen.
function insetLikeBuilding(pts, dist) {
  const n = pts[0].x === pts.at(-1).x && pts[0].z === pts.at(-1).z ? pts.length - 1 : pts.length;
  const cx = pts.slice(0, n).reduce((v, p) => v + p.x, 0) / n;
  const cz = pts.slice(0, n).reduce((v, p) => v + p.z, 0) / n;
  const out = [];
  for (const p of pts) {
    const dx = cx - p.x;
    const dz = cz - p.z;
    const len = Math.hypot(dx, dz);
    if (len < dist * 3) return pts;
    out.push({ x: p.x + (dx / len) * dist, z: p.z + (dz / len) * dist });
  }
  return out;
}
const lotRows = actualLots.buildings.map((b) => ({
  id: b.id, pts: insetLikeBuilding(localRing(b.ring, actualProject), (b.area || 80) < 70 ? 0.06 : 0.1),
  isShop: b.id === actualLots.shopId,
}));
const attached = matchShopsToLots(localizeShops(actualShops, actualProject), lotRows);
const actualColliders = lotRows.map((lot) => ({
  id: lot.id, points: lot.pts, isShop: lot.isShop, storey: 3.1,
  shops: (attached.byLot.get(lot.id) || []).map((shop) => shop.name),
}));
const near = createSigns(actualShops, actualRoads, actualProject, 50, actualColliders);
const baselineWithoutCollider = createSigns(actualShops, actualRoads, actualProject, 50, []);
assert.ok(near.count < baselineWithoutCollider.count,
  `same-name double boards remain: ${near.count} >= ${baselineWithoutCollider.count}`);
assert.equal(near.count, 0, "unsplit near-field frontages must not invent secondary boards");
assert.deepEqual(near.pending.map((s) => s.name).sort(), ["斗南米糕甲", "無名米粉湯"].sort(),
  "unverified secondary POIs must remain in the calibration queue rather than overlap a modeled sign");
assert.ok(!near.names.includes("鎮撫宮"), "temple model already includes the same named plaque");
for (const sign of near.group.children) {
  const face = sign.userData.faceEdge;
  assert.ok(face, `${sign.userData.name}: near board must fit a real collider edge`);
  const lot = actualColliders.find((c) => c.id === sign.userData.colliderId);
  assert.ok(lot, `${sign.userData.name}: collider missing`);
  const a = lot.points[face.index];
  const b = lot.points[face.index + 1] || lot.points[0];
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - face.len) < 1e-5);
  const nx = Math.sin(sign.rotation.y);
  const nz = Math.cos(sign.rotation.y);
  const wallX = sign.position.x - nx * 0.86;
  const wallZ = sign.position.z - nz * 0.86;
  const edgeX = a.x + (b.x - a.x) * face.t;
  const edgeZ = a.z + (b.z - a.z) * face.t;
  assert.ok(Math.hypot(wallX - edgeX, wallZ - edgeZ) < 1e-5,
    `${sign.userData.name}: board mount is not on its reported facade edge`);
  const halfFrame = sign.userData.width / 2 + 0.06;
  assert.ok(face.t * face.len >= halfFrame && (1 - face.t) * face.len >= halfFrame,
    `${sign.userData.name}: frame or bracket extends beyond its facade edge`);
}

const farRoads = [{ highway: "residential", pts: [{ x: 60, z: -6 }, { x: 140, z: -6 }] }];
const farPts = [
  { x: 70, z: 0 }, { x: 110, z: 0 }, { x: 110, z: 10 }, { x: 70, z: 10 }, { x: 70, z: 0 },
];
const farShops = [
  { id: "gate", name: "北門、朝陽二里聯合活動中心", lat: 2, lon: 90, floor: 1, color: "#3a4a6b" },
  { id: "mail", name: "桃園北門朝陽活動中心i郵箱", lat: 2.4, lon: 90.4, floor: 1, color: "#3a4a6b" },
];
const farSigns = createSigns(farShops, farRoads, project, 200, [{
  id: "hall", points: farPts, shops: farShops.map((shop) => shop.name), storey: 3.1, isShop: false,
}]);
assert.equal(farSigns.names.includes("北門、朝陽二里聯合活動中心"), false,
  "a fascia that already names the face must not be stacked as a second full-size board");
assert.ok(farSigns.names.includes("桃園北門朝陽活動中心i郵箱"),
  "a second shop on a long face should stay readable beside the fascia");
const farEdge = streetFacingEdge(farPts, farRoads);
const farSlots = reservedFasciaSlots(farEdge, 3.1, {
  groundShop: { name: "北門、朝陽二里聯合活動中心", brand: "shop" },
});
const mailSign = farSigns.group.children.find((mesh) => mesh.userData.name === "桃園北門朝陽活動中心i郵箱");
assert.ok(mailSign?.userData.faceEdge, "spaced sign should record the face it was fitted to");
for (const slot of farSlots) {
  const tx = (farEdge.b.x - farEdge.a.x) / farEdge.len;
  const tz = (farEdge.b.z - farEdge.a.z) / farEdge.len;
  const wallX = farEdge.a.x + (farEdge.b.x - farEdge.a.x) * slot.t;
  const wallZ = farEdge.a.z + (farEdge.b.z - farEdge.a.z) * slot.t;
  const along = (mailSign.position.x - wallX) * tx + (mailSign.position.z - wallZ) * tz;
  const out = (mailSign.position.x - wallX) * farEdge.nx + (mailSign.position.z - wallZ) * farEdge.nz;
  const alongGap = Math.abs(along) - (mailSign.userData.width + slot.width) / 2;
  const yGap = Math.abs(mailSign.userData.y - slot.y) - (0.72 + slot.height) / 2;
  if (Math.abs(out) > 1.7) continue;
  assert.ok(alongGap >= 0.15 || yGap >= 0.05,
    `i郵箱 overlaps ${slot.name} along ${alongGap} y ${yGap}`);
}
const dressedFar = new THREE.Group();
dressShopLot(dressedFar, farPts, farRoads, 3.1, {
  groundShop: { name: "北門、朝陽二里聯合活動中心", brand: "shop" },
  upperShop: null,
  isShop: false,
});
const dressedBoard = dressedFar.children.find((mesh) => mesh.userData?.kind === "fascia");
const dressedValance = dressedFar.children.filter((mesh) =>
  mesh.userData?.kind === "awning" || mesh.userData?.kind === "awning-lip");
assert.ok(dressedBoard && dressedValance.length >= 2, "generic shop still needs a fascia and a valance");
for (const piece of dressedValance) {
  const yaw = dressedBoard.rotation.y;
  const dx = piece.position.x - dressedBoard.position.x;
  const dz = piece.position.z - dressedBoard.position.z;
  const outGap = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw))
    - (dressedBoard.geometry.parameters.depth + piece.geometry.parameters.depth) / 2;
  const yGap = Math.abs(piece.position.y - dressedBoard.position.y)
    - (dressedBoard.geometry.parameters.height + piece.geometry.parameters.height) / 2;
  const along = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
  const alongGap = Math.abs(along)
    - (dressedBoard.geometry.parameters.width + piece.geometry.parameters.width) / 2;
  assert.ok(outGap >= -0.001 || yGap >= -0.001 || alongGap >= -0.001,
    `valance ${piece.userData.kind} pierces the fascia`);
}

const wide = createSigns(actualShops, actualRoads, actualProject, 200, actualColliders);
const wideBoards = wide.group.children.map((sign) => {
  const yaw = sign.rotation.y;
  return {
    name: sign.userData.name,
    id: sign.userData.colliderId,
    x: sign.position.x,
    z: sign.position.z,
    y: sign.userData.y,
    w: sign.userData.width,
    h: 0.72,
    tx: Math.cos(yaw),
    tz: -Math.sin(yaw),
    nx: Math.sin(yaw),
    nz: Math.cos(yaw),
  };
});
for (let i = 0; i < wideBoards.length; i += 1) {
  for (let j = i + 1; j < wideBoards.length; j += 1) {
    const a = wideBoards[i];
    const b = wideBoards[j];
    if (!a.id || a.id !== b.id) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const alongGap = Math.abs(dx * a.tx + dz * a.tz) - (a.w + b.w) / 2;
    const out = Math.abs(dx * a.nx + dz * a.nz);
    const yGap = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
    assert.ok(out > 0.35 || alongGap >= 0.05 || yGap >= 0.05,
      `${a.name} overlaps ${b.name} on ${a.id}`);
  }
}
assert.equal(wide.names.includes("北門、朝陽二里聯合活動中心"), false);
assert.ok(wide.names.includes("桃園北門朝陽活動中心i郵箱"));
assert.deepEqual(wide.pending.map((shop) => shop.name).sort(), ["斗南米糕甲", "無名米粉湯"].sort());

console.log("sign detail ok", {
  synthetic: created.names,
  syntheticPending: created.pending,
  nearBefore: baselineWithoutCollider.count,
  nearAfter: near.count,
  nearNames: near.names,
  nearEdges: near.group.children.map((s) => ({ name: s.userData.name, colliderId: s.userData.colliderId, edgeIndex: s.userData.faceEdge.index, edgeM: Number(s.userData.faceEdge.len.toFixed(3)), t: Number(s.userData.faceEdge.t.toFixed(3)), widthM: Number(s.userData.width.toFixed(3)), x: Number(s.position.x.toFixed(2)), z: Number(s.position.z.toFixed(2)) })),
});
