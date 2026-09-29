import { pointInRing, streetFacingEdge } from "./geo.js";

export const PLAYER = {
  radius: 0.42,
  eyeHeight: 1.62,
  walkSpeed: 4.6,
  runSpeed: 7.4,
  jumpSpeed: 7.2,
  gravity: 22,
  groundAccel: 32,
  airAccel: 9,
  friction: 28,
};

function clampWorld(x, z, worldRadius) {
  const r = worldRadius - 0.8;
  const d2 = x * x + z * z;
  if (d2 <= r * r) return { x, z };
  const s = r / Math.sqrt(d2);
  return { x: x * s, z: z * s };
}

function edgeNormal(a, b, pts) {
  let nx = a.z - b.z;
  let nz = b.x - a.x;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  if (pointInRing(mx + nx * 0.25, mz + nz * 0.25, pts)) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz };
}

function closestOnSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz || 1;
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + vx * t;
  const qz = az + vz * t;
  const dx = px - qx;
  const dz = pz - qz;
  return { qx, qz, d: Math.hypot(dx, dz), dx, dz };
}

export function hitsCollider(x, z, radius, collider) {
  if (x < collider.minX - radius || x > collider.maxX + radius || z < collider.minZ - radius || z > collider.maxZ + radius) {
    return false;
  }
  if (pointInRing(x, z, collider.points)) return true;
  const pts = collider.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const hit = closestOnSegment(x, z, pts[j].x, pts[j].z, pts[i].x, pts[i].z);
    if (hit.d < radius) return true;
  }
  return false;
}

export function pushCircleOut(x, z, radius, collider) {
  if (x < collider.minX - radius || x > collider.maxX + radius || z < collider.minZ - radius || z > collider.maxZ + radius) {
    return { x, z, hit: false };
  }
  const pts = collider.points;
  if (!pts || pts.length < 3) return { x, z, hit: false };

  let best = null;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j];
    const b = pts[i];
    const near = closestOnSegment(x, z, a.x, a.z, b.x, b.z);
    const n = edgeNormal(a, b, pts);
    if (!best || near.d < best.d) best = { ...near, ...n, a, b };
  }
  if (!best) return { x, z, hit: false };

  const inside = pointInRing(x, z, pts);
  if (inside) {
    return {
      x: x + best.nx * (radius + best.d + 0.001),
      z: z + best.nz * (radius + best.d + 0.001),
      hit: true,
    };
  }
  if (best.d >= radius) return { x, z, hit: false };

  let nx = best.dx;
  let nz = best.dz;
  const d = best.d;
  if (d < 1e-8) {
    nx = best.nx;
    nz = best.nz;
  } else {
    nx /= d;
    nz /= d;
    if (nx * best.nx + nz * best.nz < 0) {
      nx = best.nx;
      nz = best.nz;
    }
  }
  const push = radius - d + 0.001;
  return { x: x + nx * push, z: z + nz * push, hit: true };
}

export function resolveMove(x, z, radius, colliders, worldRadius) {
  let hit = false;
  let nx = x;
  let nz = z;
  const world = clampWorld(nx, nz, worldRadius);
  nx = world.x;
  nz = world.z;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const c of colliders) {
      const out = pushCircleOut(nx, nz, radius, c);
      if (out.hit) {
        nx = out.x;
        nz = out.z;
        hit = true;
        moved = true;
      }
    }
    const again = clampWorld(nx, nz, worldRadius);
    if (again.x !== nx || again.z !== nz) {
      nx = again.x;
      nz = again.z;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: nx, z: nz, hit };
}

function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

export function createPlayerState(x, z, opts = {}) {
  return {
    x,
    z,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    onGround: true,
    bob: 0,
    bobPhase: 0,
    eyeHeight: opts.eyeHeight ?? PLAYER.eyeHeight,
  };
}

export function stepPlayer(state, input, dt, colliders, worldRadius, opts = {}) {
  const cfg = { ...PLAYER, ...opts };
  const onGround = state.y <= 0.001 && state.vy <= 0;
  const wishX = (input.forward || 0) * (input.fwdX || 0) + (input.strafe || 0) * (input.rightX || 0);
  const wishZ = (input.forward || 0) * (input.fwdZ || 0) + (input.strafe || 0) * (input.rightZ || 0);
  const wishLen = Math.hypot(wishX, wishZ);
  let tx = 0;
  let tz = 0;
  const speed = input.run ? cfg.runSpeed : cfg.walkSpeed;
  if (wishLen > 1e-6) {
    tx = (wishX / wishLen) * speed;
    tz = (wishZ / wishLen) * speed;
  }
  const accel = onGround ? cfg.groundAccel : cfg.airAccel;
  let vx = approach(state.vx, tx, accel * dt);
  let vz = approach(state.vz, tz, accel * dt);
  if (onGround && wishLen < 1e-6) {
    vx = approach(vx, 0, cfg.friction * dt);
    vz = approach(vz, 0, cfg.friction * dt);
  }

  let x = state.x + vx * dt;
  let z = state.z + vz * dt;
  const moved = resolveMove(x, z, cfg.radius, colliders, worldRadius);
  if (moved.hit) {
    if (Math.abs(moved.x - state.x) < 0.0001) vx = 0;
    if (Math.abs(moved.z - state.z) < 0.0001) vz = 0;
  }
  x = moved.x;
  z = moved.z;

  let vy = state.vy;
  let y = state.y;
  if (input.jump && onGround) vy = cfg.jumpSpeed;
  vy -= cfg.gravity * dt;
  y += vy * dt;
  let grounded = false;
  if (y <= 0) {
    y = 0;
    vy = 0;
    grounded = true;
  }

  let bob = state.bob;
  let bobPhase = state.bobPhase;
  const moving = grounded && Math.hypot(vx, vz) > 0.6;
  if (moving) {
    bobPhase += dt * Math.hypot(vx, vz) * 1.7;
    bob = Math.sin(bobPhase) * 0.04;
  } else {
    bob *= Math.max(0, 1 - dt * 12);
  }

  return {
    x,
    z,
    y,
    vx,
    vz,
    vy,
    onGround: grounded,
    bob,
    bobPhase,
    eyeHeight: state.eyeHeight,
    blocked: moved.hit,
  };
}

function blockedAt(x, z, colliders, pad) {
  return (colliders || []).some((c) => hitsCollider(x, z, pad, c));
}

export function findStreetSpawn(colliders, roads, radius) {
  const clearance = Math.max(radius + 1.85, 2.25);
  const shop = (colliders || []).find((c) => c.isShop);
  if (shop) {
    const edge = streetFacingEdge(shop.points, roads);
    if (edge) {
      for (const dist of [8.4, 7.2, 9.6, 6.4, 11.2, 12.8, 5.6]) {
        const x = edge.mx + edge.nx * dist;
        const z = edge.mz + edge.nz * dist;
        if (blockedAt(x, z, colliders, clearance)) continue;
        return {
          x,
          z,
          lookX: edge.mx,
          lookZ: edge.mz,
          lookY: 3.35,
        };
      }
    }
  }

  const hits = [];
  function consider(x, z) {
    const d2 = x * x + z * z;
    if (d2 < 8 * 8 || d2 > 36 * 36) return;
    if (blockedAt(x, z, colliders, clearance)) return;
    hits.push({ x, z, d2 });
  }
  for (const road of roads || []) {
    const pts = road.pts || [];
    for (let i = 0; i < pts.length; i++) {
      consider(pts[i].x, pts[i].z);
      const b = pts[i + 1];
      if (!b) continue;
      const a = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.floor(len / 3));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        consider(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      }
    }
  }
  hits.sort((a, b) => Math.abs(Math.sqrt(a.d2) - 12) - Math.abs(Math.sqrt(b.d2) - 12));
  if (hits[0]) {
    const look = shop
      ? { lookX: (shop.minX + shop.maxX) / 2, lookZ: (shop.minZ + shop.maxZ) / 2, lookY: 3.35 }
      : {};
    return { ...hits[0], ...look };
  }
  for (let r = 10; r <= 48; r += 2) {
    for (let a = 0; a < 24; a++) {
      const x = Math.cos((a * Math.PI) / 12) * r;
      const z = Math.sin((a * Math.PI) / 12) * r;
      if (!blockedAt(x, z, colliders, clearance)) {
        return { x, z, lookX: 0, lookZ: 0, lookY: 3.35 };
      }
    }
  }
  return { x: 0, z: 16, lookX: 0, lookZ: 0, lookY: 3.35 };
}

