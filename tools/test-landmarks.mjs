import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjector } from "../src/geo.js";
import { hitsCollider } from "../src/player.js";
import { createOpenSpace } from "../src/open-space.js";
import { isZhenfuHall } from "../src/temple.js";
import {
  civicSpecFor,
  createCivicHall,
  createWorshipHall,
  inspectLandmarkGroup,
  worshipSpecFor,
} from "../src/worship.js";

const root = dirname(fileURLToPath(import.meta.url));
const osm = JSON.parse(await readFile(join(root, "../public/data/osm-200m.json"), "utf8"));
const parking = JSON.parse(await readFile(join(root, "../public/data/parking.json"), "utf8"));
const project = createProjector(24.997987, 121.3146923);

function toPts(ring) {
  return ring.map(([lon, lat]) => project.toLocal(lat, lon));
}

const roads = (osm.roads || []).map((road) => ({ name: road.name, highway: road.highway, pts: toPts(road.path) }));
const byName = (name) => osm.buildings.find((b) => b.name === name);

const chaoyang = byName("朝陽宮");
assert.equal(chaoyang.id, "way/556690563");
assert.equal(chaoyang.height, 3, "OSM fallback is a one-storey shed; the mesh must not keep that reading");
assert.equal(worshipSpecFor(chaoyang)?.tradition, "taoist");
assert.equal(worshipSpecFor({ id: "way/546763425", name: "鎮撫宮", building: "temple" }), null);
assert.equal(isZhenfuHall(chaoyang), false);
assert.equal(worshipSpecFor(byName("朝陽市場")), null);
assert.equal(civicSpecFor(byName("青溪派出所")), null);
assert.equal(civicSpecFor(byName("朝陽市場")), null);

const activity = civicSpecFor(byName("北門、朝陽二里聯合活動中心"));
const assembly = civicSpecFor(byName("青溪、成功、東門里集會所"));
assert.equal(activity?.name, "北門、朝陽二里聯合活動中心");
assert.equal(assembly?.name, "青溪、成功、東門里集會所");
assert.ok(activity.height >= 9);
assert.equal(assembly.height, 6);

const hall = createWorshipHall(toPts(chaoyang.ring), roads, worshipSpecFor(chaoyang));
assert.equal(hall.group.name, "worship-hall");
const parts = inspectLandmarkGroup(hall.group);
assert.equal(parts.plaqueText, "朝陽宮");
assert.ok(parts.roofs >= 1, "curved roof missing");
assert.ok(parts.lanterns >= 2, `lanterns ${parts.lanterns}`);
assert.ok(hall.collider.height > 6, `temple still reads as a shed at ${hall.collider.height}m`);
const center = toPts(chaoyang.ring).slice(0, -1).reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 });
const n = chaoyang.ring.length - 1;
assert.equal(hitsCollider(center.x / n, center.z / n, 0.2, hall.collider), true);

const daxiong = createWorshipHall(toPts(byName("大雄寶殿").ring), roads, worshipSpecFor(byName("大雄寶殿")));
const lianshe = createWorshipHall(toPts(byName("桃園佛教蓮社").ring), roads, worshipSpecFor(byName("桃園佛教蓮社")));
assert.equal(worshipSpecFor(byName("大雄寶殿")).tradition, "buddhist");
assert.equal(inspectLandmarkGroup(daxiong.group).plaqueText, "大雄寶殿");
assert.equal(inspectLandmarkGroup(lianshe.group).plaqueText, "桃園佛教蓮社");
assert.ok(inspectLandmarkGroup(lianshe.group).roofs >= 1);

const roofs = new Set();
for (const built of [hall, daxiong, lianshe]) {
  built.group.traverse((obj) => {
    if (obj.name === "worship-roof") roofs.add(obj.material.uuid);
  });
}
assert.equal(roofs.size, 1, "temple roofs should share one material");

const civic = createCivicHall(toPts(byName("北門、朝陽二里聯合活動中心").ring), roads, activity);
const meet = createCivicHall(toPts(byName("青溪、成功、東門里集會所").ring), roads, assembly);
assert.equal(inspectLandmarkGroup(civic.group).plaqueText, activity.name);
assert.equal(inspectLandmarkGroup(meet.group).plaqueText, assembly.name);
assert.equal(inspectLandmarkGroup(civic.group).roofs, 0, "a community centre is not a temple roof");
assert.ok(inspectLandmarkGroup(civic.group).civicRoof >= 1);
assert.equal(meet.collider.height, 6.04);

const space = createOpenSpace(osm, parking.lots, project, 200, [hall.collider]);
assert.equal(space.parkName, "朝陽公園");
assert.equal(space.parkingName, "朝陽公園停車場");
assert.ok(space.trees >= 8, `park trees ${space.trees}`);
assert.ok(space.stalls >= 6, `stalls ${space.stalls}`);
let lawns = 0;
let paths = 0;
let stallMeshes = 0;
space.group.traverse((obj) => {
  if (obj.name === "park-lawn") lawns += 1;
  if (obj.name === "park-path") paths += 1;
  if (obj.name === "parking-stalls") stallMeshes += 1;
  if (obj.name === "park-sign") assert.equal(obj.userData.text, "朝陽公園");
  if (obj.name === "parking-sign") assert.equal(obj.userData.text, "朝陽公園停車場");
});
assert.equal(lawns, 1);
assert.ok(paths >= 1, "park paths missing");
assert.equal(stallMeshes, 1);
assert.ok(space.views.park && space.views.parking);
assert.ok(Number.isFinite(hall.view.x) && Number.isFinite(space.views.park.lookX));

console.log("chaoyang landmarks ok", {
  templeHeight: Number(hall.collider.height.toFixed(2)),
  trees: space.trees,
  stalls: space.stalls,
  paths,
});
