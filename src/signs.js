import * as THREE from "three";
import { nearestRoad, pointInRing, streetFacingEdge } from "./geo.js";
import { makeVerticalSignTexture, makeShopSignTexture } from "./textures.js";
import { brandMeta } from "./brands.js";
import { dressOwnsShopSign, facingNeighborLots } from "./shop-dress.js";
import { facadeOwnsListedSign, landmarkFor } from "./landmarks.js";
import { localizeShops, matchShopsToLots, splitShopFloors } from "./shop-match.js";
import { ZHENFU_HALL_ID, ZHENFU_PLAQUE } from "./temple.js";

const NEAR_SIGN_DETAIL_RADIUS = 50;

/** 只依「目前模型已有同名牌面」去重；店點與建物配對不是現場立面校正。 */
export function modeledSignShopIds(shops, roads, project, colliders, radius = NEAR_SIGN_DETAIL_RADIUS) {
  const lots = (colliders || [])
    .filter((c) => c?.id && c.points?.length >= 3)
    .map((c) => ({ id: c.id, pts: c.points, isShop: Boolean(c.isShop), collider: c }));
  if (!lots.length) return new Set();
  const matched = matchShopsToLots(localizeShops(shops, project), lots);
  const shopLot = lots.find((lot) => lot.isShop);
  const neighbors = shopLot ? facingNeighborLots(shopLot.pts, lots, roads) : null;
  const neighborIds = new Set([neighbors?.left?.id, neighbors?.right?.id]);
  const visible = new Set();
  const radius2 = radius * radius;

  for (const lot of lots) {
    const attached = matched.byLot.get(lot.id) || [];
    if (lot.id === ZHENFU_HALL_ID) {
      for (const shop of attached) {
        if (shop.name === ZHENFU_PLAQUE && shop.x * shop.x + shop.z * shop.z <= radius2) visible.add(shop.id);
      }
      continue;
    }
    if (!attached.length || lot.isShop || neighborIds.has(lot.id) || landmarkFor(lot.id)?.ownsSign) continue;
    const edge = streetFacingEdge(lot.pts, roads);
    if (!edge || edge.len < 1.8) continue;
    const floors = splitShopFloors(attached);
    for (const shop of [floors.ground, floors.upper]) {
      if (!shop || shop.x * shop.x + shop.z * shop.z > radius2) continue;
      if (!lot.collider.shops?.includes(shop.name)) continue;
      visible.add(shop.id);
    }
  }
  return visible;
}

function fittedEdge(pts, roads, x, z, width) {
  let best = null;
  const closed = pts[0].x === pts.at(-1).x && pts[0].z === pts.at(-1).z;
  const count = closed ? pts.length - 1 : pts.length;
  for (let i = 0; i < count; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % count];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.8) continue;
    const fitWidth = Math.min(width, len * 0.8);
    const margin = fitWidth / 2 + Math.min(0.08, len * 0.05);
    if (len <= margin * 2) continue;
    const rawT = ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / (len * len);
    const t = Math.max(margin / len, Math.min(1 - margin / len, rawT));
    const px = a.x + (b.x - a.x) * t;
    const pz = a.z + (b.z - a.z) * t;
    let nx = (a.z - b.z) / len;
    let nz = (b.x - a.x) / len;
    if (pointInRing((a.x + b.x) * 0.5 + nx * 0.25, (a.z + b.z) * 0.5 + nz * 0.25, pts)) {
      nx = -nx;
      nz = -nz;
    }
    const road = nearestRoad((a.x + b.x) * 0.5, (a.z + b.z) * 0.5, roads);
    const roadFacing = ((road.px - (a.x + b.x) * 0.5) * nx + (road.pz - (a.z + b.z) * 0.5) * nz) > 0;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    // 優先靠近店點的可容納立面；背街面加成本，避免牌面藏在建物後方。
    const score = d + (roadFacing ? 0 : 36) + (fitWidth < width ? 90 : 0);
    if (!best || score < best.score) best = { index: i, px, pz, nx, nz, len, t, fitWidth, score };
  }
  return best;
}

function snapToFacade(x, z, colliders, roads, requiredWidth = 0, shopName = "", occupiedNames = new Set()) {
  let best = null;
  for (const c of colliders || []) {
    const pts = c.points;
    if (!pts || pts.length < 3) continue;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j];
      const b = pts[i];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const len2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t;
      const pz = a.z + vz * t;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (best && d >= best.d) continue;
      let nx = a.z - b.z;
      let nz = b.x - a.x;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      if (pointInRing(px + nx * 0.3, pz + nz * 0.3, pts)) {
        nx = -nx;
        nz = -nz;
      }
      best = { d, px, pz, nx, nz, collider: c, t };
    }
  }
  if (best && best.d < 24 * 24) {
    if (requiredWidth > 0) {
      const frontOccupied = best.collider.shops?.some((name) => name !== shopName && occupiedNames.has(name));
      // Two businesses sharing one unsplit footprint have no surveyed frontage
      // assignment. A guessed side-wall sign can cover the known front sign or
      // send both signs to the same side wall. Keep the second POI as pending.
      if (frontOccupied) return { pendingReason: "shared-frontage-needs-calibration", collider: best.collider };
      const fit = fittedEdge(best.collider.points, roads, x, z, requiredWidth);
      if (fit) {
        return {
          x: fit.px + fit.nx * 0.86,
          z: fit.pz + fit.nz * 0.86,
          yaw: Math.atan2(fit.nx, fit.nz),
          collider: best.collider,
          faceEdge: { index: fit.index, len: fit.len, t: fit.t },
          fitWidth: fit.fitWidth,
        };
      }
    }
    return {
      x: best.px + best.nx * 0.86,
      z: best.pz + best.nz * 0.86,
      yaw: Math.atan2(best.nx, best.nz),
      collider: best.collider,
    };
  }
  const seg = nearestRoad(x, z, roads);
  let nx = x - seg.px;
  let nz = z - seg.pz;
  const nl = Math.hypot(nx, nz);
  if (nl < 0.2) {
    nx = -seg.az;
    nz = seg.ax;
  } else {
    nx /= nl;
    nz /= nl;
  }
  return { x: x + nx * 0.55, z: z + nz * 0.55, yaw: Math.atan2(nx, nz), collider: null };
}

export function signHeightFor(shop, snapped) {
  const meta = brandMeta(shop);
  const floor = meta.floor;
  const storey = snapped?.collider?.storey || 3.1;
  if (floor >= 2) return storey + 1.18;
  if (shop.featured || meta.brand === "yangxin") return storey + 1.18;
  if (meta.brand === "yashanyuan") return 2.55;
  if (["seven", "simplemart", "familymart", "hilife", "pxmart", "shopee"].includes(meta.brand)) return 3.42;
  return 2.58;
}

export function createSigns(shops, roads, project, radius, colliders) {
  const group = new THREE.Group();
  group.name = "signs";
  const r2 = radius * radius;
  const nearR2 = NEAR_SIGN_DETAIL_RADIUS ** 2;
  const modeledSigns = modeledSignShopIds(shops, roads, project, colliders);
  const occupiedNames = new Set((shops || [])
    .filter((shop) => modeledSigns.has(shop.id) || dressOwnsShopSign(shop) || facadeOwnsListedSign(shop))
    .map((shop) => shop.name));
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a2420 });
  const armMat = new THREE.MeshLambertMaterial({ color: 0x2a2420 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8b8173, roughness: 0.55, metalness: 0.52 });
  const anchorMat = new THREE.MeshStandardMaterial({ color: 0x6d6860, roughness: 0.6, metalness: 0.55 });
  let count = 0;
  const names = [];
  const pending = [];

  for (const shop of shops || []) {
    if (dressOwnsShopSign(shop) || facadeOwnsListedSign(shop) || modeledSigns.has(shop.id)) continue;
    const p = project.toLocal(shop.lat, shop.lon);
    if (p.x * p.x + p.z * p.z > r2) continue;
    const near = p.x * p.x + p.z * p.z <= nearR2;
    const meta = brandMeta(shop);
    const chain = ["seven", "simplemart", "familymart", "hilife", "pxmart", "shopee"].includes(meta.brand);
    const vertical = !shop.featured && !chain && meta.brand !== "yashanyuan" && meta.brand !== "yangxin" && (shop.name || "").length <= 4;
    let w;
    let h;
    let tex;
    if (vertical) {
      w = 0.56;
      h = Math.min(2.15, 0.78 + shop.name.length * 0.3);
      tex = makeVerticalSignTexture(shop.name, shop.color || meta.color);
    } else {
      w = shop.featured || meta.brand === "yangxin" || meta.brand === "yashanyuan" ? 2.55 : chain ? 3.05 : Math.min(2.7, 0.86 + (shop.name || "").length * 0.16);
      h = shop.featured || meta.floor === 2 || chain ? 0.88 : 0.72;
      tex = makeShopSignTexture(shop);
    }
    let snapped;
    const shopCollider = (colliders || []).find((c) => c.isShop);
    if ((shop.featured || /養心|雅善圓/.test(shop.name || "")) && shopCollider) {
      const edge = streetFacingEdge(shopCollider.points, roads);
      if (edge) {
        const along = meta.brand === "yangxin" ? 0.62 : 0.38;
        const mx = edge.a.x + (edge.b.x - edge.a.x) * along;
        const mz = edge.a.z + (edge.b.z - edge.a.z) * along;
        const out = meta.floor >= 2 ? 0.72 : 0.88;
        snapped = {
          x: mx + edge.nx * out,
          z: mz + edge.nz * out,
          yaw: edge.yaw,
          collider: shopCollider,
        };
      }
    }
    if (!snapped) snapped = snapToFacade(p.x, p.z, colliders, roads, near ? w : 0, shop.name, occupiedNames);
    if (snapped.pendingReason) {
      pending.push({ name: shop.name, reason: snapped.pendingReason, colliderId: snapped.collider?.id || null });
      continue;
    }
    if (near && snapped.fitWidth) w = Math.min(w, snapped.fitWidth);

    const g = new THREE.Group();
    g.position.set(snapped.x, 0, snapped.z);
    g.rotation.y = snapped.yaw;

    const y = signHeightFor(shop, snapped);

    const stick = 0.06;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.07), frameMat);
    frame.position.set(0, y, -0.02);
    g.add(frame);

    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), mat);
    board.position.set(0, y, stick);
    g.add(board);

    if (near && snapped.collider) {
      const anchors = vertical ? [{ x: 0, y: -h * 0.3 }, { x: 0, y: h * 0.3 }]
        : [{ x: -w * 0.32, y: 0 }, { x: w * 0.32, y: 0 }];
      for (const anchor of anchors) {
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.82), armMat);
        rod.position.set(anchor.x, y + anchor.y, -0.45);
        g.add(rod);
        const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.035), anchorMat);
        wallPlate.position.set(anchor.x, y + anchor.y, -0.855);
        g.add(wallPlate);
      }
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.024, 0.035), trimMat);
        rail.position.set(0, y + side * (h * 0.5 + 0.018), 0.106);
        g.add(rail);
      }
    } else {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), armMat);
      arm.position.set(0, y, -0.18);
      g.add(arm);
    }

    g.userData = {
      kind: "standalone-sign", name: shop.name, floor: meta.floor, brand: meta.brand, y,
      evidence: "estimated", faceEdge: snapped.faceEdge || null, width: w,
      colliderId: snapped.collider?.id || null,
    };
    group.add(g);
    count += 1;
    names.push(shop.name);
  }

  group.userData.pendingCalibration = pending;
  return { group, count, names, pending };
}
