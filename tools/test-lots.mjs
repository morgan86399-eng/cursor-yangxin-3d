import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heightForLot, mergeNlscAndOsm, displayHeightForLot } from "../src/lots.js";

assert.equal(heightForLot(40, true), 6.6);
assert.equal(heightForLot(40, false), 6.6);
assert.equal(heightForLot(200, false), 9);
assert.equal(heightForLot(900, false), 12);

const hset = new Set();
for (let i = 0; i < 80; i++) {
  hset.add(displayHeightForLot({ id: `nlsc/${i}`, area: 50, source: "nlsc-buildx" }, false));
}
assert.ok(hset.size >= 3, `display heights ${[...hset]}`);
assert.equal(displayHeightForLot({ id: "nlsc/1", area: 50, source: "nlsc-buildx" }, true), 6.6);

const origin = { lat: 24.997987, lon: 121.3146923 };
const shopLot = {
  id: "nlsc/1",
  area: 90,
  ring: [
    [121.31468, 24.99799],
    [121.31472, 24.99799],
    [121.31472, 24.99795],
    [121.31468, 24.99795],
    [121.31468, 24.99799],
  ],
};
const farLot = {
  id: "nlsc/2",
  area: 70,
  ring: [
    [121.316, 24.999],
    [121.3161, 24.999],
    [121.3161, 24.9989],
    [121.316, 24.9989],
    [121.316, 24.999],
  ],
};
const temple = {
  id: "way/temple",
  name: "鎮撫宮",
  building: "temple",
  height: 12,
  ring: [
    [121.3146, 24.9984],
    [121.3148, 24.9984],
    [121.3148, 24.9982],
    [121.3146, 24.9982],
    [121.3146, 24.9984],
  ],
  tags: { amenity: "place_of_worship" },
};
const insideTemple = {
  id: "nlsc/inside",
  area: 50,
  ring: [
    [121.31465, 24.99832],
    [121.3147, 24.99832],
    [121.3147, 24.99828],
    [121.31465, 24.99828],
    [121.31465, 24.99832],
  ],
};

const merged = mergeNlscAndOsm([shopLot, farLot, insideTemple], [temple], origin);
assert.equal(merged.shopId, "nlsc/1");
const shop = merged.buildings.find((b) => b.id === "nlsc/1");
assert.equal(shop.isShop, true);
assert.equal(shop.height, 6.6);
assert.ok(merged.buildings.some((b) => b.id === "way/temple"));
assert.equal(merged.buildings.some((b) => b.id === "nlsc/inside"), false);
assert.ok(merged.shopDistance < 10, `shopDistance ${merged.shopDistance}`);

console.log("lots merge ok", { shopId: merged.shopId, n: merged.buildings.length, d: merged.shopDistance });

const baked = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), "../public/data/buildings-nlsc.json"), "utf8")
);
assert.ok(baked.buildings.length > 200, `too few lots ${baked.buildings.length}`);
assert.ok(baked.shopId);
assert.ok(baked.shopDistance < 5, `shop not on 46號, d=${baked.shopDistance}`);
const bakedShop = baked.buildings.find((b) => b.id === baked.shopId);
assert.equal(bakedShop.height, 6.6);
assert.equal(bakedShop.isShop, true);
assert.ok(bakedShop.area >= 25 && bakedShop.area <= 160, `46號 footprint ${bakedShop.area}`);
assert.ok(bakedShop.ring.length >= 5, "shop outline has corners");
console.log("baked BUILDX ok", { n: baked.buildings.length, shop: baked.shopId, d: baked.shopDistance, area: bakedShop.area, ring: bakedShop.ring.length });
