import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roadFacingEdges, streetFacingEdge } from "./geo.js";
import { hash01 } from "./textures.js";
import { WINDOW_CUTOUT_WIDTH, WINDOW_CUTOUT_HEIGHT } from "./wall-panels.js";

function box(w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

function frameGeometry() {
  const w = 1.18;
  const h = 1.48;
  const t = 0.07;
  const d = 0.08;
  return mergeGeometries([
    box(w, t, d, 0, h / 2 - t / 2, 0.02),
    box(w, t, d, 0, -h / 2 + t / 2, 0.02),
    box(t, h, d, -w / 2 + t / 2, 0, 0.02),
    box(t, h, d, w / 2 - t / 2, 0, 0.02),
    box(0.045, h - t * 2, 0.05, 0, 0, 0.03),
  ]);
}

function grilleGeometry() {
  const w = 1.02;
  const h = 1.28;
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const x = -w / 2 + (w * i) / 4;
    parts.push(box(0.025, h, 0.02, x, 0, 0.07));
  }
  for (let i = 0; i < 4; i++) {
    const y = -h / 2 + (h * i) / 3;
    parts.push(box(w, 0.02, 0.02, 0, y, 0.075));
  }
  return mergeGeometries(parts);
}

function acGeometry() {
  return mergeGeometries([
    box(0.62, 0.36, 0.28, 0, 0, 0.08),
    box(0.5, 0.22, 0.02, 0, -0.02, 0.23),
    box(0.62, 0.04, 0.3, 0, 0.2, 0.08),
  ]);
}

const FRAME = frameGeometry();
const GRILLE = grilleGeometry();
const AC = acGeometry();
const GLASS = new THREE.BoxGeometry(1.02, 1.3, 0.02);
const REVEAL = new THREE.BoxGeometry(1.11, 1.39, 0.02);
REVEAL.translate(0, 0, -0.04);
const SILL = new THREE.BoxGeometry(1.36, 0.07, 0.2);
const HOOD = new THREE.BoxGeometry(1.42, 0.08, 0.34);
const DRIP = new THREE.BoxGeometry(1.36, 0.045, 0.15);
DRIP.translate(0, 0, 0.08);
const RECESS = mergeGeometries([
  box(0.055, WINDOW_CUTOUT_HEIGHT, 0.24, -WINDOW_CUTOUT_WIDTH / 2 - 0.0275, 0, -0.075),
  box(0.055, WINDOW_CUTOUT_HEIGHT, 0.24, WINDOW_CUTOUT_WIDTH / 2 + 0.0275, 0, -0.075),
  box(WINDOW_CUTOUT_WIDTH + 0.11, 0.055, 0.24, 0, WINDOW_CUTOUT_HEIGHT / 2 + 0.0275, -0.075),
  box(WINDOW_CUTOUT_WIDTH + 0.11, 0.055, 0.24, 0, -WINDOW_CUTOUT_HEIGHT / 2 - 0.0275, -0.075),
]);

export function planFacadeOpenings({ edgeLen, storey, bodyH, seed, skipGround }) {
  const openings = [];
  if (!(edgeLen >= 2.4) || !(bodyH > 2)) return openings;
  const bays = Math.max(1, Math.min(4, Math.round(edgeLen / 3.2)));
  const floors = [];
  let y = (storey || 3) + 1.05;
  let guard = 0;
  while (y < bodyH - 0.55 && guard < 5) {
    floors.push(y);
    y += 3.02;
    guard += 1;
  }
  if (!floors.length && !skipGround && bodyH > 2.4) floors.push(Math.min(1.55, bodyH * 0.42));
  floors.forEach((fy, floor) => {
    for (let i = 0; i < bays; i++) {
      const n = hash01(seed + floor, i + 3);
      openings.push({
        t: (i + 0.5) / bays,
        y: fy,
        sx: 0.86 + hash01(seed, i + floor) * 0.22,
        sy: 0.9 + hash01(seed, i + 8) * 0.16,
        grille: n > 0.18,
        hood: n > 0.28,
        ac: n > 0.42 && i === bays - 1,
      });
    }
  });
  return openings;
}

export function planBuildingOpenings({ pts, roads, storey, bodyH, seed, skipGround, hero = false }) {
  const edge = streetFacingEdge(pts, roads);
  if (!edge || Math.sqrt(edge.roadDist) > 12 || edge.len < 2.4) return [];
  const nearEdges = hero ? roadFacingEdges(pts, roads) : [];
  const edges = nearEdges.length ? nearEdges : [edge];
  return edges.map((face) => ({ edge: face, openings: planFacadeOpenings({
    edgeLen: face.len, storey, bodyH,
    seed: face.index === edge.index ? seed : seed + face.index, skipGround,
  }) }));
}

function makeInstances(geo, mat, matrices) {
  if (!matrices.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  matrices.forEach((item, i) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(item.sx || 1, item.sy || 1, item.sz || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createDepthBucket() {
  return {
    frames: [], glasses: [], grilles: [], sills: [], hoods: [], acs: [], reveals: [], drips: [], recesses: [],
  };
}

export function createFacadeDepth() {
  const buckets = { always: createDepthBucket(), near: createDepthBucket(), far: createDepthBucket() };

  function addBuilding({ hero = false, recessed = false, plans = null, streetLayer = null, atlasEdges = null, ...options }) {
    const faces = plans || planBuildingOpenings({ ...options, hero });
    let count = 0;
    for (const { edge: face, openings } of faces) {
      const onAtlas = !atlasEdges || atlasEdges.has(face.index);
      const bucket = onAtlas && (streetLayer === "near" || streetLayer === "far")
        ? buckets[streetLayer]
        : buckets.always;
      const { frames, glasses, grilles, sills, hoods, acs, reveals, drips, recesses } = bucket;
      const dx = face.b.x - face.a.x;
      const dz = face.b.z - face.a.z;
      for (const opening of openings) {
        const out = recessed ? 0.035 : 0.1;
        const x = face.a.x + dx * opening.t + face.nx * out;
        const z = face.a.z + dz * opening.t + face.nz * out;
        const base = { x, y: opening.y, z, yaw: face.yaw, sx: opening.sx, sy: opening.sy, sz: 1 };
        frames.push(base);
        glasses.push(recessed ? { ...base, x: x - face.nx * 0.14, z: z - face.nz * 0.14 } : base);
        if (hero) reveals.push(recessed ? { ...base, x: x - face.nx * 0.17, z: z - face.nz * 0.17 } : base);
        if (recessed) recesses.push(base);
        sills.push({ ...base, y: opening.y - 0.74 * opening.sy, sy: 1, sx: opening.sx });
        if (opening.grille) grilles.push(base);
        if (opening.hood) hoods.push({ ...base, y: opening.y + 0.78 * opening.sy, sy: 1, sx: opening.sx });
        else if (hero) drips.push({ ...base, y: opening.y + 0.75 * opening.sy, sy: 1, sx: opening.sx });
        if (opening.ac) {
          const len = face.len || 1;
          acs.push({
            x: x + (dx / len) * 0.78,
            y: opening.y - 0.15,
            z: z + (dz / len) * 0.78,
            yaw: face.yaw,
            sx: 1,
            sy: 1,
            sz: 1,
          });
        }
      }
      count += openings.length;
    }
    return count;
  }

  function finish(group) {
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xd5dbe0 });
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0x8ea8b2,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const ironMat = new THREE.MeshLambertMaterial({ color: 0x2c2e30 });
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc9c3b6 });
    const acMat = new THREE.MeshLambertMaterial({ color: 0xd7dcde });
    const revealMat = new THREE.MeshLambertMaterial({ color: 0x303944 });
    const emit = (parent, bucket) => {
      const parts = [
        ["facade-reveals", REVEAL, revealMat, bucket.reveals],
        ["facade-window-recesses", RECESS, stoneMat, bucket.recesses],
        ["facade-frames", FRAME, frameMat, bucket.frames],
        ["facade-glass", GLASS, glassMat, bucket.glasses],
        ["facade-grilles", GRILLE, ironMat, bucket.grilles],
        ["facade-sills", SILL, stoneMat, bucket.sills],
        ["facade-hoods", HOOD, stoneMat, bucket.hoods],
        ["facade-drips", DRIP, stoneMat, bucket.drips],
        ["facade-acs", AC, acMat, bucket.acs],
      ];
      let frames = 0;
      for (const [name, geo, mat, list] of parts) {
        const mesh = makeInstances(geo, mat, list);
        if (!mesh) continue;
        mesh.name = name;
        parent.add(mesh);
        if (name === "facade-frames") frames += list.length;
      }
      return frames;
    };
    const layer = (name, nearDetail, bucket) => {
      const occupied = bucket.frames.length || bucket.glasses.length || bucket.recesses.length
        || bucket.grilles.length || bucket.sills.length || bucket.hoods.length || bucket.acs.length
        || bucket.reveals.length || bucket.drips.length;
      if (!occupied) return 0;
      const holder = new THREE.Group();
      holder.name = name;
      holder.userData = { facadeLayer: "realistic-street", nearDetail };
      group.add(holder);
      return emit(holder, bucket);
    };
    const windows = emit(group, buckets.always)
      + layer("facade-depth-near", true, buckets.near)
      + layer("facade-depth-far", false, buckets.far);
    const sum = (key) => buckets.always[key].length + buckets.near[key].length + buckets.far[key].length;
    return { windows, grilles: sum("grilles"), acs: sum("acs"), heroWindows: sum("reveals"),
      recessedWindows: sum("recesses") };
  }

  return { addBuilding, finish };
}
