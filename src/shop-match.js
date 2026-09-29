import { pointInRing } from "./geo.js";
import { brandMeta, isChainStore } from "./brands.js";

export function localizeShops(shops, project) {
  return (shops || []).map((s) => {
    const p = project.toLocal(s.lat, s.lon);
    const meta = brandMeta(s);
    return { ...s, x: p.x, z: p.z, ...meta };
  });
}

function distToRing(x, z, pts) {
  if (pointInRing(x, z, pts)) return 0;
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const b = pts[i];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const len2 = vx * vx + vz * vz || 1;
    let t = ((x - a.x) * vx + (z - a.z) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (d < best) best = d;
  }
  return best;
}

function lotHasChain(byLot, id) {
  return (byLot.get(id) || []).some((s) => isChainStore(s.brand));
}

export function matchShopsToLots(localShops, lots) {
  const used = new Set();
  const byLot = new Map();
  function add(id, shop) {
    if (!byLot.has(id)) byLot.set(id, []);
    byLot.get(id).push(shop);
    shop.lotId = id;
  }

  for (const shop of localShops) {
    const hit = lots.find((b) => pointInRing(shop.x, shop.z, b.pts));
    if (!hit) continue;
    add(hit.id, shop);
    used.add(shop.id);
  }

  for (const shop of localShops) {
    if (used.has(shop.id)) continue;
    let best = null;
    for (const b of lots) {
      const d = distToRing(shop.x, shop.z, b.pts);
      if (!best || d < best.d) best = { d, b };
    }
    const maxD = isChainStore(shop.brand) ? 24 : 14;
    if (!best || best.d > maxD) continue;
    if (isChainStore(shop.brand) && lotHasChain(byLot, best.b.id) && best.d > 2) continue;
    add(best.b.id, shop);
    used.add(shop.id);
  }

  return {
    byLot,
    unmatched: localShops.filter((s) => !used.has(s.id)),
    matched: used.size,
    shops: localShops,
  };
}

export function splitShopFloors(attached) {
  const list = attached || [];
  const upper = list.find((s) => s.floor >= 2 || s.brand === "yangxin") || null;
  const rest = list.filter((s) => s !== upper);
  const ground =
    rest.find((s) => s.brand === "yashanyuan") ||
    rest.find((s) => isChainStore(s.brand)) ||
    rest.find((s) => s.floor === 1) ||
    rest[0] ||
    null;
  return { ground, upper, all: list };
}
