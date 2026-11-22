import * as THREE from "three";

const SKIN = new THREE.MeshLambertMaterial({ color: 0xd7a67a });
const HAIR = new THREE.MeshLambertMaterial({ color: 0x241c18 });
const SHOE = new THREE.MeshLambertMaterial({ color: 0x161616 });
const METAL = new THREE.MeshLambertMaterial({ color: 0xc5c8cc });
const RUBBER = new THREE.MeshLambertMaterial({ color: 0x141414 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9eb4be, transparent: true, opacity: 0.45 });
const clothes = new Map();

const LEG = new THREE.BoxGeometry(0.15, 0.52, 0.16);
const ARM = new THREE.BoxGeometry(0.1, 0.46, 0.11);
const TORSO = new THREE.BoxGeometry(0.38, 0.5, 0.22);
const HEAD = new THREE.SphereGeometry(0.13, 8, 6);
const HAIR_CAP = new THREE.SphereGeometry(0.14, 8, 6);
const SHOE_BOX = new THREE.BoxGeometry(0.15, 0.07, 0.22);
const SHADOW = new THREE.CircleGeometry(0.34, 12);
const WHEEL = new THREE.CylinderGeometry(0.23, 0.23, 0.07, 10);

function cloth(color) {
  let material = clothes.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    clothes.set(color, material);
  }
  return material;
}

function pivotLimb(name, geometry, material, hang) {
  const pivot = new THREE.Group();
  pivot.name = name;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -hang;
  pivot.add(mesh);
  return pivot;
}

// A back-view person: jacket, limbs, hair. No face.
export function makeCitizen({ shirt = 0x2c5234, pants = 0x2a3138 } = {}) {
  const group = new THREE.Group();
  const jacket = cloth(shirt);
  const trouser = cloth(pants);
  const torso = new THREE.Mesh(TORSO, jacket);
  torso.position.y = 1.16;
  const head = new THREE.Mesh(HEAD, SKIN);
  head.position.y = 1.54;
  const hair = new THREE.Mesh(HAIR_CAP, HAIR);
  hair.position.set(0, 1.62, -0.02);
  hair.scale.y = 0.55;
  const leftLeg = pivotLimb("leg-left", LEG, trouser, 0.26);
  leftLeg.position.set(-0.09, 0.9, 0);
  const rightLeg = pivotLimb("leg-right", LEG, trouser, 0.26);
  rightLeg.position.set(0.09, 0.9, 0);
  const leftShoe = new THREE.Mesh(SHOE_BOX, SHOE);
  leftShoe.position.y = -0.5;
  const rightShoe = leftShoe.clone();
  leftLeg.children[0].add(leftShoe);
  rightLeg.children[0].add(rightShoe);
  const leftArm = pivotLimb("arm-left", ARM, jacket, 0.22);
  leftArm.position.set(-0.24, 1.32, 0);
  const rightArm = pivotLimb("arm-right", ARM, jacket, 0.22);
  rightArm.position.set(0.24, 1.32, 0);
  const shadow = new THREE.Mesh(SHADOW, new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.name = "shadow";
  group.add(torso, head, hair, leftLeg, rightLeg, leftArm, rightArm, shadow);
  return group;
}

export function poseCitizen(group, { phase = 0, speed = 0, riding = false } = {}) {
  const swing = riding || speed < 0.25 ? 0 : Math.sin(phase) * 0.55;
  const legs = riding ? 1.15 : swing;
  const arms = riding ? 0.85 : -swing * 0.65;
  const leftLeg = group.getObjectByName("leg-left");
  const rightLeg = group.getObjectByName("leg-right");
  const leftArm = group.getObjectByName("arm-left");
  const rightArm = group.getObjectByName("arm-right");
  if (leftLeg) leftLeg.rotation.x = legs;
  if (rightLeg) rightLeg.rotation.x = riding ? 1.15 : -swing;
  if (leftArm) leftArm.rotation.x = arms;
  if (rightArm) rightArm.rotation.x = riding ? 0.85 : swing * 0.65;
  const shadow = group.getObjectByName("shadow");
  if (shadow) shadow.visible = !riding;
}

function wheel(z) {
  const mesh = new THREE.Mesh(WHEEL, RUBBER);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(0, 0.23, z);
  return mesh;
}

// Forward is +Z, so a chase camera behind the rider sees the tail and the front wheel.
export function makeScooterMesh({ color = 0x1e3d72, hero = false } = {}) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const front = wheel(0.78);
  front.name = "wheel-front";
  const rear = wheel(-0.62);
  rear.name = "wheel-rear";
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.9), paint);
  deck.position.set(0, 0.38, 0.05);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.28, 0.46), paint);
  tail.position.set(0, 0.54, -0.28);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.12), paint);
  shield.position.set(0, 0.66, 0.5);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.4), RUBBER);
  seat.position.set(0, 0.74, -0.08);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 6), METAL);
  stem.position.set(0, 0.9, 0.46);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), METAL);
  bar.position.set(0, 1.05, 0.48);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.26), GLASS);
  visor.position.set(0, 0.86, 0.56);
  const headlamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.08, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }),
  );
  headlamp.position.set(0, 0.72, 0.58);
  headlamp.name = "headlamp";
  const tailLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.06, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false }),
  );
  tailLamp.position.set(0, 0.62, -0.52);
  tailLamp.name = "tail-lamp";
  group.add(front, rear, deck, tail, shield, seat, stem, bar, visor, headlamp, tailLamp);
  if (hero) {
    const glow = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 5.2, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffe3a1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.42, 3.3);
    glow.name = "head-glow";
    glow.visible = false;
    group.add(glow);
  }
  return group;
}

export function makeCarMesh(color = 0xd8d4cc) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.42, 1.9), paint);
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.36, 0.92), GLASS);
  cabin.position.set(0, 0.84, -0.08);
  for (const [x, z] of [[0.42, 0.62], [-0.42, 0.62], [0.42, -0.62], [-0.42, -0.62]]) {
    const tire = new THREE.Mesh(WHEEL, RUBBER);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.23, z);
    group.add(tire);
  }
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }),
  );
  lamp.position.set(0.24, 0.52, 0.96);
  lamp.name = "headlamp";
  const lamp2 = lamp.clone();
  lamp2.position.x = -0.24;
  group.add(body, cabin, lamp, lamp2);
  return group;
}

export const SHIRTS = [0x8c3a2f, 0x2f4f6f, 0x6b5a3a, 0x3d3a55, 0xc4b7a2, 0x245c45];
export const CAR_COLORS = [0xe6e1d6, 0xb9b6ae, 0x8e2d2a, 0x1e3d72];
export const SIT_DROP = -0.16;
