import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { distanceToRing } from "./geo.js";

export const DRAINPIPE_DETAIL_RADIUS = 0.065;

export function drainpipeCenterClear(x, z, lots, ownerId) {
  return (lots || []).every((other) => other.id === ownerId ||
    distanceToRing(x, z, other.pts) > DRAINPIPE_DETAIL_RADIUS);
}

// Refine an already estimated pipe at its existing position. Do not add a new
// pipe location, extend it above the roof, or treat these fittings as surveyed.
export function createDrainpipeDetail(height, id) {
  if (!(height > 0.5)) return null;
  const group = new THREE.Group();
  group.name = "near50-drainpipe";
  const pvc = new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.76 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x858a8b, roughness: 0.65, metalness: 0.25 });
  const body = new THREE.CylinderGeometry(0.045, 0.05, height, 24);
  body.translate(0, height / 2, 0);
  const joints = [];
  const clamps = [];
  for (let y = 1.0; y < height - 0.22; y += 3.0) {
    const joint = new THREE.CylinderGeometry(DRAINPIPE_DETAIL_RADIUS, DRAINPIPE_DETAIL_RADIUS, 0.12, 24);
    joint.translate(0, y, 0);
    joints.push(joint);
  }
  for (let y = 0.45; y < height - 0.22; y += 2.8) {
    const clamp = new THREE.TorusGeometry(0.055, 0.008, 6, 24);
    clamp.rotateX(Math.PI / 2);
    clamp.translate(0, y, 0);
    clamps.push(clamp);
  }
  for (const [kind, geometries, material] of [
    ["body", [body], pvc], ["couplings", joints, pvc], ["clamps", clamps, metal],
  ]) {
    if (!geometries.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.name = `near50-drainpipe-${kind}`;
    mesh.userData = { id, kind: mesh.name, estimated: true };
    group.add(mesh);
  }
  group.userData = { id, kind: "near50-drainpipe", estimated: true, couplings: joints.length, clamps: clamps.length };
  return group;
}
