import { hitsCollider } from "./player.js";

const DISTANCES = [3.4, 2.6, 1.8, 1.1];

// Camera sits behind the body and looks ahead. Yaw 0 faces +Z.
export function chasePose({
  x, z, y = 0, yaw, pitch = 0.12, colliders = [], distances = DISTANCES,
  lookAhead = 1.4, cameraLift = 0, lookHeight = 1.35,
}) {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const lookX = x + forwardX * lookAhead;
  const lookZ = z + forwardZ * lookAhead;
  const lookY = y + lookHeight + pitch * 0.2;
  let used = distances[distances.length - 1];
  for (const distance of distances) {
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
    y: y + 1.55 + cameraLift + Math.max(0, pitch) * 0.35,
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
