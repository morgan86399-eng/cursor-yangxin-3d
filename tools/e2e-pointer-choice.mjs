#!/usr/bin/env node
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";

const url = process.env.E2E_URL || "http://127.0.0.1:4178/xintian/zhenfu-garden/";
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForFunction(() => window.__yangxin?.farm?.beds?.length === 20, { timeout: 60000 });
  await page.click("#walkBtn");
  assert.equal(await page.evaluate(() => window.__yangxin.getState().mode), "walk");
  assert.equal(await page.evaluate(() => Boolean(document.pointerLockElement)), false, "entering walk must not lock pointer");
  assert.equal(await page.$eval("#lockBtn", (el) => el.hidden), false, "lock option is visible in walk mode");
  await page.click("#view", { offset: { x: 700, y: 450 } });
  assert.equal(await page.evaluate(() => Boolean(document.pointerLockElement)), false, "canvas click must not lock pointer");
  const lookBeforeDrag = await page.evaluate(() => window.__yangxin.getLookPose());
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(701, 451);
  await page.mouse.up();
  const lookAfterDrag = await page.evaluate(() => window.__yangxin.getLookPose());
  assert.ok(lookAfterDrag.worldUpY > 0.2, `1px unlocked drag flipped the view: ${JSON.stringify(lookAfterDrag)}`);
  assert.ok(Math.abs(lookAfterDrag.forwardY - lookBeforeDrag.forwardY) < 0.03, "1px drag changed pitch too much");
  const before = await page.evaluate(() => window.__yangxin.getState());
  await page.keyboard.down("w");
  await page.waitForFunction(({ x, z }) => {
    const next = window.__yangxin.getState();
    return Math.hypot(next.x - x, next.z - z) > 0.05;
  }, { timeout: 5000 }, { x: before.x, z: before.z });
  await page.keyboard.up("w");
  const after = await page.evaluate(() => window.__yangxin.getState());
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 0.05, "walking works without pointer lock");
  await page.click("#lockBtn");
  await page.waitForFunction(() => document.pointerLockElement?.id === "view" && document.querySelector("#lockBtn")?.getAttribute("aria-pressed") === "true", { timeout: 5000 });
  await page.mouse.move(710, 460);
  assert.ok((await page.evaluate(() => window.__yangxin.getLookPose())).worldUpY > 0.15, "locked pointer movement flipped the view");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.pointerLockElement, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.__yangxin.getState().mode), "walk", "Escape releases pointer without leaving walk mode");
  assert.equal(await page.$eval("#lockBtn", (el) => el.getAttribute("aria-pressed")), "false");
  await page.click("#orbitBtn");
  assert.equal(await page.evaluate(() => window.__yangxin.getState().mode), "orbit");
  assert.equal(await page.$eval("#lockBtn", (el) => el.hidden), true);
  await page.click("#walkBtn");
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(701, 451);
  await page.mouse.up();
  assert.ok((await page.evaluate(() => window.__yangxin.getLookPose())).worldUpY > 0.2, "orbit → walk → drag flipped the view");
  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await mobile.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await mobile.waitForFunction(() => window.__yangxin?.farm?.beds?.length === 20, { timeout: 60000 });
  await mobile.click("#walkBtn");
  const mobileBefore = await mobile.evaluate(() => window.__yangxin.getLookPose());
  const mobileAfter = await mobile.evaluate(() => {
    const canvas = document.querySelector("#view");
    for (const [name, x, y] of [["pointerdown", 250, 420], ["pointermove", 251, 421], ["pointerup", 251, 421]]) {
      canvas.dispatchEvent(new PointerEvent(name, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y }));
    }
    return window.__yangxin.getLookPose();
  });
  assert.ok(mobileAfter.worldUpY > 0.2, `1px mobile drag flipped the view: ${JSON.stringify(mobileAfter)}`);
  assert.ok(Math.abs(mobileAfter.forwardY - mobileBefore.forwardY) < 0.03, "1px mobile drag changed pitch too much");
  console.log("pointer lock choice ok: desktop/mobile drags remain upright, movement, explicit lock, Escape release, orbit", { lookBeforeDrag, lookAfterDrag, mobileBefore, mobileAfter });
} finally {
  await browser.close();
}
