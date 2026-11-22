// Four looks, in the spirit of a GTA time-of-day grade: the models stay, the light changes.
const PRESETS = [
  { hour: 7, name: "早晨", skyTop: 0x8eb8d6, skyHorizon: 0xf0d2b4, skyGround: 0xc2b6a4, fog: 0xe7d3c0, fogNear: 110, fogFar: 360, sun: [0.55, 0.28, 0.35], sunColor: 0xffd2a4, sunIntensity: 0.72, ambient: 0.38, hemi: 0.24, fill: 0.16, lamp: 0.15, exposure: 1.02 },
  { hour: 12, name: "中午", skyTop: 0x7eb0d4, skyHorizon: 0xdce7ef, skyGround: 0xc2b6a4, fog: 0xc5d6e4, fogNear: 105, fogFar: 340, sun: [0.42, 0.72, 0.28], sunColor: 0xfff1d6, sunIntensity: 0.98, ambient: 0.46, hemi: 0.28, fill: 0.2, lamp: 0, exposure: 1.08 },
  { hour: 17.5, name: "傍晚", skyTop: 0x243858, skyHorizon: 0xe97848, skyGround: 0x6a4034, fog: 0xb56a48, fogNear: 80, fogFar: 340, sun: [0.86, 0.1, 0.18], sunColor: 0xff8a4a, sunIntensity: 0.7, ambient: 0.22, hemi: 0.12, fill: 0.06, lamp: 0.9, exposure: 0.98 },
  { hour: 21, name: "夜晚", skyTop: 0x0c121c, skyHorizon: 0x1a2436, skyGround: 0x12100e, fog: 0x141a24, fogNear: 55, fogFar: 320, sun: [-0.2, -0.4, 0.1], sunColor: 0x8aa4c8, sunIntensity: 0.05, ambient: 0.1, hemi: 0.05, fill: 0.025, lamp: 1, exposure: 0.78 },
];

export function daylightPreset(hour) {
  const h = ((hour % 24) + 24) % 24;
  let next = PRESETS[0];
  let prev = PRESETS[PRESETS.length - 1];
  for (const preset of PRESETS) {
    if (preset.hour <= h) prev = preset;
    else { next = preset; break; }
  }
  if (next === prev) return { ...prev, hour: h };
  const span = (next.hour - prev.hour + 24) % 24 || 24;
  const t = ((h - prev.hour + 24) % 24) / span;
  const mix = (a, b) => Math.round(a + (b - a) * t);
  const mixHex = (a, b) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (mix(ar, br) << 16) | (mix(ag, bg) << 8) | mix(ab, bb);
  };
  return {
    hour: h,
    name: t < 0.5 ? prev.name : next.name,
    skyTop: mixHex(prev.skyTop, next.skyTop),
    skyHorizon: mixHex(prev.skyHorizon, next.skyHorizon),
    skyGround: mixHex(prev.skyGround, next.skyGround),
    fog: mixHex(prev.fog, next.fog),
    fogNear: prev.fogNear + (next.fogNear - prev.fogNear) * t,
    fogFar: prev.fogFar + (next.fogFar - prev.fogFar) * t,
    sun: prev.sun.map((value, i) => value + (next.sun[i] - value) * t),
    sunColor: mixHex(prev.sunColor, next.sunColor),
    sunIntensity: prev.sunIntensity + (next.sunIntensity - prev.sunIntensity) * t,
    ambient: prev.ambient + (next.ambient - prev.ambient) * t,
    hemi: prev.hemi + (next.hemi - prev.hemi) * t,
    fill: prev.fill + (next.fill - prev.fill) * t,
    lamp: prev.lamp + (next.lamp - prev.lamp) * t,
    exposure: prev.exposure + (next.exposure - prev.exposure) * t,
  };
}

export function applyDaylight(world, hour) {
  const look = daylightPreset(hour);
  const { THREE, scene, sky, sun, ambient, renderer, lamps } = world;
  if (sky?.material?.uniforms) {
    sky.material.uniforms.top.value.setHex(look.skyTop);
    sky.material.uniforms.horizon.value.setHex(look.skyHorizon);
    sky.material.uniforms.ground.value.setHex(look.skyGround);
    sky.material.uniforms.sunDir.value.set(look.sun[0], look.sun[1], look.sun[2]).normalize();
  }
  if (scene?.fog) {
    scene.fog.color.setHex(look.fog);
    scene.fog.near = look.fogNear;
    scene.fog.far = look.fogFar;
    scene.background?.setHex?.(look.fog);
  }
  if (sun) {
    sun.color.setHex(look.sunColor);
    sun.intensity = look.sunIntensity;
    sun.position.set(look.sun[0], Math.max(look.sun[1], -0.2), look.sun[2]).multiplyScalar(140);
  }
  if (ambient) ambient.intensity = look.ambient;
  if (world.hemi) world.hemi.intensity = look.hemi;
  if (world.fill) world.fill.intensity = look.fill;
  if (renderer) renderer.toneMappingExposure = look.exposure;
  for (const lamp of lamps || []) {
    lamp.material.color.setHex(look.lamp > 0.4 ? 0xffe7b0 : 0x4a463c);
  }
  return look;
}

export const DAY_HOURS = PRESETS.map((preset) => ({ hour: preset.hour, name: preset.name }));
