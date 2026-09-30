import { centroid, createProjector, pointInRing } from "./geo.js";
import { hash01 } from "./textures.js";

const OSM_MASSING = new Set(["apartments", "residential", "commercial", "retail", "religious"]);

function ringLocal(ring, project) {
  return (ring || []).map(([lon, lat]) => {
    const p = project.toLocal(lat, lon);
    return { x: p.x, z: p.z };
  });
}

/**
 * OSM 有明確類型、但合併檔把無名輪廓丟掉時，把類型蓋回分戶框。
 * 分戶中心落在框內才蓋，避免廟宇外緣擦到的鄰房被改成廟。
 * 完全沒被分戶蓋住的公寓／商業框則補回一棟，避免地圖上消失。
 */
export function integrateOsmPlaceClasses(buildings, osmBuildings, project) {
  const list = buildings || [];
  const parents = (osmBuildings || [])
    .filter((b) => OSM_MASSING.has(String(b.building || "")) && b.ring?.length >= 4)
    .map((b) => ({ b, pts: ringLocal(b.ring, project) }));
  const stamped = [];
  const coveredParents = new Set();
  for (const lot of list) {
    if (lot.source !== "nlsc-buildx" || lot.name) continue;
    const [lon, lat] = centroid(lot.ring);
    const c = project.toLocal(lat, lon);
    const hit = parents.find((parent) => pointInRing(c.x, c.z, parent.pts));
    if (!hit) continue;
    const building = String(hit.b.building);
    lot.building = building;
    lot.tags = {
      ...(lot.tags || {}),
      amenity: hit.b.tags?.amenity || lot.tags?.amenity || "",
      shop: lot.tags?.shop || "",
    };
    lot.osmParentId = hit.b.id;
    coveredParents.add(hit.b.id);
    stamped.push({ id: lot.id, building, parent: hit.b.id });
  }
  const added = [];
  const have = new Set(list.map((b) => b.id));
  for (const parent of parents) {
    if (have.has(parent.b.id) || coveredParents.has(parent.b.id)) continue;
    list.push({
      ...parent.b,
      source: parent.b.source || "osm",
      osmParentId: parent.b.id,
      tags: {
        amenity: parent.b.tags?.amenity || "",
        shop: parent.b.tags?.shop || "",
      },
    });
    added.push({ id: parent.b.id, building: parent.b.building });
  }
  return { stamped, added };
}

export function heightForLot(area, isShop) {
  if (isShop) return 6.6;
  if (area >= 700) return 12;
  if (area >= 160) return 9;
  return 6.6;
}

export function displayHeightForLot(b, isShop, extra = {}) {
  if (isShop) return 6.6;
  if (Number(extra.height)) return Number(extra.height);
  const name = b.name || "";
  if (b.building === "temple" || /宮|殿|蓮社/.test(name)) return Number(b.height) || 12;
  if (/市場/.test(name)) return Number(b.height) || 24;
  if (b.source === "nlsc-buildx") {
    const area = Number(b.area) || 80;
    const h = hash01(String(b.id || ""), 21);
    if (area >= 700) return h > 0.5 ? 15.4 : 12.2;
    if (area >= 220) return h > 0.48 ? 12.6 : 9.4;
    if (h < 0.2) return 6.35;
    if (h < 0.48) return 6.85;
    if (h < 0.76) return 9.85;
    return 12.55;
  }
  return Number(b.height) || 6.6;
}

function centroidLocal(ring, project) {
  const [lon, lat] = centroid(ring);
  return project.toLocal(lat, lon);
}

export function mergeNlscAndOsm(nlscLots, osmBuildings, origin) {
  const project = createProjector(origin.lat, origin.lon);
  const named = (osmBuildings || []).filter(
    (b) => b.name || b.building === "temple" || b.building === "government" || b.tags?.amenity
  );
  const namedLocal = named.map((b) => ({ b, pts: ringLocal(b.ring, project) }));
  const out = [];

  for (const lot of nlscLots || []) {
    const c = centroidLocal(lot.ring, project);
    const hit = namedLocal.find((n) => pointInRing(c.x, c.z, n.pts));
    if (hit) continue;
    out.push({
      id: lot.id,
      name: "",
      building: "house",
      height: heightForLot(lot.area, false),
      levels: lot.area >= 160 ? 3 : 2,
      area: lot.area,
      source: "nlsc-buildx",
      ring: lot.ring,
      tags: { amenity: "", shop: "" },
    });
  }

  for (const b of named) {
    out.push({
      ...b,
      source: b.source || "osm",
    });
  }

  let shop = null;
  let best = Infinity;
  for (const b of out) {
    const c = centroidLocal(b.ring, project);
    const d = Math.hypot(c.x, c.z);
    if (d < best) {
      best = d;
      shop = b;
    }
  }
  if (shop && best <= 36) {
    shop.isShop = true;
    shop.height = 6.6;
    shop.levels = 2;
    shop.name = shop.name || "養心推拿";
    shop.building = shop.building || "house";
  }

  return { buildings: out, shopId: shop?.isShop ? shop.id : null, shopDistance: shop?.isShop ? best : null };
}
