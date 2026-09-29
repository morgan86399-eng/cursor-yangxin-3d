import assert from "node:assert/strict";
import * as THREE from "three";

const ctx = {
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  fillRect() {},
  clearRect() {},
  beginPath() {},
  ellipse() {},
  arc() {},
  fill() {},
  stroke() {},
  moveTo() {},
  lineTo() {},
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
};

function element(tag) {
  const listeners = {};
  const node = {
    tag,
    hidden: false,
    disabled: false,
    textContent: "",
    type: "",
    dataset: {},
    style: {},
    children: [],
    classes: new Set(),
    width: 0,
    height: 0,
    replaceChildren(...kids) { node.children = kids.flat(); },
    append(...kids) { node.children.push(...kids); },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, event = {}) { (listeners[type] || []).forEach((fn) => fn(event)); },
    getContext() { return ctx; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
  };
  node.classList = {
    toggle(name, force) {
      const on = force === undefined ? !node.classes.has(name) : Boolean(force);
      if (on) node.classes.add(name); else node.classes.delete(name);
      return on;
    },
    contains(name) { return node.classes.has(name); },
  };
  node.listeners = listeners;
  return node;
}

const ids = {
  farmPanel: element("section"),
  farmTitle: element("strong"),
  farmHint: element("span"),
  farmAction: element("button"),
  cropPicker: element("div"),
  farmSync: element("div"),
  view: element("canvas"),
};
ids.farmPanel.hidden = true;
ids.cropPicker.hidden = true;
globalThis.document = {
  hidden: false,
  createElement: (tag) => element(tag),
  getElementById: (id) => ids[id] || null,
  addEventListener() {},
};
const keyListeners = [];
globalThis.window = {
  addEventListener(type, fn) { if (type === "keydown") keyListeners.push(fn); },
};
globalThis.location = { href: "", search: "" };
globalThis.setInterval = () => 0;
globalThis.performance = { now: () => 0 };

const { createCourtyardFarm, createCropBillboard } = await import("../src/farm.js");

function contentBody() {
  return {
    ok: true,
    crops: {
      chuxin: { name: "初心芽", unlock: 0, tutorialOnly: true },
      pingjing: { name: "平靜草", unlock: 0 },
      qingming: { name: "圓滿蓮", unlock: 10 },
    },
    water: { max_count: 3, cooldown_seconds: 60 },
  };
}
function jsonResponse(data, status = 200) {
  return { ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data };
}

const frame = {
  courtDepth: 14,
  courtHalfWidth: 8,
  midX: 0,
  midZ: 0,
  rightX: 1,
  rightZ: 0,
  outX: 0,
  outZ: 1,
};
const player = { x: 0, z: 0, mode: "orbit" };
const controls = {
  getMode: () => player.mode,
  getState: () => ({ x: player.x, z: player.z, locked: false }),
};

const guestFarm = createCourtyardFarm(new THREE.Scene(), frame, controls, {
  fetcher: async (url) => {
    if (url.endsWith("/content")) return jsonResponse(contentBody());
    if (url.endsWith("/me")) return jsonResponse({ ok: false, error: "請先登入" }, 401);
    throw new Error(`guest write ${url}`);
  },
});
await guestFarm.ready;
assert.equal(ids.farmSync.textContent, "尚未登入心田");
assert.equal(ids.farmSync.dataset.phase, "guest");
assert.equal(ids.farmSync.classList.contains("is-guest"), true);
assert.equal(guestFarm.sprites.every((sprite) => sprite == null), true);
player.mode = "walk";
player.x = guestFarm.beds[0].position.x;
player.z = guestFarm.beds[0].position.z;
guestFarm.update();
assert.equal(ids.farmPanel.hidden, false);
assert.equal(ids.farmAction.textContent, "登入種植");
assert.equal(ids.farmAction.dataset.kind, "login");
ids.farmAction.dispatch("click");
assert.equal(globalThis.location.href, "/login?next=%2Fxintian%2Fzhenfu-garden%2F");
player.mode = "orbit";
guestFarm.selectSlot(3);
guestFarm.update();
assert.equal(ids.farmTitle.textContent, "庭院田地 4");

const offlineFarm = createCourtyardFarm(new THREE.Scene(), frame, controls, {
  fetcher: async () => { throw new Error("failed to fetch"); },
});
await offlineFarm.ready;
assert.equal(ids.farmSync.textContent, "連線失敗，請重新同步");
assert.equal(ids.farmSync.dataset.phase, "offline");
offlineFarm.selectSlot(0);
assert.equal(ids.farmAction.textContent, "重新同步");
assert.equal(ids.farmAction.dataset.kind, "offline");

let plantWrites = 0;
let serverNow = 1_000;
let plots = [
  { slot: 0, state: "empty" },
  { slot: 1, state: "growing", crop_id: "pingjing", planted_at: 1_000, ready_at: 1_100, water_count: 0, last_watered_at: null },
  { slot: 2, state: "growing", crop_id: "pingjing", planted_at: 400, ready_at: 1_000, water_count: 2, last_watered_at: 900 },
];
const decoded = [];
const cropFetches = [];
const liveFarm = createCourtyardFarm(new THREE.Scene(), frame, controls, {
  fetcher: async (url, options = {}) => {
    if (url.endsWith("/content")) return jsonResponse(contentBody());
    if (url.endsWith("/me")) {
      return jsonResponse({
        ok: true,
        server_now: serverNow,
        water_cooldown: 60,
        user: { slots: 4, total_harvests: 1 },
        plots,
      });
    }
    if (url.endsWith("/plant")) {
      plantWrites += 1;
      if (plantWrites === 1) return jsonResponse({ ok: false, error: "田地忙碌" }, 500);
      const body = JSON.parse(options.body);
      plots = plots.map((plot) => plot.slot === body.slot ? {
        slot: body.slot, state: "growing", crop_id: body.crop_id, planted_at: serverNow, ready_at: serverNow + 500, water_count: 0, last_watered_at: null,
      } : plot);
      return jsonResponse({ ok: true });
    }
    if (url.endsWith("/harvest")) {
      plots = plots.map((plot) => plot.slot === 2 ? { slot: 2, state: "empty" } : plot);
      return jsonResponse({ ok: true });
    }
    throw new Error(url);
  },
  fetchCrop: async (url) => {
    cropFetches.push(url);
    if (url.endsWith("-8.png")) {
      return { ok: true, status: 200, headers: { get: () => "text/html; charset=utf-8" }, blob: async () => ({ type: "text/html" }) };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      blob: async () => ({ type: "image/png" }),
    };
  },
  decodeImage: async () => {
    decoded.push(true);
    return { width: 8, height: 8 };
  },
});
await liveFarm.ready;
await liveFarm.settle();
assert.equal(ids.farmSync.textContent, "已與心田同步");
assert.equal(ids.farmSync.classList.contains("is-ready"), true);
assert.equal(liveFarm.beds[1].mesh.userData.presentation.growing, true);
assert.equal(liveFarm.sprites[1]?.userData.crossed, true);
assert.equal(liveFarm.sprites[1]?.userData.fallback, false);
assert.equal(liveFarm.sprites[1]?.children.length, 2);
assert.match(liveFarm.sprites[1].userData.url, /pingjing-0\.png$/);
assert.equal(decoded.length > 0, true);
assert.equal(liveFarm.beds[2].mesh.userData.presentation.wet, true);
const lockedScale = new THREE.Vector3();
const unlockedScale = new THREE.Vector3();
const lockedMatrix = new THREE.Matrix4();
const openMatrix = new THREE.Matrix4();
liveFarm.stakeMesh.getMatrixAt(4, lockedMatrix);
liveFarm.stakeMesh.getMatrixAt(0, openMatrix);
lockedScale.setFromMatrixScale(lockedMatrix);
unlockedScale.setFromMatrixScale(openMatrix);
assert.ok(lockedScale.y > 0.5, "locked plots show a stake");
assert.ok(unlockedScale.y < 0.01, "open plots hide the stake");
assert.equal(liveFarm.beds[4].mesh.material.color.getHex(), 0x8a847c);

const billboard = createCropBillboard({ userData: { fallback: true } }, 6, 0.2);
assert.equal(billboard.userData.leafLayer, true);
assert.equal(billboard.children.some((child) => child.name === "crop-leaf-layer"), true);
assert.equal(billboard.userData.fallback, true);

const clock = Date.now;
try {
  let now = clock();
  Date.now = () => now;
  liveFarm.api.fetchedAt = now;
  const decodedBefore = decoded.length;
  now += 90_000;
  liveFarm.update();
  await liveFarm.settle();
  assert.match(liveFarm.sprites[1].userData.url, /pingjing-8\.png$/);
  assert.equal(liveFarm.sprites[1].userData.fallback, true, "html responses must not become crop textures");
  assert.equal(decoded.length, decodedBefore);
} finally {
  Date.now = clock;
}

player.mode = "walk";
player.x = liveFarm.beds[0].position.x;
player.z = liveFarm.beds[0].position.z;
liveFarm.update();
await liveFarm.settle();
assert.equal(ids.farmAction.dataset.kind, "plant");
ids.farmAction.dispatch("click");
assert.equal(ids.cropPicker.hidden, false);
const names = ids.cropPicker.children.map((button) => button.textContent);
assert.equal(names.includes("初心芽"), false);
assert.equal(names.some((name) => name.includes("圓滿蓮")), true);
assert.equal(ids.cropPicker.children.find((button) => button.dataset.cropId === "qingming").disabled, true);
const pingjing = ids.cropPicker.children.find((button) => button.dataset.cropId === "pingjing");
pingjing.dispatch("click");
pingjing.dispatch("click");
await liveFarm.idle();
await liveFarm.settle();
assert.equal(plantWrites, 1, "the first failure is not resent");
assert.match(ids.farmHint.textContent, /田地忙碌/);
ids.farmAction.dispatch("click");
ids.cropPicker.children.find((button) => button.dataset.cropId === "pingjing").dispatch("click");
await liveFarm.idle();
await liveFarm.settle();
assert.equal(plantWrites, 2);
assert.equal(liveFarm.api.plot(0).crop_id, "pingjing");

liveFarm.selectSlot(2);
player.x = liveFarm.beds[2].position.x;
player.z = liveFarm.beds[2].position.z;
liveFarm.update();
assert.equal(ids.farmAction.dataset.kind, "harvest");
ids.farmAction.dispatch("click");
await liveFarm.idle();
await liveFarm.settle();
assert.equal(liveFarm.api.plot(2).state, "empty");
assert.equal(liveFarm.sprites[2], null);

keyListeners.at(-1)({ code: "KeyE", repeat: true });
keyListeners.at(-1)({ code: "KeyE", repeat: false });
assert.equal(ids.farmPanel.hidden, false);
assert.equal(liveFarm.detailStats.crossedBillboards, true);
assert.equal(liveFarm.detailStats.lockMarkers, 20);
assert.equal(liveFarm.detailStats.beds, 20);

console.log("✓ farm courtyard follows xintian plots, stages, and sync labels");
