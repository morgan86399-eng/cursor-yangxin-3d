import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { cropImageDisposition, FarmAPI, FARM_SYNC_LABEL } from "./farm-api.js";
import { createFarmMockFetcher, farmMockRequested } from "./farm-mock.js";

function place(frame, x, y, z) {
  return new THREE.Vector3(
    frame.midX + frame.rightX * x + frame.outX * z,
    y,
    frame.midZ + frame.rightZ * x + frame.outZ * z,
  );
}

function seeded(slot, item) {
  const n = Math.sin((slot + 1) * 127.1 + (item + 1) * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeSoilTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#69432d";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 360; i += 1) {
    const x = seeded(i, 1) * 256;
    const y = seeded(i, 2) * 256;
    const r = 2 + seeded(i, 3) * 8;
    ctx.fillStyle = seeded(i, 4) > 0.5 ? "rgba(36,21,13,.12)" : "rgba(195,141,94,.1)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.45 + seeded(i, 5) * 0.6), seeded(i, 6) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 3200; i += 1) {
    const x = seeded(i, 7) * 256;
    const y = seeded(i, 8) * 256;
    const r = 0.5 + seeded(i, 9) * 2.1;
    ctx.fillStyle = seeded(i, 10) > 0.55 ? "rgba(205,158,111,.25)" : "rgba(32,19,13,.22)";
    ctx.fillRect(x, y, r, r * (0.7 + seeded(i, 11) * 0.6));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.2);
  texture.anisotropy = 8;
  return texture;
}

function makeContactShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  gradient.addColorStop(0, "rgba(18,10,5,.55)");
  gradient.addColorStop(0.42, "rgba(18,10,5,.3)");
  gradient.addColorStop(0.78, "rgba(18,10,5,.09)");
  gradient.addColorStop(1, "rgba(18,10,5,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeFallbackCropTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = "#6d4a2e";
  ctx.beginPath();
  ctx.ellipse(64, 108, 28, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3f6b34";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(64, 104);
  ctx.lineTo(64, 58);
  ctx.stroke();
  ctx.fillStyle = "#6ea85a";
  ctx.beginPath();
  ctx.ellipse(48, 72, 16, 8, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8fbe72";
  ctx.beginPath();
  ctx.ellipse(80, 66, 18, 9, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d7e7b0";
  ctx.beginPath();
  ctx.arc(64, 48, 7, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.userData = { fallback: true, procedural: true };
  return texture;
}

export async function defaultDecodeCropImage(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("作物圖無法解碼"));
    });
    image.src = url;
    return await loaded;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let cropPlane = null;
function sharedCropPlane() {
  if (!cropPlane) cropPlane = new THREE.PlaneGeometry(1, 1);
  return cropPlane;
}

const cropMaterials = new Map();
function materialForCrop(map) {
  let material = cropMaterials.get(map);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      alphaTest: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    cropMaterials.set(map, material);
  }
  return material;
}

export function createCropBillboard(map, stage, yaw = 0) {
  const group = new THREE.Group();
  group.name = "xintian-crop";
  const height = 0.64 + stage * 0.085;
  const width = height * 0.9;
  const material = materialForCrop(map);
  const plane = sharedCropPlane();
  const front = new THREE.Mesh(plane, material);
  const side = new THREE.Mesh(plane, material);
  front.scale.set(width, height, 1);
  side.scale.set(width * 0.92, height, 1);
  front.position.y = height / 2;
  side.position.y = height / 2;
  side.rotation.y = Math.PI / 2;
  group.add(front, side);
  if (stage >= 5) {
    const leaf = new THREE.Mesh(plane, material);
    leaf.name = "crop-leaf-layer";
    leaf.scale.set(width * 0.72, height * 0.58, 1);
    leaf.position.y = height * 0.68;
    leaf.rotation.y = 0.65;
    group.add(leaf);
  }
  group.rotation.y = yaw;
  group.userData.stage = stage;
  group.userData.yaw = yaw;
  group.userData.crossed = true;
  group.userData.fallback = map?.userData?.fallback === true;
  group.userData.leafLayer = stage >= 5;
  return group;
}

export function createCourtyardFarm(scene, frame, controls, options = {}) {
  if (!frame?.courtDepth) {
    const stuck = document.getElementById("farmSync");
    if (stuck) {
      stuck.textContent = "庭院田地尚未就緒";
      stuck.dataset.phase = "offline";
    }
    return null;
  }
  const search = options.search ?? globalThis.location?.search ?? "";
  const fetcher = options.fetcher || (farmMockRequested(search) ? createFarmMockFetcher() : undefined);
  const api = new FarmAPI(fetcher || ((...args) => fetch(...args)));
  const fetchCrop = options.fetchCrop || ((...args) => fetch(...args));
  const decodeImage = options.decodeImage || defaultDecodeCropImage;
  const camera = options.camera || controls?.camera || null;
  const group = new THREE.Group();
  group.name = "xintian-synced-courtyard-farm";
  const soilTexture = makeSoilTexture();
  const soil = new THREE.MeshStandardMaterial({
    map: soilTexture,
    bumpMap: soilTexture,
    bumpScale: 0.014,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  const edge = new THREE.MeshStandardMaterial({ color: 0x9a8266, roughness: 0.94, metalness: 0 });
  const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8070, roughness: 0.96 });
  const clodMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const stakeMaterial = new THREE.MeshStandardMaterial({ color: 0x6d5340, roughness: 0.9 });
  const wetMaterial = new THREE.MeshBasicMaterial({
    color: 0x3d2a1c,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const contactShadowTexture = makeContactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const bedHeight = 0.18;
  const bedCenterY = 0.16;
  const plantRootY = bedCenterY + bedHeight / 2;
  const beds = [];
  const sprites = [];
  const cropShadows = [];
  const half = Math.max(5.2, frame.courtHalfWidth);
  const xs = [-Math.min(4.2, half * 0.58), -Math.min(2.55, half * 0.35), Math.min(2.55, half * 0.35), Math.min(4.2, half * 0.58)];
  const z0 = frame.courtDepth >= 12 ? 7.2 : 2.1;
  const z1 = Math.max(6.9, frame.courtDepth - 1.05);
  const textureCache = new Map();
  let fallbackTexture = null;
  const bedGeometry = new RoundedBoxGeometry(1.4, bedHeight, 0.96, 4, 0.07);
  const rimGeometry = new RoundedBoxGeometry(1.54, 0.12, 1.1, 4, 0.055);
  const furrowMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(0.07, 0.012, 0.68, 2, 0.006), furrowMaterial, 60);
  furrowMesh.name = "soil-furrows";
  const stoneMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.05, 0), pebbleMaterial, 100);
  stoneMesh.name = "soil-stones";
  const clodMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.023, 0), clodMaterial, 720);
  clodMesh.name = "soil-clods";
  const stakeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), stakeMaterial, 20);
  stakeMesh.name = "plot-lock-stakes";
  const wetMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.42, 18), wetMaterial, 20);
  wetMesh.name = "plot-wet-patches";
  const instance = new THREE.Object3D();
  let furrowIndex = 0;
  let stoneIndex = 0;
  let clodIndex = 0;
  const clodColor = new THREE.Color();
  const furrowColor = new THREE.Color();

  for (let slot = 0; slot < 20; slot += 1) {
    const col = slot % 4;
    const row = Math.floor(slot / 4);
    const z = z0 + ((z1 - z0) * row) / 4;
    const p = place(frame, xs[col], bedCenterY, z);
    const bed = new THREE.Mesh(bedGeometry, soil.clone());
    bed.name = `farm-bed-${slot + 1}`;
    bed.position.copy(p);
    bed.rotation.y = Math.atan2(frame.outX, frame.outZ);
    bed.userData.slot = slot;
    bed.receiveShadow = true;
    group.add(bed);
    const rim = new THREE.Mesh(rimGeometry, edge);
    rim.position.copy(p).setY(0.1);
    rim.rotation.y = bed.rotation.y;
    rim.receiveShadow = true;
    group.add(rim);
    for (let furrow = -1; furrow <= 1; furrow += 1) {
      const offset = place(frame, xs[col] + furrow * 0.31, plantRootY + 0.003, z);
      instance.position.copy(offset);
      instance.rotation.set(0, bed.rotation.y, 0);
      instance.scale.set(1, 1, 1);
      instance.updateMatrix();
      furrowMesh.setMatrixAt(furrowIndex, instance.matrix);
      furrowMesh.setColorAt(furrowIndex, furrowColor.setHex(0x684026));
      furrowIndex += 1;
    }
    for (let item = 0; item < 5; item += 1) {
      const sx = xs[col] + (seeded(slot + 31, item) - 0.5) * 1.08;
      const sz = z + (seeded(slot + 67, item) - 0.5) * 0.62;
      const stoneScale = 0.38 + seeded(slot, item) * 0.4;
      instance.position.copy(place(frame, sx, plantRootY + 0.025, sz));
      instance.rotation.set(seeded(slot + 103, item), seeded(slot + 109, item) * Math.PI, seeded(slot + 127, item));
      instance.scale.set(stoneScale, stoneScale * (0.5 + seeded(slot + 97, item) * 0.45), stoneScale);
      instance.updateMatrix();
      stoneMesh.setMatrixAt(stoneIndex++, instance.matrix);
    }
    for (let item = 0; item < 36; item += 1) {
      const sx = xs[col] + (seeded(slot + 211, item) - 0.5) * 1.2;
      const sz = z + (seeded(slot + 307, item) - 0.5) * 0.76;
      if (Math.hypot(sx - xs[col], sz - z) < 0.13) {
        instance.scale.set(0, 0, 0);
      } else {
        const scale = 0.55 + seeded(slot + 401, item) * 1.15;
        instance.scale.set(scale, scale * (0.35 + seeded(slot + 503, item) * 0.4), scale * (0.65 + seeded(slot + 607, item) * 0.7));
      }
      instance.position.copy(place(frame, sx, plantRootY + 0.005, sz));
      instance.rotation.set(seeded(slot + 701, item) * 0.3, seeded(slot + 809, item) * Math.PI, seeded(slot + 907, item) * 0.3);
      instance.updateMatrix();
      clodMesh.setMatrixAt(clodIndex, instance.matrix);
      clodColor.setHex([0x68432b, 0x8e5d3b, 0xa3724d][Math.floor(seeded(slot + 1013, item) * 3)]);
      clodMesh.setColorAt(clodIndex, clodColor);
      clodIndex += 1;
    }
    instance.position.copy(place(frame, xs[col] + 0.58, plantRootY + 0.16, z + 0.36));
    instance.rotation.set(0, bed.rotation.y, 0);
    instance.scale.set(0, 0, 0);
    instance.updateMatrix();
    stakeMesh.setMatrixAt(slot, instance.matrix);
    instance.position.copy(place(frame, xs[col], plantRootY + 0.012, z));
    instance.rotation.set(-Math.PI / 2, 0, bed.rotation.y);
    instance.scale.set(0, 0, 0);
    instance.updateMatrix();
    wetMesh.setMatrixAt(slot, instance.matrix);
    beds.push({ mesh: bed, position: p, topY: plantRootY, col, row, x: xs[col], z });
    sprites.push(null);
    cropShadows.push(null);
  }
  furrowMesh.instanceMatrix.needsUpdate = true;
  stoneMesh.instanceMatrix.needsUpdate = true;
  clodMesh.instanceMatrix.needsUpdate = true;
  stakeMesh.instanceMatrix.needsUpdate = true;
  wetMesh.instanceMatrix.needsUpdate = true;
  if (furrowMesh.instanceColor) furrowMesh.instanceColor.needsUpdate = true;
  if (clodMesh.instanceColor) clodMesh.instanceColor.needsUpdate = true;
  group.add(furrowMesh, stoneMesh, clodMesh, stakeMesh, wetMesh);
  scene.add(group);

  const panel = document.getElementById("farmPanel");
  const title = document.getElementById("farmTitle");
  const hint = document.getElementById("farmHint");
  const action = document.getElementById("farmAction");
  const picker = document.getElementById("cropPicker");
  const sync = document.getElementById("farmSync");
  let currentSlot = -1;
  let pinnedSlot = -1;
  let actionError = "";
  let acting = false;
  let actionQueued = false;
  let refreshToken = 0;
  let growthKey = "";
  let paintTail = Promise.resolve();
  let pending = Promise.resolve();
  const slotVersion = Array(20).fill(0);

  function enqueue(work) {
    if (acting || actionQueued || api.state.busy) return pending;
    actionQueued = true;
    pending = Promise.resolve(pending).then(async () => {
      try {
        await work();
      } finally {
        actionQueued = false;
      }
    }).catch(() => {});
    return pending;
  }

  function fallbackMap() {
    if (!fallbackTexture) fallbackTexture = makeFallbackCropTexture();
    return fallbackTexture;
  }

  function loadCropMap(url) {
    if (!url) return Promise.resolve(fallbackMap());
    const cached = textureCache.get(url);
    if (cached) return cached;
    const pending = (async () => {
      try {
        const res = await fetchCrop(url, { credentials: "same-origin", cache: "force-cache" });
        const headerType = res.headers?.get?.("content-type") || "";
        if (cropImageDisposition(headerType, res.ok) !== "use") return fallbackMap();
        const blob = await res.blob();
        if (cropImageDisposition(blob.type || headerType, true) !== "use") return fallbackMap();
        const image = await decodeImage(blob);
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        texture.userData = { fallback: false, url };
        return texture;
      } catch {
        return fallbackMap();
      }
    })();
    textureCache.set(url, pending);
    return pending;
  }

  function clearSprite(slot) {
    if (sprites[slot]) group.remove(sprites[slot]);
    sprites[slot] = null;
    if (cropShadows[slot]) group.remove(cropShadows[slot]);
    cropShadows[slot] = null;
  }

  function setMarker(mesh, slot, visible, yRotation) {
    const bed = beds[slot];
    if (mesh === stakeMesh) {
      instance.position.copy(place(frame, bed.x + 0.58, plantRootY + 0.16, bed.z + 0.36));
      instance.rotation.set(0, bed.mesh.rotation.y, 0);
      instance.scale.set(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
    } else {
      instance.position.copy(place(frame, bed.x, plantRootY + 0.012, bed.z));
      instance.rotation.set(-Math.PI / 2, 0, yRotation || bed.mesh.rotation.y);
      instance.scale.set(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
    }
    instance.updateMatrix();
    mesh.setMatrixAt(slot, instance.matrix);
  }

  function paintSoil(slot, view) {
    const bed = beds[slot];
    let tint = 0xffffff;
    if (view.locked) tint = 0x8a847c;
    else if (view.wet) tint = 0xa78468;
    else if (view.unsynced) tint = 0xe7d7c6;
    bed.mesh.material.color.setHex(tint);
    bed.mesh.userData.presentation = view;
    const furrowHex = view.locked ? 0x6d6862 : view.wet ? 0x4e3118 : 0x684026;
    for (let furrow = 0; furrow < 3; furrow += 1) {
      furrowMesh.setColorAt(slot * 3 + furrow, furrowColor.setHex(furrowHex));
    }
    setMarker(stakeMesh, slot, view.locked);
    setMarker(wetMesh, slot, view.wet);
  }

  async function paintSlot(slot) {
    const version = ++slotVersion[slot];
    const view = api.plotView(slot);
    paintSoil(slot, view);
    if (!view.growing || !view.url) {
      clearSprite(slot);
      return;
    }
    if (sprites[slot]?.userData.url === view.url) return;
    const map = await loadCropMap(view.url);
    if (slotVersion[slot] !== version) return;
    const latest = api.plotView(slot);
    if (latest.url !== view.url) return;
    clearSprite(slot);
    const yaw = beds[slot].mesh.rotation.y + (seeded(slot, 17) - 0.5) * 0.5;
    const visual = createCropBillboard(map, latest.stage, yaw);
    visual.userData.url = latest.url;
    visual.userData.slot = slot;
    visual.position.copy(beds[slot].position).setY(plantRootY);
    group.add(visual);
    sprites[slot] = visual;
    const cropShadow = new THREE.Mesh(new THREE.CircleGeometry(0.18 + latest.stage * 0.016, 24), shadowMaterial);
    cropShadow.name = "crop-ground-shadow";
    cropShadow.rotation.x = -Math.PI / 2;
    cropShadow.position.copy(beds[slot].position).setY(plantRootY + 0.006);
    group.add(cropShadow);
    cropShadows[slot] = cropShadow;
  }

  function redraw() {
    paintTail = paintTail.then(async () => {
      await Promise.all(beds.map((_, slot) => paintSlot(slot)));
      if (furrowMesh.instanceColor) furrowMesh.instanceColor.needsUpdate = true;
      stakeMesh.instanceMatrix.needsUpdate = true;
      wetMesh.instanceMatrix.needsUpdate = true;
      updatePanel();
    }).catch(() => {});
    return paintTail;
  }

  function publishSync(interim) {
    const phase = interim || api.state.phase;
    const text = interim ? FARM_SYNC_LABEL[interim] : api.syncLabel();
    if (!sync) return;
    sync.textContent = text;
    sync.dataset.phase = phase;
    sync.classList.toggle("is-guest", phase === "guest");
    sync.classList.toggle("is-ready", phase === "ready");
    sync.classList.toggle("is-offline", phase === "offline");
    sync.classList.toggle("is-syncing", phase === "idle" || phase === "syncing" || phase === "retrying");
  }

  async function refresh(opts = {}) {
    const token = ++refreshToken;
    const retry = Boolean(opts.retry || api.state.phase === "offline");
    const announce = retry || api.state.phase === "idle";
    if (announce) publishSync(retry ? "retrying" : "syncing");
    try {
      await api.refresh({ retry });
    } finally {
      if (token === refreshToken) {
        publishSync();
        await redraw();
      }
    }
  }

  function nearestSlot() {
    if (controls?.getMode?.() !== "walk") return -1;
    const state = controls.getState();
    let best = -1;
    let distance = 2.8;
    beds.forEach((bed, slot) => {
      const d = Math.hypot(state.x - bed.position.x, state.z - bed.position.z);
      if (d < distance) {
        distance = d;
        best = slot;
      }
    });
    return best;
  }

  function updatePanel() {
    const near = nearestSlot();
    const nextSlot = near >= 0 ? near : pinnedSlot;
    if (nextSlot !== currentSlot) {
      actionError = "";
      if (picker) picker.hidden = true;
    }
    currentSlot = nextSlot;
    if (panel) panel.hidden = currentSlot < 0;
    if (currentSlot < 0 || !title || !hint || !action) return;
    const status = api.status(currentSlot);
    const view = api.plotView(currentSlot);
    title.textContent = `庭院田地 ${currentSlot + 1}`;
    hint.textContent = actionError || status.hint;
    action.textContent = status.label;
    action.disabled = !status.canAct || api.state.busy || acting;
    action.dataset.kind = status.kind;
    action.dataset.stage = String(view.stage || 0);
  }

  function growthSignature() {
    let sig = api.state.phase;
    for (let slot = 0; slot < 20; slot += 1) {
      const view = api.plotView(slot);
      sig += `|${view.url}:${view.locked ? 1 : 0}:${view.wet ? 1 : 0}`;
    }
    return sig;
  }

  function update() {
    const nextKey = growthSignature();
    if (nextKey !== growthKey) {
      growthKey = nextKey;
      redraw();
    }
    updatePanel();
    const time = (globalThis.performance?.now?.() || 0) * 0.001;
    sprites.forEach((sprite, slot) => {
      if (!sprite) return;
      sprite.rotation.y = (sprite.userData.yaw || 0) + Math.sin(time * 0.8 + slot * 0.73) * 0.03;
    });
  }

  function selectSlot(slot) {
    pinnedSlot = slot >= 0 && slot < beds.length ? slot : -1;
    updatePanel();
  }

  async function runAction() {
    if (currentSlot < 0 || api.state.busy || acting || actionQueued || action?.disabled) return;
    const status = api.status(currentSlot);
    if (status.kind === "login") {
      if (globalThis.location) globalThis.location.href = "/login?next=%2Fxintian%2Fzhenfu-garden%2F";
      return;
    }
    if (status.kind === "offline") {
      await refresh({ retry: true });
      return;
    }
    if (status.kind === "plant") {
      if (!picker) return;
      picker.replaceChildren();
      for (const crop of api.crops()) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = crop.unlocked ? crop.name : `🔒 ${crop.name}`;
        button.disabled = !crop.unlocked;
        button.dataset.cropId = crop.id;
        button.addEventListener("click", () => {
          if (button.disabled || acting || actionQueued) return;
          picker.hidden = true;
          enqueue(() => perform(() => api.plant(currentSlot, crop.id)));
        });
        picker.append(button);
      }
      picker.hidden = false;
      return;
    }
    if (status.kind === "water") await enqueue(() => perform(() => api.water(currentSlot)));
    if (status.kind === "harvest") await enqueue(() => perform(() => api.harvest(currentSlot)));
  }

  async function perform(operation) {
    if (acting || api.state.busy) return;
    acting = true;
    if (action) action.disabled = true;
    try {
      await operation();
      actionError = "";
    } catch (err) {
      actionError = err?.message || "未能完成，請稍後再試";
    } finally {
      acting = false;
      await redraw();
    }
  }

  action?.addEventListener("click", () => { runAction(); });
  const onKey = (event) => {
    if (event.code === "KeyE" && !event.repeat && panel && !panel.hidden) runAction();
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("focus", () => { refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  const canvas = document.getElementById("view");
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  canvas?.addEventListener("pointerup", (event) => {
    if (!camera || (event.button != null && event.button !== 0)) return;
    const rect = canvas.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(beds.map((bed) => bed.mesh), false)[0];
    if (!hit) return;
    selectSlot(hit.object.userData.slot);
  });
  setInterval(() => { refresh(); }, 15000);
  const ready = refresh();

  return {
    update,
    refresh,
    redraw,
    selectSlot,
    api,
    beds,
    sprites,
    cropShadows,
    clodMesh,
    stakeMesh,
    wetMesh,
    plantRootY,
    ready,
    settle: () => paintTail,
    idle: () => pending,
    detailStats: {
      beds: 20,
      furrows: 60,
      stones: 100,
      clods: 720,
      roundedBeds: true,
      texturedSoil: true,
      raisedSoil: true,
      featheredContactShadows: true,
      crossedBillboards: true,
      lockMarkers: 20,
      wetPatches: 20,
    },
  };
}
