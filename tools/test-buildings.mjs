import assert from "node:assert/strict";
import * as THREE from "three";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localRing, makeWallGeometry, NEAR_DETAIL_RADIUS_METERS, near50CladdingAsset, resolveBuildingProfile, shouldPlaceEstimatedRoofFurniture } from "../src/buildings.js";
import { createFacadeDepth } from "../src/facade-depth.js";
import { createProjector, distanceToRing, exteriorStripClear, roadFacingEdges } from "../src/geo.js";
import { localFloorEvidenceForLot } from "../src/local-floor-evidence.js";
import { landmarkFor } from "../src/landmarks.js";
import { createNear50Inventory, footprintGapMeters, near50CameraPose } from "../src/near50-inventory.js";
import { planWallPanels, WINDOW_CUTOUT_WIDTH, WINDOW_CUTOUT_HEIGHT } from "../src/wall-panels.js";

const house = resolveBuildingProfile({ id: "way/1", name: "", building: "apartments", height: 6 });
assert.equal(house.kind, "house");
assert.equal(house.upperFloors, 1);
assert.ok(house.height === 6);
assert.ok(house.storey < 3.2, `storey should be one floor, got ${house.storey}`);

const market = resolveBuildingProfile({
  id: "way/546763428",
  name: "朝陽市場",
  building: "apartments",
  height: 24,
  levels: 8,
});
assert.equal(market.kind, "market");
assert.equal(market.height, 24);
assert.ok(market.upperFloors >= 6 && market.upperFloors <= 8, `market floors ${market.upperFloors}`);
assert.equal(market.storey + market.upperH, 24);

const temple = resolveBuildingProfile({ id: "way/2", name: "鎮撫宮", building: "temple", height: 12, levels: 4 });
assert.equal(temple.kind, "temple");
assert.equal(temple.color, "#d2b48c");

const shop = resolveBuildingProfile({ id: "way/3", name: "", building: "yes", height: 8.4 }, { height: 6.6, color: "#d4a574" }, true);
assert.equal(shop.kind, "shop");
assert.equal(shop.color, "#d4a574");
assert.equal(shop.height, 6.6);

const crossing = [{ x: 49, z: -2 }, { x: 61, z: -2 }, { x: 61, z: 2 }, { x: 49, z: 2 }, { x: 49, z: -2 }];
assert.equal(distanceToRing(0, 0, crossing), 49, "the radius uses the footprint, not its centroid");
assert.equal(distanceToRing(50, 0, crossing), 0, "a point inside the footprint has zero distance");
assert.equal(distanceToRing(0, 0, []), Infinity);
const panels = planWallPanels(5, 3, 6, [{ x: 2.5, y: 4.5, w: WINDOW_CUTOUT_WIDTH, h: WINDOW_CUTOUT_HEIGHT }]);
const panelArea = panels.reduce((sum, panel) => sum + (panel.x1 - panel.x0) * (panel.y1 - panel.y0), 0);
assert.ok(Math.abs(panelArea - (15 - WINDOW_CUTOUT_WIDTH * WINDOW_CUTOUT_HEIGHT)) < 1e-8,
  "the wall mesh must omit the window aperture, not cover it with an opaque panel");
assert.ok(panels.every((panel) => !(panel.x0 < 2.5 && panel.x1 > 2.5 && panel.y0 < 4.5 && panel.y1 > 4.5)));
assert.deepEqual(planWallPanels(5, 3, 6), [{ x0: 0, x1: 5, y0: 3, y1: 6 }], "unmodified walls keep one panel");
assert.deepEqual(planWallPanels(0, 3, 6), []);
const clippedPanels = planWallPanels(5, 3, 6, [{ x: 0, y: 3, w: 2, h: 2 }]);
assert.equal(clippedPanels.reduce((sum, panel) => sum + (panel.x1 - panel.x0) * (panel.y1 - panel.y0), 0), 14,
  "apertures crossing band boundaries must be clipped, not create inverted panels");
const overlapPanels = planWallPanels(5, 3, 6, [{ x: 2, y: 4.5, w: 2, h: 2 }, { x: 3, y: 4.5, w: 2, h: 2 }]);
assert.equal(overlapPanels.reduce((sum, panel) => sum + (panel.x1 - panel.x0) * (panel.y1 - panel.y0), 0), 9,
  "overlapping apertures subtract their union once");
const apertureRing = [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 3 }, { x: 0, z: 3 }, { x: 0, z: 0 }];
const apertureWall = new THREE.Mesh(makeWallGeometry(apertureRing, 3, 6, 5, 1, (i) => i === 0,
  new Map([[0, [{ x: 2.5, y: 4.5, w: WINDOW_CUTOUT_WIDTH, h: WINDOW_CUTOUT_HEIGHT }]]])),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
apertureWall.updateMatrixWorld(true);
const ray = new THREE.Raycaster(new THREE.Vector3(2.5, 4.5, -2), new THREE.Vector3(0, 0, 1));
assert.equal(ray.intersectObject(apertureWall).length, 0, "an aperture ray must pass through the actual wall geometry");
ray.set(new THREE.Vector3(0.2, 4.5, -2), new THREE.Vector3(0, 0, 1));
assert.ok(ray.intersectObject(apertureWall).length > 0, "solid wall beside the aperture must remain");
const depthModule = createFacadeDepth();
assert.equal(depthModule.addBuilding({ hero: true, recessed: true, plans: [{
  edge: { a: apertureRing[0], b: apertureRing[1], nx: 0, nz: -1, yaw: Math.PI, len: 5 },
  openings: [{ t: 0.5, y: 4.5, sx: 1, sy: 1, grille: false, hood: false, ac: false }],
}] }), 1);
const apertureDetails = new THREE.Group();
assert.equal(depthModule.finish(apertureDetails).recessedWindows, 1);
const glassMatrix = new THREE.Matrix4();
apertureDetails.getObjectByName("facade-glass").getMatrixAt(0, glassMatrix);
assert.ok(glassMatrix.elements[14] > 0.1, "near-field glass must be behind the z=0 wall plane");
assert.equal(apertureDetails.getObjectByName("facade-window-recesses").count, 1);
const sideGap = [{ id: "other", pts: [
  { x: 2.6, z: 0 }, { x: 4.6, z: 0 }, { x: 4.6, z: 3 }, { x: 2.6, z: 3 }, { x: 2.6, z: 0 },
] }];
assert.equal(exteriorStripClear({ a: { x: 2, z: 0 }, b: { x: 2, z: 3 }, nx: 1, nz: 0 },
  sideGap, "owner", 1.65), false, "a projection must not bridge a narrow source-footprint gap");
assert.equal(exteriorStripClear({ a: { x: 0, z: 0 }, b: { x: 2, z: 0 }, nx: 0, nz: -1 },
  sideGap, "owner", 1.65), true, "a clear street face may retain its modeled projection");
const edgeMiss = [{ id: "other", pts: [
  { x: 2.3, z: 2.3 }, { x: 3.3, z: 2.3 }, { x: 3.3, z: 2.8 }, { x: 2.3, z: 2.8 },
] }];
assert.equal(exteriorStripClear({ a: { x: 2, z: 0 }, b: { x: 2, z: 10 }, nx: 1, nz: 0 },
  edgeMiss, "owner", 1.65), false, "the entire facade length must be checked");
const depthMiss = [{ id: "other", pts: [
  { x: 0.85, z: 2.3 }, { x: 0.9, z: 2.3 }, { x: 0.9, z: 2.8 }, { x: 0.85, z: 2.8 },
] }];
assert.equal(exteriorStripClear({ a: { x: 0, z: 0 }, b: { x: 0, z: 10 }, nx: 1, nz: 0 },
  depthMiss, "owner", 1.65), false, "the entire projection depth must be checked");
assert.equal(shouldPlaceEstimatedRoofFurniture(true, 120), false, "near-field roofs need a source, not hash furniture");
assert.equal(shouldPlaceEstimatedRoofFurniture(false, 120), true);
assert.equal(shouldPlaceEstimatedRoofFurniture(false, 60), false);
assert.equal(near50CladdingAsset("brick"), "Bricks060_Color.jpg");
assert.equal(near50CladdingAsset("tile"), "Tiles107_Color.jpg");
assert.equal(near50CladdingAsset("paint"), "Plaster003_Color.jpg");
assert.equal(near50CladdingAsset("brick", "ground"), "Plaster003_Color.jpg");
for (const style of ["brick", "tile", "paint"]) {
  const asset = near50CladdingAsset(style);
  const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), `../public/data/facade-materials/${asset}`));
  assert.equal(source.subarray(0, 2).toString("hex"), "ffd8", `${asset} must be a JPEG`);
}

const baked = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "../public/data/buildings-nlsc.json"), "utf8"));
const project = createProjector(baked.origin.lat, baked.origin.lon);
const near50 = baked.buildings.filter((b) => distanceToRing(0, 0, localRing(b.ring, project)) <= NEAR_DETAIL_RADIUS_METERS);
assert.equal(near50.length, 31, "the 50m ring must include footprints crossing the radius");
const inventory = createNear50Inventory(baked.buildings,
  near50.map((b) => ({ id: b.id, height: 9, heightIsEstimated: true })), project);
assert.equal(inventory.length, 31, "the visitor's inspector must cover the complete 50m footprint set");
assert.match(inventory.find((item) => item.id === "nlsc/392")?.historicalVisualNote || "", /對位仍為推估/);
assert.match(inventory.find((item) => item.id === "nlsc/399")?.historicalVisualNote || "", /對位仍為推估/);
assert.match(inventory.find((item) => item.id === "nlsc/354")?.historicalVisualNote || "", /棟別對位待核/);
assert.equal(inventory.find((item) => item.id === "nlsc/414")?.historicalVisualNote, null,
  "the 46號 facade must not inherit unrelated Spring Road photo evidence");
assert.ok(inventory.every((item) => item.modeled && item.heightEstimated && !item.facadeCalibrated));
assert.ok(inventory.every((item) => Number.isFinite(near50CameraPose(item)?.lookX)));
assert.ok(inventory.every((item) => Number.isFinite(item.gapMeters) && item.gapMeters >= 0 && item.nearestBuildingId));
assert.equal(footprintGapMeters(
  [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }],
  [{ x: 3, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 2 }, { x: 3, z: 2 }]
), 1);
assert.equal(footprintGapMeters(
  [{ x: -2, z: -0.5 }, { x: 2, z: -0.5 }, { x: 2, z: 0.5 }, { x: -2, z: 0.5 }],
  [{ x: -0.5, z: -2 }, { x: 0.5, z: -2 }, { x: 0.5, z: 2 }, { x: -0.5, z: 2 }]
), 0, "crossing footprints must not be reported as a gap");
assert.equal(createNear50Inventory(baked.buildings, [], project).filter((item) => item.modeled).length, 0,
  "the inspector cannot claim a volume exists when a collider is missing");
assert.ok(near50.some((b) => b.id === "nlsc/414"), "46號 must be in the near ring");
const sihai = landmarkFor("nlsc/392");
assert.ok(sihai.height < 12 && sihai.currentHeightUnverified && sihai.sourceYear === 2019,
  "the shorter corner silhouette must remain labelled as a historical estimate, not a measured height");

const osm = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "../public/data/osm-200m.json"), "utf8"));
const roads = osm.roads.map((road) => ({ ...road, pts: localRing(road.path, project) }));
const streetPose = near50CameraPose(inventory.find((item) => item.id === "nlsc/392"), roads,
  near50.map((b) => ({ id: b.id, points: localRing(b.ring, project) })));
assert.ok(streetPose.y < 10 && Number.isFinite(streetPose.lookZ),
  "a street-facing 50m building should focus from near eye level, not only above its roof");
const allColliderRings = baked.buildings.map((b) => ({ id: b.id, points: localRing(b.ring, project) }));
for (const item of inventory) {
  const pose = near50CameraPose(item, roads, allColliderRings);
  assert.ok(pose && allColliderRings.every((other) => distanceToRing(pose.x, pose.z, other.points) >= 0.6),
    `${item.id} inspector camera must not be inside a building footprint`);
}
for (const [id, expected] of [
  ["nlsc/392", [5, 9]],
  ["nlsc/399", [1, 6]],
  ["nlsc/414", [4]],
]) {
  const lot = near50.find((entry) => entry.id === id);
  const faces = roadFacingEdges(localRing(lot.ring, project), roads);
  assert.deepEqual(faces.map((face) => face.index), expected,
    `${id} should detail only the actual road-facing edges, not its adjoining side walls`);
}

const no46 = baked.buildings.find((b) => b.id === "nlsc/414");
const no48 = baked.buildings.find((b) => b.id === "nlsc/410");
const no44Overlap = baked.buildings.find((b) => b.id === "nlsc/420");
const splitSurvey = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "../../unity-outdoor/RealFarm/LOCAL_BUILDING_SPLITS.json"), "utf8"));
const floorSurvey = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), "../../unity-outdoor/RealFarm/LOCAL_FLOOR_SURVEY.json"), "utf8"));
const source46 = splitSurvey.splits.flatMap((entry) => entry.parts).find((part) => part.addresses === "鎮撫街 46 號");
const source48 = floorSurvey.buildings.find((entry) => entry.addresses === "鎮撫街 48 號");
const evidence46 = localFloorEvidenceForLot(no46, project);
const evidence48 = localFloorEvidenceForLot(no48, project);
assert.equal(evidence46?.floors, source46?.floors, "46號現地樓層與來源不一致");
assert.equal(evidence48?.floors, source48?.floors, "48號現地樓層與來源不一致");
assert.ok(evidence48.estimatedHeightMeters > 12.6 && evidence48.estimatedHeightMeters < 15.5,
  "48號五層估高須可容納四個上層窗列，且不可無限拉高");
assert.equal(localFloorEvidenceForLot(no44Overlap, project), null,
  "nlsc/420 跨越 44/46 兩戶，不可套未完成對位的樓層");
assert.equal(localFloorEvidenceForLot({ ...no48, ring: no46.ring }, project), null,
  "NLSC 輪廓變更時，48號現地樓層不可套到錯誤位置");

console.log("building profiles ok", {
  houseFloors: house.upperFloors,
  marketFloors: market.upperFloors,
  temple: temple.kind,
  near50Footprints: near50.length,
  visitorInventory: inventory.length,
  observedFloorIds: [no46.id, no48.id],
});
