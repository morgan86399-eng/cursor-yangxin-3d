import puppeteer from "puppeteer-core";

const URL = process.env.E2E_URL || "http://127.0.0.1:5174/?view=yashan";
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
    return Boolean(y && y.brandViews && status.includes("已對準"));
  },
  { timeout: 60000 }
);
const info = await page.evaluate(() => {
  const y = window.__yangxin;
  const spot = (y.brandViews || []).find((item) => item.brand === "yashanyuan");
  return {
    shopId: y.shopId,
    spot,
    neighbors: y.neighborViews,
    signHasYangxin: (y.signNames || []).includes("養心推拿"),
    signHasYashan: (y.signNames || []).includes("雅善圓蔬食館"),
    shopCenterBlocked: y.shopCollider
      ? y.insideBuilding((y.shopCollider.minX + y.shopCollider.maxX) / 2, (y.shopCollider.minZ + y.shopCollider.maxZ) / 2)
      : null,
    streetClear: spot ? !y.insideBuilding(spot.x, spot.z) : null,
  };
});
console.log("check", JSON.stringify(info));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/yashan-neighbors.png` });
await page.evaluate(() => window.__yangxin.frameYashan("close"));
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/yashan-front.png` });
await browser.close();
console.log("wrote screenshots");
