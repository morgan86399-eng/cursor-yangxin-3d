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
  shophouse: ["#efe2cf", "#e7d3b4", "#f4e7d6"],
  apt: ["#d9d3c8", "#cfc6b8", "#e4ddd2"],
  mid: ["#c5cdd4", "#b7c3cc", "#d5dde3"],
  temple: ["#f3e6cf", "#ead6b4", "#f7edd9"],
  civic: ["#e7e2d6", "#ddd6c8", "#efeae0"],
};
const SIGNS = ["#c44536", "#d89a1a", "#2f6f4e"];
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
  const variant = seed % 3;
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

function paintWindow(ctx, x, y, w, h, lit) {
  ctx.fillStyle = "#2c3134";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = lit ? "#f0d7a4" : "#7ea0b3";
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = "rgba(28, 34, 38, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 3);
  ctx.lineTo(x + w / 2, y + h - 3);
  ctx.moveTo(x + 3, y + h / 2);
  ctx.lineTo(x + w - 3, y + h / 2);
  ctx.stroke();
}

function paintSign(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255, 248, 230, 0.92)";
  const blocks = 3;
  const gap = 4;
  const bw = (w - gap * (blocks + 1)) / blocks;
  for (let i = 0; i < blocks; i += 1) {
    ctx.fillRect(x + gap + i * (bw + gap), y + 4, bw, h - 8);
  }
}

export function paintFacadeAtlas(ctx, kind, floors, variant) {
  const safeKind = WALLS[kind] ? kind : "shophouse";
  const safeFloors = Math.max(1, Math.min(14, Math.round(floors) || 1));
  const safeVariant = Math.abs(variant | 0) % 3;
  const width = BAY_PX;
  const height = FLOOR_PX * safeFloors;
  ctx.fillStyle = WALLS[safeKind][safeVariant];
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(40, 36, 28, 0.08)";
  ctx.fillRect(0, 0, 5, height);
  ctx.fillRect(width - 5, 0, 5, height);

  for (let floor = 0; floor < safeFloors; floor += 1) {
    const y = height - (floor + 1) * FLOOR_PX;
    const lit = (floor + safeVariant) % 3 === 0;
    if (safeKind === "shophouse" && floor === 0) {
      paintSign(ctx, 8, y + 6, BAY_PX - 16, 16, SIGNS[safeVariant]);
      ctx.fillStyle = "#5c4a3a";
      ctx.fillRect(0, y + 26, 10, FLOOR_PX - 26);
      ctx.fillRect(BAY_PX - 10, y + 26, 10, FLOOR_PX - 26);
      ctx.fillStyle = "#6e8c9e";
      ctx.fillRect(14, y + 30, BAY_PX - 28, FLOOR_PX - 38);
      ctx.fillStyle = "#3e2c24";
      ctx.fillRect(18, y + 40, 16, FLOOR_PX - 42);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(16, y + 32, 6, FLOOR_PX - 44);
    } else if (safeKind === "temple" && floor === 0) {
      ctx.fillStyle = "#8c2f2f";
      ctx.fillRect(6, y + 8, 12, FLOOR_PX - 10);
      ctx.fillRect(BAY_PX - 18, y + 8, 12, FLOOR_PX - 10);
      ctx.fillStyle = "#6b2a22";
      ctx.fillRect(34, y + 28, 28, FLOOR_PX - 30);
      ctx.fillStyle = "#e6c56a";
      ctx.fillRect(44, y + 40, 8, 12);
    } else if (safeKind === "mid" && floor === 0) {
      ctx.fillStyle = "#8d9394";
      ctx.fillRect(0, y + FLOOR_PX - 10, BAY_PX, 10);
      paintSign(ctx, 10, y + 8, BAY_PX - 20, 12, "#3d4c55");
      ctx.fillStyle = "#8eacbc";
      ctx.fillRect(8, y + 26, BAY_PX - 16, FLOOR_PX - 40);
    } else if (safeKind === "civic" && floor === 0) {
      ctx.fillStyle = "#3e5c49";
      ctx.fillRect(8, y + 8, BAY_PX - 16, 10);
      ctx.fillStyle = "#6d8494";
      ctx.fillRect(14, y + 26, BAY_PX - 28, FLOOR_PX - 34);
      ctx.fillStyle = "#3f4f46";
      ctx.fillRect(40, y + 36, 18, FLOOR_PX - 38);
    } else if (safeKind === "mid") {
      ctx.fillStyle = "#9aa8b0";
      ctx.fillRect(6, y + 8, BAY_PX - 12, 14);
      ctx.fillStyle = lit ? "#d5e4ea" : "#6f92a6";
      ctx.fillRect(6, y + 22, BAY_PX - 12, 36);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(8, y + 24, 10, 30);
    } else if (safeKind === "temple") {
      ctx.fillStyle = "#8c2f2f";
      ctx.fillRect(8, y + 6, 8, FLOOR_PX - 12);
      ctx.fillRect(BAY_PX - 16, y + 6, 8, FLOOR_PX - 12);
      paintWindow(ctx, 30, y + 16, 36, 40, false);
    } else {
      paintWindow(ctx, 22, y + 12, 52, 40, lit && safeKind === "apt");
      if (safeKind === "apt") {
        ctx.fillStyle = "#9aa3a8";
        ctx.fillRect(78, y + 22, 10, 16);
        ctx.fillStyle = "#b7aea2";
        ctx.fillRect(16, y + 54, 64, 4);
        ctx.fillStyle = "#8d8478";
        for (let rail = 20; rail < 78; rail += 8) ctx.fillRect(rail, y + 48, 2, 8);
      }
    }
  }

  if (safeKind === "temple") {
    ctx.fillStyle = "#8d3b32";
    ctx.fillRect(0, 0, width, 8);
  } else {
    ctx.fillStyle = "rgba(40, 36, 28, 0.18)";
    ctx.fillRect(0, 0, width, 4);
  }
  return { width, height, kind: safeKind, floors: safeFloors, variant: safeVariant };
}

function recipeKey(kind, floors, variant) {
  const safeKind = WALLS[kind] ? kind : "shophouse";
  const safeFloors = Math.max(1, Math.min(14, Math.round(floors) || 1));
  const safeVariant = Math.abs(variant | 0) % 3;
  return { kind: safeKind, floors: safeFloors, variant: safeVariant, key: `${safeKind}:${safeFloors}:${safeVariant}` };
}

export function facadeAtlasCanvas(kind, floors, variant) {
  const recipe = recipeKey(kind, floors, variant);
  const cached = canvasCache.get(recipe.key);
  if (cached) return cached;
  if (typeof document === "undefined" || !document.createElement) {
    throw new Error("2.5D 立面需要 canvas");
  }
  const canvas = document.createElement("canvas");
  canvas.width = BAY_PX;
  canvas.height = FLOOR_PX * recipe.floors;
  const ctx = canvas.getContext("2d", { alpha: false });
  paintFacadeAtlas(ctx, recipe.kind, recipe.floors, recipe.variant);
  canvasCache.set(recipe.key, canvas);
  return canvas;
}

export function facadeAtlasTexture(kind, floors, variant) {
  const recipe = recipeKey(kind, floors, variant);
  if (textureCache.has(recipe.key)) return textureCache.get(recipe.key);
  const texture = new THREE.CanvasTexture(facadeAtlasCanvas(recipe.kind, recipe.floors, recipe.variant));
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

export function facadeAtlasMaterial(kind, floors, variant) {
  const recipe = recipeKey(kind, floors, variant);
  if (materialCache.has(recipe.key)) return materialCache.get(recipe.key);
  const material = new THREE.MeshLambertMaterial({
    map: facadeAtlasTexture(recipe.kind, recipe.floors, recipe.variant),
    color: "#ffffff",
    side: THREE.DoubleSide,
  });
  material.name = `facade-25d-${recipe.key}`;
  material.userData = {
    kind: "facade-atlas-25d",
    recipe: recipe.key,
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
