#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

const url = process.env.E2E_URL || "http://127.0.0.1:5174/";
const out = process.env.E2E_OUT || "/tmp/e2e-ground";
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const results = [];
try {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage();
    const errors = [];
    const authResponses = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/api/xintian/me" && response.status() === 401) {
        authResponses.push(401); // expected for an anonymous visitor
        return;
      }
      if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith("/favicon.ico")) {
        errors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });
    await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.__yangxin && document.querySelector("#status")?.textContent.includes("已對準"), { timeout: 60000 });
    const width = viewport.width;
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      warning: document.querySelector(".model-note")?.textContent || "",
      sourceLink: !!document.querySelector('a[href="./data/ground-surface-evidence.json"]'),
      crossings: window.__yangxin.roadStats?.crossings,
      dashes: window.__yangxin.roadStats?.dashes,
      centerlineStrips: window.__yangxin.roadStats?.centerlineStrips,
      shopZebra: window.__yangxin.roadStats?.shopZebra,
    }));
    assert.ok(layout.overflow <= 1, `${width}px horizontal overflow ${layout.overflow}`);
    assert.match(layout.warning, /路面與地坪色彩含推估/);
    assert.equal(layout.sourceLink, true);
    assert.equal(layout.dashes, 0);
    assert.equal(layout.centerlineStrips, 4, "only two short 春日路 double-yellow patches are expected");
    assert.equal(layout.shopZebra, false);
    assert.ok(layout.crossings >= 4 && layout.crossings <= 8);

    // Camera samples are for render regression only: they do not measure physical pavement colour.
    await page.evaluate(() => {
      const y = window.__yangxin;
      y.enterWalk({ skipLock: true });
      y.setState({ x: -4.7255562932904684, z: -12.319503866608809, lookX: -3.9, lookZ: -10.25, lookY: 0.04 });
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const floorFile = path.join(out, `ground-46-${width}.png`);
    await page.screenshot({ path: floorFile });
    let colors;
    if (width > 600) {
      const { data, info } = await sharp(floorFile).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const at = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
      colors = { asphaltOnScreen: at(700, 550), pavementOnScreen: at(1100, 750) };
      assert.ok(Math.max(...colors.asphaltOnScreen) - Math.min(...colors.asphaltOnScreen) < 25, "asphalt rendered with a strong colour cast");
      assert.ok(colors.pavementOnScreen[0] < colors.asphaltOnScreen[0] + 115, "pavement is blown out");
    }

    // The Mapillary-referenced double yellow applies to 春日路 only, not the #46 frontage.
    await page.evaluate(() => window.__yangxin.setState({ x: 34.0, z: -38.0, lookX: 30.5, lookZ: -57.0, lookY: 0.35 }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    const springFile = path.join(out, `spring-road-${width}.png`);
    await page.screenshot({ path: springFile });
    assert.deepEqual(errors, [], `${width}px browser errors`);
    if (new URL(url).hostname === "story.taoyuanyangxintuina.shop") {
      assert.ok(authResponses.includes(401), "anonymous profile response should remain 401");
    }
    results.push({ viewport, layout, colors, floorFile, springFile, browserErrors: errors, authResponses });
    await page.close();
  }
  await writeFile(path.join(out, "ground-qc.json"), JSON.stringify(results, null, 2) + "\n");
  console.log("e2e ground ok", JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
