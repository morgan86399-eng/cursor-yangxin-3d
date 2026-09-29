import * as THREE from "three";

/** 桃園鎮撫宮（鎮撫街43號）。幾何與貼圖都是依照片重畫的簡模，不是照片網格。 */
export const ZHENFU_HALL_ID = "way/546763425";
export const ZHENFU_ANNEX_ID = "nlsc/343";
export const ZHENFU_PLAQUE = "鎮撫宮";

const CJK = "'Noto Sans TC','WenQuanYi Micro Hei','Droid Sans Fallback',sans-serif";

const texCache = new Map();

function canvasTexture(key, w, h, draw, { wrap = false } = {}) {
  if (typeof document === "undefined") return null;
  if (texCache.has(key)) return texCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  texCache.set(key, tex);
  return tex;
}

function lambert(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra });
}

function mapped(tex, fallback) {
  if (!tex) return lambert(fallback);
  return new THREE.MeshLambertMaterial({ map: tex, color: "#ffffff", side: THREE.DoubleSide });
}

function reliefTexture() {
  return canvasTexture("zhenfu-relief", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#3a4844";
    ctx.fillRect(0, 0, w, h);
    const cols = 2;
    const rows = 2;
    const gw = w / cols;
    const gh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = x * gw + 16;
        const py = y * gh + 16;
        const pw = gw - 32;
        const ph = gh - 32;
        ctx.fillStyle = "#445650";
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = "#8b9a92";
        ctx.lineWidth = 8;
        ctx.strokeRect(px + 6, py + 6, pw - 12, ph - 12);
        ctx.strokeStyle = "#2c3834";
        ctx.lineWidth = 4;
        ctx.strokeRect(px + 22, py + 22, pw - 44, ph - 44);
        ctx.beginPath();
        ctx.moveTo(px + 40, py + ph * 0.72);
        ctx.quadraticCurveTo(px + pw * 0.5, py + 36, px + pw - 40, py + ph * 0.68);
        ctx.stroke();
        ctx.fillStyle = "#5e6e68";
        ctx.beginPath();
        ctx.ellipse(px + pw * 0.5, py + ph * 0.48, pw * 0.12, ph * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a3632";
        ctx.fillRect(px + pw * 0.46, py + ph * 0.28, pw * 0.08, ph * 0.28);
      }
    }
  }, { wrap: true });
}

function plaqueTexture(text) {
  return canvasTexture(`zhenfu-plaque:${text}`, 640, 240, (ctx, w, h) => {
    ctx.fillStyle = "#1a120c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e2b43a";
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.strokeStyle = "#8c1f1c";
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, w - 52, h - 52);
    ctx.fillStyle = "#f0d56a";
    ctx.font = `700 108px ${CJK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 6);
  });
}

function ornamentPlaqueTexture() {
  return canvasTexture("zhenfu-plaque-small", 480, 160, (ctx, w, h) => {
    ctx.fillStyle = "#2a160e";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e2b43a";
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#f0d56a";
    ctx.fillRect(w * 0.18, h * 0.46, w * 0.64, 6);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
    ctx.fill();
  });
}

function graniteTexture() {
  return canvasTexture("zhenfu-granite", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8e8b86";
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const shade = 156 + ((x * 3 + y * 7) % 5) * 10;
        ctx.fillStyle = `rgb(${shade},${shade - 1},${shade - 4})`;
        ctx.fillRect(x * (w / n) + 3, y * (h / n) + 3, w / n - 6, h / n - 6);
      }
    }
  }, { wrap: true });
}

function pinkTileTexture() {
  return canvasTexture("zhenfu-pink", 256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#c4a090";
    ctx.fillRect(0, 0, w, h);
    const rows = 16;
    const cols = 6;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const shift = y % 2 ? w / cols / 2 : 0;
        const shade = 176 + ((x + y) % 3) * 12;
        ctx.fillStyle = `rgb(${shade + 28},${shade - 18},${shade - 36})`;
        ctx.fillRect(x * (w / cols) + shift + 2, y * (h / rows) + 2, w / cols - 4, h / rows - 4);
      }
    }
    ctx.fillStyle = "rgba(90,60,50,0.35)";
    ctx.fillRect(0, h * 0.33, w, 8);
    ctx.fillRect(0, h * 0.66, w, 8);
  }, { wrap: true });
}

function streetSignTexture() {
  return canvasTexture("zhenfu-street-sign", 280, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#c41218";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f0d56a";
    ctx.lineWidth = 16;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = "#f6dc78";
    ctx.font = `700 120px ${CJK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = [...ZHENFU_PLAQUE];
    chars.forEach((ch, i) => {
      ctx.fillText(ch, w / 2, 150 + i * 170);
    });
    drawBagua(ctx, w / 2, h - 210, 78);
  });
}

function annexSignTexture() {
  return canvasTexture("zhenfu-annex-sign", 640, 200, (ctx, w, h) => {
    ctx.fillStyle = "#3a342c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f0d56a";
    ctx.font = `700 112px ${CJK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ZHENFU_PLAQUE, w / 2, h / 2 + 4);
  });
}

function marqueeTexture() {
  return canvasTexture("zhenfu-marquee", 768, 128, (ctx, w, h) => {
    ctx.fillStyle = "#140406";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff3b3b";
    ctx.font = `700 54px ${CJK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("昌燈，虎爺燈，桃花燈。", w / 2, h / 2 + 2);
  });
}

function drawBagua(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#f4f0e6";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx, cy);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r / 2, r / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f0e6";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r / 2, r / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1c1c";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - r / 2, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#1c1c1c";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy + r / 2, r * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = "#f4f0e6";
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#e6c14a";
  ctx.lineWidth = Math.max(4, r * 0.12);
  ctx.stroke();
}

function openCount(pts) {
  if (!pts || pts.length < 2) return 0;
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.z - b.z) < 1e-4) return pts.length - 1;
  return pts.length;
}

function ringCentroid(pts) {
  const n = openCount(pts);
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    x += pts[i].x;
    z += pts[i].z;
  }
  return { x: x / n, z: z / n };
}

function edgesOf(pts) {
  const n = openCount(pts);
  const c = ringCentroid(pts);
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.4) continue;
    let nx = (a.z - b.z) / len;
    let nz = (b.x - a.x) / len;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    if ((c.x - mx) * nx + (c.z - mz) * nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    edges.push({ a, b, len, nx, nz, mx, mz });
  }
  return edges;
}

function nearestOnRoads(x, z, roads, nameRe) {
  let best = null;
  for (const road of roads || []) {
    if (nameRe && !nameRe.test(road.name || "")) continue;
    const path = road.pts || [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const l2 = vx * vx + vz * vz || 1;
      let t = ((x - a.x) * vx + (z - a.z) * vz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + vx * t;
      const pz = a.z + vz * t;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (!best || d < best.d) best = { d, x: px, z: pz };
    }
  }
  return best;
}

function pickFront(pts, roads) {
  const edges = edgesOf(pts);
  if (!edges.length) return null;
  const c = ringCentroid(pts);
  const named = nearestOnRoads(c.x, c.z, roads, /鎮撫街/);
  const any = named || nearestOnRoads(c.x, c.z, roads, null);
  let tx = 0.55;
  let tz = 0.84;
  if (any) {
    tx = any.x - c.x;
    tz = any.z - c.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
  }
  let best = edges[0];
  let score = -Infinity;
  for (const edge of edges) {
    const s = edge.nx * tx + edge.nz * tz + Math.min(edge.len, 40) * 0.004;
    if (s > score) {
      score = s;
      best = edge;
    }
  }
  return best;
}

function makeFrame(front) {
  const out = { x: front.nx, z: front.nz };
  const right = { x: out.z, z: -out.x };
  const mid = { x: front.mx, z: front.mz };
  function place(x, y, zOut) {
    return new THREE.Vector3(
      mid.x + right.x * x + out.x * zOut,
      y,
      mid.z + right.z * x + out.z * zOut
    );
  }
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(right.x, 0, right.z),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(out.x, 0, out.z)
  );
  const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
  function orient(mesh) {
    mesh.quaternion.copy(quat);
  }
  function project(p) {
    const dx = p.x - mid.x;
    const dz = p.z - mid.z;
    return {
      x: dx * right.x + dz * right.z,
      z: dx * out.x + dz * out.z,
    };
  }
  return { out, right, mid, place, orient, project, quat };
}

function makeCollider(id, pts, height, storey) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return {
    id,
    points: pts,
    minX,
    maxX,
    minZ,
    maxZ,
    height,
    storey,
    isShop: false,
    shops: [],
    kind: "temple",
  };
}

function addBox(parent, name, size, x, y, zOut, material, frame, userData) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.copy(frame.place(x, y, zOut));
  frame.orient(mesh);
  if (name) mesh.name = name;
  if (userData) mesh.userData = userData;
  parent.add(mesh);
  return mesh;
}

function addPerimeter(parent, pts, y0, y1, material) {
  const n = openCount(pts);
  const positions = [];
  const uvs = [];
  const indices = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.3) continue;
    positions.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z);
    const u = Math.max(0.4, len / 4.2);
    uvs.push(0, 0, u, 0, u, 1, 0, 1);
    indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  if (!positions.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "zhenfu-walls";
  parent.add(mesh);
}

function addCurvedRoof(parent, frame, x0, x1, z0, z1, eaveY, rise, name) {
  const cols = 16;
  const rows = 10;
  const positions = [];
  const colors = [];
  const indices = [];
  const orange = new THREE.Color("#e07a2e");
  const gold = new THREE.Color("#f0c14a");
  const green = new THREE.Color("#1f7a48");
  const shadow = new THREE.Color("#a34d18");
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const z = z0 + (z1 - z0) * v;
    const along = Math.abs(v - 0.5) * 2;
    const ridgeT = 1 - along;
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const x = x0 + (x1 - x0) * u;
      const end = Math.abs(u - 0.5) * 2;
      const hip = 1 - end ** 1.55 * 0.42;
      let y = eaveY + rise * ridgeT * hip;
      y += end ** 1.35 * (1 - ridgeT) * 1.15;
      y += end ** 2.4 * ridgeT ** 1.15 * 2.15;
      const p = frame.place(x, y, z);
      positions.push(p.x, p.y, p.z);
      const tile = j % 2 === 0 ? 1 : 0.86;
      const col = orange.clone();
      if (ridgeT > 0.82) col.lerp(gold, (ridgeT - 0.82) / 0.18);
      if (along > 0.72) col.lerp(green, (along - 0.72) / 0.28);
      if (end > 0.78 && ridgeT > 0.45) col.lerp(gold, (end - 0.78) * 1.4);
      col.multiplyScalar(tile);
      if (j % 4 === 3) col.lerp(shadow, 0.25);
      colors.push(col.r, col.g, col.b);
    }
  }
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * stride + i;
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function addDragonColumn(parent, frame, x, zOut, y0, height) {
  const stone = lambert(0xc8c2b4);
  const gold = lambert(0xe2b43a);
  const green = lambert(0x1f7a48);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, height, 12), stone);
  shaft.position.copy(frame.place(x, y0 + height / 2, zOut));
  parent.add(shaft);
  for (const t of [0.16, 0.5, 0.84]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 6, 16), gold);
    band.rotation.x = Math.PI / 2;
    band.position.copy(frame.place(x, y0 + height * t, zOut));
    parent.add(band);
  }
  const turns = 9;
  for (let i = 0; i < turns; i++) {
    const t = (i + 0.5) / turns;
    const ang = t * Math.PI * 3.4;
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), i % 2 ? gold : green);
    sc.position.copy(frame.place(x + Math.cos(ang) * 0.42, y0 + height * t, zOut + Math.sin(ang) * 0.42));
    parent.add(sc);
  }
}

function addLantern(parent, frame, x, y, zOut, name = "zhenfu-lantern") {
  const group = new THREE.Group();
  group.name = name;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), lambert(0x3a2418));
  cord.position.copy(frame.place(x, y + 0.42, zOut));
  group.add(cord);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 8), lambert(0xe2b43a));
  cap.position.copy(frame.place(x, y + 0.16, zOut));
  group.add(cap);
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    lambert(0xd31820, { emissive: 0x6a0c10, emissiveIntensity: 0.45 })
  );
  body.scale.set(1, 1.28, 1);
  body.position.copy(frame.place(x, y - 0.12, zOut));
  group.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8), lambert(0xf0c14a));
  band.position.copy(frame.place(x, y - 0.02, zOut));
  group.add(band);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), lambert(0xf0c14a));
  tassel.position.copy(frame.place(x, y - 0.48, zOut));
  group.add(tassel);
  parent.add(group);
  return group;
}

function addLion(parent, frame, x, zOut, scale = 1) {
  const group = new THREE.Group();
  group.name = "zhenfu-lion";
  const stone = lambert(0xe4dfd6);
  const dark = lambert(0xb7b1a6);
  const s = scale;
  addBox(group, "", [1.35 * s, 0.32 * s, 1.25 * s], x, 0.16 * s, zOut, dark, frame);
  addBox(group, "", [1.05 * s, 0.78 * s, 0.95 * s], x, 0.7 * s, zOut, stone, frame);
  addBox(group, "", [0.82 * s, 0.52 * s, 1.2 * s], x, 1.28 * s, zOut + 0.08 * s, stone, frame);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34 * s, 10, 8), stone);
  head.position.copy(frame.place(x, 1.7 * s, zOut + 0.32 * s));
  group.add(head);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.14 * s, 0.22 * s), stone);
  muzzle.position.copy(frame.place(x, 1.58 * s, zOut + 0.58 * s));
  frame.orient(muzzle);
  group.add(muzzle);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.18 * s, 5), stone);
  earL.position.copy(frame.place(x - 0.18 * s, 2.02 * s, zOut + 0.24 * s));
  group.add(earL);
  const earR = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.18 * s, 5), stone);
  earR.position.copy(frame.place(x + 0.18 * s, 2.02 * s, zOut + 0.24 * s));
  group.add(earR);
  addBox(group, "", [0.24 * s, 0.2 * s, 0.32 * s], x - 0.24 * s, 1.02 * s, zOut + 0.62 * s, stone, frame);
  addBox(group, "", [0.24 * s, 0.2 * s, 0.32 * s], x + 0.24 * s, 1.02 * s, zOut + 0.62 * s, stone, frame);
  parent.add(group);
  return group;
}

function addIncense(parent, frame, x, zOut) {
  const bronze = lambert(0x8d6a32);
  const dark = lambert(0x5c431e);
  const group = new THREE.Group();
  group.name = "zhenfu-incense";
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.38, 10), bronze);
  bowl.position.copy(frame.place(x, 0.95, zOut));
  group.add(bowl);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 12), dark);
  lip.rotation.x = Math.PI / 2;
  lip.position.copy(frame.place(x, 1.12, zOut));
  group.add(lip);
  for (const ang of [0, 2.1, 4.2]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6), bronze);
    leg.position.copy(frame.place(x + Math.cos(ang) * 0.28, 0.42, zOut + Math.sin(ang) * 0.28));
    leg.rotation.z = Math.cos(ang) * 0.35;
    leg.rotation.x = Math.sin(ang) * 0.35;
    group.add(leg);
  }
  parent.add(group);
}

function addRidgeCreatures(parent, frame, x0, x1, z, y) {
  const gold = lambert(0xe8c04a);
  const green = lambert(0x1c7a46);
  const red = lambert(0x9a241c);
  const span = x1 - x0;
  for (let i = 0; i < 7; i++) {
    const x = x0 + span * ((i + 0.5) / 7);
    const mat = i % 3 === 0 ? red : i % 3 === 1 ? green : gold;
    const fig = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 6), mat);
    fig.position.copy(frame.place(x, y + 0.38, z));
    fig.name = "zhenfu-ridge";
    parent.add(fig);
  }
  for (const side of [-1, 1]) {
    const dragon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 0.42), side < 0 ? green : gold);
    dragon.position.copy(frame.place(side * span * 0.28, y + 0.28, z));
    frame.orient(dragon);
    dragon.name = "zhenfu-ridge";
    parent.add(dragon);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), gold);
    head.position.copy(frame.place(side * span * 0.28 + side * 1.15, y + 0.42, z));
    parent.add(head);
  }
}

function addQuad(parent, name, frame, x0, z0, x1, z1, y, material) {
  const p00 = frame.place(x0, y, z0);
  const p10 = frame.place(x1, y, z0);
  const p11 = frame.place(x1, y, z1);
  const p01 = frame.place(x0, y, z1);
  const positions = [p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z];
  const uvs = [0, 0, 4, 0, 4, 4, 0, 4];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function extentInFrame(pts, frame) {
  const n = openCount(pts);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = frame.project(pts[i]);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function isZhenfuHall(b) {
  if (!b) return false;
  return b.id === ZHENFU_HALL_ID || b.name === ZHENFU_PLAQUE;
}

export function isZhenfuAnnex(b) {
  return b?.id === ZHENFU_ANNEX_ID;
}

export function createZhenfuHall(pts, roads = []) {
  const front = pickFront(pts, roads);
  if (!front || openCount(pts) < 3) return null;
  const frame = makeFrame(front);
  const ext = extentInFrame(pts, frame);
  const width = Math.max(8, front.len);
  const half = width / 2;
  const depth = Math.max(8, -ext.minZ);
  const group = new THREE.Group();
  group.name = "zhenfu-temple";

  const wallMat = mapped(reliefTexture(), 0x3a4844);
  addPerimeter(group, pts, 0.02, 6.55, wallMat);

  const red = lambert(0x8e1c1c);
  const gold = lambert(0xe2b43a);
  const dark = lambert(0x140e0c);
  const stepMat = lambert(0x9a968f);

  const bay = width / 3;
  const doorYs = [
    { x: -bay, w: 2.15, h: 3.35 },
    { x: 0, w: 2.55, h: 3.55 },
    { x: bay, w: 2.15, h: 3.35 },
  ];
  for (const door of doorYs) {
    addBox(group, "", [door.w + 0.28, door.h + 0.28, 0.08], door.x, 0.45 + door.h / 2, 0.05, red, frame);
    addBox(group, "zhenfu-door", [door.w, door.h, 0.1], door.x, 0.45 + door.h / 2, 0.12, dark, frame);
  }

  const colZ = 0.85;
  const colH = 5.85;
  for (const x of [-half + 1.15, -width / 6, width / 6, half - 1.15]) {
    addDragonColumn(group, frame, x, colZ, 0.2, colH);
    addBox(group, "", [0.62, 0.32, 0.62], x, 6.15, colZ, gold, frame);
  }

  addBox(group, "", [width + 0.4, 0.36, 0.85], 0, 6.42, 0.7, red, frame);
  addBox(group, "", [width + 0.8, 0.14, 0.95], 0, 6.66, 0.72, gold, frame);

  addBox(
    group,
    "zhenfu-plaque",
    [4.6, 1.28, 0.14],
    0,
    5.62,
    0.42,
    mapped(plaqueTexture(ZHENFU_PLAQUE), 0x1a120c),
    frame,
    { role: "plaque", text: ZHENFU_PLAQUE }
  );

  addBox(
    group,
    "zhenfu-plaque-small",
    [2.3, 0.55, 0.1],
    0,
    4.62,
    0.4,
    mapped(ornamentPlaqueTexture(), 0x2a160e),
    frame
  );

  const porchZ0 = 1.45;
  const porchZ1 = -3.4;
  addCurvedRoof(group, frame, -half - 1.1, half + 1.1, porchZ0, porchZ1, 6.55, 1.45, "zhenfu-roof-porch");
  const roofZ0 = 0.35;
  const roofZ1 = -depth - 0.7;
  addCurvedRoof(group, frame, ext.minX - 0.9, ext.maxX + 0.9, roofZ0, roofZ1, 7.55, 4.15, "zhenfu-roof");
  const ridgeZ = (roofZ0 + roofZ1) / 2;
  const ridgeY = 7.55 + 4.15;
  addRidgeCreatures(group, frame, -half * 0.72, half * 0.72, ridgeZ, ridgeY);

  const eaveOrnaments = 11;
  for (let i = 0; i < eaveOrnaments; i++) {
    const x = -half + (width * i) / (eaveOrnaments - 1);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      lambert(i % 2 ? 0xe2b43a : 0x1f7a48)
    );
    orb.position.copy(frame.place(x, 6.85, porchZ0 - 0.15));
    parentOr(group, orb);
  }

  let lanterns = 0;
  for (const x of [-half * 0.78, -half * 0.46, -half * 0.16, half * 0.16, half * 0.46, half * 0.78]) {
    addLantern(group, frame, x, 5.85, 1.15);
    lanterns += 1;
  }

  for (let i = 0; i < 4; i++) {
    const z = 0.55 + i * 0.62;
    const w = 7.4 - i * 0.25;
    addBox(group, i === 0 ? "zhenfu-steps" : "", [w, 0.2, 0.58], 0, 0.12 + (3 - i) * 0.16, z, stepMat, frame);
  }

  addLion(group, frame, -6.4, 5.6, 1.45);
  addLion(group, frame, 6.4, 5.6, 1.45);
  addIncense(group, frame, 0, 4.7);

  const street = nearestOnRoads(front.mx, front.mz, roads, /鎮撫街/) || nearestOnRoads(front.mx, front.mz, roads, null);
  const streetDist = street ? Math.sqrt(street.d) : 20;
  const courtDepth = Math.max(8, Math.min(15.5, streetDist - 6.2));
  addQuad(
    group,
    "zhenfu-courtyard",
    frame,
    -half - 2.2,
    0.15,
    half + 2.2,
    courtDepth,
    0.03,
    mapped(graniteTexture(), 0xb7b3ae)
  );

  addBox(
    group,
    "zhenfu-sign",
    [1.25, 6.6, 0.42],
    half * 0.72,
    3.4,
    6.8,
    mapped(streetSignTexture(), 0xc41218),
    frame,
    { role: "street-sign", text: ZHENFU_PLAQUE }
  );

  const look = frame.place(0, 5.2, -0.4);
  const camZ = Math.max(16, Math.min(22, streetDist * 0.82));
  const frontCam = frame.place(0.4, 8.4, camZ);
  const threeCam = frame.place(half * 0.38, 9.6, camZ * 0.92);
  group.userData = { name: ZHENFU_PLAQUE, plaque: ZHENFU_PLAQUE, lions: 2, lanterns };

  return {
    group,
    collider: makeCollider(ZHENFU_HALL_ID, pts, 12, 6.5),
    frame: {
      id: ZHENFU_HALL_ID,
      plaque: ZHENFU_PLAQUE,
      lions: 2,
      lanterns,
      outX: frame.out.x,
      outZ: frame.out.z,
      rightX: frame.right.x,
      rightZ: frame.right.z,
      midX: frame.mid.x,
      midZ: frame.mid.z,
      courtHalfWidth: half + 2.2,
      courtDepth,
      lookX: look.x,
      lookY: look.y,
      lookZ: look.z,
      front: { x: frontCam.x, y: frontCam.y, z: frontCam.z },
      threeQuarter: { x: threeCam.x, y: threeCam.y, z: threeCam.z },
    },
  };
}

function parentOr(parent, mesh) {
  parent.add(mesh);
}

export function createZhenfuAnnex(pts, roads = []) {
  const front = pickFront(pts, roads);
  if (!front || openCount(pts) < 3) return null;
  const frame = makeFrame(front);
  const group = new THREE.Group();
  group.name = "zhenfu-annex";
  const wallMat = mapped(pinkTileTexture(), 0xc4a090);
  const floorH = 2.85;
  const floors = 3;
  const top = floorH * floors;
  addPerimeter(group, pts, 0.02, top, wallMat);

  const railMat = lambert(0x8d7a68);
  const stone = lambert(0xe4dfd6);
  const len = Math.max(4, front.len - 0.8);
  for (const level of [1, 2]) {
    const y = floorH * level;
    addBox(group, "", [len, 0.12, 1.05], 0, y, 0.55, lambert(0xd8c4b4), frame);
    addBox(group, "", [len, 0.72, 0.08], 0, y + 0.48, 1.02, railMat, frame);
    addBox(group, "", [0.08, 0.72, 0.08], -len / 2, y + 0.48, 1.02, railMat, frame);
    addBox(group, "", [0.08, 0.72, 0.08], len / 2, y + 0.48, 1.02, railMat, frame);
    for (const side of [-1, 1]) {
      const lion = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.42), stone);
      lion.position.copy(frame.place(side * (len / 2 - 0.3), y + 0.95, 0.85));
      frame.orient(lion);
      lion.name = "zhenfu-annex-lion";
      group.add(lion);
    }
  }

  const lanternCount = Math.max(4, Math.min(7, Math.round(len / 2.2)));
  for (let i = 0; i < lanternCount; i++) {
    const x = -len / 2 + 0.8 + ((len - 1.6) * i) / Math.max(1, lanternCount - 1);
    addLantern(group, frame, x, floorH + 0.15, 1.35, "zhenfu-annex-lantern");
  }

  addBox(
    group,
    "zhenfu-annex-sign",
    [Math.min(7.2, len - 0.4), 1.25, 0.16],
    0,
    top + 0.55,
    0.15,
    mapped(annexSignTexture(), 0xf0d56a),
    frame,
    { role: "annex-sign", text: ZHENFU_PLAQUE }
  );
  addBox(
    group,
    "zhenfu-marquee",
    [Math.min(8.4, len - 0.3), 0.55, 0.12],
    0,
    2.15,
    0.2,
    mapped(marqueeTexture(), 0xff3b3b),
    frame,
    { role: "marquee", text: "昌燈，虎爺燈，桃花燈。" }
  );

  group.userData = { name: ZHENFU_PLAQUE, role: "annex" };
  return {
    group,
    collider: makeCollider(ZHENFU_ANNEX_ID, pts, top, floorH),
  };
}

export function inspectTempleGroup(group) {
  const found = {
    plaques: 0,
    lions: 0,
    lanterns: 0,
    roofs: 0,
    plaqueText: "",
    signText: "",
    name: group?.name || "",
  };
  if (!group) return found;
  group.traverse((obj) => {
    if (obj.name === "zhenfu-plaque") {
      found.plaques += 1;
      if (obj.userData?.text) found.plaqueText = obj.userData.text;
    }
    if (obj.name === "zhenfu-lion") found.lions += 1;
    if (obj.name === "zhenfu-lantern") found.lanterns += 1;
    if (obj.name === "zhenfu-roof") found.roofs += 1;
    if (obj.name === "zhenfu-sign" && obj.userData?.text) found.signText = obj.userData.text;
  });
  return found;
}
