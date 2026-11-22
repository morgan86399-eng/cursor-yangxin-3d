import assert from "node:assert/strict";
import * as THREE from "three";
import { batchStaticMeshes, materialSignature } from "../src/static-batch.js";

const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const box = (material, x, name = "") => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(x, 0.5, 0);
  mesh.name = name;
  return mesh;
};
const triangles = (root) => {
  let total = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    const g = node.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return total;
};

// Two materials with the same look are one draw; a different colour is not.
assert.equal(materialSignature(lambert(0x884422)), materialSignature(lambert(0x884422)));
assert.notEqual(materialSignature(lambert(0x884422)), materialSignature(lambert(0x884423)));
const tagged = lambert(0x884422);
tagged.userData = { kind: "near50-cladding" };
assert.notEqual(materialSignature(tagged), materialSignature(lambert(0x884422)), "audited materials stay their own");

const root = new THREE.Group();
const street = new THREE.Group();
street.position.set(10, 0, -4);
street.rotation.y = 0.6;
root.add(street);
for (let i = 0; i < 6; i += 1) street.add(box(lambert(0x884422), i * 2));
const mirrored = box(lambert(0x884422), 20);
mirrored.scale.x = -1;
street.add(mirrored);

const toggled = box(lambert(0x884422), 30);
toggled.userData = { facadeLayer: "realistic-street", nearDetail: true };
root.add(toggled);
const layerGroup = new THREE.Group();
layerGroup.userData = { facadeLayer: "atlas25d" };
layerGroup.add(box(lambert(0x884422), 32));
root.add(layerGroup);
const audited = box(lambert(0x884422), 34);
audited.userData = { id: "nlsc/1" };
root.add(audited);
const glass = box(new THREE.MeshLambertMaterial({ color: 0x884422, transparent: true, opacity: 0.5 }), 36);
root.add(glass);
const hidden = box(lambert(0x884422), 38);
hidden.visible = false;
root.add(hidden);
const pipe = new THREE.Group();
pipe.name = "near50-drainpipe";
pipe.add(box(lambert(0x884422), 40));
root.add(pipe);
const trees = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(0x884422), 3);
root.add(trees);
root.add(box(lambert(0x224488), 42));

root.updateWorldMatrix(true, true);
const before = triangles(root);
const corner = new THREE.Vector3(0.5, 0.5, 0.5).applyMatrix4(street.children[3].matrixWorld);
const boundsBefore = new THREE.Box3().setFromObject(street);

const stats = batchStaticMeshes(root);
assert.equal(stats.merged, 7, "six boxes and the mirrored one share a draw");
assert.equal(stats.batches, 1);
assert.equal(stats.meshesAfter, stats.meshesBefore - 6);
assert.equal(triangles(root), before, "merging must not add or drop triangles");

for (const kept of [toggled, layerGroup.children[0], audited, glass, hidden, pipe.children[0], trees]) {
  assert.ok(kept.parent, "meshes the game toggles, audits or animates stay as they were");
}
assert.equal(street.children.length, 0);

const batch = root.getObjectByName("static-batch");
assert.ok(batch);
const boundsAfter = new THREE.Box3().setFromObject(batch);
assert.ok(boundsAfter.min.distanceTo(boundsBefore.min) < 1e-4 && boundsAfter.max.distanceTo(boundsBefore.max) < 1e-4,
  "baked geometry stays where the originals stood");
const pos = batch.geometry.attributes.position;
let found = false;
for (let i = 0; i < pos.count && !found; i += 1) {
  found = new THREE.Vector3().fromBufferAttribute(pos, i).distanceTo(corner) < 1e-4;
}
assert.ok(found, "a known box corner is still at its world position");

// Outward faces stay outward after baking a mirrored transform.
const index = batch.geometry.index;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
const stored = batch.geometry.attributes.normal;
for (let i = 0; i < index.count; i += 3) {
  a.fromBufferAttribute(pos, index.getX(i));
  b.fromBufferAttribute(pos, index.getX(i + 1));
  c.fromBufferAttribute(pos, index.getX(i + 2));
  n.subVectors(b, a).cross(c.sub(a)).normalize();
  const want = new THREE.Vector3().fromBufferAttribute(stored, index.getX(i));
  assert.ok(n.dot(want) > 0.99, "triangle winding agrees with its normal");
}

console.log("static batch tests passed");
