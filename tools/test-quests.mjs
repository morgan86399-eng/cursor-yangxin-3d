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
  withNpcs,
} from "../src/quests.js";
import { approachWalkPoint, hitsCollider } from "../src/player.js";
import { Q10_LINES } from "../src/dialogue.js";
import { createNpcs } from "../src/npcs.js";
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
    talk: extra.talk || null,
    choiceId: extra.choiceId || "",
    talkNext: extra.talkNext === true,
    talkClose: extra.talkClose === true,
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
const pressed = stand(book, anchors, 0, -3, { interact: true });
assert.equal(pressed.progress.quests.Q1.status, "done", "interact path completes Q1 inside 8m");
assert.equal(pressed.affordance, null);
const greetEarly = stand(emptyQuestProgress(), anchors, 2, 2, { interact: true });
assert.equal(greetEarly.progress.quests.Q1.status, "open", "standing on 劉師父 does not require Q1 first");
assert.equal(greetEarly.dialog?.name, "劉師父");
assert.equal(greetEarly.progress.quests.Q8.status, "open");
const tooFar = stand(emptyQuestProgress(), anchors, 0, -9, { interact: true });
assert.equal(tooFar.progress.quests.Q1.status, "open");

book = pressed.progress;
const templeFar = stand(book, anchors, 30, 10, { interact: true });
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
assert.equal(currentQuestId(book), "Q8");
assert.equal(STREET_QUESTS.length, 12);
assert.ok(STREET_QUESTS.filter((quest) => quest.mode === "dialogue" || quest.mode === "delivery").length >= 5);

const placed = withNpcs(anchors);
const { liu, ahua, uncle, chen, keeper, officer } = placed.npcs;
const skyTalk = advanceQuests(book, { mode: "sky", x: liu.x, z: liu.z, interact: true, anchors });
assert.equal(skyTalk.dialog, null, "sky view does not open NPC dialogue");

const greet = stand(book, anchors, liu.x, liu.z, { interact: true });
assert.equal(greet.progress.quests.Q8.status, "open");
assert.equal(greet.dialog?.choices?.length, 2);
const dismissed = stand(greet.progress, anchors, liu.x, liu.z, { talk: greet.talk, talkClose: true });
assert.equal(dismissed.progress.quests.Q8.status, "open", "closing before a greeting does not finish Q8");
assert.equal(dismissed.dialog, null);
const hello = stand(greet.progress, anchors, liu.x, liu.z, { talk: greet.talk, choiceId: "hello" });
assert.equal(hello.progress.quests.Q8.status, "done");
assert.equal(hello.progress.quests.Q8.choice, "hello");
assert.match(hello.dialog.text, /午餐/);
const morning = stand(greet.progress, anchors, liu.x, liu.z, { talk: greet.talk, choiceId: "morning" });
assert.equal(morning.progress.quests.Q8.status, "done");
assert.match(morning.dialog.text, /十一點/);

book = morning.progress;
const askStall = stand(book, anchors, ahua.x, ahua.z, { interact: true });
assert.equal(askStall.progress.quests.Q9.status, "open");
assert.equal(askStall.progress.quests.Q9.bag, false);
assert.match(askStall.dialog.text, /市場門口/);
const tooFarBag = stand(book, anchors, anchors.market.x, anchors.market.z + 8, { interact: true });
assert.equal(tooFarBag.progress.quests.Q9.bag, false, "the paper bag stays at the market door");
const pickup = stand(book, anchors, anchors.market.x + 1, anchors.market.z + 1, { interact: true });
assert.equal(pickup.progress.quests.Q9.bag, true);
assert.match(pickup.dialog.text, /拿好了/);
const missedDrop = stand(pickup.progress, anchors, ahua.x + 6, ahua.z, { interact: true });
assert.equal(missedDrop.progress.quests.Q9.status, "open", "delivery requires standing within 3m of 阿花");
const closedBag = stand(pickup.progress, anchors, ahua.x, ahua.z, { talk: pickup.talk, talkClose: true });
const delivered = stand(closedBag.progress, anchors, ahua.x + 0.5, ahua.z, { interact: true });
assert.equal(delivered.progress.quests.Q9.status, "done");
assert.match(delivered.dialog.text, /收下/);

book = delivered.progress;
const story = stand(book, anchors, uncle.x, uncle.z, { interact: true });
assert.equal(story.progress.quests.Q10.heard, 1);
assert.equal(story.progress.quests.Q10.status, "open");
assert.equal(story.dialog.text, Q10_LINES[0]);
const half = stand(story.progress, anchors, uncle.x, uncle.z, { talk: story.talk, talkClose: true });
assert.equal(half.progress.quests.Q10.status, "open", "one line is not enough");
const resumed = stand(half.progress, anchors, uncle.x, uncle.z, { interact: true });
assert.equal(resumed.dialog.text, Q10_LINES[1]);
const heardAll = stand(resumed.progress, anchors, uncle.x, uncle.z, { talk: resumed.talk, talkClose: true });
assert.equal(heardAll.progress.quests.Q10.status, "done");
const continued = stand(story.progress, anchors, uncle.x, uncle.z, { talk: story.talk, talkNext: true });
assert.equal(continued.progress.quests.Q10.status, "done");
assert.equal(continued.dialog.text, Q10_LINES[1]);

book = heardAll.progress;
const signup = stand(book, anchors, chen.x, chen.z, { interact: true });
const later = stand(signup.progress, anchors, chen.x, chen.z, { talk: signup.talk, choiceId: "later" });
assert.equal(later.progress.quests.Q11.status, "open", "再想想 does not check in");
assert.match(later.dialog.text, /想好/);
const know = stand(signup.progress, anchors, chen.x, chen.z, { talk: signup.talk, choiceId: "know" });
assert.equal(know.progress.quests.Q11.status, "done");
assert.match(know.dialog.text, /待會見/);

book = know.progress;
const incense = stand(book, anchors, keeper.x, keeper.z, { interact: true });
assert.match(incense.dialog.text, /剛才的參拜/);
const shutEarly = stand(incense.progress, anchors, keeper.x, keeper.z, { talk: incense.talk, talkClose: true });
assert.equal(shutEarly.progress.quests.Q12.status, "open", "closing before a question does not finish Q12");
const answer = stand(incense.progress, anchors, keeper.x, keeper.z, { talk: incense.talk, choiceId: "busy" });
assert.equal(answer.progress.quests.Q12.status, "open");
assert.equal(answer.progress.quests.Q12.heard, 1);
assert.match(answer.dialog.text, /初一十五/);
book = stand(answer.progress, anchors, keeper.x, keeper.z, { talk: answer.talk, talkClose: true }).progress;
assert.equal(book.quests.Q12.status, "done");
assert.equal(currentQuestId(book), "");
assert.match(stand(book, anchors, 0, 0).objective, /都完成了/);

const tip = stand(book, anchors, officer.x, officer.z, { interact: true });
assert.match(tip.dialog.text, /夜裡/);
const waiting = stand(emptyQuestProgress(), anchors, officer.x, officer.z, { interact: true });
assert.match(waiting.dialog.text, /報個到/);
assert.equal(waiting.progress.quests.Q6.status, "open");

const npcGroup = createNpcs(placed.npcs);
assert.equal(npcGroup.group.children.length, 6);
const npcNames = npcGroup.group.children.map((child) => child.userData.name);
for (const name of ["劉師父", "廟祝", "阿花", "散步阿伯", "志工小陳", "巡邏警員"]) {
  assert.ok(npcNames.includes(name), name);
}

const store = memoryStorage();
saveQuestProgress(book, store);
const reloaded = loadQuestProgress(store);
assert.equal(reloaded.quests.Q1.status, "done");
assert.equal(reloaded.quests.Q7.rewardText, "心田+8");
assert.equal(reloaded.quests.Q12.status, "done");
assert.equal(reloaded.quests.Q9.bag, true);
assert.equal(reloaded.quests.Q10.heard >= 2, true);
assert.equal(reloaded.quests.Q8.choice, "morning");
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
  grantHeart: async () => { throw new Error("連線失敗，請重新同步"); },
});
assert.equal(refused.source, "local");
assert.equal(refused.text, "心田+5");
const offlineBook = emptyQuestProgress();
offlineBook.quests.Q1.status = "done";
const offlineWorship = stand(offlineBook, anchors, 30, 4, { interact: true });
assert.equal(offlineWorship.progress.quests.Q2.status, "done");
const offlineStore = memoryStorage();
saveQuestProgress(offlineWorship.progress, offlineStore);
assert.equal(loadQuestProgress(offlineStore).quests.Q2.status, "done", "farm sync failure still keeps Q2 in localStorage");
assert.match(loadQuestProgress(offlineStore).quests.Q2.rewardText, /心田/);

const markers = questMarkerPoints(emptyQuestProgress(), anchors);
assert.equal(markers.length, 12);
assert.equal(markers.find((point) => point.id === "Q8").x, placed.npcs.liu.x);
assert.equal(markers.find((point) => point.id === "Q9").x, placed.npcs.ahua.x);
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
assert.equal(bound.npcs.liu.name, "劉師父");
assert.equal(bound.npcs.keeper.name, "廟祝");
assert.equal(bound.npcs.ahua.name, "阿花");
assert.equal(bound.npcs.uncle.name, "散步阿伯");
assert.equal(bound.npcs.chen.name, "志工小陳");
assert.equal(bound.npcs.officer.name, "巡邏警員");
assert.ok(Math.hypot(bound.npcs.ahua.x - bound.stall.x, bound.npcs.ahua.z - bound.stall.z) > 3);
assert.ok(Math.hypot(bound.npcs.officer.x - bound.station.x, bound.npcs.officer.z - bound.station.z) > 6);
assert.equal(pointInRing(bound.park.waypoints[0].x, bound.park.waypoints[0].z, bound.park.ring), true);
const live = stand(emptyQuestProgress(), bound, bound.shrine.x + 1, bound.shrine.z + 1, { interact: true });
assert.equal(live.progress.quests.Q7.status, "done", "shrine interact uses the wayside anchor");
assert.equal(live.completed[0].action, "祈福");

const worshipSpot = approachWalkPoint(hall.view, [hall.collider], 0.42);
assert.ok(worshipSpot, "chaoyang inspection view has a walk spot");
const worshipDist = Math.hypot(worshipSpot.x - hall.view.lookX, worshipSpot.z - hall.view.lookZ);
assert.ok(worshipDist <= byId.Q2.range, `walk spawn ${worshipDist.toFixed(2)}m must be inside the worship range`);
assert.equal(hitsCollider(worshipSpot.x, worshipSpot.z, 0.42, hall.collider), false, "worship spawn stands outside the temple mesh");
const q1Done = emptyQuestProgress();
q1Done.quests.Q1.status = "done";
const worshipped = stand(q1Done, bound, worshipSpot.x, worshipSpot.z, {
  interact: true,
  dirX: hall.view.lookX - worshipSpot.x,
  dirZ: hall.view.lookZ - worshipSpot.z,
});
assert.equal(worshipped.progress.quests.Q2.status, "done", "Q2 completes at the chaoyang walk spawn");
assert.equal(worshipped.completed[0]?.id, "Q2");
assert.equal(currentQuestId(worshipped.progress), "Q3");
const keeperTalk = stand(q1Done, bound, bound.npcs.keeper.x, bound.npcs.keeper.z, { interact: true });
assert.equal(keeperTalk.progress.quests.Q2.status, "open", "廟祝 can be talked to before worship");
assert.equal(keeperTalk.dialog?.name, "廟祝");
assert.equal(keeperTalk.rows.find((row) => row.id === "Q3").status, "可進行");

console.log("street quests ok", {
  rewards: STREET_QUESTS.map((quest) => quest.reward).join(" "),
  parkWaypoints: space.quest.waypoints.map((point) => point.id).join("→"),
});
