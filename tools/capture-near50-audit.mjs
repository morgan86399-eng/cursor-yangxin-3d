import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { distanceToRing } from "../src/geo.js";

const url = process.env.E2E_URL;
const out = process.env.E2E_OUT;
assert.ok(url && out && path.isAbsolute(out), "provide E2E_URL and an absolute E2E_OUT");
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  const shaderErrors = [];
  const materialRequestErrors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && /WebGLProgram|shader error|VALIDATE_STATUS/i.test(message.text())) shaderErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/facade-materials/") && !response.ok()) materialRequestErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1000, height: 700 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__yangxin?.near50Inventory?.length === 31, { timeout: 60000 });
  await page.waitForFunction(() => {
    const audit = window.__yangxin.getNear50SurfaceAudit?.();
    return audit?.surfaces.length > 0 && audit.surfaces.every((item) => item.colorLoaded && item.normalLoaded);
  }, { timeout: 60000 });
  const runtime = await page.evaluate(() => ({
    inventory: window.__yangxin.near50Inventory,
    stats: window.__yangxin.facadeStats,
    pending: window.__yangxin.signPendingCalibration,
    rendererQuality: window.__yangxin.renderQuality,
    surfaces: window.__yangxin.getNear50SurfaceAudit(),
    colliderRings: window.__yangxin.colliders.map((item) => ({ id: item.id, pts: item.points })),
  }));
  assert.equal(runtime.inventory.length, 31);
  assert.equal(runtime.inventory.filter((item) => item.modelRole === "generic").length, 19);
  assert.ok(runtime.inventory.every((item) => item.modeled && item.heightEstimated && !item.facadeCalibrated));
  const normalIds = [...new Set(runtime.surfaces.surfaces.map((item) => item.id))].sort();
  assert.deepEqual(normalIds, runtime.inventory.filter((item) => item.modelRole === "generic").map((item) => item.id).sort());
  assert.equal(normalIds.length, 19);
  for (const surface of runtime.surfaces.surfaces) {
    assert.equal(surface.type, "MeshStandardMaterial");
    assert.equal(surface.colorSpace, "srgb");
    assert.equal(surface.normalColorSpace, "");
    assert.equal(surface.normalAsset, surface.colorAsset.replace("_Color.jpg", "_NormalGL.jpg"));
    assert.deepEqual(surface.normalRepeat, surface.colorRepeat);
    assert.ok(surface.normalLoaded && surface.colorLoaded && surface.estimated);
  }
  for (const pipe of runtime.surfaces.drainpipes) {
    const owner = runtime.inventory.find((item) => item.id === pipe.id);
    assert.ok(owner?.modelRole === "generic" && owner.detailedDrainpipe && pipe.estimated);
    assert.ok(pipe.min[1] >= -1e-6 && pipe.max[1] <= owner.height + 1e-6);
    assert.ok(runtime.colliderRings.every((other) => other.id === pipe.id ||
      distanceToRing(pipe.position[0], pipe.position[2], other.pts) > 0.065), "pipe fittings must retain neighboring footprint clearance");
  }
  const hide = await page.addStyleTag({ content: "body > :not(canvas) { visibility:hidden!important }" });
  const thumbnails = [];
  for (const [index, item] of runtime.inventory.entries()) {
    assert.equal(await page.evaluate((id) => window.__yangxin.focusNear50Building(id), item.id), true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    item.file = `${String(index + 1).padStart(2, "0")}-${item.id.replaceAll("/", "_")}.jpg`;
    await page.screenshot({ path: path.join(out, item.file), type: "jpeg", quality: 85 });
    thumbnails.push({ input: await sharp(path.join(out, item.file)).resize(360, 252).toBuffer(),
      top: Math.floor(index / 4) * 280 + 28, left: index % 4 * 360 });
    const label = `<svg width="360" height="28"><rect width="360" height="28" fill="#173b38"/><text x="10" y="20" fill="#fff" font-family="sans-serif" font-size="16">${String(index + 1).padStart(2, "0")} ${item.id} | windows:${item.recessedWindows} | ${item.modelRole}</text></svg>`;
    thumbnails.push({ input: Buffer.from(label), top: Math.floor(index / 4) * 280, left: index % 4 * 360 });
  }
  await hide.evaluate((node) => node.remove());
  const viewports = [];
  for (const width of [375, 390, 412, 768, 1400]) {
    await page.setViewport({ width, height: 900 });
    await page.evaluate(() => {
      document.getElementById("near50Btn").click();
      if (document.getElementById("near50Panel").hidden) document.getElementById("near50Btn").click();
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const row = await page.evaluate(() => {
      const visible = [...document.querySelectorAll("button")].filter((node) => node.getClientRects().length);
      return {
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        smallButtons: visible.filter((node) => {
          const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44;
        }).map((node) => node.id || node.textContent.trim()),
        count: document.querySelectorAll(".near50-item").length,
        summary: document.getElementById("near50Summary").textContent,
      };
    });
    viewports.push(row);
    assert.equal(row.count, 31);
    assert.ok(row.scrollWidth <= width);
    assert.deepEqual(row.smallButtons, []);
    assert.match(row.summary, /19 筆仍用通用推估外觀/);
    await page.screenshot({ path: path.join(out, `inspector-${width}.png`) });
    await page.evaluate(() => document.getElementById("near50Close").click());
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(shaderErrors, []);
  assert.deepEqual(materialRequestErrors, []);
  const audit = { capturedAt: new Date().toISOString(), url, radiusMeters: 50, ...runtime,
    viewports, pageErrors: errors, shaderErrors, materialRequestErrors };
  await writeFile(path.join(out, "audit.json"), JSON.stringify(audit, null, 2));
  await sharp({ create: { width: 1440, height: 2240, channels: 3, background: "#eeeae0" } })
    .composite(thumbnails).jpeg({ quality: 85 }).toFile(path.join(out, "all31-contact.jpg"));
  console.log(JSON.stringify({ captured: runtime.inventory.length, windows: runtime.stats.near50RecessedWindows,
    updatedBuildings: runtime.stats.near50RecessedBuildings, omittedProjections: runtime.stats.near50GapProjectionsRejected,
    normalMappedBuildings: normalIds.length, detailedDrainpipes: runtime.surfaces.drainpipes.length,
    viewports: viewports.length, pageErrors: errors, out }, null, 2));
} finally { await browser.close(); }
