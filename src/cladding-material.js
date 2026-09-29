import * as THREE from "three";

export function claddingNormalAsset(colorAsset) {
  return colorAsset.replace(/_Color\.jpg$/, "_NormalGL.jpg");
}

// Colour is display data; an OpenGL normal map is linear vector data. The same
// UV transform must be used on both, or mortar relief will not match the bricks.
export function createCladdingMaterial(colorMap, normalMap, color) {
  colorMap.colorSpace = THREE.SRGBColorSpace;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.repeat.copy(colorMap.repeat);
  normalMap.offset.copy(colorMap.offset);
  normalMap.center.copy(colorMap.center);
  normalMap.rotation = colorMap.rotation;
  const tint = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.23);
  const material = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(0.42, 0.42),
    roughness: 0.88,
    metalness: 0,
    color: tint,
    side: THREE.DoubleSide,
  });
  material.userData = { kind: "near50-cladding", estimated: true, license: "CC0-1.0" };
  return material;
}
