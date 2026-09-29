import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import {
  PLAYER,
  createPlayerState,
  findStreetSpawn,
  stepPlayer,
} from "./player.js";

export function rotateCameraLook(camera, dx, dy) {
  // lookAt() may encode a forward +Z view as XYZ pitch≈π and roll≈π.
  // Preserve its quaternion before applying the first-person pitch limit.
  if (camera.rotation.order !== "YXZ") camera.rotation.reorder("YXZ");
  camera.rotation.y -= dx * 0.004;
  camera.rotation.x = Math.max(-1.35, Math.min(1.35, camera.rotation.x - dy * 0.004));
}

export function createControls(
  camera,
  renderer,
  { radius, eyeHeight, walkSpeed, jumpSpeed, colliders, roads, onMode, onLock }
) {
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.enableRotate = false;
  orbit.minPolarAngle = 0;
  orbit.maxPolarAngle = 0.08;
  orbit.minDistance = 30;
  orbit.maxDistance = Math.max(radius * 2.2, 420);
  orbit.target.set(0, 0, 0);
  camera.position.set(0, 180, 8);
  orbit.update();

  const look = new PointerLockControls(camera, renderer.domElement);
  look.minPolarAngle = 0.18;
  look.maxPolarAngle = Math.PI - 0.18;
  const keys = { w: false, a: false, s: false, d: false, shift: false, jump: false };
  let mode = "sky";
  let player = createPlayerState(0, 16, { eyeHeight: eyeHeight || PLAYER.eyeHeight });
  const lookDir = new THREE.Vector3();
  const rightDir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function lookTowardShop() {
    const shop = (colliders || []).find((c) => c.isShop);
    if (shop) {
      camera.lookAt((shop.minX + shop.maxX) / 2, 3.15, (shop.minZ + shop.maxZ) / 2);
      return;
    }
    camera.lookAt(0, player.eyeHeight * 0.85, 0);
  }

  function applyWalkPose() {
    const spawn = findStreetSpawn(colliders, roads, PLAYER.radius);
    player = createPlayerState(spawn.x, spawn.z, { eyeHeight: eyeHeight || PLAYER.eyeHeight });
    camera.position.set(player.x, player.eyeHeight, player.z);
    if (Number.isFinite(spawn.lookX) && Number.isFinite(spawn.lookZ)) {
      camera.lookAt(spawn.lookX, spawn.lookY || 3.15, spawn.lookZ);
    } else {
      lookTowardShop();
    }
  }

  function applyPlayerToCamera() {
    camera.position.set(player.x, player.y + player.eyeHeight + player.bob, player.z);
  }

  function applySky(cx, cz, height) {
    const h = Number.isFinite(height) ? height : 180;
    orbit.enabled = true;
    orbit.enableRotate = false;
    orbit.enablePan = true;
    orbit.enableZoom = true;
    orbit.minPolarAngle = 0;
    orbit.maxPolarAngle = 0.08;
    orbit.minDistance = 30;
    orbit.maxDistance = Math.max(radius * 2.2, 420);
    orbit.target.set(cx, 0, cz);
    camera.up.set(0, 1, 0);
    camera.position.set(cx, h, cz + Math.min(8, h * 0.04));
    camera.lookAt(cx, 0, cz);
    orbit.update();
  }

  function pose(x, y, z, lookX, lookY, lookZ, fov) {
    if (look.isLocked) look.unlock();
    mode = "pose";
    orbit.enabled = false;
    camera.up.set(0, 1, 0);
    if (Number.isFinite(fov)) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.position.set(x, y, z);
    camera.lookAt(lookX, lookY, lookZ);
    onMode?.("pose");
    onLock?.(false);
  }

  function setMode(next, focus) {
    if (next === "walk") {
      if (mode !== "walk") {
        orbit.enabled = false;
        applyWalkPose();
        mode = "walk";
        camera.fov = 70;
        camera.updateProjectionMatrix();
        applyPlayerToCamera();
        onMode?.(mode);
      }
      onLock?.(look.isLocked);
      return;
    }
    if (next !== "sky") return;
    if (look.isLocked) look.unlock();
    const cx = Number.isFinite(focus?.x) ? focus.x : 0;
    const cz = Number.isFinite(focus?.z) ? focus.z : 0;
    mode = "sky";
    camera.fov = 55;
    camera.updateProjectionMatrix();
    applySky(cx, cz, focus?.height);
    onMode?.("sky");
    onLock?.(false);
  }

  look.addEventListener("lock", () => onLock?.(true));
  look.addEventListener("unlock", () => {
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    onLock?.(false);
  });

  function setLookLocked(locked) {
    if (mode !== "walk") return;
    if (locked && !look.isLocked) look.lock();
    else if (!locked && look.isLocked) look.unlock();
  }

  function readKey(e, down) {
    if (mode !== "walk") return;
    if (down && e.code === "Escape" && look.isLocked) {
      look.unlock();
      return;
    }
    if (down && e.target instanceof Element) {
      if (e.target.closest("input, textarea, select, [contenteditable]")) return;
      // A clicked walk button keeps focus; only Space needs its native button action.
      if (e.code === "Space" && e.target.closest("button")) return;
    }
    const code = e.code;
    if (code === "KeyW" || code === "ArrowUp") keys.w = down;
    else if (code === "KeyS" || code === "ArrowDown") keys.s = down;
    else if (code === "KeyA" || code === "ArrowLeft") keys.a = down;
    else if (code === "KeyD" || code === "ArrowRight") keys.d = down;
    else if (code === "ShiftLeft" || code === "ShiftRight") keys.shift = down;
    else if (code === "Space") {
      if (down) {
        e.preventDefault();
        if (!e.repeat) keys.jump = true;
      } else {
        keys.jump = false;
      }
    }
  }

  window.addEventListener("keydown", (e) => readKey(e, true));
  window.addEventListener("keyup", (e) => readKey(e, false));
  window.addEventListener("blur", () => Object.keys(keys).forEach((key) => { keys[key] = false; }));

  function setKeys(next) {
    Object.assign(keys, next);
  }

  function rotateLook(dx, dy) {
    if (mode !== "walk") return;
    rotateCameraLook(camera, dx, dy);
  }

  function getLookPose() {
    return {
      pitch: camera.rotation.x,
      roll: camera.rotation.z,
      worldUpY: up.clone().applyQuaternion(camera.quaternion).y,
      forwardY: camera.getWorldDirection(new THREE.Vector3()).y,
    };
  }

  function getCameraPose() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    return {
      mode,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      dirY: dir.y,
    };
  }

  function update(dt) {
    if (mode === "sky") {
      orbit.update();
      return;
    }
    if (mode !== "walk") return;
    camera.getWorldDirection(lookDir);
    lookDir.y = 0;
    if (lookDir.lengthSq() < 1e-6) lookDir.set(0, 0, -1);
    lookDir.normalize();
    rightDir.crossVectors(lookDir, up).normalize();
    player = stepPlayer(
      player,
      {
        forward: (keys.w ? 1 : 0) + (keys.s ? -1 : 0),
        strafe: (keys.d ? 1 : 0) + (keys.a ? -1 : 0),
        run: keys.shift,
        jump: keys.jump,
        fwdX: lookDir.x,
        fwdZ: lookDir.z,
        rightX: rightDir.x,
        rightZ: rightDir.z,
      },
      dt,
      colliders,
      radius,
      { walkSpeed: walkSpeed || PLAYER.walkSpeed, jumpSpeed: jumpSpeed || PLAYER.jumpSpeed, eyeHeight: player.eyeHeight }
    );
    if (keys.jump) keys.jump = false;
    applyPlayerToCamera();
  }

  function getState() {
    return { ...player, mode, locked: look.isLocked };
  }

  function setState(partial) {
    Object.assign(player, partial);
    if (Number.isFinite(partial.lookX) && Number.isFinite(partial.lookZ)) {
      camera.position.set(player.x, player.y + player.eyeHeight, player.z);
      const lookY = Number.isFinite(partial.lookY) ? partial.lookY : player.eyeHeight + player.y;
      camera.lookAt(partial.lookX, lookY, partial.lookZ);
    } else {
      applyPlayerToCamera();
    }
  }

  return {
    orbit, look, getMode: () => mode, setMode, pose, setLookLocked, update, setKeys, rotateLook,
    getLookPose, getCameraPose, getState, setState,
  };
}
