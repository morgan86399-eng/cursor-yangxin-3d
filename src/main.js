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
import { hitsCollider } from "./player.js";
import { makePavementDetail } from "./textures.js";
import { createCourtyardFarm } from "./farm.js";
import { createNear50Inventory, near50CameraPose } from "./near50-inventory.js";
import { applyFacadeMode, normalizeFacadeMode } from "./facade-atlas-25d.js";

const statusEl = document.getElementById("status");
const addressEl = document.getElementById("address");
const metaEl = document.getElementById("meta");
const creditEl = document.getElementById("credit");
const orbitBtn = document.getElementById("orbitBtn");
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
  const [config, osm, edits, shopData, lotData, crossingData] = await Promise.all([
    loadJson("./data/map-config.json"),
    loadJson("./data/osm-200m.json"),
    loadJson("./data/edits.json").catch(() => ({ buildings: {} })),
    loadJson("./data/shops.json").catch(() => ({ shops: [] })),
    loadJson("./data/buildings-nlsc.json").catch(() => ({ buildings: [] })),
    loadJson("./data/crossings.json").catch(() => ({ crossings: [] })),
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
  const near50Inventory = createNear50Inventory(lotData.buildings || osm.buildings, world.colliders, project);
  if (initialView === "near50") {
    metaEl.textContent = `${config.label} · 50 公尺逐棟檢視 ${world.facadeStats.near50Footprints} 筆建物輪廓 · 背景地圖仍涵蓋 ${config.radiusMeters} 公尺`;
  }
  const streetProps = createStreetProps(osm, config, project, world.colliders, network.roads);
  scene.add(streetProps);
  const signs = createSigns(shops, network.roads, project, config.radiusMeters, world.colliders);
  scene.add(signs.group);
  // The address and focus control live in the HUD; a floating roof billboard distorts street scale.

  const controls = createControls(camera, renderer, {
    radius: config.radiusMeters,
    eyeHeight: config.eyeHeight,
    walkSpeed: config.walkSpeed,
    jumpSpeed: config.jumpSpeed,
    colliders: world.colliders,
    roads: network.roads,
    onMode(mode) {
      orbitBtn.classList.toggle("is-on", mode === "orbit");
      walkBtn.classList.toggle("is-on", mode === "walk");
      lockBtn.hidden = mode !== "walk";
      crosshairEl?.classList.toggle("is-on", mode === "walk");
      hintEl.textContent =
        mode === "walk"
          ? "WASD 移動、空白鍵跳躍、Shift 跑步；拖曳畫面轉頭。需要連續轉頭時，可自行鎖定滑鼠，按 Esc 釋放。"
          : "拖曳旋轉、滾輪縮放。點「第一視角」在平地移動、跳躍。";
    },
    onLock(locked) {
      lockBtn.textContent = locked ? "按 Esc 解鎖" : "鎖定滑鼠";
      lockBtn.setAttribute("aria-pressed", String(locked));
      lockHintEl?.classList.toggle("is-on", controls.getMode() === "walk" && !locked);
    },
  });
  orbitBtn.classList.add("is-on");
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
    const roleLabels = { shop: "店面個別建模", neighbor: "鄰房個別建模", temple: "寺廟個別建模", landmark: "地標個別建模", generic: "通用推估外觀" };
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
    controls.setMode("orbit");
    camera.fov = 65;
    camera.updateProjectionMatrix();
    camera.position.set(pose.x, pose.y, pose.z);
    controls.orbit.target.set(pose.lookX, pose.lookY, pose.lookZ);
    controls.orbit.minDistance = 2.2;
    controls.orbit.update();
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
  const farm = createCourtyardFarm(scene, world.zhenfu, controls);

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

  const view = initialView;
  if (view === "top") {
    camera.position.set(0, 220, 0.01);
    controls.orbit.target.set(0, 0, 0);
    controls.orbit.update();
  } else if (view === "mid") {
    camera.position.set(8, 92, 14);
    controls.orbit.target.set(0, 0, 0);
    controls.orbit.update();
  } else if (view === "near50") {
    camera.position.set(13, 57, 31);
    controls.orbit.target.set(0, 4, 0);
    controls.orbit.minDistance = 2.2;
    controls.orbit.update();
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
      camera.fov = 50;
      camera.updateProjectionMatrix();
      camera.position.set(best.mx + best.nx * 18, best.y, best.mz + best.nz * 18);
      controls.orbit.target.set(best.mx, best.y * 0.55, best.mz);
      controls.orbit.minDistance = 1.2;
      controls.orbit.update();
    }
  } else if ((view === "zhenfu" || view === "zhenfu3q") && world.zhenfu) {
    const cam = view === "zhenfu3q" ? world.zhenfu.threeQuarter : world.zhenfu.front;
    camera.position.set(cam.x, cam.y, cam.z);
    controls.orbit.target.set(world.zhenfu.lookX, world.zhenfu.lookY, world.zhenfu.lookZ);
    controls.orbit.update();
  } else if (view === "corner" && world.landmarkViews?.corner) {
    const cam = world.landmarkViews.corner;
    camera.position.set(cam.x, cam.y, cam.z);
    controls.orbit.target.set(cam.lookX, cam.lookY, cam.lookZ);
    controls.orbit.minDistance = 2.2;
    controls.orbit.update();
  } else if (view === "station" && world.landmarkViews?.station) {
    const cam = world.landmarkViews.station;
    camera.position.set(cam.x, cam.y, cam.z);
    controls.orbit.target.set(cam.lookX, cam.lookY, cam.lookZ);
    controls.orbit.minDistance = 2.2;
    controls.orbit.update();
  } else if (view === "yashan" || view === "yashan-close") {
    const spot = (world.brandViews || []).find((item) => item.brand === "yashanyuan") || world.brandViews?.[0];
    if (spot) {
      const dx = spot.x - spot.lookX;
      const dz = spot.z - spot.lookZ;
      const k = view === "yashan-close" ? 0.5 : 1;
      camera.position.set(spot.lookX + dx * k, view === "yashan-close" ? 4.8 : spot.y || 6.4, spot.lookZ + dz * k);
      controls.orbit.target.set(spot.lookX, view === "yashan-close" ? 3.5 : spot.lookY || 4.5, spot.lookZ);
      controls.orbit.minDistance = 2.2;
      controls.orbit.update();
    }
  } else {
    controls.setMode("walk");
  }

  function frameNo46(mode = "normal") {
    const spot = (world.brandViews || []).find((item) => item.brand === "yashanyuan");
    if (!spot) return false;
    controls.setMode("orbit");
    const dx = spot.x - spot.lookX;
    const dz = spot.z - spot.lookZ;
    const close = mode === "close";
    const k = close ? 0.62 : mode === "neighbors" ? 1.15 : 1.4;
    camera.fov = close ? 65 : 60;
    camera.updateProjectionMatrix();
    camera.position.set(spot.lookX + dx * k, close ? 4.8 : 6.25, spot.lookZ + dz * k);
    controls.orbit.target.set(spot.lookX, close ? 3.5 : 5.7, spot.lookZ);
    controls.orbit.minDistance = 2.2;
    controls.orbit.update();
    return true;
  }

  focusBtn.addEventListener("click", () => {
    if (frameNo46()) setStatus("鎮撫街46號：1樓雅善圓、2樓桃園養心推拿");
  });
  orbitBtn.addEventListener("click", () => {
    if (controls.getMode() !== "orbit") controls.setMode("orbit");
    camera.fov = 65;
    camera.updateProjectionMatrix();
    camera.position.set(42, 38, 54);
    controls.orbit.target.set(0, 2, 0);
    controls.orbit.update();
  });
  walkBtn.addEventListener("click", () => {
    setStatus("第一視角：WASD 移動、空白鍵跳躍。撞到建物會停住");
    controls.setMode("walk");
  });
  lockBtn.addEventListener("click", () => controls.setLookLocked(!controls.getState().locked));

  const facadeNotes = {
    realistic: "寫實立面：沿用現有近景與通用貼圖，未套用 2.5D 招牌樓。",
    mixed: "混合：50 公尺內維持現有立面，較遠街面為程序化 2.5D 招牌樓（示意窗格與招牌帶，不是實景）。",
    stylized: "2.5D 招牌樓：街面改程序化窗格與招牌帶（示意，不是實景）。店面、鄰房、廟宇與地標仍用原模型。",
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
      camera.position.set(cam.x, cam.y, cam.z);
      controls.orbit.target.set(t.lookX, t.lookY, t.lookZ);
      controls.orbit.update();
      return true;
    },
    frameYashan(mode) {
      return frameNo46(mode);
    },
    framePoint(x, y, z, lookX, lookY, lookZ) {
      controls.setMode("orbit");
      camera.fov = 50;
      camera.updateProjectionMatrix();
      camera.position.set(x, y, z);
      controls.orbit.target.set(lookX, lookY, lookZ);
      controls.orbit.minDistance = 1.2;
      controls.orbit.update();
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
    farm?.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
  if (!(initialBuildingId && focusNear50Building(initialBuildingId))) {
    setStatus(`已對準 ${config.geocodeNote || config.address}，店家點位 ${shops.length} 筆`);
  }
}

boot().catch((err) => {
  console.error(err);
  setStatus("載入失敗：" + err.message);
});
