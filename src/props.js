import * as THREE from "three";
import { nearestRoad, pointInRing } from "./geo.js";
import { localRing } from "./buildings.js";
import { hitsCollider } from "./player.js";
import { hash01 } from "./textures.js";
import { roadWidth } from "./roads.js";

export function createSky() {
  const geo = new THREE.SphereGeometry(780, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x8eb8d6) },
      horizon: { value: new THREE.Color(0xdce7ef) },
      ground: { value: new THREE.Color(0xc2b6a4) },
      sunDir: { value: new THREE.Vector3(0.42, 0.72, 0.28).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 ground;
      uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, smoothstep(0.02, 0.78, h));
        col = mix(ground, col, smoothstep(-0.12, 0.06, h));
        float sun = pow(max(dot(d, sunDir), 0.0), 180.0);
        float halo = pow(max(dot(d, sunDir), 0.0), 8.0);
        col += vec3(1.0, 0.93, 0.78) * sun * 0.85;
        col += vec3(1.0, 0.88, 0.7) * halo * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sky";
  mesh.frustumCulled = false;
  return mesh;
}

function makeTree(seed) {
  const g = new THREE.Group();
  const trunkH = 1.6 + hash01(seed, 1) * 0.7;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 + hash01(seed, 2) * 0.06, 0.16 + hash01(seed, 3) * 0.08, trunkH, 6),
    new THREE.MeshLambertMaterial({ color: 0x5a4030 })
  );
  trunk.position.y = trunkH / 2;
  g.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(0.28 + hash01(seed, 4) * 0.05, 0.42, 0.26 + hash01(seed, 5) * 0.07),
  });
  const canopy = new THREE.Group();
  const s1 = 1.15 + hash01(seed, 6) * 0.4;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(s1, 8, 6), leafMat);
  leaf.scale.set(1.05, 0.72, 1.0);
  leaf.position.y = trunkH + 0.15;
  canopy.add(leaf);
  const leaf2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x2f542c })
  );
  leaf2.position.set(0.38, trunkH + 0.35, -0.22);
  leaf2.scale.set(1, 0.7, 1);
  canopy.add(leaf2);
  const leaf3 = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 6, 5),
    new THREE.MeshLambertMaterial({ color: 0x3a5e34 })
  );
  leaf3.position.set(-0.32, trunkH + 0.22, 0.28);
  leaf3.scale.set(1, 0.68, 1);
  canopy.add(leaf3);
  g.add(canopy);
  return g;
}

const scooterBodyMats = new Map();
const scooterDark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const scooterMetal = new THREE.MeshLambertMaterial({ color: 0xc5c8cc });
const scooterWheel = new THREE.MeshLambertMaterial({ color: 0x111111 });
const scooterGlass = new THREE.MeshLambertMaterial({ color: 0x9eb4be, transparent: true, opacity: 0.45 });

function scooterBodyMat(color) {
  let mat = scooterBodyMats.get(color);
  if (!mat) {
    mat = new THREE.MeshLambertMaterial({ color });
    scooterBodyMats.set(color, mat);
  }
  return mat;
}

function makeScooter(seed) {
  const g = new THREE.Group();
  const bodyCol = [0x1c1c1c, 0xd4d0c8, 0x8e2420, 0x1e3d72, 0xe6e1d6, 0x2f4a34][Math.floor(hash01(seed, 1) * 6)];
  const mat = scooterBodyMat(bodyCol);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.07, 0.34), mat);
  deck.position.set(0.02, 0.32, 0);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.48), mat);
  shell.position.set(-0.22, 0.58, 0);
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.46), mat);
  shield.position.set(0.42, 0.7, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.32), scooterDark);
  seat.position.set(-0.16, 0.82, 0);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.36), scooterGlass);
  visor.position.set(0.52, 0.92, 0);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.58), scooterMetal);
  bar.position.set(0.36, 1.02, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 5), scooterMetal);
  stem.position.set(0.36, 0.9, 0);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.16), scooterBodyMat(0xf4f1ea));
  plate.position.set(-0.54, 0.46, 0);
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8);
  const w1 = new THREE.Mesh(wheelGeo, scooterWheel);
  w1.rotation.z = Math.PI / 2;
  w1.position.set(0.46, 0.2, 0);
  const w2 = w1.clone();
  w2.position.set(-0.48, 0.2, 0);
  g.add(deck, shell, shield, seat, visor, bar, stem, plate, w1, w2);
  return g;
}

function makeLamp() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.075, 5.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x3d3a36 })
  );
  pole.position.y = 2.7;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.05, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x3d3a36 })
  );
  arm.position.set(0, 5.28, 0.28);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe7b0, toneMapped: false })
  );
  bulb.position.set(0, 5.2, 0.55);
  g.add(pole, arm, bulb);
  return g;
}

function makeUtilityPole() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 7.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a8680 })
  );
  pole.position.y = 3.7;
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.06, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x5a564e })
  );
  arm.position.y = 7.05;
  g.add(pole, arm);
  return g;
}

function sidewalkPoint(a, b, side, dist) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * side;
  const nz = (dx / len) * side;
  return {
    x: (a.x + b.x) / 2 + nx * dist,
    z: (a.z + b.z) / 2 + nz * dist,
    yaw: Math.atan2(dx, dz),
  };
}

// The plate is visible in the 2019-11-29 Mapillary frame 505287670657351.
// Its exact survey coordinate and 2026 appearance are not known.
export const HISTORICAL_ZHENFU_SIGN = Object.freeze({ x: 37, z: -20, sourceYear: 2019 });

function makeHistoricalZhenfuSign() {
  const group = new THREE.Group();
  group.name = "historical-zhenfu-street-sign";
  group.userData = {
    kind: "street-name-sign",
    sourceImage: "Mapillary/505287670657351",
    sourceYear: HISTORICAL_ZHENFU_SIGN.sourceYear,
    placementEstimated: true,
    currentAppearanceUnverified: true,
  };
  const metal = new THREE.MeshLambertMaterial({ color: 0x6f7471 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 3.7, 8), metal);
  pole.position.y = 1.85;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.06), metal);
  arm.position.set(0.83, 3.53, 0);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.07), metal);
  rim.position.set(1.1, 3.95, 0);
  rim.rotation.y = 0.6;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 230;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#164d43";
  ctx.fillRect(0, 0, 512, 230);
  ctx.strokeStyle = "#f1f4ed";
  ctx.lineWidth = 7;
  ctx.strokeRect(9, 9, 494, 212);
  ctx.fillStyle = "#f7f8f2";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 90px "Noto Sans TC", sans-serif';
  ctx.fillText("鎮撫街", 256, 89);
  ctx.font = "bold 40px Arial, sans-serif";
  ctx.fillText("Zhenfu St.", 256, 171);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.94, 0.79),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false })
  );
  plate.position.set(1.1, 3.95, 0.046);
  plate.rotation.y = 0.6;
  group.add(pole, arm, rim, plate);
  return group;
}

export function createStreetProps(osm, config, project, colliders, roads) {
  const group = new THREE.Group();
  group.name = "street-props";
  const r2 = config.radiusMeters * config.radiusMeters;

  function blocked(x, z, rad = 1.1) {
    return colliders.some((c) => hitsCollider(x, z, rad, c));
  }

  const sign = HISTORICAL_ZHENFU_SIGN;
  const expectedStreetNetwork = (roads || []).some((road) => road.name === "鎮撫街")
    && (roads || []).some((road) => road.name === "春日路");
  const outsideCarriageways = (roads || [])
    .filter((road) => roadWidth(road.highway) > 0)
    .every((road) => Math.sqrt(nearestRoad(sign.x, sign.z, [road]).d) > roadWidth(road.highway) / 2 + 0.35);
  let historicalStreetSigns = 0;
  if (expectedStreetNetwork && sign.x ** 2 + sign.z ** 2 <= Math.min(50, config.radiusMeters) ** 2
    && outsideCarriageways && !blocked(sign.x, sign.z, 0.55)) {
    const streetSign = makeHistoricalZhenfuSign();
    streetSign.position.set(sign.x, 0, sign.z);
    group.add(streetSign);
    historicalStreetSigns = 1;
  }

  for (const green of osm.greens || []) {
    // 朝陽公園改由 open-space 畫草坪、步道與樹，避免再撒一層隨機樹。
    if (/朝陽/.test(green.name || "") && green.kind === "park") continue;
    const pts = localRing(green.ring, project);
    if (pts.length < 4) continue;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minZ = Math.min(...pts.map((p) => p.z));
    const maxZ = Math.max(...pts.map((p) => p.z));
    let placed = 0;
    for (let i = 0; i < 110 && placed < 36; i++) {
      const x = minX + hash01(i + 3.1) * (maxX - minX);
      const z = minZ + hash01(i + 9.7) * (maxZ - minZ);
      if (x * x + z * z > r2) continue;
      if (!pointInRing(x, z, pts) || blocked(x, z)) continue;
      const t = makeTree(i + 2);
      t.scale.setScalar(0.85 + hash01(i + 1.4) * 0.7);
      t.position.set(x, 0, z);
      t.rotation.y = hash01(i) * Math.PI * 2;
      group.add(t);
      placed++;
    }
  }

  let roadTrees = 0;
  for (const road of roads || []) {
    if (!/residential|tertiary|unclassified/.test(road.highway || "")) continue;
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1 && roadTrees < 28; i++) {
      if (hash01(road.id.length + i, 1) < 0.55) continue;
      const side = hash01(i, 2) > 0.5 ? 1 : -1;
      const p = sidewalkPoint(pts[i], pts[i + 1], side, 3.35);
      if (p.x * p.x + p.z * p.z > r2 || blocked(p.x, p.z, 1.3)) continue;
      const t = makeTree(i + 20);
      t.scale.setScalar(0.72 + hash01(i, 3) * 0.28);
      t.position.set(p.x, 0, p.z);
      group.add(t);
      roadTrees++;
    }
  }

  const lampProto = makeLamp();
  let lamps = 0;
  for (const road of roads || []) {
    if (!/鎮撫|朝陽|東門|中山|春日|和平/.test(road.name || "") && road.highway !== "residential") continue;
    const pts = road.pts;
    let acc = 0;
    for (let i = 0; i < pts.length - 1 && lamps < 26; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      acc += Math.hypot(b.x - a.x, b.z - a.z);
      if (acc < 26) continue;
      acc = 0;
      const side = lamps % 2 === 0 ? 1 : -1;
      const p = sidewalkPoint(a, b, side, 2.85);
      if (p.x * p.x + p.z * p.z > r2 || blocked(p.x, p.z, 0.8)) continue;
      const lamp = lampProto.clone();
      lamp.position.set(p.x, 0, p.z);
      lamp.rotation.y = p.yaw;
      group.add(lamp);
      lamps++;
    }
  }

  const poleProto = makeUtilityPole();
  const polePts = [];
  let poles = 0;
  for (const road of roads || []) {
    if (!/鎮撫|朝陽|東門路|中山/.test(road.name || "")) continue;
    const pts = road.pts;
    let acc = 0;
    for (let i = 0; i < pts.length - 1 && poles < 28; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      acc += Math.hypot(b.x - a.x, b.z - a.z);
      if (acc < 22) continue;
      acc = 0;
      const p = sidewalkPoint(a, b, 1, 3.05);
      if (p.x * p.x + p.z * p.z > r2 || blocked(p.x, p.z, 0.9)) continue;
      const pole = poleProto.clone();
      pole.position.set(p.x, 0, p.z);
      group.add(pole);
      polePts.push(p);
      poles++;
    }
  }
  if (polePts.length > 1) {
    const wirePos = [];
    for (let i = 0; i < polePts.length - 1; i++) {
      const a = polePts[i];
      const b = polePts[i + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 48) continue;
      wirePos.push(a.x, 7.05, a.z, b.x, 6.7, b.z);
    }
    if (wirePos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(wirePos, 3));
      group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2a2a28 })));
    }
  }

  let scooters = 0;
  const scooterCap = 150;
  for (const road of roads || []) {
    const name = road.name || "";
    const zhenfu = name.includes("鎮撫街") && !name.includes("巷");
    const other = /朝陽|東門|和平|中山|春日/.test(name);
    if (!zhenfu && !other) continue;
    const pts = road.pts || [];
    const spacing = zhenfu ? 2.2 : 5.4;
    const sides = zhenfu ? [-1, 1] : [hash01(name.length, 3) > 0.5 ? 1 : -1];
    for (let i = 0; i < pts.length - 1 && scooters < scooterCap; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 2.2) continue;
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const yaw = Math.atan2(ux, uz);
      let s = spacing * (0.25 + hash01(i, 2) * 0.45);
      while (s < len - 0.5 && scooters < scooterCap) {
        const x0 = a.x + ux * s;
        const z0 = a.z + uz * s;
        for (const side of sides) {
          if (scooters >= scooterCap) break;
          const px = -uz * side;
          const pz = ux * side;
          for (const dist of [1.7, 2.05, 1.4]) {
            const x = x0 + px * dist;
            const z = z0 + pz * dist;
            if (x * x + z * z > r2) continue;
            if (!zhenfu && x * x + z * z > 150 * 150) continue;
            if (blocked(x, z, 0.5)) continue;
            const shopCol = (colliders || []).find((c) => c.isShop);
            if (shopCol && hitsCollider(x, z, 2.8, shopCol)) continue;
            const bike = makeScooter(scooters * 3 + i);
            bike.position.set(x, 0, z);
            const flip = hash01(scooters, 8) > 0.5 ? Math.PI : 0;
            bike.rotation.y = yaw + Math.PI / 2 + flip + (hash01(scooters, 5) - 0.5) * 0.16;
            group.add(bike);
            scooters++;
            break;
          }
        }
        s += spacing * (0.82 + hash01(s, scooters + 1) * 0.36);
      }
    }
  }

  const lanternRed = new THREE.MeshLambertMaterial({ color: 0xd3222c });
  const lanternGold = new THREE.MeshLambertMaterial({ color: 0xf0c14a });
  let lanterns = 0;
  for (const road of roads || []) {
    const name = road.name || "";
    if (name !== "鎮撫街") continue;
    const pts = road.pts || [];
    for (let i = 0; i < pts.length - 1 && lanterns < 48; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 8) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (Math.hypot(mx, mz) > 70) continue;
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      const half = 3.3;
      const span = Math.max(2, Math.floor(len / 16));
      for (let k = 0; k < span && lanterns < 48; k++) {
        const t = (k + 0.5) / span;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (x > 28 || x < -58) continue;
        const wire = [];
        wire.push(x - uz * half, 6.3, z + ux * half, x + uz * half, 6.15, z - ux * half);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
        group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3a342c })));
        for (let n = 0; n < 4; n++) {
          const u = -half + ((n + 0.5) * (half * 2)) / 4;
          const lx = x - uz * u;
          const lz = z + ux * u;
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lanternRed);
          lamp.scale.set(1, 0.78, 1);
          lamp.position.set(lx, 5.85, lz);
          lamp.userData = { kind: "street-lantern" };
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 6), lanternGold);
          band.position.set(lx, 5.85, lz);
          group.add(lamp, band);
          lanterns += 1;
        }
      }
    }
  }

  group.userData.near50HistoricalStreetSigns = historicalStreetSigns;
  return group;
}
