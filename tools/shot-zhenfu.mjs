import puppeteer from "puppeteer-core";

const URL = process.env.E2E_URL || "http://127.0.0.1:5174/?view=zhenfu";
const OUT = process.env.E2E_OUT || "/opt/cursor/artifacts";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || "/usr/local/bin/google-chrome",
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
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE", msg.text());
});
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(
  () => {
    const y = window.__yangxin;
    const status = document.getElementById("status")?.textContent || "";
    return Boolean(y && y.zhenfu && status.includes("已對準"));
  },
  { timeout: 60000 }
);
const info = await page.evaluate(() => ({
  zhenfu: window.__yangxin.zhenfu,
  shopId: window.__yangxin.shopId,
  signHasYangxin: (window.__yangxin.signNames || []).includes("養心推拿"),
  signHasYashan: (window.__yangxin.signNames || []).includes("雅善圓蔬食館"),
  hallBlocked: window.__yangxin.insideBuilding(window.__yangxin.zhenfu.lookX, window.__yangxin.zhenfu.lookZ),
}));
console.log("check", JSON.stringify(info));
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${OUT}/zhenfu-front.png` });
await page.evaluate(() => window.__yangxin.frameZhenfu("three"));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: `${OUT}/zhenfu-three-quarter.png` });
await browser.close();
console.log("wrote screenshots");
