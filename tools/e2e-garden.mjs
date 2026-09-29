#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const url = process.env.E2E_URL || "http://127.0.0.1:4178/xintian/zhenfu-garden/";
const out = process.env.E2E_OUT || "/tmp/xintian-zhenfu-e2e";
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });

for (const size of [
  { width: 1400, height: 900, name: "desktop" },
  { width: 375, height: 812, name: "mobile-375" },
  { width: 390, height: 844, name: "mobile-390" },
  { width: 412, height: 915, name: "mobile-412" },
  { width: 768, height: 1024, name: "tablet-768" },
]) {
  const page = await browser.newPage();
  await page.setViewport(size);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/xintian/content") return request.respond({ contentType: "application/json", body: JSON.stringify({ ok: true, crops: { pingjing: { name: "平靜草", unlock: 0 } }, water: { max_count: 2, cooldown_seconds: 60 }, max_plots: 20 }) });
    if (path === "/api/xintian/me") return request.respond({ contentType: "application/json", body: JSON.stringify({ ok: true, server_now: 100, water_cooldown: 60, user: { slots: 20, total_harvests: 0 }, plots: Array.from({ length: 20 }, (_, slot) => slot === 1 ? { slot, state: "growing", crop_id: "pingjing", planted_at: 0, ready_at: 90, water_count: 0 } : { slot, state: "empty" }) }) });
    request.continue();
  });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => window.__yangxin?.farm?.beds?.length === 20 && document.querySelector("#status")?.textContent.includes("已對準"), { timeout: 60000 });
  const result = await page.evaluate(() => {
    const app = window.__yangxin;
    const bed = app.farm.beds[0].position;
    app.enterWalk({ skipLock: true });
    app.setState({ x: bed.x, z: bed.z + .8, lookX: bed.x, lookZ: bed.z, lookY: .8 });
    app.farm.update();
    return {
      mode: app.getState().mode,
      beds: app.farm.beds.length,
      courtDepth: app.zhenfu.courtDepth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      panel: !document.querySelector("#farmPanel").hidden,
      sync: document.querySelector("#farmSync").textContent,
      mobileControls: getComputedStyle(document.querySelector(".mobile-controls")).display,
      detailStats: app.farm.detailStats,
      clodCount: app.farm.clodMesh.count,
      renderQuality: app.renderQuality,
      contactShadow: (() => {
        const shadow = app.farm.cropShadows.find(Boolean);
        const canvas = shadow?.material?.map?.image;
        if (!(canvas instanceof HTMLCanvasElement)) return null;
        const ctx = canvas.getContext("2d");
        return {
          edgeAlpha: ctx.getImageData(0, 0, 1, 1).data[3],
          centerAlpha: ctx.getImageData(64, 64, 1, 1).data[3],
        };
      })(),
    };
  });
  assert.equal(result.mode, "walk");
  assert.equal(result.beds, 20);
  assert.ok(result.courtDepth >= 8);
  assert.ok(result.overflow <= 1, `horizontal overflow ${result.overflow}`);
  assert.equal(result.panel, true);
  assert.deepEqual(result.detailStats, { beds: 20, furrows: 60, stones: 100, clods: 720, roundedBeds: true, texturedSoil: true, raisedSoil: true, featheredContactShadows: true });
  assert.equal(result.clodCount, 720, "every bed should have 36 instanced soil clods");
  assert.deepEqual(result.renderQuality, { fullSceneShadows: false, farmContactShadows: true, floatingAddressMarkers: 0, toneMapping: "ACESFilmic", fogNear: 105, fogFar: 265 });
  assert.ok(result.contactShadow && result.contactShadow.centerAlpha > 100, "contact shadow center must be visible");
  assert.equal(result.contactShadow.edgeAlpha, 0, "contact shadow edge must fade to transparent");
  assert.match(result.sync, /已與心田同步/);
  if (size.width <= 700) assert.notEqual(result.mobileControls, "none");
  await page.click("#farmAction");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await page.$eval("#cropPicker", (el) => el.hidden), false, "crop picker must stay open across animation frames");
  await page.$eval("#cropPicker", (el) => { el.hidden = true; });
  const alignment = await page.evaluate(() => {
    const farm = window.__yangxin.farm;
    farm.api.state.me.plots = Array.from({ length: 20 }, (_, slot) => ({
      slot, state: "growing", crop_id: "pingjing", planted_at: 0, ready_at: 90, water_count: 0,
    }));
    farm.redraw();
    return farm.beds.map((bed, slot) => {
      const crop = farm.sprites[slot];
      return {
        dx: Math.abs(crop.position.x - bed.position.x),
        dy: Math.abs(crop.position.y - bed.topY),
        dz: Math.abs(crop.position.z - bed.position.z),
        anchorX: crop.center.x,
        anchorY: crop.center.y,
      };
    });
  });
  assert.equal(alignment.length, 20);
  alignment.forEach((crop, slot) => {
    assert.ok(crop.dx < 1e-6 && crop.dy < 1e-6 && crop.dz < 1e-6, `crop ${slot + 1} is not centered on its bed`);
    assert.equal(crop.anchorX, .5, `crop ${slot + 1} horizontal anchor`);
    assert.equal(crop.anchorY, 0, `crop ${slot + 1} root anchor`);
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await page.screenshot({ path: `${out}/${size.name}.png`, fullPage: true });
  console.log("✓", size.name, result);
  await page.close();
}
await browser.close();
