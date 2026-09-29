import assert from "node:assert/strict";
import * as THREE from "three";
import { rotateCameraLook } from "../src/controls.js";
import {
  PLAYER,
  createPlayerState,
  findStreetSpawn,
  hitsCollider,
  pushCircleOut,
  resolveMove,
  stepPlayer,
} from "../src/player.js";

function square(x0, z0, x1, z1) {
  const points = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
    { x: x0, z: z0 },
  ];
  return { points, minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: 8 };
}

const building = square(0, 0, 10, 10);
const colliders = [building];

// A +Z lookAt can be represented as XYZ pitch≈π and roll≈π; the first 1px drag must not flip it.
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
camera.position.set(0.1, 1.62, -10);
camera.lookAt(0.1, 3.35, -1.6);
const cameraUpY = () => new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).y;
const originalForwardY = camera.getWorldDirection(new THREE.Vector3()).y;
assert.equal(camera.rotation.order, "XYZ");
assert.ok(camera.rotation.x > 2.8 && Math.abs(camera.rotation.z) > 3, "reproduction requires the ambiguous +Z Euler pose");
rotateCameraLook(camera, 1, 1);
assert.equal(camera.rotation.order, "YXZ");
assert.ok(cameraUpY() > 0.2, `first drag inverted the camera: upY=${cameraUpY()}`);
assert.ok(Math.abs(camera.getWorldDirection(new THREE.Vector3()).y - originalForwardY) < 0.03, "1px drag changed pitch too much");
for (const dy of [10000, -10000]) {
  rotateCameraLook(camera, 0, dy);
  assert.ok(cameraUpY() > 0.2, `vertical drag inverted the camera: dy=${dy}, upY=${cameraUpY()}`);
  assert.ok(Math.abs(camera.rotation.x) <= 1.35 + 1e-9, "walk pitch exceeded its limit");
}
camera.lookAt(0.1, 3.35, -1.6);
rotateCameraLook(camera, 1, 1);
assert.ok(cameraUpY() > 0.2, "re-entering a lookAt pose must remain upright");

assert.equal(hitsCollider(-1, 5, 0.4, building), false, "outside is free");
assert.equal(hitsCollider(5, 5, 0.4, building), true, "inside is blocked");
assert.equal(hitsCollider(-0.2, 5, 0.4, building), true, "circle overlapping wall is blocked");

const pushed = pushCircleOut(5, 5, 0.4, building);
assert.equal(pushed.hit, true);
assert.equal(hitsCollider(pushed.x, pushed.z, 0.39, building), false, "push-out leaves the building");

const intoWall = resolveMove(-1, 5, 0.4, colliders, 200);
assert.equal(intoWall.hit, false);
let x = -1;
let z = 5;
for (let i = 0; i < 40; i++) {
  const next = resolveMove(x + 0.3, z, 0.4, colliders, 200);
  x = next.x;
  z = next.z;
}
assert.ok(x < 0.05, `walk into building stops outside, x=${x}`);
assert.equal(hitsCollider(x, z, 0.39, building), false, "never enters building");

let state = createPlayerState(-2, 5);
for (let i = 0; i < 90; i++) {
  state = stepPlayer(
    state,
    { forward: 1, strafe: 0, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: 1 },
    1 / 60,
    colliders,
    200
  );
}
assert.ok(state.x < 0.05, `first-person walk is blocked by wall, x=${state.x}`);
assert.equal(state.blocked, true);
assert.equal(hitsCollider(state.x, state.z, PLAYER.radius - 0.02, building), false);

state = createPlayerState(-4, 5);
const groundedY = state.y;
state = stepPlayer(state, { jump: true, fwdX: 0, fwdZ: -1, rightX: 1, rightZ: 0 }, 1 / 60, colliders, 200);
assert.ok(state.y > groundedY, "jump leaves the ground");
assert.equal(state.onGround, false);
let maxY = state.y;
for (let i = 0; i < 120; i++) {
  state = stepPlayer(state, { fwdX: 0, fwdZ: -1, rightX: 1, rightZ: 0 }, 1 / 60, colliders, 200);
  if (state.y > maxY) maxY = state.y;
}
assert.ok(maxY > 0.6 && maxY < 2.2, `jump height feels like a step, maxY=${maxY}`);
assert.equal(state.onGround, true);
assert.equal(state.y, 0);

state = createPlayerState(-2, 5);
state = stepPlayer(state, { jump: true, forward: 1, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: 1 }, 1 / 60, colliders, 200);
for (let i = 0; i < 80; i++) {
  state = stepPlayer(state, { forward: 1, fwdX: 1, fwdZ: 0, rightX: 0, rightZ: 1 }, 1 / 60, colliders, 200);
}
assert.ok(state.x < 0.05, `still blocked by building while in the air, x=${state.x}`);

const shop = square(-3, -1.6, 3.2, 2.4);
shop.isShop = true;
const roads = [
  {
    name: "鎮撫街",
    highway: "residential",
    pts: [
      { x: -30, z: -8 },
      { x: 30, z: -8 },
    ],
  },
];
const spawn = findStreetSpawn([shop], roads, PLAYER.radius);
assert.equal(hitsCollider(spawn.x, spawn.z, PLAYER.radius, shop), false, "spawn is outside the shop");
assert.ok(Math.hypot(spawn.x - 0, spawn.z - 0) > 4.5, `spawn stands in the street, d=${Math.hypot(spawn.x, spawn.z)}`);
assert.ok(Number.isFinite(spawn.lookX), "spawn looks at the shop facade");
assert.equal(hitsCollider(spawn.x, spawn.z, 1.8, shop), false, "spawn keeps clearance from the shutter");

console.log("player physics ok", { stopX: x, jumpMax: Number(maxY.toFixed(2)), spawn });
