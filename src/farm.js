import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FarmAPI } from "./farm-api.js";

function place(frame, x, y, z) {
  return new THREE.Vector3(
    frame.midX + frame.rightX * x + frame.outX * z,
    y,
    frame.midZ + frame.rightZ * x + frame.outZ * z
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
  // Several sizes of grain keep the soil legible both beside the bed and from eye height.
  for (let i = 0; i < 360; i += 1) {
    const x = seeded(i, 1) * 256;
    const y = seeded(i, 2) * 256;
    const r = 2 + seeded(i, 3) * 8;
    ctx.fillStyle = seeded(i, 4) > .5 ? "rgba(36,21,13,.12)" : "rgba(195,141,94,.1)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (.45 + seeded(i, 5) * .6), seeded(i, 6) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 3200; i += 1) {
    const x = seeded(i, 7) * 256;
    const y = seeded(i, 8) * 256;
    const r = .5 + seeded(i, 9) * 2.1;
    ctx.fillStyle = seeded(i, 10) > .55 ? "rgba(205,158,111,.25)" : "rgba(32,19,13,.22)";
    ctx.fillRect(x, y, r, r * (.7 + seeded(i, 11) * .6));
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
  gradient.addColorStop(.42, "rgba(18,10,5,.3)");
  gradient.addColorStop(.78, "rgba(18,10,5,.09)");
  gradient.addColorStop(1, "rgba(18,10,5,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCourtyardFarm(scene, frame, controls) {
  if (!frame?.courtDepth) return null;
  const api = new FarmAPI();
  const group = new THREE.Group();
  group.name = "xintian-synced-courtyard-farm";
  const soilTexture = makeSoilTexture();
  const soil = new THREE.MeshStandardMaterial({ map: soilTexture, bumpMap: soilTexture, bumpScale: .014, color: 0xffffff, roughness: 1, metalness: 0 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x9a8266, roughness: .94, metalness: 0 });
  const furrowMaterial = new THREE.MeshStandardMaterial({ color: 0x684026, roughness: 1 });
  const pebbleMaterial = new THREE.MeshStandardMaterial({ color: 0x8c8070, roughness: .96 });
  const clodMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const contactShadowTexture = makeContactShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: contactShadowTexture, transparent: true, opacity: .72, depthWrite: false });
  const bedHeight = .18;
  const bedCenterY = .16;
  const plantRootY = bedCenterY + bedHeight / 2;
  const beds = [];
  const sprites = [];
  const cropShadows = [];
  const half = Math.max(5.2, frame.courtHalfWidth);
  const xs = [-Math.min(4.2, half * .58), -Math.min(2.55, half * .35), Math.min(2.55, half * .35), Math.min(4.2, half * .58)];
  // Keep the incense burner, lions and central worship path clear.
  const z0 = frame.courtDepth >= 12 ? 7.2 : 2.1;
  const z1 = Math.max(6.9, frame.courtDepth - 1.05);
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();
  const bedGeometry = new RoundedBoxGeometry(1.4, bedHeight, .96, 4, .07);
  const rimGeometry = new RoundedBoxGeometry(1.54, .12, 1.1, 4, .055);
  const furrowMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(.07, .012, .68, 2, .006), furrowMaterial, 60);
  furrowMesh.name = "soil-furrows";
  const stoneMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.05, 0), pebbleMaterial, 100);
  stoneMesh.name = "soil-stones";
  const clodMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.023, 0), clodMaterial, 720);
  clodMesh.name = "soil-clods";
  const instance = new THREE.Object3D();
  let furrowIndex = 0;
  let stoneIndex = 0;
  let clodIndex = 0;
  const clodColor = new THREE.Color();

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
    rim.position.copy(p).setY(.10);
    rim.rotation.y = bed.rotation.y;
    rim.receiveShadow = true;
    group.add(rim);
    // Three shallow planting furrows keep every bed readable from eye level.
    for (let furrow = -1; furrow <= 1; furrow += 1) {
      const offset = place(frame, xs[col] + furrow * .31, plantRootY + .003, z);
      instance.position.copy(offset);
      instance.rotation.set(0, bed.rotation.y, 0);
      instance.scale.set(1, 1, 1);
      instance.updateMatrix();
      furrowMesh.setMatrixAt(furrowIndex++, instance.matrix);
    }
    // Deterministic small stones break up the perfectly flat computer-made surface.
    for (let item = 0; item < 5; item += 1) {
      const sx = xs[col] + (seeded(slot + 31, item) - .5) * 1.08;
      const sz = z + (seeded(slot + 67, item) - .5) * .62;
      const stoneScale = .38 + seeded(slot, item) * .4;
      instance.position.copy(place(frame, sx, plantRootY + .025, sz));
      instance.rotation.set(seeded(slot + 103, item), seeded(slot + 109, item) * Math.PI, seeded(slot + 127, item));
      instance.scale.set(stoneScale, stoneScale * (.5 + seeded(slot + 97, item) * .45), stoneScale);
      instance.updateMatrix();
      stoneMesh.setMatrixAt(stoneIndex++, instance.matrix);
    }
    // Low clods add real parallax without separate draw calls or covering the crop root.
    for (let item = 0; item < 36; item += 1) {
      const sx = xs[col] + (seeded(slot + 211, item) - .5) * 1.2;
      const sz = z + (seeded(slot + 307, item) - .5) * .76;
      if (Math.hypot(sx - xs[col], sz - z) < .13) {
        // Preserve a clean, exact root point for the plant sprite and contact shadow.
        instance.scale.set(0, 0, 0);
      } else {
        const scale = .55 + seeded(slot + 401, item) * 1.15;
        instance.scale.set(scale, scale * (.35 + seeded(slot + 503, item) * .4), scale * (.65 + seeded(slot + 607, item) * .7));
      }
      instance.position.copy(place(frame, sx, plantRootY + .005, sz));
      instance.rotation.set(seeded(slot + 701, item) * .3, seeded(slot + 809, item) * Math.PI, seeded(slot + 907, item) * .3);
      instance.updateMatrix();
      clodMesh.setMatrixAt(clodIndex, instance.matrix);
      clodColor.setHex([0x68432b, 0x8e5d3b, 0xa3724d][Math.floor(seeded(slot + 1013, item) * 3)]);
      clodMesh.setColorAt(clodIndex, clodColor);
      clodIndex += 1;
    }
    beds.push({ mesh: bed, position: p, topY: bedCenterY + bedHeight / 2 });
    sprites.push(null);
    cropShadows.push(null);
  }
  furrowMesh.instanceMatrix.needsUpdate = true;
  stoneMesh.instanceMatrix.needsUpdate = true;
  clodMesh.instanceMatrix.needsUpdate = true;
  if (clodMesh.instanceColor) clodMesh.instanceColor.needsUpdate = true;
  group.add(furrowMesh, stoneMesh, clodMesh);
  scene.add(group);

  const panel = document.getElementById("farmPanel");
  const title = document.getElementById("farmTitle");
  const hint = document.getElementById("farmHint");
  const action = document.getElementById("farmAction");
  const picker = document.getElementById("cropPicker");
  const sync = document.getElementById("farmSync");
  let currentSlot = -1;

  function clearSprite(slot) {
    if (sprites[slot]) {
      group.remove(sprites[slot]);
      sprites[slot].material.dispose();
    }
    sprites[slot] = null;
    if (cropShadows[slot]) group.remove(cropShadows[slot]);
    cropShadows[slot] = null;
  }
  function redraw() {
    beds.forEach(({ mesh, position }, slot) => {
      const plot = api.plot(slot);
      const unlocked = slot < Number(api.state.me?.user?.slots || 0);
      mesh.material.color.set(unlocked ? (plot?.last_watered_at ? 0xc2aa98 : 0xffffff) : 0x77736d);
      if (!plot || plot.state !== "growing" || !plot.crop_id) { clearSprite(slot); return; }
      const url = api.imageURL(plot.crop_id, api.cropStage(slot));
      if (sprites[slot]?.userData.url === url) return;
      clearSprite(slot);
      let map = textureCache.get(url);
      if (!map) {
        map = textureLoader.load(url);
        map.colorSpace = THREE.SRGBColorSpace;
        textureCache.set(url, map);
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: .08 }));
      sprite.userData.url = url;
      // Anchor the bottom-center of every crop image to the exact center of its soil bed.
      sprite.center.set(.5, 0);
      sprite.position.copy(position).setY(plantRootY);
      const stage = api.cropStage(slot);
      const visualSize = .32 + stage * .052;
      sprite.scale.set(visualSize, visualSize, 1);
      group.add(sprite);
      sprites[slot] = sprite;
      const cropShadow = new THREE.Mesh(new THREE.CircleGeometry(.18 + stage * .012, 24), shadowMaterial);
      cropShadow.name = "crop-ground-shadow";
      cropShadow.rotation.x = -Math.PI / 2;
      cropShadow.position.copy(position).setY(plantRootY + .006);
      group.add(cropShadow);
      cropShadows[slot] = cropShadow;
    });
    updatePanel();
  }
  async function refresh() {
    sync.textContent = "同步中…";
    await api.refresh();
    sync.textContent = api.state.authenticated ? "已與心田同步" : "尚未登入心田";
    redraw();
  }
  function nearestSlot() {
    if (controls.getMode() !== "walk") return -1;
    const state = controls.getState();
    let best = -1;
    let distance = 2.8;
    beds.forEach((bed, slot) => {
      const d = Math.hypot(state.x - bed.position.x, state.z - bed.position.z);
      if (d < distance) { distance = d; best = slot; }
    });
    return best;
  }
  function updatePanel() {
    const nextSlot = nearestSlot();
    if (nextSlot !== currentSlot) picker.hidden = true;
    currentSlot = nextSlot;
    panel.hidden = currentSlot < 0;
    if (currentSlot < 0) return;
    const status = api.status(currentSlot);
    title.textContent = `庭院田地 ${currentSlot + 1}`;
    hint.textContent = status.hint;
    action.textContent = status.label;
    action.disabled = !status.canAct || api.state.busy;
    action.dataset.kind = status.kind;
  }
  function update() {
    updatePanel();
    const time = performance.now() * .001;
    sprites.forEach((sprite, slot) => {
      if (sprite) sprite.material.rotation = Math.sin(time * .8 + slot * .73) * .012;
    });
  }
  async function runAction() {
    if (currentSlot < 0 || api.state.busy) return;
    const status = api.status(currentSlot);
    if (status.kind === "login") {
      location.href = "/login?next=%2Fxintian%2Fzhenfu-garden%2F";
      return;
    }
    if (status.kind === "offline") return refresh();
    if (status.kind === "plant") {
      picker.replaceChildren();
      for (const crop of api.crops()) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = crop.unlocked ? crop.name : `🔒 ${crop.name}`;
        button.disabled = !crop.unlocked;
        button.addEventListener("click", async () => {
          picker.hidden = true;
          await perform(() => api.plant(currentSlot, crop.id));
        });
        picker.append(button);
      }
      picker.hidden = false;
      return;
    }
    if (status.kind === "water") await perform(() => api.water(currentSlot));
    if (status.kind === "harvest") await perform(() => api.harvest(currentSlot));
  }
  async function perform(operation) {
    action.disabled = true;
    try { await operation(); } catch (err) { hint.textContent = err.message; }
    redraw();
  }
  action.addEventListener("click", runAction);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE" && !event.repeat && !panel.hidden) runAction();
  });
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 15000);
  refresh();

  return {
    update, refresh, redraw, api, beds, sprites, cropShadows, clodMesh, plantRootY,
    detailStats: { beds: 20, furrows: 60, stones: 100, clods: 720, roundedBeds: true, texturedSoil: true, raisedSoil: true, featheredContactShadows: true },
  };
}
