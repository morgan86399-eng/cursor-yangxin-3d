import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.E2E_OUT || "/opt/cursor/artifacts";
const PORT = process.env.PORT || "5174";
const URL = process.env.E2E_URL || `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

async function waitFor(page, fn, timeout = 60000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("timeout waiting: " + JSON.stringify(last));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--window-size=1400,900",
  ],
  defaultViewport: { width: 1400, height: 900 },
});

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
await mkdir(OUT, { recursive: true });

try {
  await page.goto(`${URL}?view=sky`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitFor(page, () => Boolean(window.__yangxin?.quests?.anchors?.shrine && window.__yangxin.quests.anchors.yashan));
  await waitFor(page, () => window.__yangxin.quests.skyMarkersVisible() === true);
  const sky = await page.evaluate(() => ({
    objective: document.getElementById("questObjective")?.textContent || "",
    list: document.getElementById("questList")?.innerText || "",
    interactHidden: document.getElementById("questInteract")?.hidden,
    markers: window.__yangxin.quests.skyMarkersVisible(),
    anchors: Object.fromEntries(Object.entries(window.__yangxin.quests.anchors).map(([key, value]) => [
      key,
      value && Number.isFinite(value.x) ? { x: value.x, z: value.z, name: value.name || "" } : null,
    ])),
  }));
  assert.equal(sky.markers, true, "sky mode should show quest rings");
  assert.equal(sky.interactHidden, true, "sky mode must not offer interact");
  for (const name of [
    "找到雅善圓", "朝陽宮參拜", "市場找攤", "公園繞一圈", "活動中心打卡", "派出所報到", "地基主小祈福",
    "跟劉師父打招呼", "幫攤販遞紙袋", "聽阿伯講舊街", "跟志工報名活動", "跟廟祝問香火",
  ]) {
    assert.match(sky.list, new RegExp(name));
  }
  const npcNames = await page.evaluate(() => (window.__yangxin.quests.npcs || []).map((npc) => npc.name));
  for (const name of ["劉師父", "廟祝", "阿花", "散步阿伯", "志工小陳", "巡邏警員"]) {
    assert.ok(npcNames.includes(name), `missing NPC ${name}`);
  }
  await page.screenshot({ path: path.join(OUT, "quest-sky-markers.png") });

  await page.evaluate(() => localStorage.removeItem("zhenfu-garden-quests-v1"));
  await page.goto(`${URL}?view=walk`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitFor(page, () => Boolean(window.__yangxin?.quests?.anchors?.shrine));
  const approach = await page.evaluate(() => {
    const shrine = window.__yangxin.quests.anchors.shrine;
    const yashan = window.__yangxin.quests.anchors.yashan;
    window.__yangxin.enterWalk();
    window.__yangxin.setState({
      x: shrine.x + 1.4,
      z: shrine.z + 1.2,
      y: 0,
      lookX: shrine.x,
      lookY: 1.3,
      lookZ: shrine.z,
    });
    const view = window.__yangxin.quests.interact();
    return {
      label: view.affordance?.label || document.getElementById("questInteract")?.textContent || "",
      toast: document.getElementById("questToast")?.textContent || "",
      q1: view.progress.quests.Q1.status,
      q7: view.progress.quests.Q7.status,
      yashanAway: Math.hypot(shrine.x - yashan.x, shrine.z - yashan.z),
      stored: localStorage.getItem("zhenfu-garden-quests-v1"),
    };
  });
  assert.ok(approach.yashanAway > 12, `shrine should not sit on the shop door (${approach.yashanAway})`);
  assert.equal(approach.q7, "done", JSON.stringify(approach));
  assert.match(approach.toast, /地基主小祈福完成，心田\+8/);
  assert.match(approach.stored, /"Q7"/);
  assert.match(approach.stored, /心田\+8/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitFor(page, () => window.__yangxin?.quests?.getProgress?.().quests?.Q7?.status === "done");
  const kept = await page.evaluate(() => window.__yangxin.quests.getProgress().quests.Q7);
  assert.equal(kept.status, "done");
  assert.equal(kept.rewardText, "心田+8");

  await page.evaluate(() => {
    const shop = window.__yangxin.brandViews.find((item) => item.brand === "yashanyuan");
    const dx = shop.x - shop.lookX;
    const dz = shop.z - shop.lookZ;
    const len = Math.hypot(dx, dz) || 1;
    window.__yangxin.enterWalk();
    window.__yangxin.setState({
      x: shop.lookX + (dx / len) * 4.2,
      z: shop.lookZ + (dz / len) * 4.2,
      y: 0,
      lookX: shop.lookX,
      lookY: 2.2,
      lookZ: shop.lookZ,
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const hud = await page.evaluate(() => {
    const state = window.__yangxin.getState();
    const shop = window.__yangxin.quests.anchors.yashan;
    return {
      hidden: document.getElementById("questInteract").hidden,
      label: document.getElementById("questInteract").textContent,
      objective: document.getElementById("questObjective").textContent,
      mode: state.mode,
      dist: Math.hypot(state.x - shop.x, state.z - shop.z),
      q1: window.__yangxin.quests.getProgress().quests.Q1.status,
      x: state.x,
      z: state.z,
    };
  });
  assert.equal(hud.hidden, false, `walk mode at 46號 should offer interact ${JSON.stringify(hud)}`);
  assert.match(hud.label, /查看|祈福/);
  await page.screenshot({ path: path.join(OUT, "quest-hud-walk.png") });

  const greeting = await page.evaluate(() => {
    window.__yangxin.quests.interact();
    const liu = window.__yangxin.quests.npcs.find((npc) => npc.id === "liu");
    window.__yangxin.setState({
      x: liu.x,
      z: liu.z + 1.1,
      y: 0,
      lookX: liu.x,
      lookY: 1.4,
      lookZ: liu.z,
    });
    window.__yangxin.quests.interact();
    return {
      q1: window.__yangxin.quests.getProgress().quests.Q1.status,
      q8: window.__yangxin.quests.getProgress().quests.Q8.status,
      name: document.getElementById("questDialogName")?.textContent || "",
      text: document.getElementById("questDialogText")?.textContent || "",
      choices: [...document.querySelectorAll("#questDialogChoices button")].map((button) => button.textContent),
      dist: Math.hypot(window.__yangxin.getState().x - liu.x, window.__yangxin.getState().z - liu.z),
    };
  });
  assert.equal(greeting.q1, "done");
  assert.equal(greeting.q8, "open", JSON.stringify(greeting));
  assert.equal(greeting.name, "劉師父");
  assert.ok(greeting.choices.some((label) => label.includes("劉師父早")), JSON.stringify(greeting));
  await page.screenshot({ path: path.join(OUT, "quest-dialog-liu.png") });
  await page.click("#questDialogChoices button");
  await waitFor(page, () => window.__yangxin.quests.getProgress().quests.Q8.status === "done");
  const replied = await page.evaluate(() => ({
    text: document.getElementById("questDialogText")?.textContent || "",
    q8: window.__yangxin.quests.getProgress().quests.Q8,
  }));
  assert.match(replied.text, /十一點|午餐/);
  assert.equal(replied.q8.status, "done");
  assert.equal(replied.q8.rewardText, "心田+4");

  for (const view of ["yashan-close", "chaoyang", "shrine", "market", "activity", "station", "park", "parking"]) {
    await page.goto(`${URL}?view=${view}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await waitFor(page, () => Boolean(window.__yangxin?.landmarkViews));
    await new Promise((resolve) => setTimeout(resolve, 700));
    await page.screenshot({ path: path.join(OUT, `landmark-${view}.png`) });
  }

  assert.deepEqual(errors, [], errors.join("\n"));
  console.log("quest e2e ok", { toast: approach.toast, hud, out: OUT, root: ROOT });
} finally {
  await browser.close();
}
