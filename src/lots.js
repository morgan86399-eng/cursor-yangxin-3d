import { centroid, createProjector, pointInRing } from "./geo.js";
import { hash01 } from "./textures.js";

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

function ringLocal(ring, project) {
  return ring.map(([lon, lat]) => {
    const p = project.toLocal(lat, lon);
    return { x: p.x, z: p.z };
  });
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
