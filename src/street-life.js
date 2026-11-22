import * as THREE from "three";
import { createPlayerState, stepPlayer } from "./player.js";
import { applyDaylight, DAY_HOURS } from "./daylight.js";
import { chasePose, clampPitch } from "./follow-camera.js";
import { drawRadar } from "./radar.js";
import { createPedestrians, createVehicles, dismountSpot, parkSpot, rideReach, roadLanes, stepPedestrians, stepVehicles } from "./traffic.js";

const RIDE = { radius: 0.7, walkSpeed: 9, runSpeed: 11.5, eyeHeight: 1.45, jumpSpeed: 0 };
const RIDE_CAMERA = [4.8, 3.6, 2.4, 1.4];

function makeWalker() {
  const group = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x2c5234 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.85, 8), cloth);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), skin);
  head.position.y = 1.38;
  group.add(body, head);
  return group;
}

function makeScooter(color = 0x1e3d72) {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.07, 0.32), body);
  deck.position.y = 0.32;
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.42), body);
  shell.position.set(-0.18, 0.55, 0);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 8), dark);
  wheel.rotation.z = Math.PI / 2;
  const front = wheel.clone();
  front.position.set(0.42, 0.18, 0);
  const back = wheel.clone();
  back.position.set(-0.42, 0.18, 0);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe7b0, toneMapped: false }));
  lamp.position.set(0.5, 0.55, 0);
  lamp.name = "headlamp";
  group.add(deck, shell, front, back, lamp);
  return group;
}

function makeCar() {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xc4c0b4 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9ec4c8 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.9), paint);
  cabin.position.y = 0.48;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 0.82), glass);
  roof.position.set(-0.05, 0.86, 0);
  group.add(cabin, roof);
  return group;
}

function collectLamps(root) {
  const lamps = [];
  root.traverse((node) => {
    const material = node.material;
    if (!node.isMesh || !material?.isMeshBasicMaterial || material.map) return;
    if (material.color.getHex() === 0xffe7b0) lamps.push(node);
  });
  return lamps;
}

function faceAlong(mesh, yaw) {
  mesh.rotation.y = yaw - Math.PI / 2;
}

const QUEST_BLIP_KEYS = ["yashan", "chaoyang", "market", "stall", "activity", "station", "shrine"];

export function mountStreetLife({ scene, camera, renderer, controls, roads, colliders, questAnchors, questBlips, worldRadius = 220 }) {
  const enabled = new URLSearchParams(globalThis.location?.search || "").get("life") === "1";
  const api = { enabled, riding: false, hour: 17.5, prepare() {}, update() {} };
  if (!enabled) return api;

  const yawState = { yaw: 0, pitch: 0.15 };
  const lanes = roadLanes(roads);
  const vehicles = createVehicles(lanes, lanes.length ? 8 : 0);
  const people = createPedestrians(lanes, colliders, lanes.length ? 10 : 0);
  const lamps = collectLamps(scene);
  const sky = scene.getObjectByName("sky");
  const sun = scene.children.find((node) => node.isDirectionalLight && node.intensity > 0.5);
  const ambient = scene.children.find((node) => node.isAmbientLight);

  const body = makeWalker();
  const rideMesh = makeScooter(0x1b7a3c);
  rideMesh.name = "ride-scooter";
  rideMesh.scale.set(1.55, 1, 1.65);
  scene.add(body, rideMesh);
  const parked = { x: 2.6, z: 0, yaw: 0 };
  const eyeHeight = controls.getState().eyeHeight;
  let rider = null;
  const actors = new THREE.Group();
  actors.name = "street-life";
  const vehicleMeshes = vehicles.map((vehicle) => {
    const mesh = vehicle.kind === "car" ? makeCar() : makeScooter();
    actors.add(mesh);
    return mesh;
  });
  const pedMeshes = people.map(() => {
    const mesh = makeWalker();
    mesh.scale.setScalar(0.92);
    actors.add(mesh);
    return mesh;
  });
  scene.add(actors);

  const style = document.createElement("style");
  style.textContent = "#street-life{position:fixed;right:16px;bottom:96px;z-index:6;display:grid;gap:8px;justify-items:end;font:13px/1.4 'Noto Sans TC',sans-serif;color:#f4f1ea}#street-life[hidden]{display:none}#street-life canvas{width:148px;height:148px;border-radius:50%}#street-life .row{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;max-width:220px}#street-life button{min-height:36px;border:0;border-radius:999px;padding:6px 10px;background:#2c5234;color:#f4f1ea;cursor:pointer}";
  document.head.append(style);
  const panel = document.createElement("div");
  panel.id = "street-life";
  const radar = document.createElement("canvas");
  radar.width = 180;
  radar.height = 180;
  radar.setAttribute("aria-label", "街區雷達");
  const hours = document.createElement("div");
  hours.className = "row";
  const rideBtn = document.createElement("button");
  rideBtn.type = "button";
  rideBtn.id = "rideScooterBtn";
  rideBtn.textContent = "騎機車";
  panel.append(hours, rideBtn, radar);
  document.body.append(panel);
  for (const preset of DAY_HOURS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.name;
    button.addEventListener("click", () => { api.hour = preset.hour; });
    hours.append(button);
  }

  function endRide() {
    if (!api.riding || !rider) {
      api.riding = false;
      rider = null;
      rideBtn.textContent = "騎機車";
      return;
    }
    const spot = dismountSpot(rider.x, rider.z, yawState.yaw, colliders);
    parked.x = rider.x;
    parked.z = rider.z;
    parked.yaw = yawState.yaw;
    api.riding = false;
    rider = null;
    controls.setDriveExternal(false);
    controls.setState({ x: spot.x, z: spot.z, y: 0, vx: 0, vz: 0, vy: 0, eyeHeight });
    rideBtn.textContent = "騎機車";
  }

  function toggleRide() {
    if (controls.getMode() !== "walk") return;
    if (api.riding) {
      endRide();
      return;
    }
    const state = controls.getState();
    if (rideReach(state.x, state.z, parked) == null) return;
    rider = createPlayerState(parked.x, parked.z, { eyeHeight: RIDE.eyeHeight });
    yawState.yaw = parked.yaw;
    api.riding = true;
    controls.setDriveExternal(true);
    rideBtn.textContent = "下車";
  }
  rideBtn.addEventListener("click", toggleRide);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyF" || event.repeat) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    toggleRide();
  });

  controls.setLookHook((dx, dy) => {
    yawState.yaw -= dx * 0.004;
    yawState.pitch = clampPitch(yawState.pitch - dy * 0.003);
  });

  const lookDir = new THREE.Vector3();
  let lastMode = controls.getMode();
  let radarWait = 0;

  function placeCamera(state) {
    const pose = chasePose({
      x: state.x,
      z: state.z,
      y: state.y,
      yaw: yawState.yaw,
      pitch: yawState.pitch,
      colliders,
      distances: api.riding ? RIDE_CAMERA : undefined,
    });
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  }

  api.prepare = () => {
    controls.setDriveExternal(api.riding && controls.getMode() === "walk");
  };

  api.update = (dt) => {
    const look = applyDaylight({ THREE, scene, sky, sun, ambient, renderer, lamps }, api.hour);
    const mode = controls.getMode();
    if (mode === "walk" && lastMode !== "walk") {
      camera.getWorldDirection(lookDir);
      yawState.yaw = Math.atan2(lookDir.x, lookDir.z);
    }
    lastMode = mode;
    if (mode !== "walk" && api.riding) {
      parked.x = rider?.x ?? parked.x;
      parked.z = rider?.z ?? parked.z;
      parked.yaw = yawState.yaw;
      api.riding = false;
      rider = null;
      controls.setDriveExternal(false);
      rideBtn.textContent = "騎機車";
    }
    let state = controls.getState();
    if (api.riding && rider && mode === "walk") {
      const input = controls.getMoveInput();
      input.jump = false;
      input.fwdX = Math.sin(yawState.yaw);
      input.fwdZ = Math.cos(yawState.yaw);
      input.rightX = Math.cos(yawState.yaw);
      input.rightZ = -Math.sin(yawState.yaw);
      rider = stepPlayer(rider, input, dt, colliders, worldRadius, RIDE);
      controls.setState({
        x: rider.x, z: rider.z, y: rider.y,
        vx: rider.vx, vz: rider.vz, vy: rider.vy,
        eyeHeight: RIDE.eyeHeight,
      });
      parked.x = rider.x;
      parked.z = rider.z;
      parked.yaw = yawState.yaw;
      state = controls.getState();
    }
    const night = api.hour >= 20 || api.hour < 5;
    const vehicleCap = night ? Math.min(3, vehicles.length) : vehicles.length;
    const pedCap = night ? Math.min(4, people.length) : people.length;
    vehicles.forEach((vehicle, index) => {
      vehicle.parked = index >= vehicleCap;
      vehicle.cruise = vehicle.parked ? 0 : vehicle.base;
    });
    people.forEach((person, index) => { person.parked = index >= pedCap; });
    const blockers = [
      { x: state.x, z: state.z, radius: api.riding ? 2.2 : 1.8 },
      ...people.filter((person) => !person.parked).map((person) => ({ x: person.x, z: person.z, radius: 0.8 })),
    ];
    if (!api.riding) blockers.push({ x: parked.x, z: parked.z, radius: 1.5 });
    stepVehicles(vehicles, lanes, dt, blockers);
    stepPedestrians(people, lanes, dt, colliders);
    const lampsOn = look.lamp > 0.4;
    vehicles.forEach((vehicle, index) => {
      const mesh = vehicleMeshes[index];
      mesh.visible = !vehicle.parked;
      mesh.position.set(vehicle.x, 0, vehicle.z);
      faceAlong(mesh, vehicle.yaw);
      const headlamp = mesh.getObjectByName("headlamp");
      if (headlamp) headlamp.visible = lampsOn;
    });
    people.forEach((person, index) => {
      pedMeshes[index].visible = !person.parked;
      pedMeshes[index].position.set(person.x, 0, person.z);
      pedMeshes[index].rotation.y = person.yaw;
    });
    const nearRide = rideReach(state.x, state.z, parked) != null;
    rideMesh.visible = true;
    rideMesh.position.set(parked.x, 0, parked.z);
    faceAlong(rideMesh, parked.yaw);
    const rideLamp = rideMesh.getObjectByName("headlamp");
    if (rideLamp) rideLamp.visible = lampsOn;
    rideBtn.textContent = api.riding ? "下車" : (nearRide ? "按 F 上車" : "靠近機車");
    if (mode !== "walk") {
      body.visible = false;
      panel.hidden = true;
      return;
    }
    if (state.locked) controls.setLookLocked(false);
    panel.hidden = false;
    body.visible = true;
    body.position.set(state.x, state.y + (api.riding ? 0.28 : 0), state.z);
    body.rotation.y = yawState.yaw;
    placeCamera(state);
    radarWait += dt;
    if (radarWait < 0.2 && radarWait !== dt) return;
    radarWait = 0;
    const blips = [{ x: 0, z: 0, color: "#d4af37", radius: 4 }];
    const quests = typeof questBlips === "function" ? questBlips() : [];
    for (const point of quests || []) {
      if (Number.isFinite(point?.x)) blips.push({ x: point.x, z: point.z, color: "#f0a06a", radius: 3.4 });
    }
    if (!quests?.length) {
      for (const key of QUEST_BLIP_KEYS) {
        const anchor = questAnchors?.[key];
        if (Number.isFinite(anchor?.x)) blips.push({ x: anchor.x, z: anchor.z, color: "#f0a06a", radius: 3.2 });
      }
    }
    for (const person of people) {
      if (!person.parked) blips.push({ x: person.x, z: person.z, color: "#9ad0ff", radius: 2.2 });
    }
    if (!api.riding) blips.push({ x: parked.x, z: parked.z, color: "#7dffb2", radius: 3.6 });
    drawRadar(radar, { px: state.x, pz: state.z, yaw: yawState.yaw, blips });
  };

  stepVehicles(vehicles, lanes, 0.05, []);
  if (controls.getMode() !== "pose") {
    if (controls.getMode() !== "walk") controls.setMode("walk");
    camera.getWorldDirection(lookDir);
    yawState.yaw = Math.atan2(lookDir.x, lookDir.z);
    lastMode = "walk";
  }
  const spawned = controls.getState();
  Object.assign(parked, parkSpot(lanes, colliders, spawned.x, spawned.z));
  rideMesh.position.set(parked.x, 0, parked.z);
  faceAlong(rideMesh, parked.yaw);
  const hint = document.getElementById("hint");
  if (hint && controls.getMode() === "walk") {
    hint.textContent = "第三人稱：WASD 移動、拖曳轉向、Shift 跑步。靠近綠色機車按 F 上車，再按 F 下車。E 仍是任務。";
  }
  return api;
}
