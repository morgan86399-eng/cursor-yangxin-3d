#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const url = process.env.E2E_URL || "http://127.0.0.1:4178/xintian/zhenfu-garden/";
const out = process.env.E2E_OUT || "/tmp/no46-focus-e2e";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  for (const size of [
    { width: 1400, height: 900, name: "desktop" },
    { width: 375, height: 812, name: "mobile-375" },
    { width: 390, height: 844, name: "mobile-390" },
    { width: 412, height: 915, name: "mobile-412" },
    { width: 768, height: 1024, name: "tablet-768" },
  ]) {
    const page = await browser.newPage();
    const mobile = size.width < 700;
    await page.setViewport({ width: size.width, height: size.height, isMobile: mobile, hasTouch: mobile });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForFunction(() => window.__yangxin?.brandViews?.length && window.__yangxin?.farm?.beds?.length === 20, { timeout: 60000 });
    await page.click("#walkBtn");
    await page.click("#focusBtn");
    const state = await page.evaluate(() => ({
      mode: window.__yangxin.getState().mode,
      locked: window.__yangxin.getState().locked,
      status: document.querySelector("#status").textContent,
      overflow: document.documentElement.scrollWidth - innerWidth,
      beds: window.__yangxin.farm.beds.length,
      floatingAddressMarkers: window.__yangxin.renderQuality.floatingAddressMarkers,
      touchTargets: [...document.querySelectorAll("#focusBtn, #walkBtn, [data-move]")]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => ({ id: el.id || el.dataset.move, width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height })),
    }));
    assert.equal(state.mode, "orbit");
    assert.equal(state.locked, false);
    assert.match(state.status, /鎮撫街46號/);
    assert.equal(state.overflow, 0);
    assert.equal(state.beds, 20);
    assert.equal(state.floatingAddressMarkers, 0, "地址由介面標示，不可在屋頂懸浮大型牌面");
    assert.ok(state.touchTargets.every(({ width, height }) => width >= 44 && height >= 44),
      `操作按鈕不足 44px: ${JSON.stringify(state.touchTargets)}`);
    await page.screenshot({ path: `${out}/${size.name}.png` });
    await page.click("#walkBtn");
    assert.equal(await page.evaluate(() => window.__yangxin.getState().mode), "walk", "可由46號視角返回第一人稱");
    assert.equal(await page.evaluate(() => window.__yangxin.getState().locked), false, "返回第一人稱不應鎖滑鼠");
    console.log(`focus 46 ok: ${size.name}`, state);
    await page.close();
  }
} finally {
  await browser.close();
}
