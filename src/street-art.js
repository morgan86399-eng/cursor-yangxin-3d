import * as THREE from "three";

const SKIN = new THREE.MeshLambertMaterial({ color: 0xd7a67a });
const HAIR = new THREE.MeshLambertMaterial({ color: 0x241c18 });
const SHOE = new THREE.MeshLambertMaterial({ color: 0x161616 });
const METAL = new THREE.MeshLambertMaterial({ color: 0xc5c8cc });
const RUBBER = new THREE.MeshLambertMaterial({ color: 0x141414 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9eb4be, transparent: true, opacity: 0.45 });
const clothes = new Map();

const LEG = new THREE.BoxGeometry(0.13, 0.58, 0.15);
const ARM = new THREE.BoxGeometry(0.09, 0.5, 0.1);
const TORSO = new THREE.BoxGeometry(0.34, 0.42, 0.2);
const YOKE = new THREE.BoxGeometry(0.46, 0.14, 0.24);
const HEAD = new THREE.SphereGeometry(0.12, 8, 6);
const HOOD = new THREE.SphereGeometry(0.15, 8, 6);
const SHOE_BOX = new THREE.BoxGeometry(0.14, 0.06, 0.24);
const SHADOW = new THREE.CircleGeometry(0.34, 12);
const WHEEL = new THREE.CylinderGeometry(0.23, 0.23, 0.08, 10);
const SCOOTER_WHEEL = new THREE.CylinderGeometry(0.27, 0.27, 0.11, 12);

function cloth(color) {
  let material = clothes.get(color);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color });
    clothes.set(color, material);
  }
  return material;
}

function lift(hex, amount = 0.28) {
  const mix = (channel) => Math.min(255, Math.round(channel + (255 - channel) * amount));
  return (mix((hex >> 16) & 255) << 16) | (mix((hex >> 8) & 255) << 8) | mix(hex & 255);
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
  const yokeMat = cloth(lift(shirt));
  const trouser = cloth(pants);
  const spine = new THREE.Group();
  spine.name = "spine";
  const torso = new THREE.Mesh(TORSO, jacket);
  torso.position.y = 1.12;
  const yoke = new THREE.Mesh(YOKE, yokeMat);
  yoke.position.y = 1.34;
  const head = new THREE.Mesh(HEAD, SKIN);
  head.position.set(0, 1.56, 0.02);
  const hood = new THREE.Mesh(HOOD, HAIR);
  hood.position.set(0, 1.58, -0.04);
  hood.scale.set(1.05, 0.72, 0.85);
  const leftLeg = pivotLimb("leg-left", LEG, trouser, 0.29);
  leftLeg.position.set(-0.11, 0.9, 0);
  const rightLeg = pivotLimb("leg-right", LEG, trouser, 0.29);
  rightLeg.position.set(0.11, 0.9, 0);
  const leftShoe = new THREE.Mesh(SHOE_BOX, SHOE);
  leftShoe.position.set(0, -0.52, 0.03);
  const rightShoe = leftShoe.clone();
  leftLeg.children[0].add(leftShoe);
  rightLeg.children[0].add(rightShoe);
  const leftArm = pivotLimb("arm-left", ARM, jacket, 0.24);
  leftArm.position.set(-0.28, 1.32, 0);
  const rightArm = pivotLimb("arm-right", ARM, jacket, 0.24);
  rightArm.position.set(0.28, 1.32, 0);
  spine.add(torso, yoke, head, hood, leftArm, rightArm);
  const shadow = new THREE.Mesh(SHADOW, new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.name = "shadow";
  group.add(spine, leftLeg, rightLeg, shadow);
  return group;
}

export function poseCitizen(group, { phase = 0, speed = 0, riding = false } = {}) {
  const swing = riding || speed < 0.25 ? 0 : Math.sin(phase) * 0.75;
  const leftLeg = group.getObjectByName("leg-left");
  const rightLeg = group.getObjectByName("leg-right");
  const leftArm = group.getObjectByName("arm-left");
  const rightArm = group.getObjectByName("arm-right");
  if (leftLeg) {
    leftLeg.rotation.x = riding ? 1.25 : swing;
    leftLeg.rotation.z = riding ? 0.42 : 0.08;
  }
  if (rightLeg) {
    rightLeg.rotation.x = riding ? 1.25 : -swing;
    rightLeg.rotation.z = riding ? -0.42 : -0.08;
  }
  if (leftArm) {
    leftArm.rotation.x = riding ? 1.05 : -swing * 0.7;
    leftArm.rotation.z = riding ? 0.5 : 0.12;
  }
  if (rightArm) {
    rightArm.rotation.x = riding ? 1.05 : swing * 0.7;
    rightArm.rotation.z = riding ? -0.5 : -0.12;
  }
  const spine = group.getObjectByName("spine");
  if (spine) spine.rotation.x = riding ? 0.48 : 0;
  const shadow = group.getObjectByName("shadow");
  if (shadow) shadow.visible = !riding;
}

function wheel(z) {
  const mesh = new THREE.Mesh(SCOOTER_WHEEL, RUBBER);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(0, 0.27, z);
  return mesh;
}

function headlightPool() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    -0.18, 0.06, 1.35,
    0.18, 0.06, 1.35,
    1.35, 0.06, 8.2,
    -0.18, 0.06, 1.35,
    1.35, 0.06, 8.2,
    -1.35, 0.06, 8.2,
  ]), 3));
  const pool = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xffd27a,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }));
  pool.name = "head-glow";
  pool.visible = false;
  return pool;
}

// Forward is +Z, so a chase camera behind the rider sees the tail and the front wheel.
export function makeScooterMesh({ color = 0x1e3d72, hero = false } = {}) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const front = wheel(0.78);
  front.name = "wheel-front";
  const rear = wheel(-0.62);
  rear.name = "wheel-rear";
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 1.05), paint);
  deck.position.set(0, 0.4, 0.08);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.5), paint);
  tail.position.set(0, 0.42, -0.34);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.12), paint);
  shield.position.set(0, 0.7, 0.62);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.42), RUBBER);
  seat.position.set(0, 0.72, -0.05);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.36, 6), METAL);
  stem.position.set(0, 0.92, 0.52);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.045, 0.05), METAL);
  bar.name = "handlebar";
  bar.position.set(0, 1.08, 0.58);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.26), GLASS);
  visor.position.set(0, 0.86, 0.56);
  const headlamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.08, 0.06),
    new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }),
  );
  headlamp.position.set(0, 0.72, 0.58);
  headlamp.name = "headlamp";
  const tailLamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.07, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false }),
  );
  tailLamp.position.set(0, 0.5, -0.6);
  tailLamp.name = "tail-lamp";
  group.add(front, rear, deck, tail, shield, seat, stem, bar, visor, headlamp, tailLamp);
  if (hero) group.add(headlightPool());
  return group;
}

export function makeCarMesh(color = 0xd8d4cc) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.42, 1.9), paint);
  body.position.y = 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.32, 0.9), GLASS);
  cabin.position.set(0, 0.78, -0.12);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.95), paint);
  roof.position.set(0, 0.96, -0.1);
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
  group.add(body, cabin, roof, lamp, lamp2);
  return group;
}

export const SHIRTS = [0x8c3a2f, 0x2f4f6f, 0x6b5a3a, 0x3d3a55, 0xc4b7a2, 0x245c45];
export const CAR_COLORS = [0xe6e1d6, 0xb9b6ae, 0x8e2d2a, 0x1e3d72];
export const SIT_DROP = -0.22;
