import * as THREE from "three";

export function createAerialFrame(config, project) {
  const g = config.ground;
  if (!g || !Number.isFinite(g.west)) {
    const half = config.radiusMeters + 40;
    return {
      nw: { x: -half, z: -half },
      se: { x: half, z: half },
      width: half * 2,
      depth: half * 2,
      cx: 0,
      cz: 0,
      uvAt(x, z) {
        return { u: (x + half) / (half * 2), v: (half - z) / (half * 2) };
      },
    };
  }
  const nw = project.toLocal(g.north, g.west);
  const se = project.toLocal(g.south, g.east);
  const width = se.x - nw.x;
  const depth = se.z - nw.z;
  return {
    nw,
    se,
    width,
    depth,
    cx: (nw.x + se.x) / 2,
    cz: (nw.z + se.z) / 2,
    uvAt(x, z) {
      return {
        u: (x - nw.x) / width,
        v: (se.z - z) / depth,
      };
    },
  };
}

export function loadAerialTexture(url, anisotropy = 8) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropy;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      },
      undefined,
      () => reject(new Error("讀不到正射影像 " + url))
    );
  });
}

export function createRoofMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    toneMapped: false,
  });
}

export function createAerialMaterial(tex, { detailTex, cameraPos, frame, groundMask } = {}) {
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    toneMapped: false,
  });
  if (!detailTex || !cameraPos || !frame || !groundMask) return mat;
  const mapOrigin = new THREE.Vector2(frame.nw.x, frame.nw.z);
  const mapScale = new THREE.Vector2(frame.width, frame.depth);
  // 近景路面為視覺推估；現有空拍與街景尚不足以校正鎮撫街 46 號門前的實際鋪面色。
  mat.customProgramCacheKey = () => "aerial-street-v3";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.detailMap = { value: detailTex };
    shader.uniforms.groundMask = { value: groundMask };
    shader.uniforms.camPos = { value: cameraPos };
    shader.uniforms.mapOrigin = { value: mapOrigin };
    shader.uniforms.mapScale = { value: mapScale };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vWorldPos;`
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_pars_fragment>",
        `#include <map_pars_fragment>
         uniform sampler2D detailMap;
         uniform sampler2D groundMask;
         uniform vec3 camPos;
         uniform vec2 mapOrigin;
         uniform vec2 mapScale;
         varying vec3 vWorldPos;
         vec2 xzToUv(vec2 xz) {
           return vec2((xz.x - mapOrigin.x) / mapScale.x, (mapOrigin.y + mapScale.y - xz.y) / mapScale.y);
         }
         float hash12(vec2 p) {
           vec3 p3 = fract(vec3(p.xyx) * 0.1031);
           p3 += dot(p3, p3.yzx + 33.33);
           return fract((p3.x + p3.y) * p3.z);
         }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         vec3 aerial = diffuseColor.rgb;
         float dist = length(camPos - vWorldPos);
         float streetCam = 1.0 - smoothstep(4.5, 16.0, camPos.y);
         float close = (1.0 - smoothstep(22.0, 70.0, dist)) * streetCam;
         float groundW = 1.0 - smoothstep(0.35, 1.8, vWorldPos.y);
         vec3 mask = texture2D(groundMask, xzToUv(vWorldPos.xz)).rgb;
         float cls = mask.r;
         float road = smoothstep(0.82, 0.94, cls);
         float walk = smoothstep(0.42, 0.58, cls) * (1.0 - road);
         float curb = smoothstep(0.64, 0.74, cls) * (1.0 - smoothstep(0.86, 0.94, cls));
         float ang = (mask.g * 2.0 - 1.0) * 3.14159265;
         vec2 along = vec2(cos(ang), sin(ang));
         vec2 perp = vec2(-along.y, along.x);
         vec2 slab = vec2(dot(vWorldPos.xz, along), dot(vWorldPos.xz, perp)) / vec2(1.05, 0.62);
         vec2 fr = fract(slab);
         vec2 edge = min(fr, 1.0 - fr);
         float joint = 1.0 - smoothstep(0.016, 0.045, min(edge.x, edge.y));
         float slabN = hash12(floor(slab));
         float coarse = texture2D(detailMap, vWorldPos.xz * 0.18).r;
         float grit = texture2D(detailMap, vWorldPos.xz * 3.5).r;
         vec3 concrete = mix(vec3(0.235, 0.245, 0.245), vec3(0.310, 0.315, 0.305), slabN);
         concrete *= 0.87 + coarse * 0.24;
         concrete *= 0.94 + grit * 0.12;
         vec3 tileCol = mix(concrete, concrete * 0.73, joint);
         vec3 asphalt = mix(vec3(0.063, 0.070, 0.079), vec3(0.112, 0.122, 0.132), coarse);
         asphalt *= 0.87 + grit * 0.26;
         vec3 restored = aerial;
         restored = mix(restored, tileCol, walk);
         restored = mix(restored, vec3(0.205, 0.215, 0.225), curb);
         restored = mix(restored, asphalt, road);
         diffuseColor.rgb = mix(aerial, restored, close * groundW);`
      );
    mat.userData.shader = shader;
  };
  return mat;
}

export function applyAerialUVs(geo, uvAt) {
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const { u, v } = uvAt(pos.getX(i), pos.getZ(i));
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function toHex(r, g, b) {
  const h = (n) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mixHex(a, b, t) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a || b;
  return toHex(pa.r + (pb.r - pa.r) * t, pa.g + (pb.g - pa.g) * t, pa.b + (pb.b - pa.b) * t);
}

export function parseHex(hex) {
  if (!hex) return null;
  const s = String(hex).replace("#", "");
  if (s.length !== 6) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

export function createAerialColorSampler(tex, uvAt) {
  const img = tex?.image;
  if (!img || !img.width || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const pix = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width;
  const h = canvas.height;
  function sample(x, z) {
    const { u, v } = uvAt(x, z);
    const px = Math.max(0, Math.min(w - 1, Math.round(u * (w - 1))));
    const py = Math.max(0, Math.min(h - 1, Math.round((1 - v) * (h - 1))));
    const i = (py * w + px) * 4;
    return { r: pix[i], g: pix[i + 1], b: pix[i + 2] };
  }
  return {
    hexAt(x, z) {
      const p = sample(x, z);
      return toHex(p.r, p.g, p.b);
    },
    hexAverage(x, z, spread = 2) {
      const pts = [
        sample(x, z),
        sample(x + spread, z),
        sample(x - spread, z),
        sample(x, z + spread),
        sample(x, z - spread),
      ];
      const n = pts.length;
      return toHex(
        pts.reduce((s, p) => s + p.r, 0) / n,
        pts.reduce((s, p) => s + p.g, 0) / n,
        pts.reduce((s, p) => s + p.b, 0) / n
      );
    },
  };
}
