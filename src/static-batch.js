import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Draw calls, not triangles, are what this street costs: thousands of small boxes each
// with their own material. Merging the ones that never move keeps the picture identical.
// The whole map is under 500k triangles, so one batch per material beats splitting by
// map cell: measured 864 draws on foot unsplit against 1,210 with 64 m cells.

const VALUE_KEYS = [
  "color", "emissive", "emissiveIntensity", "specular", "shininess", "roughness", "metalness",
  "opacity", "transparent", "alphaTest", "side", "depthWrite", "depthTest", "blending",
  "vertexColors", "flatShading", "fog", "toneMapped", "wireframe", "reflectivity",
  "polygonOffset", "polygonOffsetFactor", "polygonOffsetUnits", "normalScale", "bumpScale",
  "premultipliedAlpha", "dithering", "colorWrite",
];
const TEXTURE_KEYS = [
  "map", "normalMap", "emissiveMap", "alphaMap", "bumpMap", "roughnessMap", "metalnessMap",
  "aoMap", "lightMap", "specularMap", "envMap",
];
const KEEP_SUBTREES = new Set(["shop-marker", "near50-drainpipe"]);
const plainCompile = THREE.Material.prototype.onBeforeCompile;
const plainCacheKey = THREE.Material.prototype.customProgramCacheKey;
const plainBeforeRender = THREE.Object3D.prototype.onBeforeRender;

function encode(value) {
  if (value == null) return "";
  if (value.isColor) return value.getHexString();
  if (typeof value.toArray === "function") return value.toArray().join(",");
  return String(value);
}

export function materialSignature(material) {
  const custom = material.isShaderMaterial
    || material.onBeforeCompile !== plainCompile
    || material.customProgramCacheKey !== plainCacheKey
    || Object.keys(material.userData || {}).length > 0;
  if (custom) return `own:${material.uuid}`;
  let sig = material.type;
  for (const key of VALUE_KEYS) if (key in material) sig += `|${encode(material[key])}`;
  for (const key of TEXTURE_KEYS) sig += `|${material[key] ? material[key].uuid : ""}`;
  return sig;
}

function usesTextures(material) {
  return TEXTURE_KEYS.some((key) => material[key]);
}

export function staysPut(mesh, root) {
  for (let node = mesh; node && node !== root; node = node.parent) {
    if (!node.visible || node.userData?.facadeLayer || KEEP_SUBTREES.has(node.name)) return false;
    if (node.renderOrder !== 0) return false;
  }
  return mesh.frustumCulled && mesh.onBeforeRender === plainBeforeRender;
}

function isStatic(mesh, root) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isBatchedMesh) return false;
  const material = mesh.material;
  if (!material || Array.isArray(material) || material.transparent || !material.visible) return false;
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position || geometry.attributes.position.isInterleavedBufferAttribute) return false;
  if (Object.keys(geometry.morphAttributes || {}).length) return false;
  if (geometry.drawRange.start !== 0 || Number.isFinite(geometry.drawRange.count)) return false;
  if (mesh.renderOrder !== 0 || !mesh.frustumCulled || mesh.onBeforeRender !== plainBeforeRender) return false;
  if (Object.keys(mesh.userData || {}).length) return false;
  for (let node = mesh; node && node !== root; node = node.parent) {
    if (!node.visible || node.userData?.facadeLayer || KEEP_SUBTREES.has(node.name)) return false;
    if (node !== mesh && node.renderOrder !== 0) return false;
  }
  return true;
}

function layoutSignature(geometry, names) {
  let sig = geometry.index ? "i" : "n";
  for (const name of names) {
    const attr = geometry.attributes[name];
    sig += `|${name}:${attr.itemSize}:${attr.array.constructor.name}:${attr.normalized ? 1 : 0}`;
  }
  return sig;
}

export function bakeGeometry(mesh, matrix, names) {
  const source = mesh.geometry;
  const baked = new THREE.BufferGeometry();
  for (const name of names) baked.setAttribute(name, source.attributes[name].clone());
  if (source.index) baked.setIndex(source.index.clone());
  baked.applyMatrix4(matrix);
  if (matrix.determinant() < 0) {
    // A mirrored transform flips winding; swap two corners so faces keep pointing outward.
    if (baked.index) {
      const index = baked.index;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        index.setX(i, index.getX(i + 2));
        index.setX(i + 2, a);
      }
    } else {
      for (const name of names) {
        const attr = baked.attributes[name];
        const size = attr.itemSize;
        for (let i = 0; i < attr.count; i += 3) {
          for (let k = 0; k < size; k += 1) {
            const a = attr.array[i * size + k];
            attr.array[i * size + k] = attr.array[(i + 2) * size + k];
            attr.array[(i + 2) * size + k] = a;
          }
        }
      }
    }
  }
  return baked;
}

export function batchStaticMeshes(root, { cellSize = 0, minGroup = 2 } = {}) {
  const stats = { roots: 1, meshesBefore: 0, eligible: 0, merged: 0, batches: 0, materialsShared: 0 };
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geometryUsers = new Map();
  const materialUsers = new Map();
  const buckets = new Map();
  const center = new THREE.Vector3();
  const relative = new THREE.Matrix4();

  root.traverse((node) => {
    if (!node.isMesh && !node.isLine && !node.isPoints) return;
    stats.meshesBefore += 1;
    if (node.geometry) geometryUsers.set(node.geometry, (geometryUsers.get(node.geometry) || 0) + 1);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material) materialUsers.set(material, (materialUsers.get(material) || 0) + 1);
    }
    if (!isStatic(node, root)) return;
    stats.eligible += 1;
    const material = node.material;
    const geometry = node.geometry;
    const textured = usesTextures(material);
    const names = Object.keys(geometry.attributes).filter((name) => {
      if (name === "position") return true;
      if (name === "normal") return !material.isMeshBasicMaterial || Boolean(material.envMap);
      if (name === "uv") return textured;
      if (name === "color") return Boolean(material.vertexColors);
      if (name === "tangent") return Boolean(material.normalMap);
      return name === "uv1" && Boolean(material.aoMap || material.lightMap);
    }).sort();
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    center.copy(geometry.boundingSphere.center).applyMatrix4(node.matrixWorld);
    const cell = cellSize > 0 ? `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}` : "all";
    const key = `${materialSignature(material)}#${layoutSignature(geometry, names)}#${cell}`;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = { material, names, meshes: [] });
    bucket.meshes.push(node);
  });

  const holder = new THREE.Group();
  holder.name = "static-batches";
  for (const bucket of buckets.values()) {
    if (bucket.meshes.length < minGroup) continue;
    const parts = bucket.meshes.map((mesh) => {
      relative.multiplyMatrices(toRoot, mesh.matrixWorld);
      return bakeGeometry(mesh, relative, bucket.names);
    });
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const batch = new THREE.Mesh(geometry, bucket.material);
    batch.name = "static-batch";
    batch.matrixAutoUpdate = false;
    batch.userData = { batched: bucket.meshes.length };
    holder.add(batch);
    stats.batches += 1;
    stats.merged += bucket.meshes.length;
    for (const mesh of bucket.meshes) {
      mesh.parent?.remove(mesh);
      const geometryLeft = geometryUsers.get(mesh.geometry) - 1;
      geometryUsers.set(mesh.geometry, geometryLeft);
      if (geometryLeft === 0) mesh.geometry.dispose();
      if (mesh.material !== bucket.material) {
        const materialLeft = materialUsers.get(mesh.material) - 1;
        materialUsers.set(mesh.material, materialLeft);
        if (materialLeft === 0) {
          mesh.material.dispose();
          stats.materialsShared += 1;
        }
      }
    }
  }
  if (holder.children.length) root.add(holder);
  stats.meshesAfter = stats.meshesBefore - stats.merged + stats.batches;
  return stats;
}
