import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFacade, classifyRoof, hash01, FACADE_STYLES, HOUSE_PALETTE, makeNeighborShellTexture, makeStorefrontTexture } from "../src/textures.js";
import { displayHeightForLot } from "../src/lots.js";
import { decorativeCapHeight, resolveBuildingProfile } from "../src/buildings.js";

for (const height of [6.35, 6.6, 9.4, 12.55]) {
  const cap = decorativeCapHeight(height, true);
  assert.ok(cap > 0.4 && cap <= 0.6, `cap must stay decorative at ${height}m: ${cap}`);
  assert.ok(height - cap > 5, `cladding must fit below the unchanged roofline: ${height}m`);
  assert.equal(decorativeCapHeight(height, false), 0);
}
assert.equal(decorativeCapHeight(3, true), 0, "very low roofs cannot leave an unrendered cladding gap");
assert.equal(decorativeCapHeight(5, true), 0, "cap geometry requires more than 0.4m height");

assert.ok(Number.isFinite(hash01("nlsc/414", 3)));
assert.notEqual(hash01("nlsc/1", 3), hash01("nlsc/2", 3), "string ids must hash differently");
assert.notEqual(hash01("nlsc/414", 3), hash01("nlsc/415", 3));

assert.equal(classifyRoof("#3a6aa8").kind, "blueMetal");
assert.equal(classifyRoof("#b24a32").kind, "redTile");

const shop = classifyFacade({ id: "nlsc/414", area: 41 }, { kind: "shop", isShop: true, distRoad: 4 });
assert.equal(shop.style, "arcade");
assert.equal(shop.arcade, true);
assert.equal(shop.metalCap, false);

const combos = new Set();
const styles = new Set();
const heights = new Set();
for (let i = 0; i < 240; i++) {
  const b = { id: `nlsc/${i}`, area: 40 + (i % 90), source: "nlsc-buildx" };
  const f = classifyFacade(b, { kind: "house", roofHex: i % 5 === 0 ? "#3a6aa8" : "#9aa090", distRoad: i % 3 === 0 ? 5 : 18 });
  combos.add(`${f.style}:${f.layout}:${f.wallHex}`);
  styles.add(f.style);
  heights.add(displayHeightForLot(b, false));
}
assert.ok(combos.size > 120, `too few unique facades ${combos.size}`);
assert.ok(styles.size >= 6, `too few styles ${[...styles]}`);
assert.ok(heights.size >= 4, `too few heights ${[...heights]}`);
assert.ok([...styles].every((s) => FACADE_STYLES.includes(s) || s === "paint"));
assert.ok(HOUSE_PALETTE.length >= 20);

// Record the canvas base coat: brick and grey shells must use the caller's color.
const originalDocument = globalThis.document;
const canvases = [];
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, "canvas");
    const fills = [];
    const ctx = {
      fillStyle: "",
      fillRect(x, y, width, height) { fills.push({ x, y, width, height, color: this.fillStyle }); },
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx, fills };
    canvases.push(canvas);
    return canvas;
  },
};
try {
  for (const [style, firstHex, secondHex] of [
    ["brick", "#a8483c", "#9a4034"],
    ["grey", "#c5c8c4", "#b0b4b2"],
  ]) {
    const first = makeNeighborShellTexture(firstHex, style);
    const second = makeNeighborShellTexture(secondHex, style);
    assert.notStrictEqual(first, second, `${style} colors must have separate textures`);
    assert.strictEqual(makeNeighborShellTexture(firstHex, style), first, `${style} texture must be cached`);
    for (const [canvas, hex] of [[first.image, firstHex], [second.image, secondHex]]) {
      const base = canvas.fills.find(({ x, y, width, height }) => x === 0 && y === 0 && width === 256 && height === 192);
      assert.equal(base?.color, hex, `${style} base coat must honor ${hex}`);
    }
  }
  const side = makeStorefrontTexture("#bda984", 11, "house", "tile", false);
  const front = makeStorefrontTexture("#bda984", 11, "house", "tile", true);
  assert.notStrictEqual(side, front, "50m side cladding must not reuse a storefront canvas");
  assert.equal(side.image.fills.some(({ x, y, width, height }) =>
    x === 0 && y === 0 && width === 256 && height === 34), false,
  "side wall must not paint a false ground-floor fascia");
  assert.equal(front.image.fills.some(({ x, y, width, height }) =>
    x === 0 && y === 0 && width === 256 && height === 34), true,
  "street-facing wall must retain its ground-floor fascia");
  assert.equal(canvases.length, 6);
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

const baked = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), "../public/data/buildings-nlsc.json"), "utf8")
);
const bakedCombos = new Set();
const bakedHeights = new Set();
let metal = 0;
let arcade = 0;
for (const b of baked.buildings) {
  const isShop = b.id === baked.shopId || b.isShop;
  const f = classifyFacade(b, {
    kind: isShop ? "shop" : "house",
    isShop,
    area: b.area,
    distRoad: 5,
    roofHex: "#9aa090",
  });
  bakedCombos.add(`${f.style}:${f.layout}:${f.wallHex}`);
  bakedHeights.add(displayHeightForLot(b, isShop));
  if (f.metalCap && !isShop) metal += 1;
  if (f.arcade) arcade += 1;
}
assert.ok(bakedCombos.size > 200, `200m baked facades too cloned ${bakedCombos.size}/${baked.buildings.length}`);
assert.ok(bakedHeights.size >= 4, `200m heights too uniform ${[...bakedHeights]}`);
assert.equal(displayHeightForLot(baked.buildings.find((b) => b.id === baked.shopId), true), 6.6);
assert.ok(metal > 20, `metal caps ${metal}`);
assert.ok(arcade > 5, `arcades ${arcade}`);

const house = resolveBuildingProfile({ id: "way/1", name: "", building: "apartments", height: 6 });
assert.equal(house.height, 6);

console.log("facades ok", {
  comboSample: combos.size,
  bakedUnique: bakedCombos.size,
  bakedN: baked.buildings.length,
  heights: [...bakedHeights].sort((a, b) => a - b),
  styles: [...styles],
  metal,
  arcade,
});
