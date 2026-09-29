import assert from "node:assert/strict";
import { brandOf, brandMeta, isChainStore } from "../src/brands.js";
import { splitShopFloors } from "../src/shop-match.js";
import { createSigns, signHeightFor } from "../src/signs.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { createProjector } from "../src/geo.js";
import {
  createCurbs,
  createRoadMarkings,
  planSpringCenterline,
  planRoadWords,
  findIntersections,
  pairZebraCrossings,
  roadWidth,
  segmentIntersect,
  shopFrontHasZebra,
  zebraLayout,
} from "../src/roads.js";
import { dressNeighborFacade, dressOwnsShopSign, dressShopLot, facingNeighborLots, shopFasciaLayout, shouldSkipArcade, shouldSkipHouseAwning } from "../src/shop-dress.js";
import { localRing } from "../src/buildings.js";
import { planFacadeOpenings } from "../src/facade-depth.js";

assert.equal(brandOf({ name: "養心推拿" }), "yangxin");
assert.equal(brandMeta({ name: "養心推拿" }).floor, 2);
assert.equal(brandOf({ name: "雅善圓蔬食館" }), "yashanyuan");
assert.equal(brandMeta({ name: "雅善圓蔬食館" }).floor, 1);
assert.equal(brandOf({ name: "7-ELEVEN 全鎮店" }), "seven");
assert.equal(brandOf({ name: "美廉社桃園鎮撫店" }), "simplemart");
assert.equal(brandOf({ name: "三商家購" }), "simplemart");
assert.equal(brandOf({ name: "全聯福利中心" }), "pxmart");
assert.equal(brandOf({ name: "全家便利商店" }), "familymart");
assert.ok(isChainStore("seven"));
assert.equal(isChainStore("yangxin"), false);
assert.equal(shouldSkipArcade(true, null), true);
assert.equal(shouldSkipHouseAwning(false, { brand: "seven" }), true);
assert.equal(shouldSkipArcade(false, null), false);

const floors = splitShopFloors([
  { name: "雅善圓蔬食館", brand: "yashanyuan", floor: 1 },
  { name: "養心推拿", brand: "yangxin", floor: 2 },
]);
assert.equal(floors.ground.name, "雅善圓蔬食館");
assert.equal(floors.upper.name, "養心推拿");

const mixed = splitShopFloors([
  { name: "85度C", brand: "85c", floor: 1 },
  { name: "7-ELEVEN 全鎮店", brand: "seven", floor: 1 },
]);
assert.equal(mixed.ground.name, "7-ELEVEN 全鎮店");

const y1 = signHeightFor({ name: "雅善圓蔬食館" }, { collider: { storey: 3.1 } });
const y2 = signHeightFor({ name: "養心推拿", featured: true }, { collider: { storey: 3.1 } });
assert.ok(y2 > y1 + 0.8, `2F sign should sit above 1F ${y1} ${y2}`);
assert.ok(y1 < 2.8, `1F 雅善圓 sign too high ${y1}`);

const hit = segmentIntersect({ x: 0, z: -10 }, { x: 0, z: 10 }, { x: -10, z: 0 }, { x: 10, z: 0 });
assert.ok(hit);
assert.ok(Math.abs(hit.x) < 0.01 && Math.abs(hit.z) < 0.01);
assert.equal(roadWidth("residential"), 6.6);
assert.equal(roadWidth("footway"), 0);

const roads = [
  { highway: "residential", name: "鎮撫街", pts: [{ x: -40, z: 0 }, { x: 40, z: 0 }] },
  { highway: "tertiary", name: "中山東路", pts: [{ x: 0, z: -40 }, { x: 0, z: 40 }] },
];
const crosses = findIntersections(roads);
assert.equal(crosses.length, 1);

const alongZ = zebraLayout(10, 20, 0, 1, 6);
const zs = alongZ.map((s) => s.z);
assert.ok(Math.max(...zs) - Math.min(...zs) > 3, "stripes must space along the road");
assert.ok(alongZ.every((s) => Math.abs(s.x - 10) < 0.05));
const probe = new THREE.Mesh(new THREE.BoxGeometry(alongZ[3].sx, 0.01, alongZ[3].sz));
probe.position.set(alongZ[3].x, 0, alongZ[3].z);
probe.rotation.y = alongZ[3].yaw;
probe.updateMatrixWorld(true);
const size = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3());
assert.ok(size.x > 4, `stripe should cross the road, world width ${size.x}`);
assert.ok(size.z < 1.2, `stripe should be thin along the road, world depth ${size.z}`);

const raw = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/data/crossings.json"), "utf8")
);
const project = createProjector(24.997987, 121.3146923);
const points = raw.crossings.map((c) => ({ ...project.toLocal(c.lat, c.lon), markings: c.markings }));
const paired = pairZebraCrossings(points);
assert.equal(paired.singles.length, 0, `unpaired zebra nodes ${paired.singles.length}`);
assert.ok(paired.pairs.length >= 4, `zebra pairs ${paired.pairs.length}`);
assert.equal(shopFrontHasZebra(paired.pairs, 12), false);
for (const p of paired.pairs) {
  const layout = zebraLayout(p.x, p.z, p.ax, p.az, p.roadW);
  const span = Math.hypot(layout.at(-1).x - layout[0].x, layout.at(-1).z - layout[0].z);
  const across = Math.hypot(p.ax, p.az) || 1;
  const alongDot = Math.abs((layout.at(-1).x - layout[0].x) * p.ax + (layout.at(-1).z - layout[0].z) * p.az) / across;
  assert.ok(alongDot > span * 0.9, "stripe row must follow the road");
}

const marks = createRoadMarkings([{ highway: "residential", name: "鎮撫街", pts: [{ x: -80, z: 0 }, { x: 120, z: 40 }] }], { radiusMeters: 200 }, points);
const words = planRoadWords([
  { highway: "residential", name: "鎮撫街", pts: [{ x: -40, z: -6 }, { x: 30, z: -20 }] },
  { highway: "residential", name: "鎮撫街巷", pts: [{ x: 0, z: 0 }, { x: 20, z: 4 }] },
  { highway: "tertiary", name: "春日路", pts: [{ x: 30, z: -40 }, { x: 55, z: -10 }] },
  { highway: "tertiary", name: "春日路", pts: [{ x: 200, z: 200 }, { x: 260, z: 240 }] },
]);
assert.ok(words.some((word) => word.text === "鎮撫"), "鎮撫 should be painted on this stretch");
assert.equal(words.filter((word) => word.text === "110").length, 1, "110 only at the county-road corner");
assert.ok(words.every((word) => word.text === "鎮撫" || word.text === "110"));

assert.equal(marks.dashes, 0);
assert.equal(marks.arrows, 0);
assert.equal(marks.centerlineStrips, 0, "synthetic 鎮撫街 cannot gain centerlines");
assert.equal(marks.shopZebra, false);
assert.ok(marks.crossings >= 4 && marks.crossings <= 8, `crossings ${marks.crossings}`);
assert.equal(marks.stripes, marks.crossings * 7);
assert.ok(marks.zebraPoints.every((p) => Math.hypot(p.x, p.z) > 12));

const curbs = createCurbs(
  [{ highway: "residential", pts: [{ x: -30, z: 0 }, { x: 30, z: 0 }] }],
  { radiusMeters: 200 }
);
const curbMesh = curbs.children[0];
assert.ok(curbMesh, "curb mesh missing");
const curbPos = curbMesh.geometry.attributes.position;
let maxY = 0;
for (let i = 0; i < curbPos.count; i++) maxY = Math.max(maxY, curbPos.getY(i));
assert.ok(maxY > 0.08 && maxY < 0.2, `curb height ${maxY}`);
assert.ok(curbPos.count >= 16, "curb should run both sides");

const houseWindows = planFacadeOpenings({ edgeLen: 8.4, storey: 3.1, bodyH: 9.2, seed: 4, skipGround: false });
const shopWindows = planFacadeOpenings({ edgeLen: 6.2, storey: 3.1, bodyH: 6.4, seed: 4, skipGround: true });
assert.ok(houseWindows.length >= 2, `street windows ${houseWindows.length}`);
assert.ok(houseWindows.every((w) => w.y > 2.2));
assert.ok(shopWindows.every((w) => w.y > 3.1), "shop ground floor stays clear for the storefront");
assert.ok(shopWindows.length >= 1, "upper floor still gets a real window");

function installCanvasMock() {
  if (globalThis.document?.createElement) return;
  function ctxFor(canvas) {
    return new Proxy(
      { canvas },
      {
        get(target, key) {
          if (key in target) return target[key];
          if (key === "createImageData") {
            return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
          }
          return () => {};
        },
        set(target, key, value) {
          target[key] = value;
          return true;
        },
      }
    );
  }
  globalThis.document = {
    createElement() {
      const canvas = { width: 16, height: 16 };
      canvas.getContext = () => ctxFor(canvas);
      return canvas;
    },
  };
}
installCanvasMock();

const layout = shopFasciaLayout(3.12);
assert.ok(layout.ground.y + layout.ground.h / 2 < layout.upper.y - layout.upper.h / 2, "layout boards overlap");
const dressGroup = new THREE.Group();
const dressPts = [
  { x: -3, z: 0 },
  { x: 3, z: 0 },
  { x: 3, z: 6 },
  { x: -3, z: 6 },
];
const dressRoads = [{ highway: "residential", name: "鎮撫街", pts: [{ x: -20, z: -4 }, { x: 20, z: -4 }] }];
const dressedShop = dressShopLot(dressGroup, dressPts, dressRoads, 3.12, {
  isShop: true,
  groundShop: { name: "雅善圓蔬食館", brand: "yashanyuan", floor: 1 },
  upperShop: { name: "養心推拿", brand: "yangxin", floor: 2 },
});
const fasciaBoards = [];
const blades = [];
dressGroup.traverse((obj) => {
  if (obj.userData?.kind === "fascia") fasciaBoards.push(obj);
  if (obj.userData?.kind === "blade") blades.push(obj.userData);
});
const board1 = fasciaBoards.find((mesh) => mesh.userData.floor === 1);
const board2 = fasciaBoards.find((mesh) => mesh.userData.floor === 2);
assert.ok(board1 && board2, "paired shop should have a 1F banner and a 2F plaque");
assert.ok(
  board1.position.y + board1.userData.h / 2 < board2.position.y - board2.userData.h / 2,
  `fascia overlap ${board1.position.y} ${board2.position.y}`
);
assert.equal(board1.userData.name, "雅善圓蔬食館", "1F main fascia should identify the listed business");
assert.ok(
  Math.abs(board1.material.map.image.width / board1.material.map.image.height - board1.userData.w / board1.userData.h) < 0.05,
  "1F fascia texture and mesh aspect ratios should match"
);
assert.equal(board2.userData.name, "桃園養心推拿");
assert.ok(board2.userData.w >= 2, "2F 養心招牌須足夠醒目");
assert.ok(board2.userData.h >= 0.55, "2F 養心招牌須足夠高");
assert.ok(fasciaBoards.every((mesh) => mesh.userData.estimated === true), "46號招牌造型不可標成實測");
const yashanBlade = blades.find((blade) => /雅善圓/.test(blade.name || ""));
assert.ok(yashanBlade, "vertical 雅善圓 sign missing");
assert.ok(yashanBlade.t < 0.2, `vertical sign should sit on the right pier, t=${yashanBlade.t}`);
assert.ok(blades.every((blade) => blade.estimated === true), "46號直式牌體仍是推估");
assert.ok(!blades.some((blade) => /養心/.test(blade.name || "")), "養心 must not become a corner blade");
const propKinds = [];
dressGroup.traverse((obj) => {
  if (obj.userData?.kind) propKinds.push(obj.userData.kind);
});
assert.ok(!propKinds.includes("flag"), "麵線招旗應移除");
assert.ok(!propKinds.includes("cart"), "無來源的條紋推車不得佔入口前地面");
assert.ok(propKinds.includes("feature-frame"), "46號立面主框缺失");
assert.ok(propKinds.includes("address-plaque"), "46號門牌缺失");
assert.ok(propKinds.includes("entry-handle"), "46號入口門把缺失");
assert.ok(!propKinds.includes("curb-scooter") && !propKinds.includes("stool"), "46號入口前應保持淨空");
assert.ok(!propKinds.includes("lantern"), "46號六盞燈籠並無對應來源");
const architecturalDetails = [];
dressGroup.traverse((obj) => {
  if (["feature-frame", "address-plaque", "entry-handle"].includes(obj.userData?.kind)) architecturalDetails.push(obj);
});
assert.ok(architecturalDetails.every((mesh) => mesh.userData.estimated === true), "門牌樣式、門把和裝飾主框不可標成實測");

function frontSeams(group) {
  const seams = [];
  group.traverse((obj) => {
    if (obj.userData?.kind === "estimated-front-seam") seams.push(obj);
  });
  return seams;
}

function seamVertices(mesh) {
  mesh.updateWorldMatrix(true, false);
  const vertices = [];
  const position = mesh.geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    vertices.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  }
  return vertices;
}

function assertSeamEnvelope(group, edge, maxY, roles) {
  const seams = frontSeams(group);
  assert.ok(seams.every((mesh) => mesh.userData.estimated === true), "procedural front seam must remain estimated");
  for (const role of roles) {
    assert.ok(seams.some((mesh) => mesh.userData.detail === role), `${role} near-front seam missing`);
  }
  const vertices = seams.flatMap(seamVertices);
  const tx = (edge.b.x - edge.a.x) / edge.len;
  const tz = (edge.b.z - edge.a.z) / edge.len;
  let peakY = -Infinity;
  let farthest = -Infinity;
  for (const p of vertices) {
    const t = ((p.x - edge.a.x) * tx + (p.z - edge.a.z) * tz) / edge.len;
    const out = (p.x - edge.a.x) * edge.nx + (p.z - edge.a.z) * edge.nz;
    assert.ok(t >= 0.08 - 1e-6 && t <= 0.92 + 1e-6, `seam crosses facade end: ${t}`);
    assert.ok(out >= -1e-6 && out <= 0.2 + 1e-6, `seam projects past 0.2m: ${out}`);
    assert.ok(p.y >= -1e-6 && p.y <= maxY + 1e-6, `seam crosses roof/ground: ${p.y}`);
    peakY = Math.max(peakY, p.y);
    farthest = Math.max(farthest, out);
  }
  return { count: seams.length, peakY, farthest, vertices };
}

function assertEntryClear(group, edge) {
  const doorLeft = 0.54 - 0.39 / edge.len;
  const doorRight = 0.54 + 0.39 / edge.len;
  const tx = (edge.b.x - edge.a.x) / edge.len;
  const tz = (edge.b.z - edge.a.z) / edge.len;
  for (const seam of frontSeams(group)) {
    const vertices = seamVertices(seam);
    if (Math.min(...vertices.map((p) => p.y)) > 2.4) continue;
    const projected = vertices.map((p) => ((p.x - edge.a.x) * tx + (p.z - edge.a.z) * tz) / edge.len);
    assert.ok(Math.max(...projected) < doorLeft || Math.min(...projected) > doorRight,
      "window seam intrudes into 46號 entry opening");
  }
}

const near46Details = ["46-window", "46-window-head", "46-entry-jamb", "46-door-head", "46-upper-window-head", "46-top-window-head"];
const synthetic46 = assertSeamEnvelope(dressGroup, dressedShop.edge, 9.9, near46Details);
assert.equal(synthetic46.count, 13, "46號應只有沿既有開口的細部，不能再增無來源的物件");
assertEntryClear(dressGroup, dressedShop.edge);
const farShopGroup = new THREE.Group();
const farPts = dressPts.map((p) => ({ x: p.x + 70, z: p.z }));
const farRoads = dressRoads.map((road) => ({ ...road, pts: road.pts.map((p) => ({ x: p.x + 70, z: p.z })) }));
dressShopLot(farShopGroup, farPts, farRoads, 3.12, {
  isShop: true,
  groundShop: { name: "雅善圓蔬食館", brand: "yashanyuan", floor: 1 },
  upperShop: { name: "養心推拿", brand: "yangxin", floor: 2 },
});
assert.ok(!frontSeams(farShopGroup).some((mesh) => ["46-window-head", "46-entry-jamb", "46-upper-window-head", "46-top-window-head"].includes(mesh.userData.detail)),
  "新增的近景收邊不能生成在50m外");

const shopFile = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/data/shops.json"), "utf8")
);
const osmFile = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/data/osm-200m.json"), "utf8")
);
const nlscFile = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../public/data/buildings-nlsc.json"), "utf8")
);
const mapProject = createProjector(24.997987, 121.3146923);
const mapRoads = (osmFile.roads || []).map((road) => ({
  id: road.id,
  name: road.name,
  highway: road.highway,
  pts: localRing(road.path, mapProject),
}));
const observedSpringStrips = planSpringCenterline(mapRoads, paired.pairs);
assert.equal(observedSpringStrips.length, 4, "2019 春日路 reference should render only two short double-line patches");
assert.ok(observedSpringStrips.every((s) => s.roadId === "way/5118000" && s.fromMeters >= 18 && s.toMeters <= 58));
assert.ok(observedSpringStrips.every((s) => s.width <= 0.08 && s.length <= 14.1));
assert.ok(observedSpringStrips.every((s) => Math.hypot(s.x, s.z) > 40 && s.z < -42), "line must stay north of the junction, not at #46");
assert.ok(observedSpringStrips.every((s) => paired.pairs.every((p) => Math.hypot(s.x - p.x, s.z - p.z) > s.length / 2 + 9)),
  "double-yellow line overlaps zebra or junction crossing");
assert.equal(planSpringCenterline(mapRoads.filter((r) => r.name === "鎮撫街"), paired.pairs).length, 0);
assert.equal(planSpringCenterline(mapRoads.map((r) => ({ ...r, id: "changed-source" })), paired.pairs).length, 0,
  "an unrecognized or moved OSM source must fail closed");
const blockedSpring = planSpringCenterline(mapRoads, [...paired.pairs, { x: 33.3, z: -49.7 }]);
assert.equal(blockedSpring.length, 2, "a newly observed zebra should remove its intersecting paint patch");
const localMapMarks = createRoadMarkings(mapRoads, { radiusMeters: 200 }, points);
assert.equal(localMapMarks.centerlineStrips, 4);
const lineMesh = localMapMarks.group.getObjectByName("spring-road-centerline-2019-estimate");
assert.ok(lineMesh && lineMesh.userData.kind === "estimated-road-line", "merged centerline mesh/source tag missing");
const lineVertices = lineMesh.geometry.getAttribute("position");
assert.ok(lineVertices.count >= 4 * 24, `four stripes should merge, got ${lineVertices.count} vertices`);
for (let i = 0; i < lineVertices.count; i++) {
  assert.ok(lineVertices.getY(i) > -0.02 && lineVertices.getY(i) < 0,
    `paint must hug the ground without z-fighting: ${lineVertices.getY(i)}`);
}
const mapLots = (nlscFile.buildings || []).map((b) => ({
  id: b.id,
  isShop: b.id === nlscFile.shopId,
  pts: localRing(b.ring, mapProject),
}));
const shopLot = mapLots.find((lot) => lot.isShop);
const facing = facingNeighborLots(shopLot.pts, mapLots, mapRoads);
assert.equal(facing.left?.id, "nlsc/410");
assert.equal(facing.left?.role, "shutter");
assert.equal(facing.right?.id, "nlsc/420");
assert.equal(facing.right?.role, "brick");
const shutterGroup = new THREE.Group();
dressNeighborFacade(shutterGroup, facing.left.edge, "shutter", 3.2, 12.6, facing.edge);
const brickGroup = new THREE.Group();
dressNeighborFacade(brickGroup, facing.right.edge, "brick", 3.2, 12.4, facing.edge);
const actualShopGroup = new THREE.Group();
const actualShop = dressShopLot(actualShopGroup, shopLot.pts, mapRoads, 3.12, {
  isShop: true,
  groundShop: { name: "雅善圓蔬食館", brand: "yashanyuan", floor: 1 },
  upperShop: { name: "養心推拿", brand: "yangxin", floor: 2 },
});
const actual46 = assertSeamEnvelope(actualShopGroup, actualShop.edge, 9.9, near46Details);
assertEntryClear(actualShopGroup, actualShop.edge);
assert.ok(actual46.vertices.every((p) => Math.hypot(p.x, p.z) <= 50), "46號新細部只能位於50m近景內");
const shutterSeams = assertSeamEnvelope(shutterGroup, facing.left.edge, 6.6, ["shutter-edge", "shutter-head"]);
const brickSeams = assertSeamEnvelope(brickGroup, facing.right.edge, 6.6, ["brick-reveal"]);
assert.equal(shutterSeams.count, 3);
assert.equal(brickSeams.count, 2);
function closestNewSeams(a, b) {
  let min = Infinity;
  for (const p of a.vertices) for (const q of b.vertices) {
    min = Math.min(min, Math.hypot(p.x - q.x, p.z - q.z));
  }
  return min;
}
const leftGap = closestNewSeams(actual46, shutterSeams);
const rightGap = closestNewSeams(actual46, brickSeams);
assert.ok(leftGap >= 0.6, `new seams bridge the left 0.6m house gap: ${leftGap}`);
assert.ok(rightGap >= 0.6, `new seams bridge the right 0.6m house gap: ${rightGap}`);
const shutterKinds = [];
const brickKinds = [];
shutterGroup.traverse((obj) => {
  if (obj.userData?.kind) shutterKinds.push(obj.userData.kind);
});
brickGroup.traverse((obj) => {
  if (obj.userData?.kind) brickKinds.push(obj.userData.kind);
});
assert.ok(shutterKinds.includes("shutter"), "left neighbor shutter missing");
assert.ok(brickKinds.includes("food-case"), "right neighbor food case missing");
assert.ok(brickKinds.includes("awning"), "right neighbor awning missing");
assert.ok(dressOwnsShopSign({ name: "養心推拿" }));
assert.ok(dressOwnsShopSign({ name: "雅善圓蔬食館" }));
assert.equal(dressOwnsShopSign({ name: "7-ELEVEN 全鎮店" }), false);
assert.equal(dressOwnsShopSign({ name: "美廉社桃園鎮撫店" }), false);

const emitted = createSigns(shopFile.shops, mapRoads, mapProject, 200, []);
assert.ok(!emitted.names.some((name) => /養心|雅善圓/.test(name)), emitted.names.filter((name) => /養心|雅善圓/.test(name)).join(","));
assert.ok(emitted.names.some((name) => /7-ELEVEN/.test(name)), "7-ELEVEN sign dropped");
assert.ok(emitted.names.some((name) => /美廉社/.test(name)), "美廉社 sign dropped");

console.log("street detail ok", {
  y1,
  y2,
  crosses: crosses.length,
  pairs: paired.pairs.length,
  zebra: marks.crossings,
  springCenterlineStrips: observedSpringStrips.length,
  curbY: maxY,
  houseWindows: houseWindows.length,
  shopWindows: shopWindows.length,
  nearSeams: { shop: actual46.count, left: shutterSeams.count, right: brickSeams.count },
  nearSeamMaxY: Math.max(actual46.peakY, shutterSeams.peakY, brickSeams.peakY),
  nearSeamOut: Math.max(actual46.farthest, shutterSeams.farthest, brickSeams.farthest),
  nearSeamGaps: { left: leftGap, right: rightGap },
});
