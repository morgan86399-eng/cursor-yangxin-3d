import * as THREE from "three";
import { createProjector } from "./geo.js";
import { createAerialFrame, createAerialMaterial, createRoofMaterial, loadAerialTexture } from "./aerial.js";
import { createGroundMask } from "./ground-mask.js";
import { createGround } from "./ground.js";
import { createRoadsAndParks } from "./osm.js";
import { createDetailedBuildings } from "./buildings.js";
import { createSigns } from "./signs.js";
import { createSky, createStreetProps } from "./props.js";
import { createControls } from "./controls.js";
import { approachWalkPoint, hitsCollider } from "./player.js";
import { makePavementDetail } from "./textures.js";
import { createCourtyardFarm } from "./farm.js";
import { createNear50Inventory, near50CameraPose } from "./near50-inventory.js";
import { applyFacadeMode, normalizeFacadeMode } from "./facade-atlas-25d.js";
import { createOpenSpace, PARK_WALK_REACH } from "./open-space.js";
import {
  STREET_QUESTS,
  advanceQuests,
  bindQuestAnchors,
  grantQuestReward,
  loadQuestProgress,
  questMarkerPoints,
  saveQuestProgress,
} from "./quests.js";
import { createQuestMarkers } from "./quest-markers.js";
import { createQuestPads } from "./quest-pads.js";
import { createNpcs } from "./npcs.js";
import { createWaysideShrines } from "./worship.js";

const statusEl = document.getElementById("status");
const addressEl = document.getElementById("address");
const metaEl = document.getElementById("meta");
const creditEl = document.getElementById("credit");
const skyBtn = document.getElementById("skyBtn");
const focusBtn = document.getElementById("focusBtn");
const near50Btn = document.getElementById("near50Btn");
const near50Panel = document.getElementById("near50Panel");
const near50Close = document.getElementById("near50Close");
const near50List = document.getElementById("near50List");
const near50Summary = document.getElementById("near50Summary");
const walkBtn = document.getElementById("walkBtn");
const lockBtn = document.getElementById("lockBtn");
const facadeRealisticBtn = document.getElementById("facadeRealisticBtn");
const facadeMixedBtn = document.getElementById("facadeMixedBtn");
const facade25dBtn = document.getElementById("facade25dBtn");
const facadeNote = document.getElementById("facadeNote");
const hintEl = document.getElementById("hint");
const questListEl = document.getElementById("questList");
const questObjectiveEl = document.getElementById("questObjective");
const questToastEl = document.getElementById("questToast");
const questInteractBtn = document.getElementById("questInteract");
const questDialogEl = document.getElementById("questDialog");
const questDialogNameEl = document.getElementById("questDialogName");
const questDialogTextEl = document.getElementById("questDialogText");
const questDialogChoicesEl = document.getElementById("questDialogChoices");
const crosshairEl = document.getElementById("crosshair");
const lockHintEl = document.getElementById("lockHint");
const initialParams = new URLSearchParams(window.location.search);
const initialView = initialParams.get("view");
const initialBuildingId = initialParams.get("building");
const initialFacadeMode = normalizeFacadeMode(initialParams.get("facade"));

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("讀不到 " + url);
  return res.json();
}

async function boot() {
  setStatus("載入街區資料…");
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const [config, osm, edits, shopData, lotData, crossingData, parkingData] = await Promise.all([
    loadJson("./data/map-config.json"),
    loadJson("./data/osm-200m.json"),
    loadJson("./data/edits.json").catch(() => ({ buildings: {} })),
    loadJson("./data/shops.json").catch(() => ({ shops: [] })),
    loadJson("./data/buildings-nlsc.json").catch(() => ({ buildings: [] })),
    loadJson("./data/crossings.json").catch(() => ({ crossings: [] })),
    loadJson("./data/parking.json").catch(() => ({ lots: [] })),
  ]);
  const shops = shopData.shops || [];
  const buildingCount = lotData.buildings?.length || osm.buildings?.length || 0;

  addressEl.textContent = config.address;
  metaEl.textContent = `${config.label} · 半徑 ${config.radiusMeters} 公尺 · ${buildingCount} 筆建物輪廓 · ${shops.length} 筆店家點位 · 1樓雅善圓／2樓養心`;
  creditEl.textContent = [
    config.ground?.attribution,
    lotData.attribution || "建物框：內政部國土測繪中心",
    "地圖／店名／斑馬線位置 © OpenStreetMap contributors；部分店名參考鎮撫街公開店家資料",
  ]
    .filter(Boolean)
    .join("　");
  const imageCredit = document.createElement("a");
  imageCredit.href = "https://www.mapillary.com/app/?pKey=516366592838568";
  imageCredit.target = "_blank";
  imageCredit.rel = "noopener noreferrer";
  imageCredit.textContent = "andylin／Mapillary 2019 影像";
  const imageLicense = document.createElement("a");
  imageLicense.href = "https://creativecommons.org/licenses/by-sa/4.0/";
  imageLicense.target = "_blank";
  imageLicense.rel = "noopener noreferrer";
  imageLicense.textContent = "CC BY-SA 4.0";
  creditEl.append("　春日路歷史影像參考：", imageCredit, "（", imageLicense, "；現況未驗）");

  const canvas = document.getElementById("view");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: "default",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Full-scene shadow maps are too costly for this dense map; farm contact shadows are local meshes.
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5d6e4);
  scene.fog = new THREE.Fog(0xc5d6e4, 105, 265);
  scene.add(createSky());

  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1600);
  const cameraPos = new THREE.Vector3();

  scene.add(new THREE.AmbientLight(0xfff4e8, 0.46));
  scene.add(new THREE.HemisphereLight(0xe7eef5, 0x8d7864, 0.28));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.98);
  sun.position.set(70, 120, 48);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd5e4f0, 0.2);
  fill.position.set(-50, 40, -35);
  scene.add(fill);

  const project = createProjector(config.lat, config.lon);
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const aerialTex = await loadAerialTexture(config.ground?.image || "data/ground.jpg", anisotropy);
  const detailTex = makePavementDetail();
  const frame = createAerialFrame(config, project);
  const network = createRoadsAndParks(osm, config, project, crossingData.crossings || []);
  const groundMask = createGroundMask(network.roads, frame);
  const aerialMat = createAerialMaterial(aerialTex, { detailTex, cameraPos, frame, groundMask });
  const roofMat = createRoofMaterial(aerialTex);
  scene.add(createGround(frame, aerialMat, config).group);
  scene.add(network.group);
  const world = createDetailedBuildings(osm, config, project, edits, roofMat, frame, network.roads, lotData, aerialTex, shops, {
    facadeMode: initialFacadeMode,
  });
  scene.add(world.group);
  const openSpace = createOpenSpace(osm, parkingData.lots || [], project, config.radiusMeters, world.colliders);
  scene.add(openSpace.group);
  Object.assign(world.landmarkViews, openSpace.views);
  const shrines = createWaysideShrines(osm.pois || [], project, world.colliders);
  if (shrines.count) {
    scene.add(shrines.group);
    world.colliders.push(...shrines.colliders);
    const shrineView = shrines.views["地基主祠"];
    if (shrineView) world.landmarkViews.shrine = shrineView;
  }
  const near50Inventory = createNear50Inventory(lotData.buildings || osm.buildings, world.colliders, project);
  if (initialView === "near50") {
    metaEl.textContent = `${config.label} · 50 公尺逐棟檢視 ${world.facadeStats.near50Footprints} 筆建物輪廓 · 背景地圖仍涵蓋 ${config.radiusMeters} 公尺`;
  }
  const streetProps = createStreetProps(osm, config, project, world.colliders, network.roads);
  scene.add(streetProps);
  const signs = createSigns(shops, network.roads, project, config.radiusMeters, world.colliders);
  scene.add(signs.group);
  // The address and focus control live in the HUD; a floating roof billboard distorts street scale.

  const questAnchors = bindQuestAnchors({
    landmarkViews: world.landmarkViews,
    brandViews: world.brandViews,
    parkQuest: openSpace.quest,
  });
  const questMarkers = createQuestMarkers();
  scene.add(questMarkers.group);
  const questPads = createQuestPads(questAnchors.park?.waypoints || []);
  scene.add(questPads.group);
  const streetNpcs = createNpcs(questAnchors.npcs || {});
  scene.add(streetNpcs.group);
  let questProgress = loadQuestProgress(globalThis.localStorage);
  let questInteractQueued = false;
  let questRewardBusy = false;
  let questTalk = null;
  let questChoice = "";
  let questTalkNext = false;
  let questTalkClose = false;
  let questDialogSig = "";
  const questRewardQueue = [];
  const questLook = new THREE.Vector3();

  function paintQuest(view) {
    if (questObjectiveEl) questObjectiveEl.textContent = view.objective;
    if (questListEl) {
      questListEl.replaceChildren();
      for (const row of view.rows) {
        const item = document.createElement("li");
        item.className = row.done ? "is-done" : row.current ? "is-current" : "";
        const name = document.createElement("strong");
        name.textContent = `${row.id} ${row.name}`;
        const status = document.createElement("span");
        status.textContent = row.done ? `完成 · ${row.reward}` : row.status;
        item.append(name, status);
        questListEl.append(item);
      }
    }
    if (questInteractBtn) {
      const affordance = view.affordance;
      questInteractBtn.hidden = !affordance;
      questInteractBtn.textContent = affordance ? affordance.label : "";
      questInteractBtn.dataset.quest = affordance?.id || "";
    }
    questMarkers.sync(questMarkerPoints(questProgress, questAnchors), controls.getMode() === "sky");
    questPads.sync(questProgress.quests.Q4);
    paintDialog(view.dialog);
  }

  function paintDialog(dialog) {
    if (!questDialogEl) return;
    const sig = dialog ? JSON.stringify(dialog) : "";
    if (sig === questDialogSig) return;
    questDialogSig = sig;
    questDialogEl.hidden = !dialog;
    if (!dialog) return;
    if (questDialogNameEl) questDialogNameEl.textContent = dialog.name || "";
    if (questDialogTextEl) questDialogTextEl.textContent = dialog.text || "";
    if (!questDialogChoicesEl) return;
    questDialogChoicesEl.replaceChildren();
    for (const choice of dialog.choices || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.label;
      button.addEventListener("click", () => {
        questChoice = choice.id;
      });
      questDialogChoicesEl.append(button);
    }
    if (dialog.canNext) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = dialog.nextLabel || "繼續";
      button.addEventListener("click", () => {
        questTalkNext = true;
      });
      questDialogChoicesEl.append(button);
    }
    if (dialog.canClose) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = dialog.closeLabel || "關閉";
      button.addEventListener("click", () => {
        questTalkClose = true;
      });
      questDialogChoicesEl.append(button);
    }
  }

  function applyQuest(dt, interact) {
    const state = controls.getState();
    camera.getWorldDirection(questLook);
    const view = advanceQuests(questProgress, {
      mode: controls.getMode(),
      x: state.x,
      z: state.z,
      dirX: questLook.x,
      dirZ: questLook.z,
      dt,
      interact,
      anchors: questAnchors,
      talk: questTalk,
      choiceId: questChoice,
      talkNext: questTalkNext,
      talkClose: questTalkClose,
    });
    questChoice = "";
    questTalkNext = false;
    questTalkClose = false;
    questTalk = view.closeDialog ? null : (view.talk || null);
    questProgress = view.progress;
    if (view.changed) saveQuestProgress(questProgress, globalThis.localStorage);
    for (const quest of view.completed) {
      if (questToastEl) questToastEl.textContent = `${quest.name}完成，${quest.reward}`;
      questRewardQueue.push(quest);
    }
    paintQuest(view);
    flushQuestRewards();
    return view;
  }

  function flushQuestRewards() {
    if (questRewardBusy) return;
    questRewardBusy = true;
    (async () => {
      try {
        while (questRewardQueue.length) {
          const quest = questRewardQueue.shift();
          const reward = await grantQuestReward(quest);
          const row = questProgress.quests[quest.id];
          if (row && row.status === "done") {
            row.rewardSource = reward.source;
            row.rewardText = reward.text;
            saveQuestProgress(questProgress, globalThis.localStorage);
          }
        }
      } finally {
        questRewardBusy = false;
      }
    })();
  }

  questInteractBtn?.addEventListener("click", () => {
    questInteractQueued = true;
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (controls.getMode() !== "walk") return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable], #questDialog")) return;
    questInteractQueued = true;
  });

  const controls = createControls(camera, renderer, {
    radius: Math.max(config.radiusMeters, PARK_WALK_REACH),
    eyeHeight: config.eyeHeight,
    walkSpeed: config.walkSpeed,
    jumpSpeed: config.jumpSpeed,
    colliders: world.colliders,
    roads: network.roads,
    onMode(mode) {
      skyBtn.classList.toggle("is-on", mode === "sky");
      skyBtn?.setAttribute("aria-pressed", String(mode === "sky"));
      walkBtn.classList.toggle("is-on", mode === "walk");
      walkBtn?.setAttribute("aria-pressed", String(mode === "walk"));
      lockBtn.hidden = mode !== "walk";
      crosshairEl?.classList.toggle("is-on", mode === "walk");
      hintEl.textContent =
        mode === "walk"
          ? "WASD 移動、空白鍵跳躍、Shift 跑步；拖曳畫面轉頭。需要連續轉頭時，可自行鎖定滑鼠，按 Esc 釋放。"
          : mode === "sky"
            ? "天空俯瞰：拖曳平移、滾輪縮放。點「第一視角」走到街上。"
            : "可改「天空俯瞰」或「第一視角」。";
    },
    onLock(locked) {
      lockBtn.textContent = locked ? "按 Esc 解鎖" : "鎖定滑鼠";
      lockBtn.setAttribute("aria-pressed", String(locked));
      lockHintEl?.classList.toggle("is-on", controls.getMode() === "walk" && !locked);
    },
  });
  skyBtn?.classList.add("is-on");
  const modeledNear50 = near50Inventory.filter((item) => item.modeled).length;
  const floorObservedNear50 = near50Inventory.filter((item) => item.observedFloors != null).length;
  const genericNear50 = near50Inventory.filter((item) => item.modelRole === "generic").length;
  const nlscNear50 = near50Inventory.filter((item) => item.id.startsWith("nlsc/")).length;
  const near50Ids = new Set(near50Inventory.map((item) => item.id));
  near50Summary.textContent = `${near50Inventory.length} 筆輪廓（${nlscNear50} NLSC／${near50Inventory.length - nlscNear50} OSM） · ${modeledNear50} 筆有 3D 量體 · ${genericNear50} 筆仍用通用推估外觀 · ${floorObservedNear50} 筆樓層目視 · 0 筆現況立面校準`;
  let selectedNear50Outline = null;
  for (const [index, item] of near50Inventory.entries()) {
    const row = document.createElement("div");
    row.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "near50-item";
    button.dataset.id = item.id;
    button.disabled = !item.modeled;
    const title = document.createElement("strong");
    title.textContent = `${String(index + 1).padStart(2, "0")} · ${item.label}`;
    const detail = document.createElement("span");
    const roleLabels = {
      shop: "店面個別建模",
      neighbor: "鄰房個別建模",
      temple: "寺廟個別建模",
      landmark: "地標個別建模",
      civic: "公共建築個別建模",
      market: "市場個別建模",
      apartment: "集合住宅量體",
      commercial: "商業量體",
      generic: "通用推估外觀",
    };
    detail.textContent = `距中心 ${item.distance.toFixed(1)}m · ${item.height == null ? "模型未載入" : `${item.height.toFixed(1)}m 高度推估`}${item.observedFloors ? ` · ${item.observedFloors} 層目視` : ""} · ${roleLabels[item.modelRole] || "外觀類型待查"}`;
    if (item.recessedWindows) detail.textContent += ` · ${item.recessedWindows} 處立體窗洞（窗位推估）`;
    if (item.normalMapped) detail.textContent += " · 牆面凹凸光影（材質樣式推估）";
    if (item.detailedDrainpipe) detail.textContent += " · 排水管接頭／管箍（位置推估）";
    const neighbor = document.createElement("span");
    const nearId = item.nearestBuildingId || "未找到";
    const outside = !near50Ids.has(nearId) ? "，清冊範圍外" : "";
    const gapText = item.gapMeters > 0.15
      ? `輪廓間距約 ${item.gapMeters.toFixed(1)}m，非現場測量`
      : "輪廓相接／重疊，可能含跨來源重複";
    neighbor.textContent = `${item.source} · 最近 ${nearId}${outside} · ${gapText}`;
    button.append(title, detail, neighbor);
    if (item.historicalVisualNote) {
      const evidence = document.createElement("span");
      evidence.textContent = item.historicalVisualNote;
      button.append(evidence);
    }
    button.addEventListener("click", () => focusNear50Building(item.id));
    row.append(button);
    near50List.append(row);
  }
  function focusNear50Building(id) {
    const item = near50Inventory.find((entry) => entry.id === id);
    const pose = near50CameraPose(item, network.roads, world.colliders);
    if (!pose) return false;
    controls.setMode("sky", {
      x: (pose.x + pose.lookX) / 2,
      z: (pose.z + pose.lookZ) / 2,
      height: Math.max(36, Math.abs(pose.y) + 24),
    });
    if (selectedNear50Outline) {
      scene.remove(selectedNear50Outline);
      selectedNear50Outline.geometry.dispose();
      selectedNear50Outline.material.dispose();
    }
    const outlinePoints = item.ring.map((point) => new THREE.Vector3(point.x, (item.height || 8) + 0.55, point.z));
    selectedNear50Outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints),
      new THREE.LineBasicMaterial({ color: 0xffd27a, depthTest: false }));
    selectedNear50Outline.name = "near50-selection";
    selectedNear50Outline.renderOrder = 10;
    scene.add(selectedNear50Outline);
    near50List.querySelectorAll(".near50-item").forEach((button) => {
      button.classList.toggle("is-current", button.dataset.id === id);
    });
    setStatus(`${item.label}：距中心 ${item.distance.toFixed(1)} 公尺；高度為推估`);
    return true;
  }
  function setNear50Panel(open) {
    near50Panel.hidden = !open;
    near50Btn.setAttribute("aria-expanded", String(open));
    if (open) near50Close.focus();
    else near50Btn.focus();
  }
  near50Btn.addEventListener("click", () => setNear50Panel(near50Panel.hidden));
  near50Close.addEventListener("click", () => setNear50Panel(false));
  const farm = createCourtyardFarm(scene, world.zhenfu, controls, { camera });

  document.querySelectorAll("[data-move]").forEach((button) => {
    const key = button.dataset.move;
    const set = (value) => controls.setKeys({ [key]: value });
    button.addEventListener("pointerdown", (event) => { event.preventDefault(); controls.setMode("walk"); set(true); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => button.addEventListener(name, () => set(false)));
  });
  let lookDrag = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (controls.getMode() === "walk" && !controls.getState().locked) lookDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!lookDrag || lookDrag.id !== event.pointerId) return;
    controls.rotateLook(event.clientX - lookDrag.x, event.clientY - lookDrag.y);
    lookDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", () => { lookDrag = null; });
  canvas.addEventListener("pointercancel", () => { lookDrag = null; });
  canvas.addEventListener("pointerleave", () => { lookDrag = null; });
  window.addEventListener("blur", () => { lookDrag = null; });

  let landmarkWalk = null;
  function showLandmark(cam) {
    if (!cam || !Number.isFinite(cam.lookX) || !Number.isFinite(cam.lookZ)) return false;
    controls.pose(cam.x, cam.y, cam.z, cam.lookX, cam.lookY, cam.lookZ);
    landmarkWalk = cam;
    return true;
  }
  function enterWalkHere() {
    if (controls.getMode() === "walk") return;
    const cam = landmarkWalk;
    controls.setMode("walk");
    if (!cam) return;
    const spot = approachWalkPoint(cam, world.colliders, 0.42);
    if (!spot) return;
    controls.setState({
      x: spot.x,
      y: 0,
      z: spot.z,
      lookX: spot.lookX,
      lookY: spot.lookY,
      lookZ: spot.lookZ,
    });
  }

  const view = initialView === "orbit" ? "sky" : initialView;
  if (view === "top" || view === "sky") {
    controls.setMode("sky", { x: 0, z: 0, height: view === "top" ? 220 : 180 });
  } else if (view === "mid") {
    controls.pose(8, 92, 14, 0, 0, 0, 65);
  } else if (view === "near50") {
    controls.setMode("sky", { x: 0, z: 0, height: 90 });
  } else if (view === "walk") {
    controls.setMode("walk");
  } else if (view === "facade") {
    let best = null;
    world.group.traverse((obj) => {
      if (obj.name !== "facade-atlas-25d" || obj.userData?.nearDetail) return;
      const pos = obj.geometry?.getAttribute("position");
      if (!pos || pos.count < 3) return;
      const ax = pos.getX(0);
      const ay = pos.getY(0);
      const az = pos.getZ(0);
      const bx = pos.getX(1);
      const by = pos.getY(1);
      const bz = pos.getZ(1);
      const cx = pos.getX(2);
      const cy = pos.getY(2);
      const cz = pos.getZ(2);
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      let nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      nz /= len;
      if (Math.abs(ny / len) > 0.35) return;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const dist = Math.hypot(mx, mz);
      const width = Math.hypot(ux, uz);
      if (dist < 70 || dist > 130 || width < 8) return;
      const score = width - Math.abs(dist - 95);
      if (!best || score > best.score) best = { score, mx, mz, nx, nz, y: Math.max(4.2, Math.min(Math.max(ay, cy) * 0.45, 8)) };
    });
    if (best) {
      controls.pose(best.mx + best.nx * 18, best.y, best.mz + best.nz * 18, best.mx, best.y * 0.55, best.mz, 50);
    }
  } else if (view === "farm" && world.zhenfu) {
    const t = world.zhenfu;
    const depth = Math.min((t.courtDepth || 12) - 3.4, 9.4);
    const lookX = t.midX + t.outX * depth + t.rightX * 0.4;
    const lookZ = t.midZ + t.outZ * depth + t.rightZ * 0.4;
    controls.pose(
      lookX + t.outX * 4.6 + t.rightX * 1.7,
      2.15,
      lookZ + t.outZ * 4.6 + t.rightZ * 1.7,
      lookX,
      0.72,
      lookZ,
      42,
    );
  } else if ((view === "zhenfu" || view === "zhenfu3q") && world.zhenfu) {
    const cam = view === "zhenfu3q" ? world.zhenfu.threeQuarter : world.zhenfu.front;
    showLandmark(cam);
  } else if (view === "corner" && world.landmarkViews?.corner) {
    showLandmark(world.landmarkViews.corner);
  } else if (view === "station" && world.landmarkViews?.station) {
    showLandmark(world.landmarkViews.station);
  } else if ((view === "chaoyang" || view === "chaoyang-temple") && world.landmarkViews?.chaoyang) {
    showLandmark(world.landmarkViews.chaoyang);
  } else if ((view === "park" || view === "chaoyang-park") && world.landmarkViews?.park) {
    showLandmark(world.landmarkViews.park);
  } else if ((view === "parking" || view === "chaoyang-parking") && world.landmarkViews?.parking) {
    showLandmark(world.landmarkViews.parking);
  } else if ((view === "market" || view === "chaoyang-market") && world.landmarkViews?.market) {
    showLandmark(world.landmarkViews.market);
  } else if ((view === "activity" || view === "civic") && world.landmarkViews?.activity) {
    showLandmark(world.landmarkViews.activity);
  } else if (view === "shrine" && world.landmarkViews?.shrine) {
    showLandmark(world.landmarkViews.shrine);
  } else if (view === "yashan" || view === "yashan-close") {
    const spot = (world.brandViews || []).find((item) => item.brand === "yashanyuan") || world.brandViews?.[0];
    if (spot) {
      const dx = spot.x - spot.lookX;
      const dz = spot.z - spot.lookZ;
      const k = view === "yashan-close" ? 0.5 : 1;
      const y = view === "yashan-close" ? 4.8 : spot.y || 6.4;
      const lookY = view === "yashan-close" ? 3.5 : spot.lookY || 4.5;
      const cam = {
        x: spot.lookX + dx * k,
        y,
        z: spot.lookZ + dz * k,
        lookX: spot.lookX,
        lookY,
        lookZ: spot.lookZ,
      };
      controls.pose(cam.x, cam.y, cam.z, cam.lookX, cam.lookY, cam.lookZ, 60);
      landmarkWalk = cam;
    }
  } else {
    controls.setMode("sky", { x: 0, z: 0, height: 180 });
  }
  if (initialParams.get("mode") === "walk") enterWalkHere();

  function frameNo46(mode = "normal") {
    const spot = (world.brandViews || []).find((item) => item.brand === "yashanyuan");
    if (!spot) return false;
    if (mode === "normal") {
      controls.setMode("sky", { x: spot.lookX, z: spot.lookZ, height: 48 });
      return true;
    }
    const dx = spot.x - spot.lookX;
    const dz = spot.z - spot.lookZ;
    const close = mode === "close";
    const k = close ? 0.62 : mode === "neighbors" ? 1.15 : 1.4;
    controls.pose(
      spot.lookX + dx * k,
      close ? 4.8 : 6.25,
      spot.lookZ + dz * k,
      spot.lookX,
      close ? 3.5 : 5.7,
      spot.lookZ,
      close ? 65 : 60,
    );
    return true;
  }

  focusBtn.addEventListener("click", () => {
    if (frameNo46()) setStatus("鎮撫街46號：1樓雅善圓、2樓桃園養心推拿");
  });
  skyBtn.addEventListener("click", () => {
    landmarkWalk = null;
    controls.setMode("sky", { x: 0, z: 0, height: 180 });
    setStatus("天空俯瞰：拖曳平移、滾輪縮放");
  });
  walkBtn.addEventListener("click", () => {
    setStatus("第一視角：WASD 移動、空白鍵跳躍。撞到建物會停住");
    enterWalkHere();
  });
  lockBtn.addEventListener("click", () => controls.setLookLocked(!controls.getState().locked));

  const facadeNotes = {
    realistic: "寫實立面：沿用現有近景與通用貼圖，未套用 2.5D 招牌樓。",
    mixed: "混合：50 公尺內維持現有立面，較遠街面為程序化 2.5D 招牌樓（窗框、雨遮、招牌厚度與店面分區，不是實景）。",
    stylized: "2.5D 招牌樓：街面改程序化窗框、雨遮與招牌帶（示意，不是實景）。店面、鄰房、廟宇與地標仍用原模型。",
  };
  function setFacadeMode(mode) {
    const applied = applyFacadeMode(world.group, mode);
    if (world.facadeStats) world.facadeStats.facadeMode = applied;
    for (const [button, value] of [
      [facadeRealisticBtn, "realistic"],
      [facadeMixedBtn, "mixed"],
      [facade25dBtn, "stylized"],
    ]) {
      if (!button) continue;
      const on = applied === value;
      button.classList.toggle("is-on", on);
      button.setAttribute("aria-pressed", String(on));
    }
    if (facadeNote) facadeNote.textContent = facadeNotes[applied];
    if (window.__yangxin) window.__yangxin.facadeMode = applied;
    return applied;
  }
  setFacadeMode(world.facadeStats?.facadeMode || initialFacadeMode);
  facadeRealisticBtn?.addEventListener("click", () => setFacadeMode("realistic"));
  facadeMixedBtn?.addEventListener("click", () => setFacadeMode("mixed"));
  facade25dBtn?.addEventListener("click", () => setFacadeMode("stylized"));

  window.__yangxin = {
    enterWalk(opts) {
      controls.setMode("walk");
    },
    setLookLocked: (locked) => controls.setLookLocked(locked),
    setKeys: (next) => controls.setKeys(next),
    update: (dt) => controls.update(dt),
    getState: () => controls.getState(),
    getLookPose: () => controls.getLookPose(),
    setState: (next) => controls.setState(next),
    colliders: world.colliders,
    shopId: world.shopId,
    buildingCount: world.colliders.length,
    insideBuilding: (x, z) => world.colliders.some((c) => hitsCollider(x, z, 0.2, c)),
    shopCollider: world.colliders.find((c) => c.isShop) || null,
    facadeStats: world.facadeStats || null,
    facadeMode: world.facadeStats?.facadeMode || "mixed",
    setFacadeMode,
    getFacade25dAudit() {
      const audit = {
        atlasVisible: 0,
        atlasHidden: 0,
        nearAtlasVisible: 0,
        farAtlasVisible: 0,
        shopAtlas: 0,
        realisticStreetVisible: 0,
        realisticStreetHidden: 0,
      };
      world.group.traverse((obj) => {
        const layer = obj.userData?.facadeLayer;
        if (layer === "atlas25d") {
          if (obj.userData.isShop) audit.shopAtlas += 1;
          if (obj.visible) {
            audit.atlasVisible += 1;
            if (obj.userData.nearDetail) audit.nearAtlasVisible += 1;
            else audit.farAtlasVisible += 1;
          } else audit.atlasHidden += 1;
        } else if (layer === "realistic-street") {
          if (obj.visible) audit.realisticStreetVisible += 1;
          else audit.realisticStreetHidden += 1;
        }
      });
      return audit;
    },
    near50Inventory,
    getNear50SurfaceAudit() {
      const surfaces = [];
      const drainpipes = [];
      world.group.traverse((mesh) => {
        if (mesh.name === "near50-drainpipe" && mesh.isGroup) {
          const box = new THREE.Box3().setFromObject(mesh);
          drainpipes.push({ ...mesh.userData, position: mesh.position.toArray(),
            min: box.min.toArray(), max: box.max.toArray(), parts: mesh.children.map((part) => part.name) });
        }
        const mat = mesh.material;
        if (!mat || Array.isArray(mat) || mat.userData?.kind !== "near50-cladding") return;
        surfaces.push({
          id: mesh.userData.id,
          type: mat.type,
          colorAsset: mat.map?.userData.asset,
          normalAsset: mat.normalMap?.userData.asset,
          colorSpace: mat.map?.colorSpace,
          normalColorSpace: mat.normalMap?.colorSpace,
          colorRepeat: mat.map?.repeat.toArray(),
          normalRepeat: mat.normalMap?.repeat.toArray(),
          normalScale: mat.normalScale?.toArray(),
          colorLoaded: Boolean(mat.map?.image?.complete && mat.map.image.naturalWidth === 1024),
          normalLoaded: Boolean(mat.normalMap?.image?.complete && mat.normalMap.image.naturalWidth === 1024),
          estimated: mat.userData.estimated,
        });
      });
      return { surfaces, drainpipes };
    },
    focusNear50Building,
    streetPropStats: { near50HistoricalStreetSigns: streetProps.userData.near50HistoricalStreetSigns || 0 },
    signCount: signs.count,
    signNames: signs.names,
    signPendingCalibration: signs.pending,
    roadStats: network.roadStats || null,
    matchedShops: world.matchedShops,
    brandViews: world.brandViews || [],
    neighborViews: world.neighborViews || [],
    landmarkViews: world.landmarkViews || {},
    quests: {
      definitions: STREET_QUESTS,
      anchors: questAnchors,
      getProgress: () => questProgress,
      interact() {
        return applyQuest(0, true);
      },
      skyMarkersVisible() {
        return questMarkers.group.visible && questMarkers.group.children.some((child) => child.visible);
      },
      npcs: Object.entries(questAnchors.npcs || {}).map(([id, npc]) => ({
        id,
        name: npc?.name || "",
        x: npc?.x,
        z: npc?.z,
        range: npc?.range,
        questId: npc?.questId || "",
      })),
      pads() {
        return questPads.group.children.map((pad) => ({
          id: pad.userData.id,
          label: pad.userData.label,
          x: pad.position.x,
          z: pad.position.z,
          color: pad.userData.material.color.getHexString(),
          visible: pad.visible,
        }));
      },
    },
    openSpace: openSpace.group.userData,
    zhenfu: world.zhenfu || null,
    farm,
    renderQuality: {
      fullSceneShadows: renderer.shadowMap.enabled,
      farmContactShadows: true,
      floatingAddressMarkers: scene.getObjectByName("shop-marker")?.children.length || 0,
      toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping ? "ACESFilmic" : "other",
      fogNear: scene.fog?.near || null,
      fogFar: scene.fog?.far || null,
    },
    frameZhenfu(mode) {
      const t = world.zhenfu;
      if (!t) return false;
      const cam = mode === "three" ? t.threeQuarter : t.front;
      controls.pose(cam.x, cam.y, cam.z, t.lookX, t.lookY, t.lookZ);
      return true;
    },
    getView() {
      return controls.getCameraPose();
    },
    frameYashan(mode) {
      return frameNo46(mode);
    },
    framePoint(x, y, z, lookX, lookY, lookZ) {
      controls.pose(x, y, z, lookX, lookY, lookZ, 50);
    },
    buildingRoot: world.group,
    shopList: shops.map((s) => {
      const p = project.toLocal(s.lat, s.lon);
      return { name: s.name, brand: s.kind, x: p.x, z: p.z, floor: s.floor, lat: s.lat, lon: s.lon };
    }),
  };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    cameraPos.copy(camera.position);
    controls.update(dt);
    streetNpcs.faceCamera(camera);
    try { farm?.update(); } catch { /* a failed farm paint must not stop quests */ }
    const interact = questInteractQueued;
    questInteractQueued = false;
    applyQuest(dt, interact);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
  const viewLabels = {
    chaoyang: "朝陽宮",
    "chaoyang-temple": "朝陽宮",
    park: "朝陽公園",
    "chaoyang-park": "朝陽公園",
    parking: "朝陽公園停車場",
    "chaoyang-parking": "朝陽公園停車場",
    market: "朝陽市場",
    "chaoyang-market": "朝陽市場",
    activity: "北門、朝陽二里聯合活動中心",
    civic: "北門、朝陽二里聯合活動中心",
    shrine: "地基主祠",
  };
  if (!(initialBuildingId && focusNear50Building(initialBuildingId))) {
    const framed = viewLabels[initialView];
    setStatus(framed
      ? `已對準${framed}`
      : `已對準 ${config.geocodeNote || config.address}，店家點位 ${shops.length} 筆`);
  }
}

boot().catch((err) => {
  console.error(err);
  setStatus("載入失敗：" + err.message);
});
