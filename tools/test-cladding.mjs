import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import sharp from "sharp";
import { claddingNormalAsset, createCladdingMaterial } from "../src/cladding-material.js";
import { createDrainpipeDetail, drainpipeCenterClear, DRAINPIPE_DETAIL_RADIUS } from "../src/drainpipe-detail.js";

const data = new URL("../public/data/facade-materials/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("SOURCE.json", data), "utf8"));
for (const id of ["Bricks060", "Tiles107", "Plaster003"]) {
  const colorFile = `${id}_Color.jpg`;
  const normalFile = claddingNormalAsset(colorFile);
  assert.equal(normalFile, `${id}_NormalGL.jpg`);
  const color = new THREE.Texture();
  const normal = new THREE.Texture();
  color.repeat.set(id === "Bricks060" ? 2 : 1, 1);
  color.offset.set(0.1, 0.2);
  color.center.set(0.5, 0.5);
  color.rotation = 0.25;
  normal.colorSpace = THREE.SRGBColorSpace;
  const material = createCladdingMaterial(color, normal, "#bca892");
  assert.equal(material.type, "MeshStandardMaterial");
  assert.equal(material.map, color);
  assert.equal(material.normalMap, normal);
  assert.equal(color.colorSpace, THREE.SRGBColorSpace);
  assert.equal(normal.colorSpace, THREE.NoColorSpace, "normal vectors must not be sRGB decoded");
  for (const key of ["repeat", "offset", "center"]) assert.deepEqual(normal[key].toArray(), color[key].toArray());
  assert.equal(normal.rotation, color.rotation);
  assert.deepEqual(material.normalScale.toArray(), [0.42, 0.42]);
  assert.equal(material.metalness, 0);
  assert.ok(material.roughness > 0.8);
  assert.equal(material.userData.estimated, true);
  for (const file of [colorFile, normalFile]) {
    const buffer = await readFile(new URL(file, data));
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.width, 1024); assert.equal(meta.height, 1024);
    assert.equal(meta.format, "jpeg");
    assert.equal(createHash("sha256").update(buffer).digest("hex"), manifest.sha256[file]);
  }
  const original = await readFile(new URL(`../../unity-outdoor/Assets/Art/RealFarm/Facades/${id}/NormalGL.jpg`, import.meta.url));
  const reused = await readFile(new URL(normalFile, data));
  assert.ok(original.equals(reused), "reuse the existing licensed texture byte-for-byte");
}

for (const height of [0.6, 6.35, 9.85, 12.55]) {
  const pipe = createDrainpipeDetail(height, "example");
  const bounds = new THREE.Box3().setFromObject(pipe);
  assert.ok(bounds.min.y >= -1e-6 && bounds.max.y <= height + 1e-6, "fittings must stay below the existing roofline");
  assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z))
    <= DRAINPIPE_DETAIL_RADIUS + 1e-6, "fittings must fit the checked clearance radius");
  assert.equal(pipe.children[0].geometry.attributes.position.count, new THREE.CylinderGeometry(0.045, 0.05, height, 24).attributes.position.count);
  assert.ok(pipe.children.every((part) => part.userData.id === "example" && part.userData.estimated));
}
assert.equal(createDrainpipeDetail(0, "bad"), null);
const neighbor = [{ id: "neighbor", pts: [{ x: 1, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 1 }, { x: 1, z: 1 }] }];
assert.equal(drainpipeCenterClear(0.9, 0, neighbor, "owner"), true);
assert.equal(drainpipeCenterClear(0.94, 0, neighbor, "owner"), false, "coupling radius must be checked, not just the centre");
assert.equal(drainpipeCenterClear(1.5, 0, neighbor, "owner"), false, "a pipe inside a neighboring footprint is omitted");
assert.equal(drainpipeCenterClear(1.5, 0, neighbor, "neighbor"), true, "the owner's own wall is not a neighboring obstruction");
assert.match(manifest.scope, /Estimated/);
assert.match(manifest.license, /CC0/);
console.log("cladding and drainpipe detail ok", { texturePairs: 3, textureSize: 1024, linearNormals: true, heightCases: 4 });
