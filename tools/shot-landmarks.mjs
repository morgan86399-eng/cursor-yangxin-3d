import puppeteer from "puppeteer-core";

const URL = process.env.E2E_URL || "http://127.0.0.1:5174/?view=corner";
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
    return Boolean(y && y.landmarkViews && y.landmarkViews.corner && status.includes("已對準"));
  },
  { timeout: 60000 }
);
const info = await page.evaluate(() => ({
  corner: window.__yangxin.landmarkViews.corner,
  station: window.__yangxin.landmarkViews.station,
  seven: (window.__yangxin.signNames || []).filter((name) => /7-ELEVEN/.test(name)).length,
  yashan: (window.__yangxin.signNames || []).includes("雅善圓蔬食館"),
}));
console.log("check", JSON.stringify(info));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/corner-110.png` });
await page.goto("http://127.0.0.1:5174/?view=station", { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("已對準"), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${OUT}/police-station.png` });
await browser.close();
console.log("wrote landmark shots");
