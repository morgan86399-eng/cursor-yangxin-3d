import * as THREE from "three";

export function createGround(frame, aerialMat, config) {
  const group = new THREE.Group();
  group.name = "ground";

  const geom = new THREE.PlaneGeometry(frame.width, frame.depth, 1, 1);
  geom.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geom, aerialMat);
  mesh.position.set(frame.cx, -0.02, frame.cz);
  mesh.receiveShadow = false;
  group.add(mesh);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(config.radiusMeters - 0.45, config.radiusMeters + 0.45, 128),
    new THREE.MeshBasicMaterial({
      color: 0xfff4d6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.12,
      toneMapped: false,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  return { group, mesh };
}
