import * as THREE from "three";
import { createPlayerState, stepPlayer } from "./player.js";
import { applyDaylight, DAY_HOURS } from "./daylight.js";
import { chasePose, clampPitch } from "./follow-camera.js";
import { drawRadar } from "./radar.js";
import { buildRoadGraph, createPedestrians, createVehicles, dismountSpot, parkSpot, rideReach, roadLanes, routeAlongRoads, stepPedestrians, stepScooter, stepVehicles } from "./traffic.js";
import { CAR_COLORS, makeCarMesh, makeCitizen, makeScooterMesh, poseCitizen, SHIRTS, SIT_DROP } from "./street-art.js";

const RIDE = { radius: 0.7, walkSpeed: 9, runSpeed: 11.5, eyeHeight: 1.45, jumpSpeed: 0 };
const RIDE_CAMERA = [4.8, 3.6, 2.4, 1.4];
const SCOOTER_COLORS = [0x1e3d72, 0xd4d0c8, 0x8e2420, 0x1c1c1c];

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
  mesh.rotation.y = yaw;
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
  const fill = scene.children.find((node) => node.isDirectionalLight && node !== sun);
  const ambient = scene.children.find((node) => node.isAmbientLight);
  const hemi = scene.children.find((node) => node.isHemisphereLight);

  const body = makeCitizen({ shirt: 0x6e8f62, pants: 0x2a3138, pack: true });
  const rideMesh = makeScooterMesh({ color: 0x1b7a3c, hero: true });
  rideMesh.name = "ride-scooter";
  scene.add(body, rideMesh);
  const parked = { x: 2.6, z: 0, yaw: 0 };
  const eyeHeight = controls.getState().eyeHeight;
  let rider = null;
  const actors = new THREE.Group();
  actors.name = "street-life";
  const vehicleMeshes = vehicles.map((vehicle, index) => {
    const mesh = vehicle.kind === "car"
      ? makeCarMesh(CAR_COLORS[index % CAR_COLORS.length])
      : makeScooterMesh({ color: SCOOTER_COLORS[index % SCOOTER_COLORS.length] });
    actors.add(mesh);
    return mesh;
  });
  const pedMeshes = people.map((_, index) => {
    const mesh = makeCitizen({ shirt: SHIRTS[index % SHIRTS.length], hood: false });
    mesh.scale.setScalar(0.94 + (index % 3) * 0.03);
    actors.add(mesh);
    return mesh;
  });
  scene.add(actors);

  const style = document.createElement("style");
  style.textContent = "#street-life{position:fixed;right:16px;bottom:96px;z-index:6;display:grid;gap:8px;justify-items:end;font:13px/1.4 'Noto Sans TC',sans-serif;color:#f4f1ea}#street-life[hidden]{display:none}#street-life canvas{width:148px;height:148px;border-radius:50%}#street-life .row{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;max-width:220px}#street-life button{min-height:36px;border:0;border-radius:999px;padding:6px 10px;background:#2c5234;color:#f4f1ea;cursor:pointer}#rideSpeed,#questGuide{background:rgba(18,16,12,.78);border-radius:999px;padding:4px 10px}#street-grade{position:fixed;inset:0;z-index:3;pointer-events:none;background:radial-gradient(ellipse at center, transparent 58%, rgba(12,8,6,.2) 100%)}#street-grade[hidden]{display:none}#street-grade[data-time='dusk']{background:radial-gradient(ellipse at center, transparent 50%, rgba(64,22,8,.38) 100%)}#street-grade[data-time='night']{background:radial-gradient(ellipse at center, transparent 42%, rgba(2,6,14,.5) 100%)}";
  document.head.append(style);
  const grade = document.createElement("div");
  grade.id = "street-grade";
  document.body.append(grade);
  for (const lamp of lamps) {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
    );
    halo.name = "lamp-halo";
    halo.visible = false;
    lamp.add(halo);
  }
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
    rideSpeed = 0;
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
    followYaw = parked.yaw;
    rideSpeed = 0;
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

  let camYaw = yawState.yaw;
  let lookOffset = 0;
  let lookHold = 0;
  controls.setLookHook((dx, dy) => {
    if (api.riding) {
      lookOffset = Math.max(-1.15, Math.min(1.15, lookOffset - dx * 0.004));
      lookHold = 0.55;
    } else {
      camYaw -= dx * 0.004;
    }
    yawState.pitch = clampPitch(yawState.pitch - dy * 0.003);
  });

  const lookDir = new THREE.Vector3();
  let lastMode = controls.getMode();
  let radarWait = 0;
  let rideSpeed = 0;
  let followYaw = yawState.yaw;
  const roadGraph = buildRoadGraph(lanes);
  let routePoints = [];
  let routeMeters = null;
  let routeWait = 1;
  const speedEl = document.createElement("div");
  speedEl.id = "rideSpeed";
  speedEl.textContent = "步行";
  const guideEl = document.createElement("div");
  guideEl.id = "questGuide";
  panel.insertBefore(guideEl, radar);
  panel.insertBefore(speedEl, guideEl);

  function dampYaw(current, target, amount) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * Math.min(1, amount);
  }

  function placeCamera(state, dt) {
    if (api.riding) {
      if (lookHold > 0) lookHold -= dt;
      else lookOffset = dampYaw(lookOffset, 0, dt * 3.5);
      followYaw = dampYaw(followYaw, yawState.yaw + lookOffset, dt * 3.2);
    } else {
      followYaw = dampYaw(followYaw, camYaw, dt * 10);
    }
    const pose = chasePose({
      x: state.x,
      z: state.z,
      y: state.y,
      yaw: followYaw,
      pitch: yawState.pitch,
      colliders,
      distances: api.riding ? RIDE_CAMERA : undefined,
      lookAhead: api.riding ? 3.8 : 1.4,
      cameraLift: api.riding ? 0.95 : 0,
      lookHeight: api.riding ? 1.05 : 1.35,
    });
    camera.position.set(pose.x, pose.y, pose.z);
    camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
  }

  api.prepare = () => {
    controls.setDriveExternal(controls.getMode() === "walk");
  };

  api.update = (dt) => {
    const look = applyDaylight({ THREE, scene, sky, sun, ambient, hemi, fill, renderer, lamps }, api.hour);
    const mode = controls.getMode();
    if (mode === "walk" && lastMode !== "walk") {
      camera.getWorldDirection(lookDir);
      yawState.yaw = Math.atan2(lookDir.x, lookDir.z);
      camYaw = yawState.yaw;
      followYaw = yawState.yaw;
    }
    lastMode = mode;
    if (mode !== "walk" && api.riding) {
      parked.x = rider?.x ?? parked.x;
      parked.z = rider?.z ?? parked.z;
      parked.yaw = yawState.yaw;
      api.riding = false;
      rider = null;
      rideSpeed = 0;
      controls.setDriveExternal(false);
      rideBtn.textContent = "騎機車";
    }
    let state = controls.getState();
    if (api.riding && rider && mode === "walk") {
      const input = controls.getMoveInput();
      const next = stepScooter({
        x: rider.x, z: rider.z, yaw: yawState.yaw, speed: rideSpeed,
      }, { gas: input.forward, steer: input.strafe, run: input.run }, dt, colliders, worldRadius);
      yawState.yaw = next.yaw;
      rideSpeed = next.speed;
      rider = { ...rider, x: next.x, z: next.z, y: 0, vx: next.vx, vz: next.vz, vy: 0 };
      controls.setState({
        x: rider.x, z: rider.z, y: 0,
        vx: rider.vx, vz: rider.vz, vy: 0,
        eyeHeight: RIDE.eyeHeight,
      });
      parked.x = rider.x;
      parked.z = rider.z;
      parked.yaw = yawState.yaw;
      state = controls.getState();
    } else if (mode === "walk") {
      const input = controls.getMoveInput();
      controls.setKeys({ jump: false });
      const fx = Math.sin(followYaw);
      const fz = Math.cos(followYaw);
      const rx = Math.cos(followYaw);
      const rz = -Math.sin(followYaw);
      const mx = input.forward * fx + input.strafe * rx;
      const mz = input.forward * fz + input.strafe * rz;
      const mag = Math.hypot(mx, mz);
      const prev = controls.getState();
      const stepped = stepPlayer(prev, {
        forward: mag > 0.05 ? 1 : 0,
        strafe: 0,
        run: input.run,
        jump: input.jump,
        fwdX: mag > 0.05 ? mx / mag : fx,
        fwdZ: mag > 0.05 ? mz / mag : fz,
        rightX: rx,
        rightZ: rz,
      }, dt, colliders, worldRadius);
      if (Math.hypot(stepped.vx, stepped.vz) > 0.45) {
        yawState.yaw = dampYaw(yawState.yaw, Math.atan2(stepped.vx, stepped.vz), dt * 12);
      }
      controls.setState({
        x: stepped.x, z: stepped.z, y: stepped.y,
        vx: stepped.vx, vz: stepped.vz, vy: stepped.vy,
        onGround: stepped.onGround, bob: stepped.bob, bobPhase: stepped.bobPhase,
      });
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
    stepPedestrians(people, lanes, dt, colliders, state);
    const lampsOn = look.lamp > 0.4;
    const showLamp = (mesh) => {
      mesh.traverse((node) => {
        if (node.name === "headlamp" || node.name === "tail-lamp" || node.name === "head-glow") node.visible = lampsOn;
      });
    };
    vehicles.forEach((vehicle, index) => {
      const mesh = vehicleMeshes[index];
      mesh.visible = !vehicle.parked;
      mesh.position.set(vehicle.x, 0, vehicle.z);
      faceAlong(mesh, vehicle.yaw);
      showLamp(mesh);
    });
    people.forEach((person, index) => {
      const mesh = pedMeshes[index];
      mesh.visible = !person.parked;
      mesh.position.set(person.x, 0, person.z);
      mesh.rotation.y = person.yaw;
      person.phase = (person.phase || index) + dt * person.speed * 6.5;
      poseCitizen(mesh, { phase: person.phase, speed: person.looking ? 0 : person.speed });
    });
    for (const lamp of lamps) {
      const halo = lamp.getObjectByName("lamp-halo");
      if (halo) halo.visible = lampsOn;
    }
    const nearRide = rideReach(state.x, state.z, parked) != null;
    rideMesh.visible = true;
    rideMesh.position.set(parked.x, 0, parked.z);
    faceAlong(rideMesh, parked.yaw);
    showLamp(rideMesh);
    grade.dataset.time = night ? "night" : (lampsOn ? "dusk" : "day");
    rideBtn.textContent = api.riding ? "下車" : (nearRide ? "按 F 上車" : "靠近機車");
    speedEl.textContent = api.riding ? `時速 ${Math.max(0, Math.round(Math.abs(rideSpeed) * 3.6))}` : "步行";
    const questsNow = typeof questBlips === "function" ? questBlips() : [];
    const goal = (questsNow || []).find((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z));
    routeWait += dt;
    if (goal && routeWait > 0.4) {
      routeWait = 0;
      const found = routeAlongRoads(roadGraph, state.x, state.z, goal.x, goal.z);
      routePoints = found.points;
      routeMeters = found.meters;
    } else if (!goal) {
      routePoints = [];
      routeMeters = null;
    }
    guideEl.textContent = Number.isFinite(routeMeters) ? `任務 ${Math.round(routeMeters)} 公尺` : "";
    if (mode !== "walk") {
      body.visible = false;
      panel.hidden = true;
      grade.hidden = true;
      return;
    }
    if (state.locked) controls.setLookLocked(false);
    panel.hidden = false;
    grade.hidden = false;
    body.visible = true;
    const pace = api.riding ? Math.abs(rideSpeed) : Math.hypot(state.vx || 0, state.vz || 0);
    body.userData.phase = (body.userData.phase || 0) + dt * (api.riding ? 0 : pace) * 6.5;
    poseCitizen(body, { phase: body.userData.phase, speed: pace, riding: api.riding });
    body.position.set(state.x, state.y + (api.riding ? SIT_DROP : 0), state.z);
    body.rotation.y = yawState.yaw;
    placeCamera(state, dt);
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
    const guide = goal || quests?.find((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z)) || null;
    drawRadar(radar, { px: state.x, pz: state.z, yaw: yawState.yaw, blips, guide, route: routePoints });
  };

  stepVehicles(vehicles, lanes, 0.05, []);
  if (controls.getMode() !== "pose") {
    if (controls.getMode() !== "walk") controls.setMode("walk");
    camera.getWorldDirection(lookDir);
    yawState.yaw = Math.atan2(lookDir.x, lookDir.z);
    camYaw = yawState.yaw;
    followYaw = yawState.yaw;
    lastMode = "walk";
  }
  const spawned = controls.getState();
  Object.assign(parked, parkSpot(lanes, colliders, spawned.x, spawned.z));
  rideMesh.position.set(parked.x, 0, parked.z);
  faceAlong(rideMesh, parked.yaw);
  const hint = document.getElementById("hint");
  if (hint && controls.getMode() === "walk") {
    hint.textContent = "走路：WASD 相對鏡頭移動，人會轉向走的方向，拖曳只轉動鏡頭。機車：F 上下車，W 加油、S 煞車、A D 轉車頭，拖曳暫時看旁邊。雷達黃線沿著街道通往任務，E 仍是任務。";
  }
  return api;
}
