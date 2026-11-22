import { hitsCollider } from "./player.js";

function approach(current, target, maxDelta) {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export function roadLanes(roads) {
  const lanes = [];
  for (const road of roads || []) {
    const pts = (road.pts || []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
    if (pts.length < 2) continue;
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (length < 12) continue;
    lanes.push({ pts, length, name: road.name || "" });
  }
  return lanes;
}

function sample(lane, distance) {
  let left = ((distance % lane.length) + lane.length) % lane.length;
  for (let i = 1; i < lane.pts.length; i += 1) {
    const a = lane.pts[i - 1];
    const b = lane.pts[i];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= span || i === lane.pts.length - 1) {
      const t = span ? Math.min(1, left / span) : 0;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      return { x, z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    left -= span;
  }
  const last = lane.pts[lane.pts.length - 1];
  return { x: last.x, z: last.z, yaw: 0 };
}

export function createVehicles(lanes, count, seed = 1) {
  const vehicles = [];
  if (!lanes.length) return vehicles;
  for (let i = 0; i < count; i += 1) {
    const lane = lanes[i % lanes.length];
    const direction = i % 2 === 0 ? 1 : -1;
    const along = (lane.length * ((i * 0.37 + seed * 0.1) % 1));
    vehicles.push({
      lane: i % lanes.length,
      along: direction > 0 ? along : lane.length - along,
      direction,
      speed: 0,
      cruise: 4.2 + (i % 3) * 0.8,
      base: 4.2 + (i % 3) * 0.8,
      x: 0,
      z: 0,
      yaw: 0,
      kind: i % 3 === 0 ? "car" : "scooter",
    });
  }
  return vehicles;
}

export function stepVehicles(vehicles, lanes, dt, blockers) {
  for (const vehicle of vehicles) {
    const lane = lanes[vehicle.lane];
    if (!lane || vehicle.parked) continue;
    const ahead = sample(lane, vehicle.along + vehicle.direction * 5);
    let blocked = false;
    for (const blocker of blockers) {
      if (Math.hypot(blocker.x - ahead.x, blocker.z - ahead.z) < (blocker.radius || 1.6)) blocked = true;
    }
    for (const other of vehicles) {
      if (other === vehicle || other.parked) continue;
      const dx = other.x - vehicle.x;
      const dz = other.z - vehicle.z;
      const forward = Math.sin(vehicle.yaw) * dx + Math.cos(vehicle.yaw) * dz;
      if (forward > 0 && forward < 6 && Math.hypot(dx, dz) < 2.4) blocked = true;
    }
    vehicle.speed = approach(vehicle.speed, blocked ? 0 : vehicle.cruise, (blocked ? 10 : 4) * dt);
    vehicle.along += vehicle.direction * vehicle.speed * dt;
    const pose = sample(lane, vehicle.along);
    vehicle.x = pose.x;
    vehicle.z = pose.z;
    vehicle.yaw = vehicle.direction > 0 ? pose.yaw : pose.yaw + Math.PI;
  }
  return vehicles;
}

export function sidewalkPoint(x, z, yaw, side = 1, offset = 3.1) {
  return {
    x: x + Math.cos(yaw) * side * offset,
    z: z - Math.sin(yaw) * side * offset,
  };
}

export function pointClear(x, z, colliders, radius) {
  return !(colliders || []).some((collider) => collider?.points && hitsCollider(x, z, radius, collider));
}

export function parkSpot(lanes, colliders, x, z) {
  let best = null;
  for (const lane of lanes || []) {
    const steps = Math.max(2, Math.floor(lane.length / 4));
    for (let i = 0; i <= steps; i += 1) {
      const pose = sample(lane, (lane.length * i) / steps);
      const dist = Math.hypot(pose.x - x, pose.z - z);
      if (dist < 5 || dist > 18) continue;
      if (!pointClear(pose.x, pose.z, colliders, 0.9)) continue;
      if (!best || dist < best.dist) best = { ...pose, dist };
    }
  }
  if (best) return best;
  const beside = { x: x + 2.6, z, yaw: 0 };
  if (pointClear(beside.x, beside.z, colliders, 0.8)) return beside;
  return { x, z: z + 2.6, yaw: 0 };
}

export function rideReach(x, z, scooter, reach = 2.2) {
  if (!scooter || !Number.isFinite(scooter.x) || !Number.isFinite(scooter.z)) return null;
  const distance = Math.hypot(scooter.x - x, scooter.z - z);
  return distance <= reach ? distance : null;
}

export function dismountSpot(x, z, yaw, colliders) {
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  for (const side of [1, -1]) {
    const px = x + rightX * 1.15 * side;
    const pz = z + rightZ * 1.15 * side;
    if (pointClear(px, pz, colliders, 0.5)) return { x: px, z: pz };
  }
  return { x, z };
}

export function createPedestrians(lanes, colliders, count) {
  const people = [];
  for (let i = 0; i < count && lanes.length; i += 1) {
    const laneIndex = i % lanes.length;
    const lane = lanes[laneIndex];
    const along = lane.length * ((i * 0.41) % 1);
    const pose = sample(lane, along);
    const side = i % 2 === 0 ? 1 : -1;
    const spot = sidewalkPoint(pose.x, pose.z, pose.yaw, side, 3.15);
    if (!pointClear(spot.x, spot.z, colliders, 0.7)) continue;
    people.push({
      lane: laneIndex,
      along,
      direction: i % 3 === 0 ? -1 : 1,
      side,
      speed: 0.9 + (i % 4) * 0.15,
      x: spot.x,
      z: spot.z,
      yaw: pose.yaw,
    });
  }
  return people;
}

export function stepPedestrians(people, lanes, dt, colliders) {
  for (const person of people) {
    const lane = lanes[person.lane];
    if (!lane || person.parked) continue;
    person.along += person.direction * person.speed * dt;
    if (person.along < 0 || person.along > lane.length) person.direction *= -1;
    person.along = Math.max(0, Math.min(lane.length, person.along));
    const pose = sample(lane, person.along);
    const spot = sidewalkPoint(pose.x, pose.z, pose.yaw, person.side, 3.15);
    if (colliders && !pointClear(spot.x, spot.z, colliders, 0.45)) {
      person.direction *= -1;
      continue;
    }
    person.x = spot.x;
    person.z = spot.z;
    person.yaw = person.direction > 0 ? pose.yaw : pose.yaw + Math.PI;
  }
  return people;
}
