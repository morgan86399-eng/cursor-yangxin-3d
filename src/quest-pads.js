import * as THREE from "three";

const UNLIT = 0xe2b43a;
const LIT = 0x3dff7a;

/** Visible ground rings for Q4. Stepping on one lights it; the quest finishes when every ring is lit. */
export function createQuestPads(waypoints = []) {
  const group = new THREE.Group();
  group.name = "quest-pads";
  const pads = [];
  for (const point of waypoints) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z) || !point.id) continue;
    const material = new THREE.MeshBasicMaterial({ color: UNLIT, side: THREE.DoubleSide });
    const pad = new THREE.Group();
    pad.name = "quest-pad";
    pad.userData = { id: point.id, label: point.label || point.id, material };
    pad.position.set(point.x, 0, point.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.72, 24), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.11;
    disc.name = "quest-pad-disc";
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 1.45, 28), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    ring.name = "quest-pad-ring";
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 8), material);
    post.position.y = 0.52;
    post.name = "quest-pad-post";
    pad.add(disc, ring, post);
    group.add(pad);
    pads.push(pad);
  }

  function sync(row) {
    const done = row?.status === "done";
    const lit = new Set(
      String(row?.choice || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    for (const pad of pads) {
      const on = done || lit.has(pad.userData.id);
      pad.userData.material.color.setHex(on ? LIT : UNLIT);
    }
  }

  return { group, sync };
}
