import { hitsCollider } from "./player.js";

const DISTANCES = [3.4, 2.6, 1.8, 1.1];

// Camera sits behind the body and looks ahead. Yaw 0 faces +Z.
export function chasePose({ x, z, y = 0, yaw, pitch = 0.12, colliders = [] }) {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const lookX = x + forwardX * 1.4;
  const lookZ = z + forwardZ * 1.4;
  const lookY = y + 1.35 + pitch * 0.2;
  let used = DISTANCES[DISTANCES.length - 1];
  for (const distance of DISTANCES) {
    const cx = x - forwardX * distance;
    const cz = z - forwardZ * distance;
    const blocked = colliders.some((collider) => collider?.points && hitsCollider(cx, cz, 0.3, collider));
    if (!blocked) {
      used = distance;
      break;
    }
  }
  return {
    x: x - forwardX * used,
    y: y + 1.55 + Math.max(0, pitch) * 0.35,
    z: z - forwardZ * used,
    lookX,
    lookY,
    lookZ,
    distance: used,
  };
}

export function clampPitch(pitch) {
  return Math.max(-0.45, Math.min(0.7, pitch));
}
