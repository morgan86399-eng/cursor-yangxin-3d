#!/usr/bin/env node
/**
 * 烘焙鎮撫街46號往外 200 公尺的 OSM 與正射影像。
 * 執行期不需要 API 金鑰。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public", "data");

const ADDRESS = "桃園市桃園區鎮撫街46號";
const LABEL = "養心推拿";
const RADIUS = 200;
const TEMPLE = { lat: 24.998272, lon: 121.314644, note: "鎮撫宮（鎮撫街43號）" };
const UA = "yangxin-3d-map/0.1 (https://github.com/morgan8639-design/shenxinling-website; OSM/NLSC educational map)";
const TILE_ZOOM = 20;
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, options = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          ...(options.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

async function fetchBuffer(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/jpeg,image/png,image/*" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await sleep(400 * (i + 1));
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

async function geocode() {
  const queries = [
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&countrycodes=tw&accept-language=zh-TW&q=" +
      encodeURIComponent(ADDRESS),
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tw&street=" +
      encodeURIComponent("鎮撫街 46") +
      "&city=" + encodeURIComponent("桃園區") +
      "&county=" + encodeURIComponent("桃園市") +
      "&country=" + encodeURIComponent("Taiwan"),
    "https://photon.komoot.io/api/?limit=3&lang=zh&q=" + encodeURIComponent(ADDRESS),
  ];

  for (const url of queries) {
    try {
      const data = await fetchJson(url);
      const hits = Array.isArray(data) ? data : data.features || [];
      for (const hit of hits) {
        const lat = Number(hit.lat ?? hit.geometry?.coordinates?.[1]);
        const lon = Number(hit.lon ?? hit.geometry?.coordinates?.[0]);
        const name = String(hit.display_name || hit.properties?.name || "");
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (lat < 24.97 || lat > 25.03 || lon < 121.28 || lon > 121.34) continue;
        if (/南昌|江西|中国/.test(name) && !/臺灣|台灣|桃園/.test(name)) continue;
        return { lat, lon, source: url.includes("photon") ? "photon" : "nominatim", raw: name };
      }
    } catch (err) {
      console.warn("geocode miss:", err.message);
    }
  }

  try {
    const q = `
      [out:json][timeout:25];
      (
        nwr(around:180,${TEMPLE.lat},${TEMPLE.lon})["addr:housenumber"="46"];
        nwr(around:180,${TEMPLE.lat},${TEMPLE.lon})["addr:full"~"鎮撫街.?46"];
      );
      out center tags;
    `;
    const osm = await overpass(q);
    const el = (osm.elements || []).find((e) => e.lat || e.center);
    if (el) {
      return {
        lat: el.lat || el.center.lat,
        lon: el.lon || el.center.lon,
        source: "overpass-housenumber-46",
        raw: el.tags?.name || el.tags?.["addr:full"] || "housenumber 46",
      };
    }
  } catch (err) {
    console.warn("overpass geocode miss:", err.message);
  }

  // 46 號與鎮撫宮 43 號隔街相對，先以宮廟為錨再向東南偏約 25 公尺（路寬＋門牌側）
  return {
    lat: TEMPLE.lat - 0.00018,
    lon: TEMPLE.lon + 0.00012,
    source: "fallback-across-from-zhenfu-temple",
    raw: TEMPLE.note,
  };
}

async function overpass(query) {
  let lastErr;
  for (const endpoint of OVERPASS_URLS) {
    try {
      return await fetchJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: "data=" + encodeURIComponent(query.trim()),
      });
    } catch (err) {
      lastErr = err;
      console.warn("overpass fail", endpoint, err.message);
      await sleep(1200);
    }
  }
  throw lastErr;
}

function nodeMap(elements) {
  const nodes = new Map();
  for (const el of elements) {
    if (el.type === "node" && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }
  return nodes;
}

function wayCoords(way, nodes) {
  const coords = [];
  for (const id of way.nodes || []) {
    const n = nodes.get(id);
    if (n) coords.push([n.lon, n.lat]);
  }
  return coords;
}

function closeRing(coords) {
  if (coords.length < 3) return coords;
  const a = coords[0];
  const b = coords[coords.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) coords.push([a[0], a[1]]);
  return coords;
}

function buildingHeight(tags = {}) {
  if (tags.height) {
    const n = parseFloat(String(tags.height).replace(/m/i, ""));
    if (Number.isFinite(n) && n > 1) return n;
  }
  if (tags["building:height"]) {
    const n = parseFloat(String(tags["building:height"]).replace(/m/i, ""));
    if (Number.isFinite(n) && n > 1) return n;
  }
  const levels = parseFloat(tags["building:levels"] || tags.levels);
  if (Number.isFinite(levels) && levels > 0) return Math.max(3, levels * 3);
  return 6;
}

async function fetchOsm(origin) {
  const q = `
    [out:json][timeout:90];
    (
      way["building"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      relation["building"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      way["highway"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      way["leisure"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      way["landuse"~"grass|meadow|forest|recreation_ground"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      way["natural"="water"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      way["waterway"](around:${RADIUS + 40},${origin.lat},${origin.lon});
      nwr["amenity"](around:${RADIUS + 30},${origin.lat},${origin.lon});
    );
    out body;
    >;
    out skel qt;
  `;
  const osm = await overpass(q);
  const elements = osm.elements || [];
  const nodes = nodeMap(elements);
  const ways = new Map(elements.filter((e) => e.type === "way").map((w) => [w.id, w]));

  const buildings = [];
  for (const el of elements) {
    if (el.type === "way" && el.tags?.building && el.tags.building !== "no") {
      const coords = closeRing(wayCoords(el, nodes));
      if (coords.length < 4) continue;
      buildings.push({
        id: `way/${el.id}`,
        name: el.tags.name || el.tags["name:zh"] || "",
        building: el.tags.building,
        height: buildingHeight(el.tags),
        levels: Number(el.tags["building:levels"] || 0) || null,
        tags: { amenity: el.tags.amenity || "", shop: el.tags.shop || "" },
        ring: coords,
      });
    }
    if (el.type === "relation" && el.tags?.building && el.tags.building !== "no") {
      const outer = (el.members || []).find((m) => m.role === "outer" && m.type === "way");
      const way = outer && ways.get(outer.ref);
      if (!way) continue;
      const coords = closeRing(wayCoords(way, nodes));
      if (coords.length < 4) continue;
      buildings.push({
        id: `relation/${el.id}`,
        name: el.tags.name || "",
        building: el.tags.building,
        height: buildingHeight(el.tags),
        levels: Number(el.tags["building:levels"] || 0) || null,
        tags: {},
        ring: coords,
      });
    }
  }

  const roads = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.tags?.highway) continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 2) continue;
    roads.push({
      id: `way/${el.id}`,
      name: el.tags.name || "",
      highway: el.tags.highway,
      path: coords,
    });
  }

  const greens = [];
  for (const el of elements) {
    if (el.type !== "way") continue;
    const t = el.tags || {};
    if (!(t.leisure || /grass|meadow|forest|recreation_ground/.test(t.landuse || ""))) continue;
    const coords = closeRing(wayCoords(el, nodes));
    if (coords.length < 4) continue;
    greens.push({ id: `way/${el.id}`, name: t.name || "", kind: t.leisure || t.landuse, ring: coords });
  }

  const parking = [];
  for (const el of elements) {
    if (el.type !== "way" || el.tags?.amenity !== "parking") continue;
    const coords = closeRing(wayCoords(el, nodes));
    if (coords.length < 4) continue;
    parking.push({
      id: `way/${el.id}`,
      name: el.tags.name || "",
      operator: el.tags.operator || "",
      parking: el.tags.parking || "",
      access: el.tags.access || "",
      ring: coords,
    });
  }

  const water = [];
  for (const el of elements) {
    if (el.type !== "way") continue;
    const t = el.tags || {};
    if (!(t.natural === "water" || t.waterway)) continue;
    const coords = wayCoords(el, nodes);
    if (coords.length < 2) continue;
    water.push({ id: `way/${el.id}`, name: t.name || "", kind: t.natural || t.waterway, path: coords });
  }

  const pois = [];
  for (const el of elements) {
    const t = el.tags || {};
    if (!t.amenity && !t.name) continue;
    let lat = el.lat;
    let lon = el.lon;
    if ((!lat || !lon) && el.center) {
      lat = el.center.lat;
      lon = el.center.lon;
    }
    if ((!lat || !lon) && el.type === "way") {
      const c = wayCoords(el, nodes);
      if (!c.length) continue;
      lat = c.reduce((s, p) => s + p[1], 0) / c.length;
      lon = c.reduce((s, p) => s + p[0], 0) / c.length;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (t.highway && !t.amenity) continue;
    pois.push({
      id: `${el.type}/${el.id}`,
      name: t.name || t.amenity || "",
      amenity: t.amenity || "",
      lat,
      lon,
    });
  }

  return { buildings, roads, greens, water, pois, parking };
}

function lonLatToTile(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

function tileNW(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lat: (latRad * 180) / Math.PI, lon };
}

function offsetLatLon(lat, lon, northMeters, eastMeters) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180);
  return {
    lat: lat + northMeters / mPerDegLat,
    lon: lon + eastMeters / mPerDegLon,
  };
}

const TILE_SOURCES = [
  {
    name: "nlsc-photo2",
    attribution: "正射影像：內政部國土測繪中心",
    url: (z, x, y) => `https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/${z}/${y}/${x}`,
  },
  {
    name: "esri-world-imagery",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
];

async function stitchGround(origin) {
  const pad = RADIUS + 40;
  const sw = offsetLatLon(origin.lat, origin.lon, -pad, -pad);
  const ne = offsetLatLon(origin.lat, origin.lon, pad, pad);
  const tSW = lonLatToTile(sw.lat, sw.lon, TILE_ZOOM);
  const tNE = lonLatToTile(ne.lat, ne.lon, TILE_ZOOM);
  const x0 = Math.min(tSW.x, tNE.x);
  const x1 = Math.max(tSW.x, tNE.x);
  const y0 = Math.min(tSW.y, tNE.y);
  const y1 = Math.max(tSW.y, tNE.y);
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  console.log(`tiles ${cols}x${rows} @ z${TILE_ZOOM} (${cols * rows} images)`);

  const jobs = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) jobs.push({ x, y });
  }

  let used = null;
  let tiles = [];
  for (const source of TILE_SOURCES) {
    tiles = await mapPool(jobs, 6, async (job) => {
      try {
        const buf = await fetchBuffer(source.url(TILE_ZOOM, job.x, job.y));
        return { ...job, buf };
      } catch (err) {
        console.warn("tile fail", source.name, job.x, job.y, err.message);
        return { ...job, buf: null };
      }
    });
    const ok = tiles.filter((t) => t.buf).length;
    if (ok >= cols * rows * 0.5) {
      used = source;
      console.log(`${source.name} got ${ok}/${cols * rows} tiles`);
      break;
    }
    console.warn(source.name, "too many missing tiles, try next source");
  }
  if (!used) throw new Error("所有正射影像來源都失敗");

  const blank = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 118, g: 116, b: 108 } },
  }).jpeg().toBuffer();

  const outPath = path.join(DATA, "ground.jpg");
  let canvas = sharp({
    create: {
      width: cols * 256,
      height: rows * 256,
      channels: 3,
      background: { r: 118, g: 116, b: 108 },
    },
  });
  const BATCH = 40;
  for (let i = 0; i < tiles.length; i += BATCH) {
    const composites = tiles.slice(i, i + BATCH).map((tile) => ({
      input: tile.buf || blank,
      left: (tile.x - x0) * 256,
      top: (tile.y - y0) * 256,
    }));
    const buf = await canvas.composite(composites).png().toBuffer();
    canvas = sharp(buf);
  }
  await canvas.sharpen({ sigma: 1.05, m1: 1.0, m2: 0.45 }).jpeg({ quality: 92, mozjpeg: true }).toFile(outPath);

  const nw = tileNW(x0, y0, TILE_ZOOM);
  const se = tileNW(x1 + 1, y1 + 1, TILE_ZOOM);
  return {
    image: "data/ground.jpg",
    zoom: TILE_ZOOM,
    source: used.name,
    attribution: used.attribution,
    north: nw.lat,
    west: nw.lon,
    south: se.lat,
    east: se.lon,
    tileX0: x0,
    tileY0: y0,
    tileX1: x1,
    tileY1: y1,
    pixelWidth: cols * 256,
    pixelHeight: rows * 256,
  };
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const groundOnly = process.argv.includes("--ground-only");
  let prev = null;
  try {
    prev = JSON.parse(await readFile(path.join(DATA, "map-config.json"), "utf8"));
  } catch {
    prev = null;
  }

  if (groundOnly) {
    if (!prev || !Number.isFinite(prev.lat) || !Number.isFinite(prev.lon)) {
      throw new Error("沒有既有 map-config，無法只重拉地板");
    }
    const origin = {
      lat: prev.lat,
      lon: prev.lon,
      source: prev.geocodeSource,
      raw: prev.geocodeNote,
    };
    console.log("ground-only origin", origin);
    console.log("stitching aerial tiles");
    const ground = await stitchGround(origin);
    const config = { ...prev, ground, fetchedAt: new Date().toISOString() };
    await writeFile(path.join(DATA, "map-config.json"), JSON.stringify(config, null, 2));
    console.log("wrote ground", DATA);
    return;
  }

  console.log("geocoding", ADDRESS);
  const origin = await geocode();
  console.log("origin", origin);

  console.log("fetching OSM");
  const osm = await fetchOsm(origin);
  console.log(
    `buildings ${osm.buildings.length}, roads ${osm.roads.length}, pois ${osm.pois.length}`
  );

  console.log("stitching aerial tiles");
  const ground = await stitchGround(origin);

  const config = {
    address: ADDRESS,
    label: LABEL,
    lat: origin.lat,
    lon: origin.lon,
    geocodeSource: origin.source,
    geocodeNote: origin.raw,
    radiusMeters: RADIUS,
    eyeHeight: 1.6,
    walkSpeed: 4.5,
    ground,
    fetchedAt: new Date().toISOString(),
  };

  const parking = osm.parking || [];
  delete osm.parking;
  await writeFile(path.join(DATA, "map-config.json"), JSON.stringify(config, null, 2));
  await writeFile(path.join(DATA, "osm-200m.json"), JSON.stringify(osm));
  await writeFile(path.join(DATA, "parking.json"), JSON.stringify({
    source: "osm",
    attribution: "© OpenStreetMap contributors",
    note: "平面停車場多邊形。朝陽公園停車場在 OSM 以 operator=朝陽公園平面停車場 標註。",
    lots: parking,
  }, null, 2));
  console.log("wrote", DATA, `parking ${parking.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
