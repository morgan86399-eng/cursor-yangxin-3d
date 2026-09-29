#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.E2E_OUT || "/opt/cursor/artifacts";
const PORT = process.env.PORT || "5174";
const URL = process.env.E2E_URL || `http://127.0.0.1:${PORT}/?view=orbit`;
const CHROME = process.env.CHROME || "/usr/local/bin/google-chrome";

async function waitFor(page, fn, timeout = 60000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await page.evaluate(fn);
    if (last) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timeout waiting: " + JSON.stringify(last));
}

async function neutralWallRatio(file) {
  // Ignore the HUD: a wall filling this central view is almost entirely mid-gray.
  const { data, info } = await sharp(file)
    .extract({ left: 450, top: 30, width: 850, height: 740 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let neutral = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 65 && r < 190 && Math.max(r, g, b) - Math.min(r, g, b) < 14) neutral++;
  }
  return neutral / (info.width * info.height);
}

async function main() {
  await mkdir(OUT, { recursive: true });
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
  page.setDefaultTimeout(60000);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const ready = await waitFor(page, () => {
    const y = window.__yangxin;
    const status = document.getElementById("status")?.textContent || "";
    if (!y || !status.includes("已對準")) return null;
    return {
      count: y.buildingCount,
      shopId: y.shopId,
      insideOrigin: y.insideBuilding(0, 0),
      uniqueFacades: y.facadeStats?.unique || 0,
      styles: y.facadeStats?.styles || {},
      metalCaps: y.facadeStats?.metalCaps || 0,
      fascia: y.facadeStats?.fascia || 0,
      signCount: y.signCount || 0,
      signNames: y.signNames || [],
      signPendingCalibration: y.signPendingCalibration || [],
      crossings: y.roadStats?.crossings || 0,
      stripes: y.roadStats?.stripes || 0,
      dashes: y.roadStats?.dashes || 0,
      shopZebra: y.roadStats?.shopZebra === true,
      branded: y.facadeStats?.branded || 0,
      near50Footprints: y.facadeStats?.near50Footprints || 0,
      near50PlainUpper: y.facadeStats?.near50PlainUpper || 0,
      near50PhysicalWindows: y.facadeStats?.near50PhysicalWindows || 0,
      near50Inventory: (y.near50Inventory || []).map((item) => ({
        id: item.id, modeled: item.modeled, modelRole: item.modelRole, recessedWindows: item.recessedWindows,
        projectionOmissions: item.projectionOmissions,
        heightEstimated: item.heightEstimated,
        observedFloors: item.observedFloors, facadeCalibrated: item.facadeCalibrated,
        source: item.source, nearestBuildingId: item.nearestBuildingId,
        historicalVisualNote: item.historicalVisualNote,
      })),
      near50HistoricalStreetSigns: y.streetPropStats?.near50HistoricalStreetSigns || 0,
      near50RepeatedNameTexturesAvoided: y.facadeStats?.near50RepeatedNameTexturesAvoided || 0,
      near50RoofEquipmentOmitted: y.facadeStats?.near50RoofEquipmentOmitted || 0,
      near50HistoricalCornerSigns: y.facadeStats?.near50HistoricalCornerSigns || 0,
      near50GapProjectionsRejected: y.facadeStats?.near50GapProjectionsRejected || 0,
      near50RecessedWindows: y.facadeStats?.near50RecessedWindows || 0,
      near50RecessedBuildings: y.facadeStats?.near50RecessedBuildings || 0,
      surveyedFloors: ["nlsc/414", "nlsc/410", "nlsc/420"].map((id) => {
        const lot = y.colliders.find((c) => c.id === id);
        return { id, floors: lot?.observedFloors ?? null, height: lot?.height ?? null,
          heightIsEstimated: lot?.heightIsEstimated ?? null };
      }),
      templeHeightsEstimated: ["nlsc/343", "way/546763425"].every((id) =>
        y.colliders.find((c) => c.id === id)?.heightIsEstimated === true),
      shopList: (y.shopList || []).map((s) => s.name),
    };
  });
  assert.ok(ready.count >= 200, `too few buildings ${ready.count}`);
  assert.ok(ready.shopId, "shop lot missing");
  assert.ok(ready.uniqueFacades > 80, `facades still cloned ${ready.uniqueFacades}`);
  assert.ok(ready.signCount >= 35, `too few independent signs ${ready.signCount}`);
  assert.ok(ready.signCount < ready.shopList.length, "building-owned signs must not be duplicated as independent signs");
  assert.deepEqual(ready.signPendingCalibration.map((s) => s.name).sort(), ["斗南米糕甲", "無名米粉湯"].sort(),
    "secondary shops without a verified frontage must remain pending, not overlap a modeled fascia");
  assert.equal(ready.near50Footprints, 31, "50m includes every intersecting baked footprint");
  assert.deepEqual(ready.surveyedFloors.map((lot) => lot.floors), [3, 5, null],
    "only address-aligned 46/48 may use weiyo's on-site floor survey");
  assert.ok(ready.surveyedFloors.every((lot) => lot.heightIsEstimated === true),
    "floor observation must not be presented as measured metre height");
  assert.equal(ready.templeHeightsEstimated, true,
    "near-field custom temple metre heights must also be labelled as estimates");
  assert.ok(ready.surveyedFloors[1].height >= 14.6 && ready.surveyedFloors[1].height <= 14.7,
    "48號 five-storey visual mass should retain its explicitly estimated height");
  assert.ok(ready.near50PlainUpper >= 1, "near-field street walls should not have duplicate painted and physical windows");
  assert.ok(ready.near50PhysicalWindows >= 1, "near-field physical windows missing");
  assert.equal(ready.near50Inventory.length, 31, "the 50m visitor inspector must include all footprints");
  assert.equal(ready.near50Inventory.filter((item) => item.modelRole === "generic").length, 18,
    "the 50m inspector must disclose the generic-model backlog rather than call every volume detailed");
  assert.equal(ready.near50Inventory.filter((item) => item.modelRole !== "generic").length, 13);
  assert.equal(ready.near50Inventory.find((item) => item.id === "way/764063118")?.modelRole, "civic",
    "青溪、成功、東門里集會所 is a community centre, not a generic house");
  assert.ok(ready.near50RecessedWindows > 0 && ready.near50RecessedBuildings > 0);
  assert.equal(ready.near50RecessedWindows, ready.near50Inventory.reduce((sum, item) => sum + item.recessedWindows, 0),
    "every updated window must belong to a building in the 50m inventory");
  assert.equal(ready.near50RecessedBuildings, ready.near50Inventory.filter((item) => item.recessedWindows > 0).length);
  assert.ok(ready.near50Inventory.filter((item) => item.modelRole !== "generic").every((item) => item.recessedWindows === 0),
    "the approved shop and neighbor facade modules must remain unchanged");
  assert.ok(ready.near50GapProjectionsRejected > 0, "the narrow-gap source footprints must suppress generic projections");
  assert.equal(ready.near50GapProjectionsRejected,
    ready.near50Inventory.reduce((sum, item) => sum + item.projectionOmissions, 0));
  assert.ok(ready.near50Inventory.every((item) => item.modeled && item.heightEstimated && !item.facadeCalibrated),
    "missing geometry or estimated facades must never be presented as verified");
  assert.equal(ready.near50Inventory.filter((item) => item.observedFloors != null).length, 2);
  assert.ok(ready.near50Inventory.every((item) => item.source && item.nearestBuildingId),
    "every near-field model must expose its footprint source and nearest footprint for review");
  assert.equal(ready.near50HistoricalStreetSigns, 1,
    "the 2019 Zhenfu St. road-name plate should be present only at its estimated 50m corner");
  assert.ok(ready.near50RepeatedNameTexturesAvoided >= 1, "near-field business names still repeat across whole footprints");
  assert.ok(ready.near50RoofEquipmentOmitted >= 1, "unverified near-field rooftop equipment is still fabricated");
  assert.equal(ready.near50HistoricalCornerSigns, 1,
    "the 2019 round sign reference belongs to one 50m corner lot only");
  assert.ok(!ready.signNames.some((n) => /養心|雅善圓/.test(n)), "building dress owns 養心/雅善圓 signs");
  assert.ok(ready.signNames.some((n) => /美廉社/.test(n)), "missing 美廉社");
  assert.ok(ready.signNames.some((n) => /7-ELEVEN|7-Eleven/.test(n)), "missing 7-ELEVEN");
  assert.ok(ready.crossings >= 3 && ready.crossings <= 8, `zebra count ${ready.crossings}`);
  assert.ok(ready.stripes >= 18, `too few zebra stripes ${ready.stripes}`);
  assert.equal(ready.dashes, 0, "lane dashes should not be painted");
  assert.equal(ready.shopZebra, false, "no zebra in front of 46號");
  assert.ok(ready.branded >= 3, `chain storefronts ${ready.branded}`);
  assert.ok(ready.fascia >= 20, `too few fascia boards ${ready.fascia}`);

  await page.screenshot({ path: path.join(OUT, "e2e_orbit.png"), type: "png" });
  await page.click("#near50Btn");
  const near50Ui = await page.evaluate(() => ({
    open: !document.getElementById("near50Panel").hidden,
    entries: document.querySelectorAll(".near50-item").length,
    disabled: document.querySelectorAll(".near50-item:disabled").length,
    summary: document.getElementById("near50Summary").textContent,
    allFocusable: window.__yangxin.near50Inventory.every((item) => window.__yangxin.focusNear50Building(item.id)),
    selected: document.querySelectorAll(".near50-item.is-current").length,
    visualCautions: [...document.querySelectorAll(".near50-item")].filter((item) =>
      /對位仍為推估|棟別對位待核/.test(item.textContent)).length,
  }));
  assert.equal(near50Ui.open, true);
  assert.equal(near50Ui.entries, 31);
  assert.equal(near50Ui.disabled, 0);
  assert.equal(near50Ui.allFocusable, true);
  assert.equal(near50Ui.selected, 1);
  assert.equal(near50Ui.visualCautions, 3, "the three historically ambiguous lots need visible cautions");
  assert.match(near50Ui.summary, /18 筆仍用通用推估外觀/);
  assert.match(near50Ui.summary, /31 筆輪廓.*0 筆現況立面校準/);
  await page.screenshot({ path: path.join(OUT, "e2e_near50_inspector.png"), type: "png" });
  await page.click("#near50Close");
  await page.click("#orbitBtn");

  // Reproduce a real visitor's first action: clicking this button leaves it focused.
  await page.click("#walkBtn");
  const buttonStart = await page.evaluate(() => {
    const s = window.__yangxin.getState();
    return { x: s.x, z: s.z, mode: s.mode, focus: document.activeElement?.id };
  });
  assert.equal(buttonStart.mode, "walk");
  assert.equal(buttonStart.focus, "walkBtn", "click must retain button focus for this regression");
  await page.keyboard.down("w");
  await page.evaluate(() => { for (let i = 0; i < 30; i++) window.__yangxin.update(1 / 60); });
  await page.keyboard.up("w");
  const buttonMove = await page.evaluate(() => {
    const s = window.__yangxin.getState();
    return { x: s.x, z: s.z, inside: window.__yangxin.insideBuilding(s.x, s.z) };
  });
  assert.ok(Math.hypot(buttonMove.x - buttonStart.x, buttonMove.z - buttonStart.z) > 0.3,
    `W did not move after clicking the focused walk button: ${JSON.stringify({ buttonStart, buttonMove })}`);
  assert.equal(buttonMove.inside, false, "keyboard walk must not enter a building");
  await page.screenshot({ path: path.join(OUT, "e2e_button_wasd.png"), type: "png" });

  for (const tag of ["input", "textarea"]) {
    const editableStart = await page.evaluate((tag) => {
      window.__yangxin.setState({ vx: 0, vz: 0 });
      const field = document.createElement(tag);
      field.id = "e2e-editable";
      document.body.append(field);
      field.focus();
      const s = window.__yangxin.getState();
      return { x: s.x, z: s.z, focus: document.activeElement?.tagName };
    }, tag);
    assert.equal(editableStart.focus, tag.toUpperCase());
    await page.keyboard.down("w");
    await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__yangxin.update(1 / 60); });
    await page.keyboard.up("w");
    const editableEnd = await page.evaluate(() => {
      const s = window.__yangxin.getState();
      document.getElementById("e2e-editable")?.remove();
      return { x: s.x, z: s.z };
    });
    assert.ok(Math.hypot(editableEnd.x - editableStart.x, editableEnd.z - editableStart.z) < 0.05,
      `W must not move while typing in ${tag}: ${JSON.stringify({ editableStart, editableEnd })}`);
  }
  await page.click("#orbitBtn");

  const walk = await page.evaluate(() => {
    const y = window.__yangxin;
    y.enterWalk({ skipLock: true });
    for (let i = 0; i < 8; i++) y.update(1 / 60);
    const s = y.getState();
    const shop = y.shopCollider;
    return {
      x: s.x,
      z: s.z,
      y: s.y,
      inside: y.insideBuilding(s.x, s.z),
      shopId: y.shopId,
      shopMinX: shop?.minX,
      shopMaxX: shop?.maxX,
      shopMinZ: shop?.minZ,
      shopMaxZ: shop?.maxZ,
      count: y.buildingCount,
    };
  });
  assert.equal(walk.inside, false, `spawn inside building at ${walk.x},${walk.z}`);
  assert.ok(Math.hypot(walk.x, walk.z) > 4, `spawn too close ${walk.x},${walk.z}`);

  await page.screenshot({ path: path.join(OUT, "e2e_walk_spawn.png"), type: "png" });

  await page.evaluate(() => {
    const y = window.__yangxin;
    const s = y.getState();
    const shop = y.shopCollider;
    const cx = (shop.minX + shop.maxX) / 2;
    const cz = (shop.minZ + shop.maxZ) / 2;
    y.setState({ lookX: cx, lookZ: cz, lookY: 2.7 });
    for (let i = 0; i < 3; i++) y.update(1 / 60);
    return { x: s.x, z: s.z };
  });
  await page.screenshot({ path: path.join(OUT, "e2e_shop_front.png"), type: "png" });
  await page.screenshot({ path: path.join(OUT, "e2e_1f_yashanyuan.png"), type: "png" });

  await page.evaluate(() => {
    const y = window.__yangxin;
    const shop = y.shopCollider;
    const cx = (shop.minX + shop.maxX) / 2;
    const cz = (shop.minZ + shop.maxZ) / 2;
    y.setState({ lookX: cx, lookZ: cz, lookY: 4.25 });
  });
  await page.screenshot({ path: path.join(OUT, "e2e_2f_yangxin.png"), type: "png" });

  await page.evaluate(() => {
    const y = window.__yangxin;
    const s = y.getState();
    y.setState({ lookX: s.x + 0.35, lookZ: s.z + 2.1, lookY: 0.04 });
  });
  await page.screenshot({ path: path.join(OUT, "e2e_floor_46.png"), type: "png" });

  const zebraShot = await page.evaluate(() => {
    const y = window.__yangxin;
    const pts = [...(y.roadStats?.zebraPoints || [])].sort((a, b) => a.x * a.x + a.z * a.z - (b.x * b.x + b.z * b.z));
    const z = pts[0];
    if (!z) return null;
    const tries = [
      [0, 4.2],
      [0, -4.2],
      [4.2, 0],
      [-4.2, 0],
      [3, 3],
      [-3, 3],
      [2.4, -2.4],
      [-2.2, 3.6],
    ];
    for (const [ox, oz] of tries) {
      const x = z.x + ox;
      const zz = z.z + oz;
      if (y.insideBuilding(x, zz)) continue;
      y.setState({ x, z: zz, y: 0, lookX: z.x, lookZ: z.z, lookY: 0.06 });
      return { x, z: zz, tx: z.x, tz: z.z, dist: Math.hypot(z.x, z.z) };
    }
    return { missed: true, tx: z.x, tz: z.z };
  });
  await page.screenshot({ path: path.join(OUT, "e2e_zebra.png"), type: "png" });

  async function shotBrand(page, pattern, file, lookY = 2.9) {
    const placed = await page.evaluate((pattern, lookY) => {
      const y = window.__yangxin;
      const view = (y.brandViews || []).find((s) => new RegExp(pattern).test(s.name) || new RegExp(pattern).test(s.brand || ""));
      const shop = view || (y.shopList || []).find((s) => new RegExp(pattern).test(s.name));
      if (!shop) return null;
      if (view && !y.insideBuilding(view.x, view.z)) {
        y.setState({ x: view.x, z: view.z, y: 0, lookX: view.lookX, lookZ: view.lookZ, lookY });
        return { name: view.name, x: view.x, z: view.z, tx: view.lookX, tz: view.lookZ, via: "brandView" };
      }
      const tries = [
        [8, 0],
        [-8, 0],
        [0, 8],
        [0, -8],
        [12, 0],
        [-12, 0],
        [0, 12],
        [0, -12],
        [10, 4],
        [-10, 4],
      ];
      for (const [ox, oz] of tries) {
        const px = shop.x + ox;
        const pz = shop.z + oz;
        if (y.insideBuilding(px, pz)) continue;
        y.setState({ x: px, z: pz, y: 0, lookX: shop.x, lookZ: shop.z, lookY });
        return { name: shop.name, x: px, z: pz, tx: shop.x, tz: shop.z, via: "offset" };
      }
      return { name: shop.name, missed: true };
    }, pattern, lookY);
    if (placed && !placed.missed) {
      await page.screenshot({ path: path.join(OUT, file), type: "png" });
    }
    return placed;
  }

  const sevenShot = await shotBrand(page, "7-ELEVEN", "e2e_seven.png", 3.1);
  const martShot = await shotBrand(page, "美廉社", "e2e_simplemart.png", 2.9);
  const pxShot = await shotBrand(page, "全聯", "e2e_pxmart.png", 3.0);

  await page.evaluate((spawn) => {
    const y = window.__yangxin;
    const shop = y.shopCollider;
    const cx = (shop.minX + shop.maxX) / 2;
    const cz = (shop.minZ + shop.maxZ) / 2;
    y.setState({ x: spawn.x, z: spawn.z, y: 0, lookX: cx, lookZ: cz, lookY: 3.1 });
  }, { x: walk.x, z: walk.z });

  const facade = await page.evaluate(() => {
    const y = window.__yangxin;
    const shop = y.shopCollider;
    const cx = (shop.minX + shop.maxX) / 2;
    const cz = (shop.minZ + shop.maxZ) / 2;
    y.setState({ lookX: cx, lookZ: cz, lookY: 3.1 });
    const s0 = y.getState();
    const clearance = (x, z) => {
      let nearest = Infinity;
      const points = shop.points;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[j];
        const b = points[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
      }
      return nearest;
    };
    let steps = 0;
    for (let i = 0; i < 180; i++) {
      y.setKeys({ w: true, a: false, s: false, d: false, shift: false, jump: false });
      y.update(1 / 60);
      steps++;
      const s = y.getState();
      if (clearance(s.x, s.z) <= 2.6) break;
    }
    y.setKeys({ w: false });
    y.setState({ vx: 0, vz: 0 });
    const s = y.getState();
    return {
      startX: s0.x,
      startZ: s0.z,
      x: s.x,
      z: s.z,
      blocked: s.blocked,
      inside: y.insideBuilding(s.x, s.z),
      clearance: clearance(s.x, s.z),
      steps,
    };
  });
  assert.equal(facade.inside, false, "facade view must stay outside 46號");
  assert.ok(facade.clearance >= 2 && facade.clearance <= 3,
    `facade screenshot must be taken 2–3m from the wall: ${JSON.stringify(facade)}`);

  await page.evaluate(() => {
    const y = window.__yangxin;
    const shop = y.shopCollider;
    const cx = (shop.minX + shop.maxX) / 2;
    const cz = (shop.minZ + shop.maxZ) / 2;
    y.setState({ lookX: cx, lookZ: cz, lookY: 3.35 });
  });
  const shopShot = path.join(OUT, "e2e_walk_shop.png");
  await page.screenshot({ path: shopShot, type: "png" });
  const grayWallRatio = await neutralWallRatio(shopShot);
  assert.ok(grayWallRatio < 0.65, `facade screenshot is still dominated by a gray wall: ${grayWallRatio}`);

  const toward = await page.evaluate(() => {
    const y = window.__yangxin;
    for (let i = 0; i < 180; i++) {
      y.setKeys({ w: true, a: false, s: false, d: false, shift: false, jump: false });
      y.update(1 / 60);
    }
    y.setKeys({ w: false });
    const s = y.getState();
    return { x: s.x, z: s.z, blocked: s.blocked, inside: y.insideBuilding(s.x, s.z) };
  });
  assert.equal(toward.inside, false, "must not walk into 46號");
  assert.equal(toward.blocked, true, `must stop at 46號 collision edge: ${JSON.stringify(toward)}`);
  assert.ok(Math.hypot(toward.x - facade.x, toward.z - facade.z) > 1.3,
    `did not advance from facade view to collision edge: ${JSON.stringify({ facade, toward })}`);
  await page.screenshot({ path: path.join(OUT, "e2e_walk_collision.png"), type: "png" });

  const jump = await page.evaluate(() => {
    const y = window.__yangxin;
    y.setKeys({ jump: true });
    y.update(1 / 60);
    y.setKeys({ jump: false });
    let maxY = 0;
    for (let i = 0; i < 90; i++) {
      y.update(1 / 60);
      const s = y.getState();
      if (s.y > maxY) maxY = s.y;
    }
    const s = y.getState();
    return { maxY, y: s.y, onGround: s.onGround, inside: y.insideBuilding(s.x, s.z) };
  });
  assert.ok(jump.maxY > 0.6 && jump.maxY < 2.2, `jump ${jump.maxY}`);
  assert.equal(jump.onGround, true);
  assert.equal(jump.inside, false);

  await page.screenshot({ path: path.join(OUT, "e2e_walk_after_jump.png"), type: "png" });

  await page.goto(new globalThis.URL("?view=top", URL).href, { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitFor(page, () => (document.getElementById("status")?.textContent || "").includes("已對準"));
  await page.screenshot({ path: path.join(OUT, "e2e_top.png"), type: "png" });

  await page.goto(new globalThis.URL("?view=near50&building=nlsc%2F392", URL).href,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await waitFor(page, () => document.querySelector('.near50-item.is-current')?.dataset.id === "nlsc/392");
  assert.match(await page.$eval("#status", (el) => el.textContent), /高度為推估/,
    "direct 50m review links must keep the estimated-height warning");
  await page.screenshot({ path: path.join(OUT, "e2e_near50_deep_link.png"), type: "png" });

  console.log("e2e ok", { ready, buttonStart, buttonMove, walk, facade, grayWallRatio, toward, jump, sevenShot, martShot, pxShot, zebraShot, out: OUT });
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
