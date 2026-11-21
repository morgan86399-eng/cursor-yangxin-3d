import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bakeGeometry, staysPut } from "./static-batch.js";

// Each building wall is painted from its own small canvas, so a thousand walls are a
// thousand draws. Stacking same-sized canvases into one array texture lets a single mesh
// draw them all, with every wall still sampling exactly its own pixels.

const LABEL_KEYS = new Set(["id", "label", "isShop", "style"]);
// WebGL2 guarantees 256 array layers; staying at that floor works on every phone.
const MAX_LAYERS = 256;

function plainWall(mesh, root) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.name === "static-batch") return false;
  const material = mesh.material;
  if (!material?.isMeshLambertMaterial || Array.isArray(material)) return false;
  if (material.transparent || material.alphaTest || material.vertexColors || material.flatShading) return false;
  if (material.color.getHex() !== 0xffffff || material.emissive.getHex() !== 0) return false;
  if (Object.keys(material.userData || {}).length) return false;
  for (const key of ["normalMap", "emissiveMap", "alphaMap", "bumpMap", "aoMap", "lightMap", "specularMap", "envMap"]) {
    if (material[key]) return false;
  }
  const map = material.map;
  if (!map?.isCanvasTexture || !map.image?.width) return false;
  if (map.repeat.x !== 1 || map.repeat.y !== 1 || map.offset.x !== 0 || map.offset.y !== 0 || map.rotation !== 0) return false;
  if (map.channel !== 0 || !map.flipY || map.colorSpace !== THREE.SRGBColorSpace) return false;
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position || !geometry.attributes.uv || !geometry.index) return false;
  if (Object.keys(mesh.userData || {}).some((key) => !LABEL_KEYS.has(key))) return false;
  return mesh.renderOrder === 0 && staysPut(mesh, root);
}

function arrayMaterial(texture, side) {
  const material = new THREE.MeshLambertMaterial({ color: "#ffffff", side });
  material.userData = { kind: "wall-texture-array", layers: texture.image.depth };
  material.customProgramCacheKey = () => "wall-texture-array-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wallLayers = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float wallLayer;\nvarying float vWallLayer;\nvarying vec2 vWallUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWallLayer = wallLayer;\nvWallUv = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2DArray wallLayers;\nvarying float vWallLayer;\nvarying vec2 vWallUv;")
      .replace("#include <map_fragment>", "diffuseColor *= texture( wallLayers, vec3( vWallUv, floor( vWallLayer + 0.5 ) ) );");
  };
  return material;
}

function stack(textures, width, height) {
  const data = new Uint8Array(width * height * 4 * textures.length);
  const row = width * 4;
  textures.forEach((texture, layer) => {
    const canvas = texture.image;
    const pixels = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, height).data;
    const base = layer * row * height;
    // Canvas rows run top-down; the 2D textures were uploaded flipped, so flip here too.
    for (let y = 0; y < height; y += 1) {
      data.set(pixels.subarray((height - 1 - y) * row, (height - y) * row), base + y * row);
    }
  });
  const first = textures[0];
  const array = new THREE.DataArrayTexture(data, width, height, textures.length);
  array.format = THREE.RGBAFormat;
  array.type = THREE.UnsignedByteType;
  array.colorSpace = THREE.SRGBColorSpace;
  array.wrapS = first.wrapS;
  array.wrapT = first.wrapT;
  array.minFilter = first.minFilter;
  array.magFilter = first.magFilter;
  array.anisotropy = first.anisotropy;
  array.generateMipmaps = first.generateMipmaps;
  array.unpackAlignment = 4;
  array.needsUpdate = true;
  return array;
}

export function mergeWallTextures(root) {
  const stats = { walls: 0, textures: 0, arrays: 0, meshes: 0 };
  root.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();
  const textureUsers = new Map();
  const groups = new Map();
  root.traverse((node) => {
    const map = !Array.isArray(node.material) && node.material?.map;
    if (map) textureUsers.set(map, (textureUsers.get(map) || 0) + 1);
    if (!plainWall(node, root)) return;
    const hasNormal = Boolean(node.geometry.attributes.normal);
    const key = [map.image.width, map.image.height, map.wrapS, map.wrapT, map.minFilter, map.magFilter,
      map.anisotropy, map.generateMipmaps ? 1 : 0, node.material.side, hasNormal ? 1 : 0].join("|");
    let group = groups.get(key);
    if (!group) groups.set(key, group = { side: node.material.side, hasNormal, chunks: [] });
    let chunk = group.chunks.find((entry) => entry.layers.has(map) || entry.layers.size < MAX_LAYERS);
    if (!chunk) group.chunks.push(chunk = { layers: new Map(), meshes: [] });
    if (!chunk.layers.has(map)) chunk.layers.set(map, chunk.layers.size);
    chunk.meshes.push(node);
  });

  const holder = new THREE.Group();
  holder.name = "wall-texture-arrays";
  for (const group of groups.values()) {
    const names = group.hasNormal ? ["normal", "position", "uv"] : ["position", "uv"];
    for (const chunk of group.chunks) {
      if (chunk.layers.size < 2 || chunk.meshes.length < 2) continue;
      const textures = [...chunk.layers.keys()];
      const { width, height } = textures[0].image;
      const parts = chunk.meshes.map((mesh) => {
        relative.multiplyMatrices(toRoot, mesh.matrixWorld);
        const part = bakeGeometry(mesh, relative, names);
        const layer = chunk.layers.get(mesh.material.map);
        part.setAttribute("wallLayer", new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count).fill(layer), 1));
        return part;
      });
      const geometry = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const array = stack(textures, width, height);
      const merged = new THREE.Mesh(geometry, arrayMaterial(array, group.side));
      merged.name = "wall-texture-array";
      merged.matrixAutoUpdate = false;
      merged.userData = { walls: chunk.meshes.length, layers: textures.length };
      holder.add(merged);
      stats.arrays += 1;
      stats.meshes += 1;
      stats.walls += chunk.meshes.length;
      stats.textures += textures.length;
      for (const mesh of chunk.meshes) {
        const map = mesh.material.map;
        mesh.parent?.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        const left = textureUsers.get(map) - 1;
        textureUsers.set(map, left);
        if (left === 0) map.dispose();
      }
    }
  }
  if (holder.children.length) root.add(holder);
  return stats;
}
