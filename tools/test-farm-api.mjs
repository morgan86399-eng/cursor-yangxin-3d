import assert from "node:assert/strict";
import { cropImageDisposition, FarmAPI, FARM_SYNC_LABEL } from "../src/farm-api.js";
import { createFarmMockFetcher, farmMockRequested } from "../src/farm-mock.js";

const content = {
  ok: true,
  crops: {
    chuxin: { name: "初心芽", unlock: 0, tutorialOnly: true },
    rice: { name: "稻米", unlock: 0 },
    lotus: { name: "圓滿蓮", unlock: 10 },
  },
  water: { max_count: 2, cooldown_seconds: 60 },
};
let plot = { slot: 0, state: "empty" };
let plantWrites = 0;
let meReads = 0;
const fetcher = async (url, options = {}) => {
  if (url.endsWith("/content")) return response(content);
  if (url.endsWith("/me")) {
    meReads += 1;
    return response({
      ok: true,
      server_now: 100,
      water_cooldown: 60,
      user: { slots: 1, total_harvests: 0 },
      plots: [plot],
    });
  }
  if (url.endsWith("/plant")) {
    plantWrites += 1;
    const body = JSON.parse(options.body);
    plot = { slot: body.slot, state: "growing", crop_id: body.crop_id, planted_at: 100, ready_at: 200, water_count: 0 };
    return response({ ok: true, plot });
  }
  throw new Error(`unexpected ${url} ${options.method}`);
};
function response(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

const api = new FarmAPI(fetcher);
assert.equal(api.state.phase, "idle");
assert.equal(api.syncLabel(), FARM_SYNC_LABEL.idle);
await api.refresh();
assert.equal(api.state.phase, "ready");
assert.equal(api.syncLabel(), "已與心田同步");
assert.equal(api.status(0).kind, "plant");
assert.equal(api.crops().some((crop) => crop.id === "chuxin"), false, "tutorial crops stay out of the planter");
assert.equal(api.crops().find((crop) => crop.id === "lotus").unlocked, false);
assert.equal(api.crops().find((crop) => crop.id === "rice").unlocked, true);
await api.plant(0, "rice");
assert.equal(plantWrites, 1, "a write must never be replayed");
assert.equal(api.plot(0).crop_id, "rice");
assert.equal(api.status(1).kind, "locked");
assert.equal(api.plotView(1).locked, true);
assert.equal(api.plotView(0).growing, true);
assert.equal(meReads >= 3, true, "refresh before and after the write");

const realNow = Date.now;
try {
  let now = 1_700_000_000_000;
  Date.now = () => now;
  const clock = new FarmAPI(async (url) => {
    if (url.endsWith("/content")) return response(content);
    if (url.endsWith("/me")) {
      return response({
        ok: true,
        server_now: 1_000,
        water_cooldown: 60,
        user: { slots: 4, total_harvests: 3 },
        plots: [
          { slot: 0, state: "empty" },
          { slot: 1, state: "growing", crop_id: "rice", planted_at: 1_000, ready_at: 1_100, water_count: 0 },
          { slot: 2, state: "growing", crop_id: "rice", planted_at: 400, ready_at: 1_000, water_count: 2, last_watered_at: 900 },
          { slot: 3, state: "growing", crop_id: "rice", planted_at: 500, ready_at: 2_000, water_count: 1, last_watered_at: 990 },
        ],
      });
    }
    throw new Error(url);
  });
  await clock.refresh();
  clock.fetchedAt = now;
  assert.equal(clock.cropStage(1), 0);
  assert.equal(clock.status(1).kind, "water");
  assert.equal(clock.status(2).kind, "harvest");
  assert.equal(clock.status(3).kind, "wait");
  assert.equal(clock.plotView(2).wet, true);
  assert.equal(clock.imageURL("rice", clock.cropStage(1)), "/xintian/assets/img/crops/rice-0.png");
  const readsBefore = clock.fetchedAt;
  now += 120_000;
  assert.equal(clock.cropStage(1), 9, "stage follows server time between refreshes");
  assert.equal(clock.fetchedAt, readsBefore, "stage changes must not refetch");
  assert.equal(clock.status(1).kind, "harvest");
  assert.equal(clock.imageURL("rice", clock.cropStage(1)), "/xintian/assets/img/crops/rice-9.png");
} finally {
  Date.now = realNow;
}

const guest = new FarmAPI(async (url) => {
  if (url.endsWith("/content")) return response(content);
  if (url.endsWith("/me")) return response({ ok: false, error: "請先登入" }, 401);
  throw new Error(`write ${url}`);
});
await guest.refresh();
assert.equal(guest.state.phase, "guest");
assert.equal(guest.state.error, "");
assert.equal(guest.state.authenticated, false);
assert.equal(guest.syncLabel(), "尚未登入心田");
assert.equal(guest.status(0).kind, "login");
await assert.rejects(() => guest.plant(0, "rice"), /請先登入/);

const htmlGuest = new FarmAPI(async (url) => {
  if (url.endsWith("/content")) return response(content);
  return { ok: false, status: 401, json: async () => { throw new Error("html"); } };
});
await htmlGuest.refresh();
assert.equal(htmlGuest.state.phase, "guest");
assert.equal(htmlGuest.syncLabel(), "尚未登入心田");

let failedWrites = 0;
const brokenWrite = new FarmAPI(async (url) => {
  if (url.endsWith("/content")) return response(content);
  if (url.endsWith("/me")) {
    return response({ ok: true, server_now: 50, water_cooldown: 60, user: { slots: 2, total_harvests: 0 }, plots: [{ slot: 0, state: "empty" }] });
  }
  if (url.endsWith("/plant")) {
    failedWrites += 1;
    return response({ ok: false, error: "田地忙碌" }, 500);
  }
  throw new Error(url);
});
await brokenWrite.refresh();
await assert.rejects(() => brokenWrite.plant(0, "rice"), /田地忙碌/);
assert.equal(failedWrites, 1, "a failed write is not resent");
assert.equal(brokenWrite.state.busy, false);
assert.equal(brokenWrite.state.phase, "ready");

const offline = new FarmAPI(async () => { throw new Error("failed to fetch"); });
await offline.refresh();
assert.equal(offline.state.phase, "offline");
assert.equal(offline.syncLabel(), "連線失敗，請重新同步");
assert.equal(offline.status(0).kind, "offline");
assert.notEqual(offline.status(0).kind, "login");
let release;
let meCalls = 0;
const deferred = new FarmAPI((url) => {
  if (url.endsWith("/content")) return Promise.resolve(response(content));
  meCalls += 1;
  return new Promise((resolve) => { release = () => resolve(response({ ok: true, server_now: 10, water_cooldown: 60, user: { slots: 1, total_harvests: 0 }, plots: [{ slot: 0, state: "empty" }] })); });
});
const first = deferred.refresh({ retry: true });
const second = deferred.refresh();
assert.equal(deferred.state.phase, "retrying");
assert.equal(deferred.syncLabel(), "重新同步中…");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(typeof release, "function");
release();
await first;
await second;
assert.equal(meCalls, 1, "overlapping refresh stays single-flight");
assert.equal(deferred.state.phase, "ready");

const session = new FarmAPI(async (url) => {
  if (url.endsWith("/content")) return response(content);
  if (url.endsWith("/me")) {
    if (session.state.phase === "ready" || session.state.authenticated) throw new Error("socket closed");
    return response({ ok: true, server_now: 20, water_cooldown: 60, user: { slots: 2, total_harvests: 1 }, plots: [{ slot: 0, state: "growing", crop_id: "rice", planted_at: 0, ready_at: 99999, water_count: 0 }] });
  }
  throw new Error(`blocked ${url}`);
});
await session.refresh();
assert.equal(session.plotView(0).growing, true);
await session.refresh();
assert.equal(session.state.phase, "offline");
assert.equal(session.state.me?.plots?.length, 1, "last good plots stay visible while offline");
assert.equal(session.status(0).kind, "offline");
await assert.rejects(() => session.water(0), /socket closed|請先登入|同步/);

assert.equal(cropImageDisposition("image/png", true), "use");
assert.equal(cropImageDisposition("image/webp; charset=binary", true), "use");
assert.equal(cropImageDisposition("text/html; charset=utf-8", true), "fallback");
assert.equal(cropImageDisposition("image/png", false), "fallback");
assert.equal(cropImageDisposition("", true), "fallback");
assert.equal(farmMockRequested(""), false);
assert.equal(farmMockRequested("?facade=mixed"), false);
assert.equal(farmMockRequested("?farm=mock"), true);
const mock = createFarmMockFetcher();
const mockMe = await (await mock("/api/xintian/me")).json();
assert.equal(mockMe.user.slots, 10);
assert.equal(mockMe.plots.find((plotItem) => plotItem.slot === 0).state, "empty");
assert.equal(mockMe.plots.find((plotItem) => plotItem.slot === 3).crop_id, "yuyi");
const mockContent = await (await mock("/api/xintian/content")).json();
assert.equal(mockContent.crops.chuxin.tutorialOnly, true);

const timeoutApi = new FarmAPI((_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
}), 5);
await assert.rejects(() => timeoutApi.request("content"), /連線逾時/);

const ignoreAbort = new FarmAPI(() => new Promise(() => {}), 5);
await assert.rejects(() => ignoreAbort.request("content"), /連線逾時/);

console.log("✓ farm API uses the shared server state and performs one write");
