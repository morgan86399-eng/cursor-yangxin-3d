import * as THREE from "three";
import { brandMeta } from "./brands.js";

const font = "bold 42px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
const fontSmall = "28px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";

const cache = new Map();

export function hash01(x, y = 0) {
  if (typeof x === "string") {
    let h = 0;
    for (let i = 0; i < x.length; i++) h = (h * 33 + x.charCodeAt(i)) >>> 0;
    x = h;
  }
  const n = Math.sin(Number(x) * 127.1 + Number(y) * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function cached(key, make) {
  let tex = cache.get(key);
  if (!tex) {
    tex = make();
    cache.set(key, tex);
  }
  return tex;
}

function toCanvasTex(canvas, { wrap = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function fillNoise(ctx, w, h, hex, amp = 18) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash01(x * 0.63, y * 0.71);
      const d = (n - 0.5) * amp;
      const i = (y * w + x) * 4;
      data[i] = Math.max(0, Math.min(255, data[i] + d));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + d));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + d));
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const HOUSE_PALETTE = [
  "#e6d9c6",
  "#d7c3a5",
  "#c4b7a2",
  "#eee4d4",
  "#d9cbb8",
  "#c9b496",
  "#b9c3b0",
  "#cfd6c8",
  "#dcc6b0",
  "#e2b9a4",
  "#c7a888",
  "#aeb6ae",
  "#9aa194",
  "#8f8a82",
  "#b8b3a8",
  "#d2a07a",
  "#c48b74",
  "#a67c5d",
  "#8b6e55",
  "#b5523a",
  "#c4a35a",
  "#8aa090",
  "#6e8b86",
  "#7a9aa8",
  "#d8d2c6",
  "#cfc4b2",
];

export const FACADE_STYLES = [
  "paint",
  "mosaic",
  "terrazzo",
  "brick",
  "tile",
  "greenMosaic",
  "pinkTile",
  "stone",
  "concrete",
  "metal",
  "arcade",
  "temple",
];

export function paletteColor(id, kind) {
  if (kind === "temple") return "#d2b48c";
  if (kind === "civic") return "#9aa3ab";
  if (kind === "market") return "#cbb79a";
  if (kind === "shop") return "#d4a574";
  let h = 0;
  const s = String(id || "x");
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return HOUSE_PALETTE[h % HOUSE_PALETTE.length];
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseCssHex(hex) {
  const s = String(hex || "").replace("#", "");
  if (s.length !== 6) return { r: 200, g: 190, b: 176 };
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function cssHex(r, g, b) {
  const h = (n) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgb(r, g, b, a) {
  if (a == null) return `rgb(${clampByte(r)},${clampByte(g)},${clampByte(b)})`;
  return `rgba(${clampByte(r)},${clampByte(g)},${clampByte(b)},${a})`;
}

function shiftHex(hex, d) {
  const p = parseCssHex(hex);
  return cssHex(p.r + d, p.g + d * 0.92, p.b + d * 0.82);
}

export function classifyRoof(hex) {
  if (!hex) return { kind: "unknown", hex: "" };
  const p = parseCssHex(hex);
  if (p.b > p.r + 16 && p.b > p.g + 6) return { kind: "blueMetal", hex };
  if (p.r > p.g + 22 && p.r > p.b + 18) return { kind: "redTile", hex };
  if (p.g > p.r + 10 && p.g > p.b + 6) return { kind: "green", hex };
  const lum = (p.r + p.g + p.b) / 3;
  if (lum < 72) return { kind: "dark", hex };
  if (lum > 188) return { kind: "light", hex };
  return { kind: "concrete", hex };
}

export function classifyFacade(b, extra = {}) {
  const id = String(b?.id || extra.id || "x");
  const kind = extra.kind || "house";
  const isShop = Boolean(extra.isShop);
  const area = Number(b?.area || extra.area || 80);
  const distRoad = Number.isFinite(extra.distRoad) ? extra.distRoad : 12;
  const roof = classifyRoof(extra.roofHex || "");
  const layout = Math.floor(hash01(id, 3) * 32);
  const wallHex = extra.color || HOUSE_PALETTE[Math.floor(hash01(id, 5) * HOUSE_PALETTE.length)];

  if (kind === "temple") {
    return { style: "temple", wallHex: extra.color || "#d2b48c", layout, metalCap: false, arcade: false, balcony: false, roof };
  }
  if (kind === "civic") {
    return { style: "concrete", wallHex: extra.color || "#9aa3ab", layout, metalCap: false, arcade: false, balcony: false, roof };
  }
  if (kind === "market") {
    return { style: "tile", wallHex: extra.color || "#cbb79a", layout, metalCap: false, arcade: false, balcony: false, roof };
  }
  if (kind === "apartment" || kind === "commercial") {
    return {
      style: kind === "commercial" ? "tile" : "concrete",
      wallHex: extra.color || (kind === "commercial" ? "#cbb79a" : "#d7d2c8"),
      layout,
      metalCap: false,
      arcade: false,
      balcony: false,
      roof,
    };
  }
  if (isShop) {
    return { style: "arcade", wallHex: extra.color || "#d4a574", layout: 1, metalCap: false, arcade: true, balcony: false, roof };
  }

  const s = hash01(id, 4);
  let style;
  if (roof.kind === "blueMetal" && s > 0.38) style = "metal";
  else if (s < 0.11) style = "mosaic";
  else if (s < 0.2) style = "terrazzo";
  else if (s < 0.29) style = "brick";
  else if (s < 0.38) style = "tile";
  else if (s < 0.47) style = "greenMosaic";
  else if (s < 0.55) style = "pinkTile";
  else if (s < 0.63) style = "stone";
  else if (s < 0.72) style = "concrete";
  else if (s < 0.8) style = "metal";
  else style = "paint";

  const streetHouse = distRoad < 8 && area < 150;
  const arcade = streetHouse && hash01(id, 7) > 0.5;
  const balcony = !arcade && streetHouse && hash01(id, 8) > 0.42;
  const metalCap = area < 240 && (roof.kind === "blueMetal" || hash01(id, 6) > 0.72);
  return { style: arcade ? "arcade" : style, wallHex, layout, metalCap, arcade, balcony, roof };
}

function drawMosaic(ctx, w, h, hex, seed, tile) {
  const base = parseCssHex(hex);
  const img = ctx.createImageData(w, h);
  const groutR = 122;
  const groutG = 118;
  const groutB = 112;
  for (let y = 0; y < h; y++) {
    const ty = Math.floor(y / tile);
    const gy = y % tile === 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (gy || x % tile === 0) {
        img.data[i] = groutR;
        img.data[i + 1] = groutG;
        img.data[i + 2] = groutB;
        img.data[i + 3] = 255;
        continue;
      }
      const n = hash01((Math.floor(x / tile) + seed) * 13, ty * 7 + seed);
      const d = (n - 0.5) * 34;
      img.data[i] = clampByte(base.r + d);
      img.data[i + 1] = clampByte(base.g + d * 0.9);
      img.data[i + 2] = clampByte(base.b + d * 0.75);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawTerrazzo(ctx, w, h, hex, seed) {
  const base = parseCssHex(hex);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = hash01(x * 0.9 + seed, y * 1.1);
      const pebble = hash01(x * 2.2, y * 1.8 + seed) > 0.82;
      const d = (n - 0.5) * 22 + (pebble ? 28 : 0);
      const i = (y * w + x) * 4;
      img.data[i] = clampByte(base.r + d);
      img.data[i + 1] = clampByte(base.g + d * 0.92);
      img.data[i + 2] = clampByte(base.b + d * 0.8);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawBrick(ctx, w, h, hex, seed) {
  const base = parseCssHex(hex);
  ctx.fillStyle = "#6b5a52";
  ctx.fillRect(0, 0, w, h);
  const bh = 15;
  const bw = 32;
  let row = 0;
  for (let y = 0; y < h; y += bh) {
    const off = (row % 2) * (bw / 2);
    for (let x = -bw; x < w; x += bw) {
      const n = hash01(x + seed, y);
      ctx.fillStyle = rgb(base.r + (n - 0.5) * 26, base.g + (n - 0.5) * 18, base.b + (n - 0.5) * 12);
      ctx.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
    }
    row += 1;
  }
}

function drawLargeTile(ctx, w, h, hex, seed, tw, th) {
  const base = parseCssHex(hex);
  ctx.fillStyle = "#8a8680";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += th) {
    for (let x = 0; x < w; x += tw) {
      const n = hash01(x + seed, y);
      ctx.fillStyle = rgb(base.r + (n - 0.5) * 16, base.g + (n - 0.5) * 14, base.b + (n - 0.5) * 12);
      ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(x + 2, y + 2, tw - 6, 3);
    }
  }
}

function drawStone(ctx, w, h, hex, seed) {
  fillNoise(ctx, w, h, hex, 18);
  ctx.strokeStyle = "rgba(50,46,42,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const x = hash01(seed, i) * w;
    const y = hash01(seed, i + 40) * h;
    const bw = 28 + hash01(seed, i + 80) * 70;
    const bh = 18 + hash01(seed, i + 120) * 36;
    ctx.strokeRect(x, y, bw, bh);
  }
}

function drawCorrugated(ctx, w, h, hex, seed) {
  const base = parseCssHex(hex);
  for (let x = 0; x < w; x++) {
    const wave = Math.sin(x / 5.2 + seed) * 0.5 + 0.5;
    const rust = hash01(x, seed + 3) > 0.975 ? 26 : 0;
    const v = -16 + wave * 34 + rust;
    ctx.fillStyle = rgb(base.r + v, base.g + v * 0.88, base.b + v * 0.62);
    ctx.fillRect(x, 0, 1, h);
  }
  ctx.fillStyle = "rgba(40,30,20,0.12)";
  for (let i = 0; i < 6; i++) {
    const x = hash01(seed, i + 9) * w;
    ctx.fillRect(x, 0, 6 + hash01(seed, i) * 10, h);
  }
}

function drawPaint(ctx, w, h, hex, seed) {
  fillNoise(ctx, w, h, hex, 20);
  ctx.fillStyle = "rgba(40,36,32,0.08)";
  for (let i = 0; i < 18; i++) {
    const x = hash01(seed, i + 2) * w;
    ctx.fillRect(x, 0, 2 + hash01(seed, i) * 4, h);
  }
  ctx.strokeStyle = "rgba(80,70,60,0.12)";
  ctx.lineWidth = 1;
  for (let y = 18; y < h; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function paintWall(ctx, w, h, hex, seed, style) {
  if (style === "mosaic") drawMosaic(ctx, w, h, hex, seed, 6);
  else if (style === "greenMosaic") drawMosaic(ctx, w, h, shiftHex(hex, -18), seed, 5);
  else if (style === "pinkTile") drawLargeTile(ctx, w, h, hex, seed, 18, 18);
  else if (style === "tile") drawLargeTile(ctx, w, h, hex, seed, 36, 14);
  else if (style === "terrazzo") drawTerrazzo(ctx, w, h, hex, seed);
  else if (style === "brick") drawBrick(ctx, w, h, hex, seed);
  else if (style === "stone") drawStone(ctx, w, h, hex, seed);
  else if (style === "metal") drawCorrugated(ctx, w, h, hex, seed);
  else if (style === "concrete") fillNoise(ctx, w, h, hex, 14);
  else if (style === "arcade") drawLargeTile(ctx, w, h, hex, seed, 22, 22);
  else drawPaint(ctx, w, h, hex, seed);
}

function drawTaiwanWindow(ctx, x, y, bw, bh, seed, opts = {}) {
  const { bars = true, ac = false, lit = false, split = true } = opts;
  ctx.fillStyle = "#d5dbde";
  ctx.fillRect(x - 5, y - 5, bw + 10, bh + 10);
  ctx.fillStyle = "#2f363a";
  ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = lit ? "rgba(214, 204, 150, 0.38)" : "rgba(118, 138, 146, 0.48)";
  ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x + 2, y + 2, bw - 4, 5);
  if (split) {
    ctx.fillStyle = "#cfd4d6";
    ctx.fillRect(x + bw / 2 - 2, y, 4, bh);
    ctx.fillRect(x, y + bh * 0.5 - 2, bw, 4);
  }
  if (bars) {
    ctx.strokeStyle = "rgba(36,38,40,0.78)";
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (bw * i) / 5, y);
      ctx.lineTo(x + (bw * i) / 5, y + bh);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y + (bh * i) / 4);
      ctx.lineTo(x + bw, y + (bh * i) / 4);
      ctx.stroke();
    }
  }
  if (ac) {
    ctx.fillStyle = "#c5ccd0";
    ctx.fillRect(x + bw + 6, y + bh - 26, 42, 24);
    ctx.fillStyle = "#7c8286";
    ctx.fillRect(x + bw + 8, y + bh - 30, 38, 5);
    ctx.fillStyle = "#9aa0a4";
    for (let i = 0; i < 5; i++) ctx.fillRect(x + bw + 10, y + bh - 20 + i * 3, 34, 1.5);
  }
}

function drawBalcony(ctx, x, y, bw, bh) {
  ctx.fillStyle = "rgba(28,30,32,0.55)";
  ctx.fillRect(x, y + bh * 0.42, bw, bh * 0.58);
  ctx.fillStyle = "#c8c2b6";
  ctx.fillRect(x - 4, y + bh * 0.5, bw + 8, 8);
  ctx.fillStyle = "#8a9094";
  ctx.fillRect(x - 4, y + bh * 0.28, bw + 8, 5);
  for (let i = 0; i < 9; i++) {
    ctx.fillRect(x + 6 + i * ((bw - 12) / 8), y + bh * 0.28, 3, bh * 0.24);
  }
}

function drawShutter(ctx, x, y, bw, bh, seed) {
  const tones = ["#5a5e62", "#6a6258", "#4a5850", "#5c5048", "#4a4e56", "#6e6a62"];
  const base = tones[Math.floor(hash01(seed, 1) * tones.length)];
  ctx.fillStyle = base;
  ctx.fillRect(x, y, bw, bh);
  for (let yy = y + 4; yy < y + bh - 6; yy += 7) {
    ctx.fillStyle = yy % 14 < 7 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.2)";
    ctx.fillRect(x + 4, yy, bw - 8, 4);
  }
  ctx.fillStyle = "rgba(20,20,22,0.48)";
  ctx.fillRect(x + bw / 2 - 20, y + bh * 0.42, 40, 32);
}

function drawPipe(ctx, w, h, seed) {
  const x = 10 + hash01(seed, 19) * 18;
  ctx.fillStyle = "#8b9094";
  ctx.fillRect(x, 0, 7, h);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x + 1, 0, 2, h);
}

export function makeSignTexture(name, sub, color) {
  return cached(`sign:${name}|${sub}|${color}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(0, 0, 768, 256);
    ctx.fillStyle = color || "#3a4a6b";
    ctx.fillRect(14, 14, 740, 228);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(28, 28, 712, 18);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(28, 210, 712, 18);
    ctx.strokeStyle = "rgba(255, 232, 180, 0.55)";
    ctx.lineWidth = 5;
    ctx.strokeRect(36, 36, 696, 184);
    ctx.fillStyle = "#fff8ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const title = name.length > 10 ? name.slice(0, 10) : name;
    ctx.font = font;
    ctx.fillText(title, 384, sub ? 108 : 128);
    if (sub) {
      ctx.font = fontSmall;
      ctx.fillStyle = "rgba(255,248,234,0.86)";
      ctx.fillText(sub, 384, 178);
    }
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeStreetBannerTexture(text, bg = "#1b7a3c") {
  return cached(`banner-v1:${text}:${bg}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 220);
    ctx.strokeStyle = "#e6c15a";
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, 996, 192);
    ctx.fillStyle = "#f7f3df";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 72px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText(text, 512, 118);
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

// 46 號一樓牌面造型仍是推估；紋理比例跟隨牌體，避免店名字形被拉寬。
export function makeYashanyuanFasciaTexture(aspect) {
  const height = Math.round(1200 / aspect);
  return cached(`yashanyuan-wide-v1:${height}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2f4f2c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#4d7a45";
    ctx.lineWidth = 12;
    ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
    ctx.fillStyle = "#f4f7e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 95px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText("雅善圓蔬食館", canvas.width / 2, canvas.height / 2);
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeYangxinPlaqueTexture() {
  return cached("yangxin-plaque-v3", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(0, 0, 640, 200);
    ctx.strokeStyle = "#6b4a2c";
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, 620, 180);
    ctx.fillStyle = "#6b3a28";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 76px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText("桃園養心推拿", 320, 86);
    ctx.font = "36px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText("2樓", 320, 148);
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeBrownTileTexture() {
  return cached("brown-tile-v2", () => {
    const w = 256;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#786957";
    ctx.fillRect(0, 0, w, h);
    const shades = ["#a9977e", "#aa9984", "#a3927c", "#b1a08a", "#a79680"];
    for (let y = 0; y < h; y += 10) {
      for (let x = 0; x < w; x += 12) {
        ctx.fillStyle = shades[Math.floor(hash01(x, y) * shades.length)];
        ctx.fillRect(x + 1, y + 1, 11, 9);
        ctx.fillStyle = "rgba(255,248,227,0.08)";
        ctx.fillRect(x + 2, y + 2, 9, 1);
      }
    }
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makePaleCladdingTexture() {
  return cached("pale-cladding-v1", () => {
    const w = 256;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#b7c5ce";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#8ea3ae";
    for (let x = 0; x < w; x += 14) ctx.fillRect(x, 0, 4, h);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeNo46UpperTexture() {
  return cached("no46-upper-v1", () => {
    const w = 256;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    fillNoise(ctx, w, h, "#ddcbb1", 9);
    ctx.fillStyle = "rgba(103, 80, 57, 0.13)";
    for (let x = 0; x < w; x += 48) ctx.fillRect(x, 0, 2, h);
    ctx.fillStyle = "rgba(255, 248, 229, 0.22)";
    for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 3);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeVerticalSignTexture(name, color) {
  return cached(`vsign:${name}|${color}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 768;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(0, 0, 220, 768);
    ctx.fillStyle = color || "#8b2c24";
    ctx.fillRect(12, 12, 196, 744);
    ctx.strokeStyle = "rgba(255,220,140,0.5)";
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, 172, 720);
    const chars = name.replace(/\s/g, "").slice(0, 8).split("");
    ctx.fillStyle = "#fff8ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 64px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    const gap = 680 / (chars.length + 1);
    chars.forEach((ch, i) => ctx.fillText(ch, 110, 50 + gap * (i + 1)));
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makePavementDetail() {
  return cached("pavement-v2", () => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n =
          hash01(x, y) * 0.42 +
          hash01(x * 0.27, y * 0.27) * 0.28 +
          hash01(x * 0.08, y * 0.08) * 0.18 +
          hash01(x * 0.02, y * 0.02) * 0.12;
        const stone = hash01(x * 1.7, y * 1.9) > 0.82 ? 18 : 0;
        const v = Math.round(118 + n * 110 + stone);
        const i = (y * size + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v - 2;
        img.data[i + 2] = v - 4;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = "rgba(36,32,28,0.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.moveTo(hash01(i, 1) * size, hash01(i, 2) * size);
      ctx.quadraticCurveTo(
        hash01(i, 5) * size,
        hash01(i, 6) * size,
        hash01(i, 3) * size,
        hash01(i, 4) * size
      );
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    return tex;
  });
}

export function makeMassingTexture(kind = "apartment") {
  const commercial = kind === "commercial";
  return cached(commercial ? "massing-commercial-v2" : "massing-apartment-v2", () => {
    const w = 256;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = commercial ? "#cbb79a" : "#d7d2c8";
    ctx.fillRect(0, 0, w, h);
    const floors = 4;
    const band = h / floors;
    for (let i = 0; i < floors; i++) {
      const y = i * band;
      ctx.fillStyle = commercial ? "rgba(92, 68, 42, 0.38)" : "rgba(72, 66, 58, 0.32)";
      ctx.fillRect(0, y, w, 7);
      ctx.fillStyle = "rgba(255, 250, 244, 0.42)";
      ctx.fillRect(0, y + 7, w, 2);
      ctx.fillStyle = "#6e8794";
      ctx.fillRect(36, y + 22, 52, 34);
      ctx.fillRect(168, y + 22, 52, 34);
      ctx.strokeStyle = "#f7f1e6";
      ctx.lineWidth = 3;
      ctx.strokeRect(36, y + 22, 52, 34);
      ctx.strokeRect(168, y + 22, 52, 34);
    }
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeUpperFloorTexture(hex, seed = 0, kind = "house", style = "paint", drawOpenings = true) {
  return cached(`upper3:${hex}:${seed}:${kind}:${style}:${drawOpenings}`, () => {
    const w = 256;
    const h = 160;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    paintWall(ctx, w, h, hex, seed, kind === "temple" ? "temple" : style);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(0, h - 10, w, 10);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(0, 0, w, 6);

    // Near-field facades place one set of physical windows in front of this wall.
    // Drawing another unrelated window layout into the cladding causes ghost windows.
    if (!drawOpenings) return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });

    if (kind === "temple") {
      ctx.fillStyle = "rgba(140, 36, 28, 0.55)";
      ctx.fillRect(10, 10, 16, h - 20);
      ctx.fillRect(w - 26, 10, 16, h - 20);
      drawTaiwanWindow(ctx, 38, 28, 70, 96, seed, { bars: false, split: true });
      drawTaiwanWindow(ctx, 148, 28, 70, 96, seed + 1, { bars: false, split: true });
    } else if (style === "metal") {
      drawTaiwanWindow(ctx, 28, 32, 54, 70, seed, { bars: false, split: false, ac: false });
      if (hash01(seed, 3) > 0.4) drawTaiwanWindow(ctx, 150, 32, 54, 70, seed + 2, { bars: false, split: false });
    } else {
      const layout = seed % 8;
      const bars = hash01(seed, 11) > 0.22;
      const lit = hash01(seed, 8) > 0.86;
      if (layout === 0) {
        drawBalcony(ctx, 36, 22, 184, 118);
      } else if (layout === 1) {
        drawTaiwanWindow(ctx, 18, 28, 88, 98, seed, { bars, ac: true, lit });
        drawTaiwanWindow(ctx, 140, 28, 88, 98, seed + 1, { bars, lit: hash01(seed, 9) > 0.88 });
      } else if (layout === 2) {
        drawTaiwanWindow(ctx, 58, 24, 140, 108, seed, { bars, ac: true, lit, split: true });
      } else if (layout === 3) {
        drawTaiwanWindow(ctx, 14, 30, 64, 90, seed, { bars, lit });
        drawTaiwanWindow(ctx, 96, 30, 64, 90, seed + 1, { bars, ac: true });
        drawTaiwanWindow(ctx, 178, 30, 64, 90, seed + 2, { bars });
      } else if (layout === 4) {
        drawBalcony(ctx, 14, 26, 110, 110);
        drawTaiwanWindow(ctx, 140, 30, 92, 96, seed, { bars, ac: true, lit });
      } else if (layout === 5) {
        drawTaiwanWindow(ctx, 20, 32, 96, 88, seed, { bars: false, split: true, ac: true });
        drawTaiwanWindow(ctx, 140, 32, 96, 88, seed + 3, { bars, lit });
      } else if (layout === 6) {
        drawTaiwanWindow(ctx, 16, 18, 70, 58, seed, { bars, split: true });
        drawTaiwanWindow(ctx, 96, 18, 70, 58, seed + 1, { bars });
        drawTaiwanWindow(ctx, 176, 18, 58, 58, seed + 2, { bars: false, ac: true });
        drawTaiwanWindow(ctx, 16, 88, 70, 52, seed + 4, { bars });
        drawTaiwanWindow(ctx, 96, 88, 70, 52, seed + 5, { bars, lit });
      } else {
        drawTaiwanWindow(ctx, 16, 28, 100, 100, seed, { bars, ac: hash01(seed, 10) > 0.45, lit });
        drawBalcony(ctx, 132, 32, 108, 100);
      }
      if (hash01(seed, 17) > 0.55) drawPipe(ctx, w, h, seed);
    }
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeStorefrontTexture(hex, seed = 0, kind = "house", style = "paint", drawStorefront = true) {
  return cached(`store3:${hex}:${seed}:${kind}:${style}:${drawStorefront}`, () => {
    const w = 256;
    const h = 192;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    paintWall(ctx, w, h, hex, seed, kind === "temple" ? "temple" : style);

    // A street-front shop texture repeated around an entire footprint paints
    // false doors and fascia into side-wall gaps. Keep only the cladding there.
    if (!drawStorefront) return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });

    ctx.fillStyle = "rgba(28,24,20,0.78)";
    ctx.fillRect(0, 0, w, 34);
    ctx.fillStyle = "rgba(255,220,150,0.16)";
    ctx.fillRect(12, 8, w - 24, 18);

    if (kind === "temple") {
      ctx.fillStyle = "#7a241c";
      ctx.fillRect(0, 34, w, h - 34);
      ctx.fillStyle = "#e8d5a8";
      ctx.fillRect(w / 2 - 54, 64, 108, h - 88);
      ctx.fillStyle = "#3a2018";
      ctx.fillRect(w / 2 - 48, 72, 44, h - 104);
      ctx.fillRect(w / 2 + 4, 72, 44, h - 104);
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(22, 34, 20, h - 52);
      ctx.fillRect(w - 42, 34, 20, h - 52);
    } else {
      const colW = style === "arcade" ? 28 : 22;
      ctx.fillStyle = shiftHex(hex, -22);
      ctx.fillRect(0, 34, colW, h - 34);
      ctx.fillRect(w - colW, 34, colW, h - 34);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(6, 42, 10, h - 52);
      ctx.fillRect(w - 16, 42, 10, h - 52);

      if (hash01(seed, 12) > 0.34 && style !== "metal") {
        const signColors = ["#8b2c24", "#2c4a7a", "#2d6a4f", "#c45c26", "#1f1f22", "#6b3a2a"];
        ctx.fillStyle = signColors[seed % signColors.length];
        ctx.fillRect(colW + 8, 40, w - colW * 2 - 16, 28);
      }

      const glass = hash01(seed, 2) > 0.72;
      const innerX = colW + 6;
      const innerW = w - innerX * 2;
      const innerY = 74;
      const innerH = h - innerY - 28;
      if (glass) {
        ctx.fillStyle = "rgba(28, 32, 36, 0.94)";
        ctx.fillRect(innerX, innerY, innerW, innerH);
        ctx.fillStyle = "rgba(168, 196, 206, 0.38)";
        ctx.fillRect(innerX + 8, innerY + 8, innerW - 16, innerH - 48);
        ctx.fillStyle = "rgba(28,26,24,0.9)";
        ctx.fillRect(w / 2 - 22, innerY + 18, 44, innerH - 70);
      } else {
        drawShutter(ctx, innerX, innerY, innerW, innerH, seed);
      }
      ctx.fillStyle = "rgba(90, 86, 78, 0.95)";
      ctx.fillRect(innerX, h - 26, innerW, 18);
      if (style === "arcade") {
        ctx.fillStyle = "rgba(20,18,16,0.35)";
        ctx.fillRect(0, 34, w, 16);
      }
    }
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeMetalCapTexture(hex, seed = 0) {
  const metalHex = shiftHex(hex, -40);
  return cached(`cap1:${metalHex}:${seed}`, () => {
    const w = 256;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    drawCorrugated(ctx, w, h, metalHex, seed);
    drawTaiwanWindow(ctx, 40, 28, 54, 54, seed, { bars: false, split: false });
    if (hash01(seed, 4) > 0.4) drawTaiwanWindow(ctx, 150, 28, 54, 54, seed + 2, { bars: false, split: false });
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function hexToCss(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export function makeZebraTexture() {
  return cached("zebra-v3", () => {
    const w = 512;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    const bars = 10;
    const bar = w / bars;
    for (let i = 0; i < bars; i++) {
      if (i % 2) continue;
      ctx.fillStyle = "#f8f4ea";
      ctx.fillRect(i * bar + 4, 8, bar - 8, h - 16);
    }
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeShopSignTexture(shop) {
  const { brand, color, fascia, ink } = brandMeta(shop);
  const name = shop.name || "";
  const sub = shop.sub || "";
  return cached(`sign5:${brand}:${name}:${sub}:${color}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1c1a18";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (brand === "seven") {
      ctx.fillStyle = "#007548";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#e87722";
      ctx.fillRect(0, 0, 1024, 70);
      ctx.fillStyle = "#d0121a";
      ctx.fillRect(0, 186, 1024, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 96px 'Noto Sans TC','Arial Black',sans-serif";
      ctx.fillText("7-ELEVEN", 512, 128);
      ctx.font = "28px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "全鎮店", 512, 168);
    } else if (brand === "simplemart") {
      ctx.fillStyle = "#f0c400";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = "#d91e18";
      ctx.lineWidth = 14;
      ctx.strokeRect(18, 18, 988, 220);
      ctx.fillStyle = "#d91e18";
      ctx.font = "bold 92px 'Noto Sans TC',sans-serif";
      ctx.fillText("美廉社", 512, 118);
      ctx.font = "36px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "桃園鎮撫店", 512, 178);
    } else if (brand === "familymart") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#00a0e9";
      ctx.fillRect(0, 0, 1024, 36);
      ctx.fillStyle = "#009845";
      ctx.fillRect(0, 220, 1024, 36);
      ctx.fillStyle = "#009845";
      ctx.font = "bold 84px 'Noto Sans TC',sans-serif";
      ctx.fillText("FamilyMart", 512, 128);
      ctx.fillStyle = "#00a0e9";
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "全家便利商店", 512, 178);
    } else if (brand === "hilife") {
      ctx.fillStyle = "#007548";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#e87722";
      ctx.fillRect(0, 0, 1024, 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 88px 'Noto Sans TC',sans-serif";
      ctx.fillText("Hi-Life", 512, 128);
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText("萊爾富", 512, 178);
    } else if (brand === "pxmart") {
      ctx.fillStyle = "#e85d04";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 78px 'Noto Sans TC',sans-serif";
      ctx.fillText("全聯福利中心", 512, 118);
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "桃園東國店", 512, 178);
    } else if (brand === "shopee") {
      ctx.fillStyle = "#ee4d2d";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 72px 'Noto Sans TC',sans-serif";
      ctx.fillText("蝦皮店到店", 512, 118);
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "鎮撫街52號", 512, 178);
    } else if (brand === "yashanyuan") {
      ctx.fillStyle = "#2f4f2c";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#4d7a45";
      ctx.fillRect(18, 18, 988, 220);
      ctx.fillStyle = "#f4f7e8";
      ctx.font = "bold 72px 'Noto Sans TC',sans-serif";
      ctx.fillText("雅善圓蔬食館", 512, 112);
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "鎮撫街46號1樓", 512, 178);
    } else if (brand === "yangxin") {
      ctx.fillStyle = "#6b4a2c";
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = "#c4894a";
      ctx.fillRect(18, 18, 988, 220);
      ctx.fillStyle = "#fff6e4";
      ctx.font = "bold 78px 'Noto Sans TC',sans-serif";
      ctx.fillText("桃園養心推拿", 512, 112);
      ctx.font = "32px 'Noto Sans TC',sans-serif";
      ctx.fillText(sub || "鎮撫街46號2樓", 512, 178);
    } else {
      ctx.fillStyle = fascia || color || "#3a4a6b";
      ctx.fillRect(16, 16, 992, 224);
      ctx.strokeStyle = "rgba(255, 232, 180, 0.55)";
      ctx.lineWidth = 6;
      ctx.strokeRect(40, 36, 944, 184);
      ctx.fillStyle = ink || "#fff8ea";
      const title = name;
      const size = title.length > 16 ? 36 : title.length > 12 ? 42 : title.length > 9 ? 48 : 54;
      ctx.font = `bold ${size}px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif`;
      ctx.fillText(title, 512, sub ? 108 : 128);
      if (sub) {
        ctx.font = "32px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
        ctx.fillStyle = "rgba(255,248,234,0.9)";
        ctx.fillText(sub, 512, 178);
      }
    }
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeNamedStorefrontTexture(name, hex, seed = 0, kind = "house") {
  return cached(`named-store2:${name}:${hex}:${seed}:${kind}`, () => {
    const w = 512;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    paintWall(ctx, w, h, hex, seed, kind === "restaurant" || kind === "cafe" ? "arcade" : "paint");
    ctx.fillStyle = "rgba(20,16,12,0.92)";
    ctx.fillRect(0, 0, w, 58);
    ctx.fillStyle = hex;
    ctx.fillRect(12, 10, w - 24, 38);
    ctx.fillStyle = "#fff8ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 28px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText(name.length > 10 ? name.slice(0, 10) : name, w / 2, 30);
    const colW = 28;
    const innerX = colW + 8;
    const innerW = w - innerX * 2;
    const innerY = 70;
    const innerH = h - innerY - 28;
    const glass = kind === "restaurant" || kind === "cafe" || kind === "pharmacy" || kind === "hair" || hash01(seed, 2) > 0.55;
    ctx.fillStyle = shiftHex(hex, -28);
    ctx.fillRect(0, 58, colW, h - 58);
    ctx.fillRect(w - colW, 58, colW, h - 58);
    if (glass) {
      ctx.fillStyle = "rgba(24, 28, 32, 0.96)";
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.fillStyle = "rgba(168, 196, 206, 0.42)";
      ctx.fillRect(innerX + 10, innerY + 10, innerW / 2 - 18, innerH - 48);
      ctx.fillRect(w / 2 + 8, innerY + 10, innerW / 2 - 18, innerH - 48);
      ctx.fillStyle = "rgba(28,26,24,0.92)";
      ctx.fillRect(w / 2 - 16, innerY + 18, 32, innerH - 56);
    } else {
      drawShutter(ctx, innerX, innerY, innerW, innerH, seed);
    }
    ctx.fillStyle = "rgba(90, 86, 78, 0.95)";
    ctx.fillRect(innerX, h - 26, innerW, 18);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

function drawShelfInterior(ctx, x, y, w, h) {
  ctx.fillStyle = "#14181c";
  ctx.fillRect(x, y, w, h);
  for (let row = 0; row < 4; row++) {
    const yy = y + 12 + row * ((h - 24) / 4);
    ctx.fillStyle = "rgba(90, 70, 50, 0.85)";
    ctx.fillRect(x + 8, yy + 18, w - 16, 6);
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = ["#c45c26", "#2d6a4f", "#d4a017", "#8b2c24", "#3a6aa8"][(row + k) % 5];
      ctx.fillRect(x + 14 + k * ((w - 28) / 7), yy + 2, 16, 16);
    }
  }
  ctx.fillStyle = "rgba(120, 190, 210, 0.16)";
  ctx.fillRect(x, y, w, 10);
}

export function makeBrandStorefrontTexture(brand, seed = 0) {
  return cached(`brand-store2:${brand}:${seed}`, () => {
    const w = 768;
    const h = 384;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (brand === "seven") {
      ctx.fillStyle = "#efefe8";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e87722";
      ctx.fillRect(0, 0, w, 42);
      ctx.fillStyle = "#007548";
      ctx.fillRect(0, 42, w, 70);
      ctx.fillStyle = "#d0121a";
      ctx.fillRect(0, 112, w, 14);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 52px 'Noto Sans TC','Arial Black',sans-serif";
      ctx.fillText("7-ELEVEN", w / 2, 78);
      ctx.fillStyle = "#2a2e30";
      ctx.fillRect(0, 126, 36, h - 126);
      ctx.fillRect(w - 36, 126, 36, h - 126);
      drawShelfInterior(ctx, 48, 140, (w - 120) / 2 - 8, h - 178);
      drawShelfInterior(ctx, w / 2 + 16, 140, (w - 120) / 2 - 8, h - 178);
      ctx.fillStyle = "#e87722";
      ctx.fillRect(w / 2 - 22, 148, 44, h - 196);
      ctx.fillStyle = "rgba(180, 220, 210, 0.28)";
      ctx.fillRect(56, 148, (w - 140) / 2 - 12, 18);
      ctx.fillStyle = "#6a706c";
      ctx.fillRect(48, h - 32, w - 96, 22);
      ctx.fillStyle = "#ffffff";
      ctx.font = "18px 'Noto Sans TC',sans-serif";
      ctx.fillText("24H  CITY CAFE  ibon", w / 2, 36);
    } else if (brand === "simplemart") {
      ctx.fillStyle = "#f0c400";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#d91e18";
      ctx.fillRect(0, 0, w, 72);
      ctx.strokeStyle = "#d91e18";
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px 'Noto Sans TC',sans-serif";
      ctx.fillText("美廉社", w / 2, 38);
      drawShelfInterior(ctx, 28, 88, w - 56, h - 128);
      ctx.fillStyle = "#f0c400";
      ctx.fillRect(w / 2 - 18, 110, 36, h - 170);
      ctx.fillStyle = "#d91e18";
      ctx.font = "bold 22px 'Noto Sans TC',sans-serif";
      ctx.fillText("Simple Mart  桃園鎮撫店", w / 2, h - 22);
    } else if (brand === "familymart") {
      ctx.fillStyle = "#f7f7f7";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#00a0e9";
      ctx.fillRect(0, 0, w, 28);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 28, w, 64);
      ctx.fillStyle = "#009845";
      ctx.fillRect(0, 92, w, 12);
      ctx.fillStyle = "#009845";
      ctx.font = "bold 44px 'Noto Sans TC',sans-serif";
      ctx.fillText("FamilyMart", w / 2, 62);
      drawShelfInterior(ctx, 24, 118, w / 2 - 40, h - 150);
      drawShelfInterior(ctx, w / 2 + 16, 118, w / 2 - 40, h - 150);
      ctx.fillStyle = "#00a0e9";
      ctx.fillRect(w / 2 - 16, 130, 32, h - 170);
    } else if (brand === "pxmart") {
      ctx.fillStyle = "#fff5ee";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e85d04";
      ctx.fillRect(0, 0, w, 78);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 44px 'Noto Sans TC',sans-serif";
      ctx.fillText("全聯福利中心", w / 2, 40);
      ctx.font = "22px 'Noto Sans TC',sans-serif";
      ctx.fillText("桃園東國店", w / 2, 66);
      drawShelfInterior(ctx, 24, 96, w - 48, h - 128);
    } else if (brand === "shopee") {
      ctx.fillStyle = "#fff3ee";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ee4d2d";
      ctx.fillRect(0, 0, w, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 42px 'Noto Sans TC',sans-serif";
      ctx.fillText("蝦皮店到店", w / 2, 36);
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = r % 2 === c % 2 ? "#ee4d2d" : "#ff8a65";
          ctx.fillRect(30 + c * 88, 88 + r * 64, 78, 54);
          ctx.fillStyle = "#fff";
          ctx.font = "12px sans-serif";
          ctx.fillText("SPX", 69 + c * 88, 115 + r * 64);
        }
      }
    } else {
      ctx.fillStyle = "#2f9e44";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 36px 'Noto Sans TC',sans-serif";
      ctx.fillText("超商", w / 2, 48);
    }
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeYashanYuanStorefrontTexture() {
  return cached("yashan-storefront-v4", () => {
    const w = 512;
    const h = 512;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    fillNoise(ctx, w, h, "#3a2c24", 10);
    ctx.fillStyle = "#14181c";
    ctx.fillRect(28, 36, w - 56, h - 72);
    ctx.fillStyle = "rgba(196, 150, 90, 0.18)";
    ctx.fillRect(48, 56, w - 96, 28);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeYangxinUpperTexture() {
  return cached("yangxin-upper-v3", () => {
    const w = 768;
    const h = 320;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    fillNoise(ctx, w, h, "#e6d7c4", 12);
    drawTaiwanWindow(ctx, 48, 48, 220, 220, 2, { bars: false, split: true, lit: true });
    drawTaiwanWindow(ctx, 500, 48, 220, 220, 3, { bars: false, split: true, lit: true });
    ctx.fillStyle = "rgba(90, 70, 48, 0.35)";
    ctx.fillRect(w / 2 - 18, 60, 36, 190);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeSolidWallTexture(hex) {
  return cached(`solid-wall:${hex}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 8, 8);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 2 });
  });
}

export function makeRoadWordTexture(text) {
  return cached(`road-word:${text}`, () => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 512, 180);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 120px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText(text, 256, 96);
    return toCanvasTex(canvas, { wrap: false, anisotropy: 4 });
  });
}

export function makeFulongBoardTexture() {
  return cached("fulong-board-v1", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c42822";
    ctx.fillRect(0, 0, 1024, 420);
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.arc(210, 168, 118, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1d4e89";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = "#1d4e89";
    ctx.font = "bold 54px 'Noto Sans TC',sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("福隆", 210, 168);
    ctx.strokeStyle = "#f4f1ea";
    ctx.lineWidth = 8;
    for (let i = 0; i < 4; i++) {
      const y = 250 + i * 16;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(380, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff6e4";
    ctx.font = "bold 78px 'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif";
    ctx.fillText("福隆月台便當", 690, 200);
    return toCanvasTex(canvas, { wrap: false, anisotropy: 8 });
  });
}

export function makeNeighborShellTexture(hex = "#efe4cf", style = "tile") {
  return cached(`neighbor-shell-v4:${hex}:${style}`, () => {
    const w = 256;
    const h = 192;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (style === "brick") {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      const bh = 16;
      const bw = 40;
      ctx.fillStyle = "rgba(70, 70, 68, 0.25)";
      for (let row = 0; row < h / bh + 1; row++) {
        const y = row * bh;
        const off = row % 2 ? bw / 2 : 0;
        ctx.fillRect(0, y, w, 1);
        for (let x = -bw + off; x < w; x += bw) {
          ctx.fillRect(x, y, 1, bh);
        }
      }
    } else if (style === "grey") {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(72, 76, 74, 0.14)";
      for (let y = 48; y < h; y += 48) ctx.fillRect(0, y, w, 1);
      for (let row = 0; row < h / 48; row++) {
        for (let x = 80 + (row % 2) * 40; x < w; x += 80) ctx.fillRect(x, row * 48, 1, 48);
      }
    } else if (style === "pale") {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(76, 82, 84, 0.12)";
      for (let y = 64; y < h; y += 64) ctx.fillRect(0, y, w, 1);
      for (let x = 80; x < w; x += 80) ctx.fillRect(x, 0, 1, h);
    } else {
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(83, 81, 77, 0.16)";
      for (let y = 24; y < h; y += 24) ctx.fillRect(0, y, w, 1);
      for (let row = 0; row < h / 24; row++) {
        for (let x = 40 + (row % 2) * 20; x < w; x += 40) ctx.fillRect(x, row * 24, 1, 24);
      }
    }

    // Cached, fixed-seed washes add broad tonal variation without repeating sharp bands.
    const seed = `${hex}:${style}`;
    for (const [index, tone] of [[1, "255,255,255"], [2, "58,58,56"]]) {
      const cx = w * (0.25 + hash01(seed, index) * 0.5);
      const cy = h * (0.28 + hash01(seed, index + 2) * 0.44);
      const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.56);
      wash.addColorStop(0, `rgba(${tone},0.045)`);
      wash.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
    }
    const patina = ctx.createLinearGradient(0, h * 0.72, 0, h);
    patina.addColorStop(0, "rgba(82, 80, 75, 0)");
    patina.addColorStop(1, "rgba(82, 80, 75, 0.05)");
    ctx.fillStyle = patina;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
    return toCanvasTex(canvas, { wrap: true, anisotropy: 8 });
  });
}

export function makeYangxinStorefrontTexture() {
  return makeYashanYuanStorefrontTexture();
}
