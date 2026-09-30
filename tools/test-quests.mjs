import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjector, pointInRing } from "../src/geo.js";
import { createOpenSpace } from "../src/open-space.js";
import {
  STREET_QUESTS,
  advanceQuests,
  bindQuestAnchors,
  currentQuestId,
  emptyQuestProgress,
  grantQuestReward,
  loadQuestProgress,
  questMarkerPoints,
  saveQuestProgress,
} from "../src/quests.js";
import { createMarketHall, createWaysideShrine, createWorshipHall, marketSpecFor, worshipSpecFor } from "../src/worship.js";

const root = dirname(fileURLToPath(import.meta.url));
const byId = Object.fromEntries(STREET_QUESTS.map((quest) => [quest.id, quest]));

function memoryStorage(seed = null) {
  const data = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function anchorsAt(origin = { x: 0, z: 0 }) {
  const shift = (x, z) => ({ x: origin.x + x, z: origin.z + z });
  return {
    yashan: shift(0, 0),
    chaoyang: shift(30, 0),
    market: shift(60, 0),
    stall: shift(64, 2),
    activity: shift(0, 40),
    station: shift(-20, 10),
    shrine: shift(10, -30),
    park: {
      ring: [
        { x: 80, z: -10 },
        { x: 140, z: -10 },
        { x: 140, z: 40 },
        { x: 80, z: 40 },
      ],
      waypoints: [
        { id: "gate", label: "公園入口", x: 86, z: 4 },
        { id: "far", label: "公園另一側", x: 130, z: 30 },
        { id: "parking", label: "停車場", x: 150, z: 8 },
      ],
    },
  };
}

function stand(progress, anchors, x, z, extra = {}) {
  return advanceQuests(progress, {
    mode: "walk",
    x,
    z,
    dirX: extra.dirX ?? 0,
    dirZ: extra.dirZ ?? 1,
    dt: extra.dt ?? 0,
    interact: extra.interact === true,
    anchors,
  });
}

const anchors = anchorsAt();
let book = emptyQuestProgress();

const sky = advanceQuests(book, { mode: "sky", x: 0, z: 0, dirX: 0, dirZ: 1, dt: 3, interact: true, anchors });
assert.equal(sky.progress.quests.Q1.status, "open");
assert.equal(sky.affordance, null, "sky view must not offer an interaction");
assert.equal(sky.completed.length, 0);

const facingShort = stand(book, anchors, 0, -4, { dirX: 0, dirZ: 1, dt: 1.9 });
assert.equal(facingShort.progress.quests.Q1.status, "open");
assert.ok(facingShort.progress.quests.Q1.face >= 1.9);
const facingDone = stand(facingShort.progress, anchors, 0, -4, { dirX: 0, dirZ: 1, dt: 0.2 });
assert.equal(facingDone.progress.quests.Q1.status, "done");
assert.equal(facingDone.completed[0].reward, "心田+5");
assert.equal(facingDone.progress.quests.Q1.rewardText, "心田+5");
assert.equal(facingDone.progress.quests.Q1.rewardSource, "local");

book = emptyQuestProgress();
const lookedAway = stand(book, anchors, 0, -4, { dirX: 1, dirZ: 0, dt: 3 });
assert.equal(lookedAway.progress.quests.Q1.status, "open", "facing away must not finish Q1");
assert.equal(lookedAway.progress.quests.Q1.face, 0);
const pressed = stand(book, anchors, 2, 2, { interact: true });
assert.equal(pressed.progress.quests.Q1.status, "done", "interact path completes Q1 inside 8m");
assert.equal(pressed.affordance, null);
const tooFar = stand(emptyQuestProgress(), anchors, 0, -9, { interact: true });
assert.equal(tooFar.progress.quests.Q1.status, "open");

book = pressed.progress;
const templeFar = stand(book, anchors, 30, 8, { interact: true });
assert.equal(templeFar.progress.quests.Q2.status, "open");
const temple = stand(book, anchors, 30, 4, { interact: true });
assert.equal(temple.progress.quests.Q2.status, "done");
assert.equal(temple.completed[0].id, "Q2");
assert.equal(temple.completed[0].reward, "心田+8");
const templeAgain = stand(temple.progress, anchors, 30, 4, { interact: true });
assert.equal(templeAgain.completed.length, 0, "a finished quest does not pay twice");

book = temple.progress;
const marketOnly = stand(book, anchors, 60, 6, { interact: true });
assert.equal(marketOnly.progress.quests.Q3.status, "open", "the market entrance is the hint, not the stall");
assert.match(marketOnly.objective, /熟悉的攤位/);
const stall = stand(book, anchors, 64, 3, { interact: true });
assert.equal(stall.progress.quests.Q3.status, "done");
assert.equal(stall.completed[0].reward, "心田+6");

book = stall.progress;
const skipped = stand(book, anchors, 150, 8, { dt: 0.2 });
assert.equal(skipped.progress.quests.Q4.step, 0, "parking does not count before entering the park");
assert.equal(skipped.progress.quests.Q4.entered, false);
const entered = stand(book, anchors, 86, 4);
assert.equal(entered.progress.quests.Q4.entered, true);
assert.equal(entered.progress.quests.Q4.step, 1, "the gate is the first waypoint");
const wrongOrder = stand(entered.progress, anchors, 150, 8);
assert.equal(wrongOrder.progress.quests.Q4.step, 1, "waypoints stay in order");
const farSide = stand(entered.progress, anchors, 130, 30);
assert.equal(farSide.progress.quests.Q4.step, 2);
const parking = stand(farSide.progress, anchors, 150, 8);
assert.equal(parking.progress.quests.Q4.status, "done");
assert.equal(parking.completed[0].reward, "心田+10");

book = parking.progress;
assert.equal(stand(book, anchors, 0, 52, { interact: true }).progress.quests.Q5.status, "open");
book = stand(book, anchors, 0, 42, { interact: true }).progress;
assert.equal(book.quests.Q5.status, "done");
book = stand(book, anchors, -20, 12, { interact: true }).progress;
assert.equal(book.quests.Q6.status, "done");
assert.equal(book.quests.Q6.rewardText, "心田+5");
const beforeShrine = stand(book, anchors, 10, -40, { interact: true });
assert.equal(beforeShrine.progress.quests.Q7.status, "open");
book = stand(book, anchors, 10, -32, { interact: true }).progress;
assert.equal(book.quests.Q7.status, "done");
assert.equal(currentQuestId(book), "");
assert.match(stand(book, anchors, 0, 0).objective, /都完成了/);

const store = memoryStorage();
saveQuestProgress(book, store);
const reloaded = loadQuestProgress(store);
assert.equal(reloaded.quests.Q1.status, "done");
assert.equal(reloaded.quests.Q7.rewardText, "心田+8");
assert.equal(reloaded.quests.Q4.step >= 3, true);
const corrupt = memoryStorage({ "zhenfu-garden-quests-v1": "{" });
assert.equal(loadQuestProgress(corrupt).quests.Q2.status, "open");

const hooked = await grantQuestReward(byId.Q2, {
  grantHeart: async ({ points, questId }) => {
    assert.equal(points, 8);
    assert.equal(questId, "Q2");
    return { ok: true };
  },
});
assert.equal(hooked.source, "xintian");
assert.equal(hooked.text, "心田+8");
const localReward = await grantQuestReward(byId.Q7, { scope: {} });
assert.equal(localReward.source, "local");
assert.equal(localReward.text, "心田+8");
const refused = await grantQuestReward(byId.Q5, {
  grantHeart: async () => { throw new Error("offline"); },
});
assert.equal(refused.source, "local");
assert.equal(refused.text, "心田+5");

const markers = questMarkerPoints(emptyQuestProgress(), anchors);
assert.equal(markers.length, 7);
assert.equal(questMarkerPoints(book, anchors).length, 0);
const partial = emptyQuestProgress();
partial.quests.Q1.status = "done";
partial.quests.Q4.step = 2;
const q4marker = questMarkerPoints(partial, anchors).find((point) => point.id === "Q4");
assert.equal(q4marker.x, anchors.park.waypoints[2].x);

const osm = JSON.parse(await readFile(join(root, "../public/data/osm-200m.json"), "utf8"));
const parkingFile = JSON.parse(await readFile(join(root, "../public/data/parking.json"), "utf8"));
const project = createProjector(24.997987, 121.3146923);
const toPts = (ring) => ring.map(([lon, lat]) => project.toLocal(lat, lon));
const roads = (osm.roads || []).map((road) => ({ name: road.name, highway: road.highway, pts: toPts(road.path) }));
const named = (name) => osm.buildings.find((building) => building.name === name);
const chaoyang = named("朝陽宮");
assert.equal(chaoyang.id, "way/556690563");
const hall = createWorshipHall(toPts(chaoyang.ring), roads, worshipSpecFor(chaoyang));
const marketBuilding = named("朝陽市場");
const market = createMarketHall(toPts(marketBuilding.ring), roads, marketSpecFor(marketBuilding));
const activity = named("北門、朝陽二里聯合活動中心");
assert.ok(activity?.id);
const shrinePoi = (osm.pois || []).find((poi) => poi.name === "地基主祠");
assert.equal(shrinePoi?.amenity, "place_of_worship");
const shrinePoint = project.toLocal(shrinePoi.lat, shrinePoi.lon);
const shrine = createWaysideShrine(shrinePoint.x, shrinePoint.z, shrinePoi.name);
const space = createOpenSpace(osm, parkingFile.lots, project, 200, []);
const bound = bindQuestAnchors({
  landmarkViews: {
    chaoyang: hall.view,
    market: market.view,
    marketStall: market.stall,
    activity: { x: 1, y: 2, z: 3, lookX: 4, lookY: 1, lookZ: 5 },
    station: { x: -64.3, y: 4.8, z: -7.9, lookX: -58.8, lookY: 2.4, lookZ: -10.2 },
    shrine: shrine.view,
  },
  brandViews: [{ brand: "yashanyuan", x: 8, z: 2, lookX: 0.4, lookZ: -0.2, y: 6, lookY: 3 }],
  parkQuest: space.quest,
});
assert.equal(bound.yashan.x, 0.4);
assert.ok(Math.hypot(bound.chaoyang.x, bound.chaoyang.z) > 1);
assert.equal(bound.stall.name, "熟食攤");
assert.ok(Math.hypot(bound.stall.x - bound.market.x, bound.stall.z - bound.market.z) > 1.5);
assert.equal(bound.shrine.x, shrinePoint.x);
assert.equal(bound.station.x, -58.8);
assert.equal(bound.park.waypoints.at(-1).id, "parking");
assert.equal(pointInRing(bound.park.waypoints[0].x, bound.park.waypoints[0].z, bound.park.ring), true);
const live = stand(emptyQuestProgress(), bound, bound.shrine.x + 1, bound.shrine.z + 1, { interact: true });
assert.equal(live.progress.quests.Q7.status, "done", "shrine interact uses the wayside anchor");
assert.equal(live.completed[0].action, "祈福");

console.log("street quests ok", {
  rewards: STREET_QUESTS.map((quest) => quest.reward).join(" "),
  parkWaypoints: space.quest.waypoints.map((point) => point.id).join("→"),
});
