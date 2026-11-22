import { hitsCollider, resolveMove } from "./player.js";

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
  if (Math.abs(distance - lane.length) < 1e-4) {
    const end = lane.pts[lane.pts.length - 1];
    const before = lane.pts[lane.pts.length - 2] || end;
    return { x: end.x, z: end.z, yaw: Math.atan2(end.x - before.x, end.z - before.z) };
  }
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

// GTA-style scooter: W gas, S brake then reverse, A/D steer the heading.
export function stepScooter(pose, input, dt, colliders, worldRadius) {
  const gas = input.gas || 0;
  const steer = input.steer || 0;
  const top = input.run ? 11 : 9;
  const target = gas > 0 ? top : gas < 0 ? -3.2 : 0;
  const braking = gas < 0 && (pose.speed || 0) > 0.4;
  const accel = braking ? 16 : gas === 0 ? 4.5 : 6.5;
  let speed = approach(pose.speed || 0, target, accel * dt);
  const turn = (0.45 + Math.min(Math.abs(speed), 8) * 0.16) * dt * (speed < -0.2 ? -1 : 1);
  const yaw = pose.yaw + steer * turn;
  const next = resolveMove(
    pose.x + Math.sin(yaw) * speed * dt,
    pose.z + Math.cos(yaw) * speed * dt,
    0.7,
    colliders || [],
    worldRadius,
  );
  if (next.hit) speed *= 0.25;
  return {
    x: next.x,
    z: next.z,
    yaw,
    speed,
    vx: Math.sin(yaw) * speed,
    vz: Math.cos(yaw) * speed,
  };
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

export function stepPedestrians(people, lanes, dt, colliders, lookAt) {
  for (const person of people) {
    const lane = lanes[person.lane];
    if (!lane || person.parked) continue;
    if (lookAt && Math.hypot(person.x - lookAt.x, person.z - lookAt.z) < 3.2) {
      person.looking = true;
      person.yaw = Math.atan2(lookAt.x - person.x, lookAt.z - person.z);
      continue;
    }
    person.looking = false;
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

function connectNodes(nodes, a, b) {
  if (a === b) return;
  if (!nodes[a].links.includes(b)) nodes[a].links.push(b);
  if (!nodes[b].links.includes(a)) nodes[b].links.push(a);
}

export function buildRoadGraph(lanes) {
  const nodes = [];
  for (const lane of lanes || []) {
    const steps = Math.max(1, Math.ceil(lane.length / 8));
    const ids = [];
    for (let i = 0; i <= steps; i += 1) {
      const pose = sample(lane, (lane.length * i) / steps);
      ids.push(nodes.length);
      nodes.push({ x: pose.x, z: pose.z, links: [] });
    }
    for (let i = 0; i < ids.length - 1; i += 1) connectNodes(nodes, ids[i], ids[i + 1]);
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (dist < 7) connectNodes(nodes, i, j);
    }
  }
  return nodes;
}

function nearestNode(nodes, x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const dist = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

export function routeAlongRoads(nodes, x, z, tx, tz) {
  const straight = Math.hypot(tx - x, tz - z);
  if (!nodes?.length) return { points: [{ x, z }, { x: tx, z: tz }], meters: straight };
  const start = nearestNode(nodes, x, z);
  const goal = nearestNode(nodes, tx, tz);
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const used = new Array(nodes.length).fill(false);
  dist[start] = 0;
  while (true) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      if (!used[i] && dist[i] < best) {
        best = dist[i];
        current = i;
      }
    }
    if (current < 0 || current === goal) break;
    used[current] = true;
    for (const next of nodes[current].links) {
      const weight = Math.hypot(nodes[current].x - nodes[next].x, nodes[current].z - nodes[next].z);
      if (dist[current] + weight < dist[next]) {
        dist[next] = dist[current] + weight;
        prev[next] = current;
      }
    }
  }
  if (!Number.isFinite(dist[goal])) return { points: [{ x, z }, { x: tx, z: tz }], meters: straight };
  const points = [];
  for (let i = goal; i >= 0; i = prev[i]) {
    points.push({ x: nodes[i].x, z: nodes[i].z });
    if (i === start) break;
  }
  points.reverse();
  points.push({ x: tx, z: tz });
  return { points, meters: dist[goal] + Math.hypot(nodes[goal].x - tx, nodes[goal].z - tz) };
}

// Put one walker on the sidewalk just ahead of the player so the chase view is not empty.
export function placeNearbyWalker(people, lanes, colliders, x, z, yaw) {
  if (!people?.length || !lanes?.length) return false;
  const goalX = x + Math.sin(yaw) * 6;
  const goalZ = z + Math.cos(yaw) * 6;
  let best = null;
  lanes.forEach((lane, laneIndex) => {
    const steps = Math.max(2, Math.ceil(lane.length / 3));
    for (let i = 0; i <= steps; i += 1) {
      const along = (lane.length * i) / steps;
      const pose = sample(lane, along);
      for (const side of [1, -1]) {
        const spot = sidewalkPoint(pose.x, pose.z, pose.yaw, side, 3.15);
        const dist = Math.hypot(spot.x - goalX, spot.z - goalZ);
        if (dist > 4.8) continue;
        if (!pointClear(spot.x, spot.z, colliders, 0.45)) continue;
        if (!best || dist < best.dist) best = { dist, laneIndex, along, side, spot, yaw: pose.yaw };
      }
    }
  });
  if (!best) return false;
  const person = people[0];
  person.lane = best.laneIndex;
  person.along = best.along;
  person.side = best.side;
  person.direction = 1;
  person.x = best.spot.x;
  person.z = best.spot.z;
  person.yaw = best.yaw;
  person.parked = false;
  return true;
}
