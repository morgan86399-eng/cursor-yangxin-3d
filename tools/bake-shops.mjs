#!/usr/bin/env node
/**
 * 依真實 OSM 門牌＋店家，以及鎮撫街公開店名，烘焙 3D 招牌與騎樓店屋。
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "public", "data");
const UA = "yangxin-3d-map/0.2 (https://github.com/morgan8639-design/shenxinling-website)";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CURATED = [
  { name: "養心推拿", no: "46", kind: "massage", featured: true, color: "#c4894a", floor: 2 },
  { name: "雅善圓蔬食館", no: "46", kind: "restaurant", color: "#5c8a4a", floor: 1 },
  { name: "大眾小吃店", no: "36", kind: "restaurant" },
  { name: "無名米粉湯", no: "38", kind: "restaurant" },
  { name: "檜溪彰化肉圓", no: "21", kind: "restaurant" },
  { name: "斗南米糕甲", no: "42", kind: "restaurant" },
  { name: "山東水餃館", no: "40", kind: "restaurant" },
  { name: "冰棧", no: "2", kind: "cafe" },
  { name: "王哥麵食館", no: "11", kind: "restaurant" },
  { name: "超品漢堡", no: "5", kind: "restaurant" },
  { name: "美廉社桃園鎮撫店", no: "32-1", kind: "supermarket", color: "#f0c400" },
  { name: "蝦皮店到店", no: "52", kind: "convenience" },
  { name: "青溪派出所", no: "39", kind: "police" },
  { name: "鎮撫宮", no: "43", kind: "temple", color: "#c45c3a" },
  { name: "朝陽市場", kind: "market", color: "#b57a3a" },
  { name: "寶之林藝品店", no: "22", kind: "shop" },
  { name: "爪皇娃娃機", no: "17", kind: "arcade" },
  { name: "億萬金彩券行", no: "27", kind: "lottery" },
  { name: "鑫盈中古電器行", no: "25", kind: "electronics" },
  { name: "大偉寵物", no: "53-1", kind: "pet" },
  { name: "御皇油飯", no: "63", kind: "restaurant" },
  { name: "小豆子早點", no: "65", kind: "restaurant" },
  { name: "美力早餐屋", no: "85", kind: "restaurant" },
  { name: "鈞鳳理髮店", no: "77", kind: "hair" },
  { name: "北港吳生炒鴨肉羹", no: "106", kind: "restaurant" },
  { name: "吉米時尚髮型", no: "96", kind: "hair" },
  { name: "民昇商行", no: "31", kind: "shop" },
];

const KIND_COLOR = {
  massage: "#c4894a",
  restaurant: "#b23b32",
  cafe: "#8a5a38",
  supermarket: "#d4a017",
  convenience: "#2f9e44",
  pharmacy: "#1f8a4d",
  temple: "#c45c3a",
  police: "#2c5aa0",
  dentist: "#3a8a8a",
  market: "#b57a3a",
  arcade: "#7a3fa0",
  lottery: "#c43a5a",
  electronics: "#3d5a73",
  pet: "#6b8f3a",
  hair: "#a05670",
  shop: "#3a4a6b",
  hardware: "#6a5a3a",
};

function parseNo(raw) {
  const m = String(raw || "").replace(/號/g, "").match(/(\d+)(?:之|-)?(\d+)?/);
  if (!m) return null;
  const n = Number(m[1]);
  const sub = m[2] ? Number(m[2]) : 0;
  return { n, sub, key: sub ? `${n}-${sub}` : String(n), odd: n % 2 === 1 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function overpass(query) {
  let lastErr;
  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": UA,
        },
        body: "data=" + encodeURIComponent(query.trim()),
      });
      if (!res.ok) throw new Error(`${res.status} ${endpoint}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(800);
    }
  }
  throw lastErr;
}

function elCoord(el) {
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function distM(a, b) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * mLat;
  const dx = (a.lon - b.lon) * mLon;
  return Math.hypot(dx, dy);
}

function interpolate(targetKey, doors) {
  const t = parseNo(targetKey);
  if (!t) return null;
  const exact = doors.find((d) => d.key === t.key);
  if (exact) return exact;
  const same = doors.filter((d) => d.odd === t.odd && !d.sub && d.street === "鎮撫街").sort((a, b) => a.n - b.n);
  if (same.length < 2) {
    const near = doors
      .filter((d) => d.street === "鎮撫街")
      .sort((a, b) => Math.abs(a.n - t.n) - Math.abs(b.n - t.n))[0];
    return near || null;
  }
  let lo = same.filter((d) => d.n <= t.n).pop();
  let hi = same.find((d) => d.n >= t.n);
  if (!lo) lo = same[0];
  if (!hi) hi = same[same.length - 1];
  if (lo.n === hi.n) return lo;
  const u = (t.n - lo.n) / (hi.n - lo.n);
  return {
    lat: lo.lat + (hi.lat - lo.lat) * u,
    lon: lo.lon + (hi.lon - lo.lon) * u,
    key: t.key,
    n: t.n,
    interpolated: true,
  };
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const config = JSON.parse(await readFile(path.join(DATA, "map-config.json"), "utf8"));
  const osm = JSON.parse(await readFile(path.join(DATA, "osm-200m.json"), "utf8"));
  const origin = { lat: config.lat, lon: config.lon };

  const q = `
    [out:json][timeout:60];
    (
      nwr(around:210,${origin.lat},${origin.lon})[name];
      nwr(around:210,${origin.lat},${origin.lon})[shop];
      nwr(around:210,${origin.lat},${origin.lon})[amenity];
      nwr(around:220,${origin.lat},${origin.lon})["addr:housenumber"];
    );
    out center tags;
  `;
  console.log("fetching shops / housenumbers");
  const raw = await overpass(q);
  const els = raw.elements || [];

  const doors = [];
  const seenDoor = new Set();
  for (const el of els) {
    const t = el.tags || {};
    if (!t["addr:housenumber"]) continue;
    const street = (t["addr:street"] || "").replace(/臺/g, "台");
    if (street && street !== "鎮撫街" && !/鎮撫/.test(street) && street !== "春日路") continue;
    const parsed = parseNo(t["addr:housenumber"]);
    const coord = elCoord(el);
    if (!parsed || !coord) continue;
    const id = `${street}|${parsed.key}|${coord.lat.toFixed(5)}`;
    if (seenDoor.has(id)) continue;
    seenDoor.add(id);
    doors.push({
      ...parsed,
      street: street || "鎮撫街",
      lat: coord.lat,
      lon: coord.lon,
      name: t.name || "",
    });
  }

  const shops = [];

  function addShop(s) {
    if (distM(origin, s) > config.radiusMeters + 15) return;
    const dup = shops.find((x) => x.name === s.name && distM(x, s) < 28);
    if (dup) {
      if (s.featured) Object.assign(dup, { featured: true, color: s.color || dup.color });
      return;
    }
    shops.push({
      id: s.id || `shop-${shops.length + 1}`,
      name: s.name,
      sub: s.sub || (s.no ? `鎮撫街${s.no}號` : ""),
      kind: s.kind || "shop",
      lat: s.lat,
      lon: s.lon,
      color: s.color || KIND_COLOR[s.kind] || KIND_COLOR.shop,
      featured: !!s.featured,
      floor: s.floor || (s.kind === "massage" ? 2 : 1),
      source: s.source || "osm",
      makeHouse: s.makeHouse !== false,
    });
  }

  for (const item of CURATED) {
    if (item.name === "朝陽市場") {
      const b = (osm.buildings || []).find((x) => x.name === "朝陽市場");
      if (b && b.ring?.length) {
        const n = b.ring.length - 1;
        const lon = b.ring.slice(0, n).reduce((s, p) => s + p[0], 0) / n;
        const lat = b.ring.slice(0, n).reduce((s, p) => s + p[1], 0) / n;
        addShop({ ...item, lat, lon, id: "chaoyang-market", makeHouse: false, source: "osm-building" });
      }
      continue;
    }
    if (item.name === "鎮撫宮") {
      addShop({
        ...item,
        lat: 24.998423,
        lon: 121.314646,
        id: "zhenfu-temple",
        makeHouse: false,
        source: "osm-building",
      });
      continue;
    }
    const hit = interpolate(item.no, doors);
    if (!hit) {
      console.warn("no door for", item.name, item.no);
      continue;
    }
    addShop({
      ...item,
      lat: hit.lat,
      lon: hit.lon,
      id: item.featured ? "yangxin" : `curated-${item.no}-${item.name}`,
      source: hit.interpolated ? "housenumber-interpolated" : "housenumber",
    });
  }

  const skip = /街口|里$|溪$|路線|公車/;
  for (const el of els) {
    const t = el.tags || {};
    let name = t.name || t.brand;
    if (!name || skip.test(name)) continue;
    const kind = t.shop
      ? t.shop === "convenience"
        ? "convenience"
        : t.shop === "supermarket"
          ? "supermarket"
          : t.shop === "pharmacy"
            ? "pharmacy"
            : "shop"
      : t.amenity === "restaurant" || t.amenity === "fast_food"
        ? "restaurant"
        : t.amenity === "cafe"
          ? "cafe"
          : t.amenity === "pharmacy"
            ? "pharmacy"
            : t.amenity === "police"
              ? "police"
              : t.amenity === "place_of_worship"
                ? "temple"
                : t.amenity === "dentist"
                  ? "dentist"
                  : t.amenity === "marketplace"
                    ? "market"
                    : t.amenity
                      ? "shop"
                      : null;
    if (!kind && !t.shop) continue;
    const coord = elCoord(el);
    if (!coord) continue;
    if (/7-?Eleven|統一超商/i.test(name)) {
      name = "7-ELEVEN 全鎮店";
      t["addr:housenumber"] = t["addr:housenumber"] || "238";
    }
    addShop({
      name,
      kind: kind || "shop",
      lat: coord.lat,
      lon: coord.lon,
      id: `${el.type}-${el.id}`,
      no: /全鎮/.test(name) ? "" : t["addr:housenumber"] || "",
      sub: /全鎮/.test(name) ? "春日路238-240號" : t["addr:housenumber"] ? `鎮撫街${t["addr:housenumber"]}號` : "",
      source: "osm",
      makeHouse: !t.building,
    });
  }

  for (const poi of osm.pois || []) {
    if (!poi.name || !poi.lat || skip.test(poi.name)) continue;
    const kind =
      poi.amenity === "pharmacy"
        ? "pharmacy"
        : poi.amenity === "cafe"
          ? "cafe"
          : poi.amenity === "restaurant" || poi.amenity === "fast_food"
            ? "restaurant"
            : poi.amenity === "place_of_worship"
              ? "temple"
              : poi.amenity === "police"
                ? "police"
                : poi.amenity === "dentist"
                  ? "dentist"
                  : poi.amenity === "marketplace"
                    ? "market"
                    : null;
    if (!kind) continue;
    addShop({
      name: poi.name,
      kind,
      lat: poi.lat,
      lon: poi.lon,
      id: poi.id || `poi-${poi.name}`,
      source: "osm-poi",
      makeHouse: true,
    });
  }

  shops.sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, "zh-Hant"));

  const payload = {
    origin,
    fetchedAt: new Date().toISOString(),
    count: shops.length,
    shops,
  };
  await writeFile(path.join(DATA, "shops.json"), JSON.stringify(payload, null, 2));
  console.log("wrote", shops.length, "shops");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
