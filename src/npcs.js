import * as THREE from "three";

const CLOTHES = {
  liu: 0x3e4a3a,
  keeper: 0x7a2e2a,
  ahua: 0xc4552a,
  uncle: 0x4d5c6b,
  chen: 0x2f5f6b,
  officer: 0x2c3a4a,
};

function nameplate(text) {
  const hasCanvas = typeof document !== "undefined" && typeof document.createElement === "function";
  if (!hasCanvas) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.22, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xf4e2b8 }),
    );
    mesh.name = "npc-name";
    mesh.userData.label = text;
    return mesh;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(28,18,10,0.9)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#fff6e4";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.3),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.name = "npc-name";
  mesh.userData.label = text;
  return mesh;
}

function person(id, npc) {
  const group = new THREE.Group();
  group.name = `npc-${id}`;
  group.userData = { npcId: id, name: npc.name, questId: npc.questId || "" };
  group.position.set(npc.x, 0, npc.z);
  const cloth = new THREE.MeshLambertMaterial({ color: CLOTHES[id] || 0x3d4c5c });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0c7a4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.92, 8), cloth);
  body.position.y = 0.84;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.48;
  head.castShadow = true;
  group.add(body, head);
  if (id === "uncle") {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 0.42), wood);
    seat.position.set(0.95, 0.42, 0.15);
    seat.name = "npc-bench";
    seat.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.08), wood);
    back.position.set(0.95, 0.68, 0.34);
    back.name = "npc-bench";
    const legA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), wood);
    legA.position.set(0.42, 0.21, 0.15);
    const legB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), wood);
    legB.position.set(1.48, 0.21, 0.15);
    group.add(seat, back, legA, legB);
  }
  const plate = nameplate(npc.name);
  plate.position.y = 1.92;
  group.add(plate);
  return group;
}

export function createNpcs(npcs = {}) {
  const group = new THREE.Group();
  group.name = "street-npcs";
  for (const [id, npc] of Object.entries(npcs)) {
    if (!npc || !Number.isFinite(npc.x) || !Number.isFinite(npc.z) || !npc.name) continue;
    group.add(person(id, npc));
  }
  return {
    group,
    faceCamera(camera) {
      group.traverse((node) => {
        if (node.name === "npc-name") node.lookAt(camera.position);
      });
    },
  };
}
