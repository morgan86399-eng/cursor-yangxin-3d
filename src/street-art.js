import * as THREE from "three";

const SKIN = new THREE.MeshLambertMaterial({ color: 0xd7a67a });
const METAL = new THREE.MeshLambertMaterial({ color: 0xc5c8cc });
const RUBBER = new THREE.MeshLambertMaterial({ color: 0x141414 });
const GLASS = new THREE.MeshLambertMaterial({ color: 0x9eb4be, transparent: true, opacity: 0.45 });
const LAMP = new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false });
const TAIL = new THREE.MeshBasicMaterial({ color: 0xff3b2e, toneMapped: false });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x120e0c, side: THREE.BackSide });
const clothes = new Map();

const THIGH = new THREE.BoxGeometry(0.15, 0.4, 0.16);
const SHIN = new THREE.BoxGeometry(0.13, 0.38, 0.14);
const UPPER = new THREE.BoxGeometry(0.12, 0.32, 0.13);
const FORE = new THREE.BoxGeometry(0.1, 0.28, 0.11);
const HAND = new THREE.BoxGeometry(0.09, 0.08, 0.1);
const TORSO = new THREE.BoxGeometry(0.34, 0.36, 0.2);
const HEM = new THREE.BoxGeometry(0.4, 0.1, 0.24);
const YOKE = new THREE.BoxGeometry(0.4, 0.1, 0.22);
const CAP = new THREE.BoxGeometry(0.14, 0.12, 0.24);
const SEAM = new THREE.BoxGeometry(0.04, 0.32, 0.03);
const HEAD = new THREE.SphereGeometry(0.11, 8, 6);
const HOOD_GEO = new THREE.SphereGeometry(0.16, 8, 6);
const COWL = new THREE.BoxGeometry(0.38, 0.14, 0.26);
const SHOE_BOX = new THREE.BoxGeometry(0.14, 0.07, 0.26);
const PACK = new THREE.BoxGeometry(0.28, 0.32, 0.14);
const SHADOW = new THREE.CircleGeometry(0.34, 12);
const SCOOTER_WHEEL = new THREE.CylinderGeometry(0.3, 0.3, 0.13, 14);
const HUB = new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10);
const CAR_WHEEL = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14);
const CAR_HUB = new THREE.CylinderGeometry(0.15, 0.15, 0.24, 10);
const CAR_LAMP = new THREE.BoxGeometry(0.26, 0.1, 0.06);
const CAR_TAIL = new THREE.BoxGeometry(0.3, 0.11, 0.06);

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

function shade(hex, amount = 0.78) {
  const mix = (channel) => Math.max(0, Math.round(channel * amount));
  return (mix((hex >> 16) & 255) << 16) | (mix((hex >> 8) & 255) << 8) | mix(hex & 255);
}

function hangBox(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -geometry.parameters.height / 2;
  return mesh;
}

function armRig(name, side, upperMat, foreMat) {
  const shoulder = new THREE.Group();
  shoulder.name = name;
  shoulder.add(hangBox(UPPER, upperMat));
  const elbow = new THREE.Group();
  elbow.name = `${name}-elbow`;
  elbow.position.y = -UPPER.parameters.height;
  const hand = new THREE.Mesh(HAND, SKIN);
  hand.name = side < 0 ? "hand-left" : "hand-right";
  hand.position.set(0, -FORE.parameters.height - 0.02, 0.02);
  elbow.add(hangBox(FORE, foreMat), hand);
  shoulder.add(elbow);
  shoulder.position.set(side * 0.3, 1.38, 0.02);
  return shoulder;
}

function legRig(name, side, thighMat, shinMat, shoeMat) {
  const hip = new THREE.Group();
  hip.name = name;
  hip.add(hangBox(THIGH, thighMat));
  const knee = new THREE.Group();
  knee.name = `${name}-knee`;
  knee.position.y = -THIGH.parameters.height;
  const shoe = new THREE.Mesh(SHOE_BOX, shoeMat);
  shoe.name = side < 0 ? "shoe-left" : "shoe-right";
  shoe.position.set(0, -SHIN.parameters.height - 0.02, 0.05);
  knee.add(hangBox(SHIN, shinMat), shoe);
  hip.add(knee);
  hip.position.set(side * 0.11, 0.9, 0);
  return hip;
}

// Back-view person. No eyes, mouth, or other face.
export function makeCitizen({
  shirt = 0x2c5234,
  pants = 0x2a3138,
  shoes = 0x161616,
  hair = 0x241c18,
  hood = true,
  sleeves = "long",
  legs = "pants",
  bag = false,
} = {}) {
  const group = new THREE.Group();
  const jacket = cloth(shirt);
  const yokeMat = cloth(lift(shirt, 0.36));
  const hemMat = cloth(shade(shirt, 0.72));
  const trouser = cloth(pants);
  const shinMat = legs === "shorts" ? SKIN : trouser;
  const foreMat = sleeves === "short" ? SKIN : jacket;
  const spine = new THREE.Group();
  spine.name = "spine";
  const torso = new THREE.Mesh(TORSO, jacket);
  torso.position.y = 1.12;
  const hem = new THREE.Mesh(HEM, hemMat);
  hem.position.set(0, 0.88, -0.02);
  const yoke = new THREE.Mesh(YOKE, yokeMat);
  yoke.position.set(0, 1.34, 0);
  const capL = new THREE.Mesh(CAP, yokeMat);
  capL.position.set(-0.22, 1.38, 0);
  const capR = capL.clone();
  capR.position.x = 0.22;
  const seam = new THREE.Mesh(SEAM, hemMat);
  seam.position.set(0, 1.12, -0.115);
  const head = new THREE.Mesh(HEAD, SKIN);
  head.position.set(0, 1.58, 0.04);
  spine.add(torso, hem, yoke, capL, capR, seam, head);
  if (hood) {
    const shell = new THREE.Mesh(HOOD_GEO, jacket);
    shell.name = "hood";
    shell.position.set(0, 1.64, -0.04);
    shell.scale.set(1.22, 0.84, 1.12);
    const cowl = new THREE.Mesh(COWL, jacket);
    cowl.position.set(0, 1.46, -0.06);
    spine.add(shell, cowl);
  } else {
    const mop = new THREE.Mesh(HOOD_GEO, cloth(hair));
    mop.name = "hair";
    mop.position.set(0, 1.66, -0.02);
    mop.scale.set(1.08, 0.58, 1.02);
    spine.add(mop);
  }
  if (bag) {
    const pack = new THREE.Mesh(PACK, cloth(0x2c261f));
    pack.name = "bag";
    pack.position.set(0, 1.12, -0.2);
    spine.add(pack);
  }
  spine.add(armRig("arm-left", -1, jacket, foreMat), armRig("arm-right", 1, jacket, foreMat));
  const shadow = new THREE.Mesh(SHADOW, new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.name = "shadow";
  group.add(
    spine,
    legRig("leg-left", -1, trouser, shinMat, cloth(shoes)),
    legRig("leg-right", 1, trouser, shinMat, cloth(shoes)),
    shadow,
  );
  return group;
}

export function outlineFigure(group) {
  const meshes = [];
  group.traverse((node) => {
    if (node.isMesh && node.name !== "shadow" && node.name !== "outline") meshes.push(node);
  });
  for (const mesh of meshes) {
    const shell = new THREE.Mesh(mesh.geometry, OUTLINE);
    shell.name = "outline";
    shell.scale.setScalar(1.08);
    shell.raycast = () => {};
    mesh.add(shell);
  }
  return group;
}

export function poseCitizen(group, { phase = 0, speed = 0, riding = false } = {}) {
  const swing = riding || speed < 0.25 ? 0 : Math.sin(phase) * 0.75;
  const set = (name, rot) => {
    const node = group.getObjectByName(name);
    if (!node) return;
    node.rotation.x = rot.x || 0;
    node.rotation.z = rot.z || 0;
  };
  set("leg-left", riding ? { x: -1.2, z: -0.62 } : { x: swing, z: -0.08 });
  set("leg-right", riding ? { x: -1.2, z: 0.62 } : { x: -swing, z: 0.08 });
  set("leg-left-knee", { x: riding ? 1.35 : Math.max(0, swing) * 0.45 + 0.12 });
  set("leg-right-knee", { x: riding ? 1.35 : Math.max(0, -swing) * 0.45 + 0.12 });
  set("arm-left", riding ? { x: -0.95, z: -0.42 } : { x: -swing * 0.7, z: -0.16 });
  set("arm-right", riding ? { x: -0.95, z: 0.42 } : { x: swing * 0.7, z: 0.16 });
  set("arm-left-elbow", { x: riding ? -0.85 : -0.35 });
  set("arm-right-elbow", { x: riding ? -0.85 : -0.35 });
  const spine = group.getObjectByName("spine");
  if (spine) spine.rotation.x = riding ? 0.38 : 0;
  const shadow = group.getObjectByName("shadow");
  if (shadow) shadow.visible = !riding;
}

function scooterWheel(z, name) {
  const group = new THREE.Group();
  group.name = name;
  const tire = new THREE.Mesh(SCOOTER_WHEEL, RUBBER);
  tire.rotation.z = Math.PI / 2;
  const hub = new THREE.Mesh(HUB, METAL);
  hub.rotation.z = Math.PI / 2;
  group.add(tire, hub);
  group.position.set(0, 0.3, z);
  return group;
}

function trapezoid(nearZ, farZ, nearHalf, farHalf, y) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
    -nearHalf, y, nearZ,
    nearHalf, y, nearZ,
    farHalf, y, farZ,
    -nearHalf, y, nearZ,
    farHalf, y, farZ,
    -farHalf, y, farZ,
  ]), 3));
  return geometry;
}

function beamLayer(nearZ, farZ, nearHalf, farHalf, y, color, opacity) {
  return new THREE.Mesh(trapezoid(nearZ, farZ, nearHalf, farHalf, y), new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }));
}

// A warm pool on the road ahead of the front wheel, not a disc around the bike.
function headlightPool() {
  const pool = beamLayer(1.6, 16.5, 0.38, 2.6, 0.05, 0xff8a32, 0.4);
  pool.name = "head-glow";
  pool.visible = false;
  pool.renderOrder = 2;
  pool.add(beamLayer(1.75, 11.5, 0.16, 1.15, 0.06, 0xffc56a, 0.72));
  pool.add(beamLayer(1.9, 6.4, 0.08, 0.42, 0.07, 0xfff0c8, 0.85));
  return pool;
}

// Forward is +Z. The chase camera behind the rider should still see the bar, rear wheel, and tail lamp.
export function makeScooterMesh({ color = 0x1e3d72, hero = false } = {}) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const front = scooterWheel(0.84, "wheel-front");
  const rear = scooterWheel(-0.7, "wheel-rear");
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 1.05), paint);
  deck.position.set(0, 0.42, 0.08);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.46), paint);
  tail.position.set(0, 0.5, -0.38);
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.4), paint);
  fender.position.set(0, 0.58, -0.7);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.1), paint);
  shield.position.set(0, 0.72, 0.7);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.42), RUBBER);
  seat.position.set(0, 0.74, -0.02);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), METAL);
  stem.position.set(0, 0.98, 0.62);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.07, 0.07), METAL);
  bar.name = "handlebar";
  bar.position.set(0, 1.2, 0.7);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.09), RUBBER);
  grip.position.set(-0.52, 1.2, 0.7);
  const gripR = grip.clone();
  gripR.position.x = 0.52;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.28), GLASS);
  visor.position.set(0, 0.9, 0.66);
  const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), LAMP);
  headlamp.position.set(0, 0.7, 0.76);
  headlamp.name = "headlamp";
  const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.05), TAIL);
  tailLamp.position.set(0, 0.58, -0.64);
  tailLamp.name = "tail-lamp";
  group.add(front, rear, deck, tail, fender, shield, seat, stem, bar, grip, gripR, visor, headlamp, tailLamp);
  if (hero) group.add(headlightPool());
  return group;
}

export function makeCarMesh(color = 0xd8d4cc) {
  const group = new THREE.Group();
  const paint = cloth(color);
  const dark = cloth(0x1a1c1e);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.42, 4.05), paint);
  body.position.set(0, 0.52, 0);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.16, 1.25), paint);
  hood.position.set(0, 0.76, 1.15);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.2, 0.95), paint);
  trunk.position.set(0, 0.78, -1.35);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.42, 1.55), GLASS);
  glass.position.set(0, 1.02, -0.05);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.08, 1.25), paint);
  roof.name = "roof";
  roof.position.set(0, 1.26, -0.12);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.14), dark);
  bumperF.position.set(0, 0.36, 1.98);
  const bumperR = bumperF.clone();
  bumperR.position.z = -1.98;
  for (const [x, z] of [[0.9, 1.25], [-0.9, 1.25], [0.9, -1.25], [-0.9, -1.25]]) {
    const tire = new THREE.Mesh(CAR_WHEEL, RUBBER);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.34, z);
    const hub = new THREE.Mesh(CAR_HUB, METAL);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.34, z);
    group.add(tire, hub);
  }
  for (const x of [0.55, -0.55]) {
    const lamp = new THREE.Mesh(CAR_LAMP, LAMP);
    lamp.name = "headlamp";
    lamp.position.set(x, 0.58, 2.02);
    const tailLamp = new THREE.Mesh(CAR_TAIL, TAIL);
    tailLamp.name = "tail-lamp";
    tailLamp.position.set(x, 0.7, -1.86);
    group.add(lamp, tailLamp);
  }
  group.add(body, hood, trunk, glass, roof, bumperF, bumperR);
  return group;
}

export const SHIRTS = [0x8c3a2f, 0x2f4f6f, 0x6b5a3a, 0x3d3a55, 0xc4b7a2, 0x245c45];
export const LOOKS = [
  { shirt: 0x8c3a2f, pants: 0x2f4c86, shoes: 0x2a2118, hair: 0x1c140f, hood: false, sleeves: "short", legs: "pants" },
  { shirt: 0x2f4f6f, pants: 0x161616, hair: 0x241c18, hood: true, sleeves: "long", bag: true, legs: "pants" },
  { shirt: 0xd8c7ae, pants: 0x6a5338, shoes: 0x1a1a1a, hair: 0x3d2a1c, hood: false, sleeves: "short", legs: "shorts" },
  { shirt: 0x3d3a55, pants: 0x243044, hair: 0x111111, hood: true, sleeves: "long", legs: "pants" },
  { shirt: 0x1f6b4a, pants: 0x3e342c, hair: 0x0e0e0e, hood: false, sleeves: "long", bag: true, legs: "pants" },
  { shirt: 0xc4552a, pants: 0x2a3348, hair: 0x4a3018, hood: false, sleeves: "short", legs: "pants" },
];
export const CAR_COLORS = [0xe6e1d6, 0xb9b6ae, 0x8e2d2a, 0x1e3d72];
export const SIT_DROP = -0.1;
