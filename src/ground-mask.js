import * as THREE from "three";
import { roadWidth } from "./roads.js";

function bandsFor(highway) {
  const w = roadWidth(highway);
  if (w <= 0) return null;
  if (highway === "pedestrian") return { asphalt: 0, outer: 4.2 };
  const asphalt = Math.max(3.1, w * 0.7);
  const side = w >= 9 ? 1.85 : 1.5;
  return { asphalt, outer: asphalt + side * 2 };
}

/** R：0 空地、約 0.59 人行道、1 柏油。G：沿路方向角。近距離地板用這張遮罩還原街景，不拿正射的陰影當路面。 */
export function createGroundMask(roads, frame) {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const ppm = ((size / frame.width + size / frame.depth) / 2);

  function toCanvas(x, z) {
    return {
      x: ((x - frame.nw.x) / frame.width) * size,
      y: ((z - frame.nw.z) / frame.depth) * size,
    };
  }

  function strokeBand(road, widthM, rByte) {
    const pts = road.pts || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.4) continue;
      const ax = (b.x - a.x) / len;
      const az = (b.z - a.z) / len;
      const g = Math.round((Math.atan2(az, ax) / Math.PI * 0.5 + 0.5) * 255);
      ctx.strokeStyle = `rgb(${rByte},${g},0)`;
      ctx.lineWidth = Math.max(1.5, widthM * ppm);
      ctx.beginPath();
      const ca = toCanvas(a.x, a.z);
      const cb = toCanvas(b.x, b.z);
      ctx.moveTo(ca.x, ca.y);
      ctx.lineTo(cb.x, cb.y);
      ctx.stroke();
    }
  }

  const bands = [];
  for (const road of roads || []) {
    const band = bandsFor(road.highway);
    if (band) bands.push({ road, ...band });
  }
  for (const b of bands) strokeBand(b.road, b.outer, 150);
  for (const b of bands) {
    if (b.asphalt > 0) strokeBand(b.road, b.asphalt, 255);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
