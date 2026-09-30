import * as THREE from "three";

const COLORS = {
  Q1: 0xe2b43a,
  Q2: 0xd31820,
  Q3: 0xc4552a,
  Q4: 0x3f8a45,
  Q5: 0x6e8c9a,
  Q6: 0x4e565e,
  Q7: 0xf0d56a,
};

export function createQuestMarkers() {
  const group = new THREE.Group();
  group.name = "quest-sky-markers";
  group.visible = false;
  const geo = new THREE.RingGeometry(1.15, 2.05, 22);
  const byId = new Map();

  function meshFor(id) {
    let mesh = byId.get(id);
    if (mesh) return mesh;
    mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: COLORS[id] || 0xe2b43a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    mesh.name = "quest-marker";
    mesh.userData = { questId: id };
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    group.add(mesh);
    byId.set(id, mesh);
    return mesh;
  }

  return {
    group,
    sync(points, sky) {
      const live = new Set((points || []).map((point) => point.id));
      for (const [id, mesh] of byId) mesh.visible = live.has(id);
      for (const point of points || []) {
        const mesh = meshFor(point.id);
        mesh.visible = true;
        mesh.position.set(point.x, 0.55, point.z);
      }
      group.visible = Boolean(sky && live.size);
    },
  };
}
