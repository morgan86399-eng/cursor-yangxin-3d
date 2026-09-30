import * as THREE from "three";

// Procedural 2.5D street facades ported from the Zhenfu GTA preview
// (https://morgan86399-eng.github.io/zhenfu-gta-preview/). One canvas is one
// bay wide and one floor-band tall per storey. Repeating it along a wall
// keeps one bay ≈ one texture repeat. These are estimated game facades,
// not surveyed photographs.
export const FACADE_25D_REFERENCE = "https://morgan86399-eng.github.io/zhenfu-gta-preview/";
export const FLOOR_PX = 72;
export const BAY_PX = 96;
export const FACADE_25D_KINDS = ["shophouse", "apt", "mid", "temple", "civic"];
export const KIND_LABEL_25D = {
  shophouse: "店屋",
  apt: "公寓",
  mid: "中層",
  temple: "廟宇",
  civic: "公共",
};

const WALLS = {
  shophouse: ["#efe2cf", "#e7d3b4", "#f4e7d6", "#e8d4c0"],
  apt: ["#d9d3c8", "#cfc6b8", "#e4ddd2", "#d3cdc2"],
  mid: ["#c5cdd4", "#b7c3cc", "#d5dde3", "#c9d0d4"],
  temple: ["#f3e6cf", "#ead6b4", "#f7edd9", "#efe0c8"],
  civic: ["#e7e2d6", "#ddd6c8", "#efeae0", "#e3ddd0"],
};
const SIGNS = ["#c44536", "#d89a1a", "#2f6f4e", "#24577a"];
const GLASS = ["#7ea0b3", "#6f93a8", "#89a9b8", "#7698a6"];
const GLOW = ["#f0d7a4", "#e7c98a", "#f3dcb0", "#edd3a2"];
export const FACADE_25D_VARIANT_COUNT = 4;
const RECIPE_FLOORS = {
  shophouse: [3, 4, 3, 2],
  apt: [5, 5, 6, 4],
  mid: [8, 9, 8],
  temple: [2, 1],
  civic: [3, 2, 3],
};

const canvasCache = new Map();
const textureCache = new Map();
const materialCache = new Map();

export function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function num(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeFacadeMode(mode) {
  const value = String(mode || "").toLowerCase();
  if (value === "realistic" || value === "real" || value === "photo") return "realistic";
  if (value === "stylized" || value === "25d" || value === "2.5d" || value === "atlas") return "stylized";
  return "mixed";
}

export function bayWidthForKind(kind) {
  if (kind === "apt") return 3.6;
  if (kind === "mid") return 4.6;
  if (kind === "temple") return 5;
  return 4.1;
}

export function classifyFacade25d(tags = {}, seed = 0, kindHint = "") {
  const building = String(tags.building || "").toLowerCase();
  const amenity = String(tags.amenity || "").toLowerCase();
  const name = String(tags.name || "");
  const levels = num(tags["building:levels"] ?? tags.levels);
  const hint = String(kindHint || "").toLowerCase();
  if (building === "temple" || building === "religious" || amenity === "place_of_worship" || hint === "temple" || /宮|殿|蓮社/.test(name)) {
    return "temple";
  }
  if (
    building === "government" || building === "civic" || building === "public"
    || hint === "civic" || amenity === "police" || amenity === "community_centre"
  ) return "civic";
  if (
    building === "commercial" || building === "retail" || amenity === "marketplace"
    || hint === "market" || hint === "shop"
  ) return levels >= 7 ? "mid" : "shophouse";
  if (building === "apartments" || building === "residential") return levels >= 8 ? "mid" : "apt";
  if (hint === "mid") return "mid";
  if (levels >= 8) return "mid";
  if (levels >= 5) return "apt";
  if (seed % 5 === 0) return "apt";
  return "shophouse";
}

export function measureFacade25d(tags = {}, kind = "shophouse", seed = 0, modeledHeight = NaN) {
  const modeled = num(modeledHeight);
  if (modeled > 2 && modeled < 80) {
    return {
      height: modeled,
      floors: Math.max(1, Math.min(14, Math.round(modeled / 3.15))),
      source: "modeled",
    };
  }
  const heightTag = num(tags.height);
  if (heightTag > 2 && heightTag < 80) {
    return {
      height: heightTag,
      floors: Math.max(1, Math.min(14, Math.round(heightTag / 3.15))),
      source: "height",
    };
  }
  const levels = num(tags["building:levels"] ?? tags.levels);
  if (levels >= 1 && levels <= 20) {
    const floors = Math.max(1, Math.min(14, Math.round(levels)));
    return { height: floors * 3.15, floors, source: "levels" };
  }
  const choices = RECIPE_FLOORS[kind] || RECIPE_FLOORS.shophouse;
  const floors = choices[Math.abs(seed) % choices.length];
  return { height: floors * 3.15, floors, source: "recipe" };
}

export function resolveFacade25d(building = {}, extra = {}) {
  const seed = hashId(building.id || extra.id || "x");
  const tags = {
    building: building.building,
    amenity: building.amenity,
    name: building.name,
    levels: building.levels,
    "building:levels": building["building:levels"] ?? building.levels,
    height: building.height,
  };
  const kind = classifyFacade25d(tags, seed, extra.kindHint || extra.kind || "");
  const spec = measureFacade25d(tags, kind, seed, extra.height);
  const variant = seed % FACADE_25D_VARIANT_COUNT;
  return {
    kind,
    label: KIND_LABEL_25D[kind] || KIND_LABEL_25D.shophouse,
    floors: spec.floors,
    height: spec.height,
    source: spec.source,
    variant,
    seed,
    bayWidth: bayWidthForKind(kind),
    key: `${kind}:${spec.floors}:${variant}`,
  };
}

// mixed: near detail stays on the existing materials, farther street faces use the atlas.
// stylized: every generic street face uses the atlas, including the 50m ring.
// realistic: atlas stays hidden.
export function facadeLayerVisible(layer, nearDetail, mode) {
  const selected = normalizeFacadeMode(mode);
  if (layer === "atlas25d") {
    if (selected === "realistic") return false;
    if (selected === "stylized") return true;
    return !nearDetail;
  }
  if (layer === "realistic-street") {
    if (selected === "stylized") return false;
    if (selected === "realistic") return true;
    return Boolean(nearDetail);
  }
  return true;
}

export function applyFacadeMode(root, mode) {
  const selected = normalizeFacadeMode(mode);
  if (!root?.traverse) return selected;
  root.traverse((obj) => {
    const layer = obj.userData?.facadeLayer;
    if (layer !== "atlas25d" && layer !== "realistic-street") return;
    obj.visible = facadeLayerVisible(layer, Boolean(obj.userData.nearDetail), selected);
  });
  return selected;
}

function paintWindow(ctx, x, y, w, h, lit, variant = 0) {
  const glass = lit ? GLOW[variant] || GLOW[0] : GLASS[variant] || GLASS[0];
  ctx.fillStyle = "#243036";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#d9d1c4";
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = glass;
  ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.fillRect(x + 5, y + 5, Math.max(2, Math.round(w * 0.18)), Math.max(4, h - 14));
  ctx.fillStyle = "rgba(18, 32, 42, 0.22)";
  ctx.fillRect(x + 4, y + Math.round(h * 0.62), w - 8, Math.max(3, Math.round(h * 0.28)));
  ctx.fillStyle = "#6e6458";
  ctx.fillRect(x - 1, y + h - 2, w + 2, 3);
  ctx.strokeStyle = "rgba(28, 34, 38, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 4);
  ctx.lineTo(x + w / 2, y + h - 4);
  ctx.moveTo(x + 4, y + h / 2);
  ctx.lineTo(x + w - 4, y + h / 2);
  ctx.stroke();
}

function paintSign(ctx, x, y, w, h, color, depth) {
  if (depth) {
    ctx.fillStyle = "#6a2c24";
    ctx.fillRect(x + 2, y + 3, w, h);
  }
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255, 236, 210, 0.55)";
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = "rgba(255, 248, 230, 0.92)";
  const widths = [0.34, 0.22, 0.28, 0.18];
  const gap = 3;
  let cursor = x + gap;
  const count = 2 + (Math.abs(color.length) % 2);
  for (let i = 0; i < count; i += 1) {
    const bw = Math.max(6, Math.round((w - gap * (count + 1)) * widths[i % widths.length]));
    if (cursor + bw > x + w - gap) break;
    ctx.fillRect(cursor, y + 4, bw, h - 8);
    cursor += bw + gap;
  }
}

export function facadeDetailPlan(kind, variant, options = {}) {
  const safeKind = WALLS[kind] ? kind : "shophouse";
  const v = Math.abs(variant | 0) % FACADE_25D_VARIANT_COUNT;
  const shop = safeKind === "shophouse";
  const apt = safeKind === "apt";
  const mid = safeKind === "mid";
  const civic = safeKind === "civic";
  const paintedSign = options.paintedSign !== false;
  return {
    kind: safeKind,
    variant: v,
    windowFrames: safeKind !== "temple",
    edgeShadow: true,
    glassSheen: safeKind !== "temple",
    awning: shop && (v === 0 || v === 2),
    rainCover: (shop && (v === 1 || v === 2)) || civic || (mid && v !== 0),
    balcony: apt,
    acUnit: (apt || mid || shop) && (v === 1 || v === 3),
    pipe: (apt || mid || shop) && (v === 1 || v === 3),
    paintedSign,
    signDepth: paintedSign && (shop || mid || civic),
    shopBays: shop ? (v % 2 === 0 ? 2 : 3) : (mid ? 2 : 0),
    nightGlass: v === 1 || v === 3,
  };
}

function paintEdge(ctx, width, height) {
  ctx.fillStyle = "rgba(28, 22, 16, 0.34)";
  ctx.fillRect(0, 0, 3, height);
  ctx.fillRect(width - 3, 0, 3, height);
  ctx.fillStyle = "rgba(255, 248, 236, 0.16)";
  ctx.fillRect(3, 0, 2, height);
}

function paintAwning(ctx, y) {
  ctx.fillStyle = "#b5523a";
  ctx.fillRect(6, y + 23, BAY_PX - 12, 7);
  ctx.fillStyle = "#7a3428";
  ctx.fillRect(8, y + 29, BAY_PX - 16, 3);
}

function paintRainCover(ctx, y) {
  ctx.fillStyle = "#6f7c84";
  ctx.fillRect(4, y + 2, BAY_PX - 8, 4);
  ctx.fillStyle = "rgba(20, 24, 28, 0.35)";
  ctx.fillRect(6, y + 6, BAY_PX - 12, 2);
}

function paintAc(ctx, x, y) {
  ctx.fillStyle = "#d5dde2";
  ctx.fillRect(x, y, 14, 11);
  ctx.fillStyle = "#8ea0aa";
  ctx.fillRect(x + 2, y + 2, 10, 3);
  ctx.fillStyle = "#b7c3c8";
  ctx.fillRect(x + 2, y + 6, 10, 3);
}

function paintPipe(ctx, x, y, length) {
  ctx.fillStyle = "#8e9898";
  ctx.fillRect(x, y, 2, length);
  ctx.fillStyle = "rgba(20, 24, 28, 0.28)";
  ctx.fillRect(x + 2, y, 1, length);
}

function paintBalcony(ctx, y) {
  ctx.fillStyle = "#b7aea2";
  ctx.fillRect(14, y + 50, 58, 5);
  ctx.fillStyle = "#8d8478";
  ctx.fillRect(14, y + 46, 58, 2);
  for (let rail = 18; rail < 70; rail += 7) ctx.fillRect(rail, y + 40, 2, 10);
  ctx.fillStyle = "rgba(40, 36, 28, 0.2)";
  ctx.fillRect(16, y + 55, 54, 2);
}

function paintShopBays(ctx, y, bays, floorH) {
  const top = y + 33;
  const height = floorH - 38;
  const gap = 6;
  const inner = BAY_PX - 16;
  const bayW = (inner - gap * (bays - 1)) / bays;
  for (let i = 0; i < bays; i += 1) {
    const x = 8 + i * (bayW + gap);
    ctx.fillStyle = i === bays - 1 ? "#6e8c9e" : "#7f97a4";
    ctx.fillRect(x, top, bayW, height);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(x + 2, top + 2, 4, height - 6);
    if (i === Math.floor(bays / 2)) {
      ctx.fillStyle = "#3e2c24";
      ctx.fillRect(x + bayW * 0.28, top + 10, bayW * 0.44, height - 12);
    }
  }
  ctx.fillStyle = "#4a3b32";
  ctx.fillRect(0, y + 32, 8, floorH - 32);
  ctx.fillRect(BAY_PX - 8, y + 32, 8, floorH - 32);
  for (let i = 1; i < bays; i += 1) {
    const x = 8 + i * (bayW + gap) - gap;
    ctx.fillRect(x, y + 32, gap, floorH - 32);
  }
}

export function paintFacadeAtlas(ctx, kind, floors, variant, options = {}) {
  const plan = facadeDetailPlan(kind, variant, options);
  const safeKind = plan.kind;
  const safeFloors = Math.max(1, Math.min(14, Math.round(floors) || 1));
  const safeVariant = plan.variant;
  const width = BAY_PX;
  const height = FLOOR_PX * safeFloors;
  ctx.fillStyle = WALLS[safeKind][safeVariant];
  ctx.fillRect(0, 0, width, height);
  paintEdge(ctx, width, height);

  for (let floor = 0; floor < safeFloors; floor += 1) {
    const y = height - (floor + 1) * FLOOR_PX;
    const lit = (floor + safeVariant) % 3 === 0;
    ctx.fillStyle = "rgba(40, 36, 28, 0.16)";
    ctx.fillRect(0, y, width, 3);
    if (safeKind === "shophouse" && floor === 0) {
      if (plan.rainCover) paintRainCover(ctx, y);
      if (plan.paintedSign) paintSign(ctx, 8, y + 8, BAY_PX - 16, 14, SIGNS[safeVariant], plan.signDepth);
      if (plan.awning) paintAwning(ctx, y);
      paintShopBays(ctx, y, plan.shopBays || 2, FLOOR_PX);
    } else if (safeKind === "temple" && floor === 0) {
      ctx.fillStyle = "#8c2f2f";
      ctx.fillRect(6, y + 8, 12, FLOOR_PX - 10);
      ctx.fillRect(BAY_PX - 18, y + 8, 12, FLOOR_PX - 10);
      ctx.fillStyle = "#6b2a22";
      ctx.fillRect(34, y + 28, 28, FLOOR_PX - 30);
      ctx.fillStyle = "#e6c56a";
      ctx.fillRect(44, y + 40, 8, 12);
      ctx.strokeStyle = "#8c2f2f";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(38, y + 34);
      ctx.lineTo(58, y + 34);
      ctx.moveTo(48, y + 32);
      ctx.lineTo(48, y + FLOOR_PX - 6);
      ctx.stroke();
    } else if (safeKind === "mid" && floor === 0) {
      if (plan.rainCover) paintRainCover(ctx, y);
      ctx.fillStyle = "#8d9394";
      ctx.fillRect(0, y + FLOOR_PX - 8, BAY_PX, 8);
      if (plan.paintedSign) paintSign(ctx, 10, y + 8, BAY_PX - 20, 12, "#3d4c55", plan.signDepth);
      paintShopBays(ctx, y, 2, FLOOR_PX);
    } else if (safeKind === "civic" && floor === 0) {
      if (plan.rainCover) paintRainCover(ctx, y);
      if (plan.paintedSign) {
        ctx.fillStyle = "#3e5c49";
        ctx.fillRect(8, y + 8, BAY_PX - 16, 10);
      }
      paintWindow(ctx, 12, y + 24, 28, 36, false, safeVariant);
      ctx.fillStyle = "#3f4f46";
      ctx.fillRect(52, y + 30, 28, FLOOR_PX - 34);
      ctx.fillStyle = "#d7c48a";
      ctx.fillRect(60, y + 40, 12, 8);
    } else if (safeKind === "mid") {
      const paneW = 36;
      paintWindow(ctx, 8, y + 16, paneW, 34, lit, safeVariant);
      paintWindow(ctx, BAY_PX - 8 - paneW, y + 16, paneW, 34, (floor + safeVariant) % 2 === 0, safeVariant);
      ctx.fillStyle = "#9aa8b0";
      ctx.fillRect(6, y + 8, BAY_PX - 12, 5);
    } else if (safeKind === "temple") {
      ctx.fillStyle = "#8c2f2f";
      ctx.fillRect(8, y + 6, 8, FLOOR_PX - 12);
      ctx.fillRect(BAY_PX - 16, y + 6, 8, FLOOR_PX - 12);
      paintWindow(ctx, 28, y + 14, 40, 40, false, 0);
    } else if (safeKind === "shophouse") {
      const bays = plan.shopBays || 2;
      const gap = 8;
      const paneW = Math.floor((BAY_PX - 20 - gap * (bays - 1)) / bays);
      for (let bay = 0; bay < bays; bay += 1) {
        const x = 10 + bay * (paneW + gap);
        paintWindow(ctx, x, y + 14, paneW, 34, lit && bay === 0, safeVariant);
      }
    } else {
      paintWindow(ctx, 18, y + 10, 28, 32, lit, safeVariant);
      paintWindow(ctx, 52, y + 10, 28, 32, (floor + safeVariant) % 2 === 1, safeVariant);
      if (plan.balcony && floor % 2 === safeVariant % 2) paintBalcony(ctx, y);
      ctx.fillStyle = "rgba(255, 248, 236, 0.5)";
      ctx.fillRect(4, y + 4, width - 8, 3);
    }
    if (plan.acUnit && floor > 0 && floor % 2 === (safeVariant % 2)) paintAc(ctx, 78, y + 18);
    if (plan.pipe && floor === safeFloors - 1) paintPipe(ctx, 84, 8, Math.max(12, height - 16));
  }

  if (safeKind === "temple") {
    ctx.fillStyle = "#8d3b32";
    ctx.fillRect(0, 0, width, 8);
    ctx.fillStyle = "#e6c56a";
    ctx.fillRect(0, 8, width, 2);
  } else {
    ctx.fillStyle = "rgba(40, 36, 28, 0.28)";
    ctx.fillRect(0, 0, width, 5);
    ctx.fillStyle = "rgba(255, 248, 236, 0.2)";
    ctx.fillRect(0, 5, width, 2);
  }
  return { width, height, kind: safeKind, floors: safeFloors, variant: safeVariant, details: plan };
}

function recipeKey(kind, floors, variant, options = {}) {
  const safeKind = WALLS[kind] ? kind : "shophouse";
  const safeFloors = Math.max(1, Math.min(14, Math.round(floors) || 1));
  const safeVariant = Math.abs(variant | 0) % FACADE_25D_VARIANT_COUNT;
  const paintedSign = options.paintedSign !== false;
  const key = paintedSign
    ? `${safeKind}:${safeFloors}:${safeVariant}`
    : `${safeKind}:${safeFloors}:${safeVariant}:nosign`;
  return { kind: safeKind, floors: safeFloors, variant: safeVariant, paintedSign, key };
}

export function facadeAtlasCanvas(kind, floors, variant, options = {}) {
  const recipe = recipeKey(kind, floors, variant, options);
  const cached = canvasCache.get(recipe.key);
  if (cached) return cached;
  if (typeof document === "undefined" || !document.createElement) {
    throw new Error("2.5D 立面需要 canvas");
  }
  const canvas = document.createElement("canvas");
  canvas.width = BAY_PX;
  canvas.height = FLOOR_PX * recipe.floors;
  const ctx = canvas.getContext("2d", { alpha: false });
  paintFacadeAtlas(ctx, recipe.kind, recipe.floors, recipe.variant, { paintedSign: recipe.paintedSign });
  canvasCache.set(recipe.key, canvas);
  return canvas;
}

export function facadeAtlasTexture(kind, floors, variant, options = {}) {
  const recipe = recipeKey(kind, floors, variant, options);
  if (textureCache.has(recipe.key)) return textureCache.get(recipe.key);
  const texture = new THREE.CanvasTexture(facadeAtlasCanvas(recipe.kind, recipe.floors, recipe.variant, { paintedSign: recipe.paintedSign }));
  texture.name = `facade-25d-${recipe.key}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.userData = { kind: "facade-atlas-25d", recipe: recipe.key, estimated: true, procedural: true };
  textureCache.set(recipe.key, texture);
  return texture;
}

export function facadeAtlasMaterial(kind, floors, variant, options = {}) {
  const recipe = recipeKey(kind, floors, variant, options);
  if (materialCache.has(recipe.key)) return materialCache.get(recipe.key);
  const material = new THREE.MeshLambertMaterial({
    map: facadeAtlasTexture(recipe.kind, recipe.floors, recipe.variant, { paintedSign: recipe.paintedSign }),
    color: "#ffffff",
    side: THREE.DoubleSide,
  });
  material.name = `facade-25d-${recipe.key}`;
  material.userData = {
    kind: "facade-atlas-25d",
    recipe: recipe.key,
    paintedSign: recipe.paintedSign,
    estimated: true,
    procedural: true,
  };
  materialCache.set(recipe.key, material);
  return material;
}

export function clearFacadeAtlasCache() {
  for (const texture of textureCache.values()) texture.dispose?.();
  for (const material of materialCache.values()) material.dispose?.();
  canvasCache.clear();
  textureCache.clear();
  materialCache.clear();
}
