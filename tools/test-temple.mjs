import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjector } from "../src/geo.js";
import { hitsCollider } from "../src/player.js";
import {
  ZHENFU_ANNEX_ID,
  ZHENFU_HALL_ID,
  ZHENFU_PLAQUE,
  createZhenfuAnnex,
  createZhenfuHall,
  inspectTempleGroup,
  isZhenfuAnnex,
  isZhenfuHall,
} from "../src/temple.js";

const root = dirname(fileURLToPath(import.meta.url));
const nlsc = JSON.parse(await readFile(join(root, "../public/data/buildings-nlsc.json"), "utf8"));
const osm = JSON.parse(await readFile(join(root, "../public/data/osm-200m.json"), "utf8"));
const project = createProjector(24.997987, 121.3146923);

function toPts(ring) {
  return ring.map(([lon, lat]) => project.toLocal(lat, lon));
}

const roads = (osm.roads || []).map((road) => ({
  name: road.name,
  pts: toPts(road.path),
}));

assert.equal(isZhenfuHall({ id: ZHENFU_HALL_ID, name: "鎮撫宮" }), true);
assert.equal(isZhenfuHall({ id: "way/556690563", name: "朝陽宮" }), false);
assert.equal(isZhenfuAnnex({ id: ZHENFU_ANNEX_ID }), true);
assert.equal(isZhenfuAnnex({ id: "nlsc/414" }), false);

const hallLot = nlsc.buildings.find((b) => b.id === ZHENFU_HALL_ID);
assert.ok(hallLot, "鎮撫宮 footprint missing");
const hall = createZhenfuHall(toPts(hallLot.ring), roads);
assert.ok(hall, "hall group missing");
assert.equal(hall.group.name, "zhenfu-temple");
const parts = inspectTempleGroup(hall.group);
assert.ok(parts.plaques >= 1, "plaque missing");
assert.equal(parts.plaqueText, ZHENFU_PLAQUE);
assert.equal(parts.lions, 2, `lions ${parts.lions}`);
assert.ok(parts.lanterns >= 4, `lanterns ${parts.lanterns}`);
assert.ok(parts.roofs >= 1, "roof missing");
assert.equal(parts.signText, ZHENFU_PLAQUE);
assert.ok(hall.frame.outZ > 0.25, `front should face south, outZ ${hall.frame.outZ}`);
assert.ok(hall.frame.outX > 0.15, `front should face east toward the street, outX ${hall.frame.outX}`);

const [clon, clat] = hallLot.ring.reduce(
  (acc, p, i, arr) => {
    const n = arr.length - 1;
    if (i >= n) return acc;
    acc[0] += p[0];
    acc[1] += p[1];
    return acc;
  },
  [0, 0]
);
const n = hallLot.ring.length - 1;
const center = project.toLocal(clat / n, clon / n);
assert.equal(hitsCollider(center.x, center.z, 0.2, hall.collider), true, "hall must block the player");
const outside = {
  x: center.x + hall.frame.outX * 18,
  z: center.z + hall.frame.outZ * 18,
};
assert.equal(hitsCollider(outside.x, outside.z, 0.2, hall.collider), false, "courtyard in front stays walkable");

const annexLot = nlsc.buildings.find((b) => b.id === ZHENFU_ANNEX_ID);
assert.ok(annexLot, "annex footprint missing");
const annex = createZhenfuAnnex(toPts(annexLot.ring), roads);
assert.equal(annex.group.name, "zhenfu-annex");
let annexSign = "";
let annexLanterns = 0;
annex.group.traverse((obj) => {
  if (obj.name === "zhenfu-annex-sign") annexSign = obj.userData?.text || "";
  if (obj.name === "zhenfu-annex-lantern") annexLanterns += 1;
});
assert.equal(annexSign, ZHENFU_PLAQUE);
assert.ok(annexLanterns >= 4, `annex lanterns ${annexLanterns}`);
const annexPts = toPts(annexLot.ring);
let ax = 0;
let az = 0;
const an = annexPts.length - 1;
for (let i = 0; i < an; i++) {
  ax += annexPts[i].x;
  az += annexPts[i].z;
}
assert.equal(hitsCollider(ax / an, az / an, 0.2, annex.collider), true, "annex must block the player");

console.log("zhenfu temple ok", {
  plaque: parts.plaqueText,
  lions: parts.lions,
  lanterns: parts.lanterns,
  roofs: parts.roofs,
  out: [Number(hall.frame.outX.toFixed(2)), Number(hall.frame.outZ.toFixed(2))],
  annexLanterns,
});
