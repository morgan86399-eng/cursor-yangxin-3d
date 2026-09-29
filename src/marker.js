import * as THREE from "three";

export function createShopMarker(config, colliders) {
  const group = new THREE.Group();
  group.name = "shop-marker";

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(36, 24, 16, 0.9)";
  ctx.beginPath();
  ctx.moveTo(28, 0);
  ctx.lineTo(740, 0);
  ctx.quadraticCurveTo(768, 0, 768, 28);
  ctx.lineTo(768, 212);
  ctx.quadraticCurveTo(768, 240, 740, 240);
  ctx.lineTo(28, 240);
  ctx.quadraticCurveTo(0, 240, 0, 212);
  ctx.lineTo(0, 28);
  ctx.quadraticCurveTo(0, 0, 24, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#d6b47b";
  ctx.lineWidth = 7;
  ctx.strokeRect(12, 12, 744, 216);
  ctx.fillStyle = "#f6e6c8";
  ctx.font = "bold 60px 'Noto Sans TC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("鎮撫街 46 號", 384, 103);
  ctx.font = "37px 'Noto Sans TC', sans-serif";
  ctx.fillStyle = "#d9c4a4";
  ctx.fillText("2樓 桃園養心推拿 · 1樓 雅善圓", 384, 181);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, sizeAttenuation: true })
  );
  const shop = (colliders || []).find((c) => c.isShop);
  const x = shop ? (shop.minX + shop.maxX) / 2 : 0;
  const z = shop ? (shop.minZ + shop.maxZ) / 2 : 0;
  const y = shop ? shop.height + 3 : 7.2;
  sprite.position.set(x, y, z);
  sprite.scale.set(8.1, 2.54, 1);
  sprite.userData = { kind: "focal-marker", address: "鎮撫街46號" };
  group.add(sprite);

  if (shop?.points?.length > 2) {
    const roofEdge = new THREE.MeshBasicMaterial({ color: 0xffd279, toneMapped: false });
    const pts = shop.points;
    const count = pts[0].x === pts.at(-1).x && pts[0].z === pts.at(-1).z ? pts.length - 1 : pts.length;
    for (let i = 0; i < count; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % count];
      const curve = new THREE.LineCurve3(
        new THREE.Vector3(a.x, shop.height + 0.14, a.z),
        new THREE.Vector3(b.x, shop.height + 0.14, b.z)
      );
      const edge = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.075, 5, false), roofEdge);
      edge.userData = { kind: "focal-roof-edge", address: "鎮撫街46號" };
      group.add(edge);
    }
  }

  return group;
}
