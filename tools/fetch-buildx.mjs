#!/usr/bin/env node
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { vectorizeBuildxRgba } from "./vectorize-buildx.mjs";
import { mergeNlscAndOsm } from "../src/lots.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");
const UA = "yangxin-3d-map/0.1 (educational map; NLSC BUILDX)";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBuffer(url, retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/png,image/*" } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await sleep(350 * (i + 1));
    }
  }
  throw lastErr;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const config = JSON.parse(await readFile(path.join(DATA, "map-config.json"), "utf8"));
  const osm = JSON.parse(await readFile(path.join(DATA, "osm-200m.json"), "utf8"));
  const g = config.ground;
  const x0 = g.tileX0;
  const y0 = g.tileY0;
  const x1 = g.tileX1;
  const y1 = g.tileY1;
  const z = g.zoom || 20;
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const cacheDir = path.join(ROOT, ".cache");
  const mosaicPath = path.join(cacheDir, "buildx-mosaic.png");
  const refresh = process.argv.includes("--refresh");

  let mosaic;
  if (!refresh && (await fileExists(mosaicPath))) {
    mosaic = await sharp(mosaicPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log("cached mosaic", mosaic.info.width, mosaic.info.height, mosaicPath);
  } else {
    const jobs = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) jobs.push({ x, y });
    }
    console.log(`BUILDX ${cols}x${rows} @ z${z}`);
    const tiles = await mapPool(jobs, 8, async (job) => {
      const url = `https://wmts.nlsc.gov.tw/wmts/BUILDX/default/GoogleMapsCompatible/${z}/${job.y}/${job.x}`;
      try {
        return { ...job, buf: await fetchBuffer(url) };
      } catch (err) {
        console.warn("tile fail", job.x, job.y, err.message);
        return { ...job, buf: null };
      }
    });
    const ok = tiles.filter((t) => t.buf).length;
    console.log(`got ${ok}/${tiles.length} tiles`);
    if (ok < tiles.length * 0.6) throw new Error("BUILDX 圖磚不足");

    const empty = await sharp({
      create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    let canvas = sharp({
      create: {
        width: cols * 256,
        height: rows * 256,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    });
    const BATCH = 30;
    for (let i = 0; i < tiles.length; i += BATCH) {
      const composites = tiles.slice(i, i + BATCH).map((tile) => ({
        input: tile.buf || empty,
        left: (tile.x - x0) * 256,
        top: (tile.y - y0) * 256,
      }));
      const buf = await canvas.composite(composites).png().toBuffer();
      canvas = sharp(buf);
    }
    await mkdir(cacheDir, { recursive: true });
    const png = await canvas.png().toBuffer();
    await writeFile(mosaicPath, png);
    mosaic = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    console.log("mosaic", mosaic.info.width, mosaic.info.height);
  }

  const vec = vectorizeBuildxRgba(mosaic.data, mosaic.info.width, mosaic.info.height, {
    tileX0: x0,
    tileY0: y0,
    zoom: z,
  });
  console.log("vectorize", vec.stats);

  const mLat = 111320;
  const mLon = 111320 * Math.cos((config.lat * Math.PI) / 180);
  const r2 = (config.radiusMeters + 28) ** 2;
  const lots = vec.lots.filter((lot) => {
    const n = lot.ring.length - 1;
    let lon = 0;
    let lat = 0;
    for (let i = 0; i < n; i++) {
      lon += lot.ring[i][0];
      lat += lot.ring[i][1];
    }
    lon /= n;
    lat /= n;
    const x = (lon - config.lon) * mLon;
    const zc = (config.lat - lat) * mLat;
    return x * x + zc * zc <= r2;
  });
  console.log(`lots in radius ${lots.length}/${vec.lots.length}`);

  const merged = mergeNlscAndOsm(lots, osm.buildings || [], { lat: config.lat, lon: config.lon });
  const payload = {
    origin: { lat: config.lat, lon: config.lon },
    fetchedAt: new Date().toISOString(),
    source: "nlsc-buildx",
    attribution: "建物框：內政部國土測繪中心 BUILDX",
    count: merged.buildings.length,
    shopId: merged.shopId,
    shopDistance: merged.shopDistance,
    buildings: merged.buildings,
  };
  await writeFile(path.join(DATA, "buildings-nlsc.json"), JSON.stringify(payload));
  console.log("wrote buildings-nlsc.json", {
    count: payload.count,
    shopId: payload.shopId,
    shopDistance: payload.shopDistance,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
