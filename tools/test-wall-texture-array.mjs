import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeWallTextures } from "../src/wall-texture-array.js";

// A canvas stand-in: row y is filled with the value `base + y`, so a flipped copy is detectable.
function fakeCanvas(width, height, base) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) data.fill(base + y, y * width * 4, (y + 1) * width * 4);
  return { width, height, getContext: () => ({ getImageData: () => ({ data }) }) };
}
function wallTexture(width, height, base) {
  const texture = new THREE.CanvasTexture(fakeCanvas(width, height, base));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
function wall(texture, x, userData) {
  const geometry = new THREE.PlaneGeometry(4, 3);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: texture, color: "#ffffff", side: THREE.DoubleSide }));
  mesh.position.set(x, 1.5, 0);
  if (userData) mesh.userData = userData;
  return mesh;
}

const root = new THREE.Group();
const texA = wallTexture(4, 2, 10);
const texB = wallTexture(4, 2, 100);
const texOdd = wallTexture(8, 2, 50);
root.add(wall(texA, 0, { id: "nlsc/1", label: "", isShop: false, style: "tile" }));
root.add(wall(texB, 10));
root.add(wall(texA, 20));
const toggled = wall(texB, 30, { id: "nlsc/2", facadeLayer: "realistic-street", nearDetail: false });
root.add(toggled);
const audited = wall(texB, 40, { id: "nlsc/3", kind: "near50-side-wall" });
root.add(audited);
const lone = wall(texOdd, 50);
root.add(lone);
const tinted = wall(texA, 60);
tinted.material.color.set("#ffeedd");
root.add(tinted);

const stats = mergeWallTextures(root);
assert.deepEqual(stats, { walls: 3, textures: 2, arrays: 1, meshes: 1 });
for (const kept of [toggled, audited, lone, tinted]) assert.ok(kept.parent, "toggled, audited, odd-sized and tinted walls stay separate");

const merged = root.getObjectByName("wall-texture-array");
assert.ok(merged);
assert.equal(merged.material.side, THREE.DoubleSide);
const layers = merged.geometry.attributes.wallLayer;
assert.equal(layers.count, 12);
assert.deepEqual([...new Set(layers.array)].sort(), [0, 1]);
assert.equal(merged.geometry.index.count, 18, "three quads keep their triangles");

// The wall at x=10 used the second canvas; its vertices must carry layer 1.
const pos = merged.geometry.attributes.position;
for (let i = 0; i < pos.count; i += 1) {
  const x = pos.getX(i);
  assert.equal(layers.getX(i), x > 5 && x < 15 ? 1 : 0);
}

// Capture the uploaded array through the compile hook.
const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <map_fragment>" };
merged.material.onBeforeCompile(shader);
const array = shader.uniforms.wallLayers.value;
assert.ok(array.isDataArrayTexture);
assert.deepEqual([array.image.width, array.image.height, array.image.depth], [4, 2, 2]);
assert.equal(array.colorSpace, THREE.SRGBColorSpace);
assert.equal(array.wrapS, THREE.RepeatWrapping);
assert.equal(array.anisotropy, 8);
// Layer 0, first stored row is the canvas's bottom row (base 10 + y 1).
assert.equal(array.image.data[0], 11);
assert.equal(array.image.data[4 * 4], 10);
assert.equal(array.image.data[4 * 2 * 4], 101, "layer 1 starts after layer 0");
assert.ok(shader.fragmentShader.includes("sampler2DArray") && !shader.fragmentShader.includes("#include <map_fragment>"));

console.log("wall texture array tests passed");
