import assert from "node:assert/strict";
import { daylightPreset } from "../src/daylight.js";
import { chasePose, clampPitch } from "../src/follow-camera.js";
import { radarPoint } from "../src/radar.js";
import { createPedestrians, createVehicles, dismountSpot, parkSpot, rideReach, roadLanes, stepPedestrians, stepVehicles } from "../src/traffic.js";
import { mountStreetLife } from "../src/street-life.js";

const noon = daylightPreset(12);
assert.equal(noon.name, "中午");
assert.equal(noon.lamp, 0);
assert.ok(noon.sunIntensity > 0.9);
const night = daylightPreset(21);
assert.equal(night.name, "夜晚");
assert.equal(night.lamp, 1);
assert.ok(night.sunIntensity < 0.15);
assert.ok(night.fogFar >= 300, "night fog must still leave the sky view readable");
const dusk = daylightPreset(17.5);
assert.equal(dusk.name, "傍晚");
assert.ok(dusk.lamp > 0.8);
assert.equal(clampPitch(4), 0.7);
assert.equal(clampPitch(-2), -0.45);

const open = chasePose({ x: 0, z: 0, yaw: 0, colliders: [] });
assert.ok(open.z < -3, "chase camera sits behind a +Z facing player");
assert.ok(open.lookZ > 1, "chase camera looks ahead of the player");
assert.equal(open.distance, 3.4);
const wall = {
  minX: -2, maxX: 2, minZ: -6, maxZ: -2,
  points: [
    { x: -2, z: -6 }, { x: 2, z: -6 }, { x: 2, z: -2 }, { x: -2, z: -2 }, { x: -2, z: -6 },
  ],
};
const pulled = chasePose({ x: 0, z: 0, yaw: 0, colliders: [wall] });
assert.ok(pulled.distance < open.distance, "a wall behind the player pulls the camera in");
assert.ok(pulled.z > wall.maxZ, "pulled camera stays outside the wall");

const north = radarPoint(0, 0, 0, -20, 70, 180);
assert.ok(north && north.y < 90, "north, which is -Z, draws above the radar center");
assert.equal(radarPoint(0, 0, 200, 0, 70, 180), null);

assert.equal(roadLanes([{ pts: [{ x: 0, z: 0 }, { x: 3, z: 0 }] }]).length, 0);
const lanes = roadLanes([{ name: "鎮撫街", pts: [{ x: 0, z: 0 }, { x: 0, z: 40 }] }]);
const vehicles = createVehicles(lanes, 1, 1);
const started = vehicles[0].along;
stepVehicles(vehicles, lanes, 0.5, []);
assert.notEqual(vehicles[0].along, started);
assert.ok(Math.abs(vehicles[0].x) < 0.01);
for (let i = 0; i < 30; i += 1) {
  const ahead = vehicles[0].direction * 5;
  stepVehicles(vehicles, lanes, 0.1, [{ x: vehicles[0].x, z: vehicles[0].z + ahead, radius: 3 }]);
}
assert.equal(vehicles[0].speed, 0, "traffic stops for someone in front");

const people = [{ lane: 0, along: 0.2, direction: -1, side: 1, speed: 5, x: 0, z: 0, yaw: 0 }];
stepPedestrians(people, lanes, 1, []);
assert.equal(people[0].direction, 1, "a walker turns around at the end of the sidewalk");
const blocked = {
  minX: 2, maxX: 6, minZ: -2, maxZ: 42,
  points: [
    { x: 2, z: -2 }, { x: 6, z: -2 }, { x: 6, z: 42 }, { x: 2, z: 42 }, { x: 2, z: -2 },
  ],
};
const spawned = createPedestrians(lanes, [blocked], 4);
assert.ok(spawned.length > 0 && spawned.every((person) => person.x < 0), "walkers do not spawn inside a building");

const rideLane = roadLanes([{ pts: [{ x: 0, z: 0 }, { x: 0, z: 40 }] }]);
const parked = parkSpot(rideLane, [], 0, 8);
const parkedDist = Math.hypot(parked.x, parked.z - 8);
assert.ok(parkedDist >= 5 && parkedDist <= 18, "the ride scooter parks a short walk down the lane");
assert.equal(rideReach(parked.x, parked.z + 2, parked), 2);
assert.equal(rideReach(parked.x, parked.z + 3, parked), null);
const sideWall = {
  minX: 0.4, maxX: 3, minZ: -2, maxZ: 2,
  points: [
    { x: 0.4, z: -2 }, { x: 3, z: -2 }, { x: 3, z: 2 }, { x: 0.4, z: 2 }, { x: 0.4, z: -2 },
  ],
};
const stepOff = dismountSpot(0, 0, 0, [sideWall]);
assert.ok(stepOff.x < 0, "dismount steps to the clear side");
const ridingCam = chasePose({ x: 0, z: 0, yaw: 0, distances: [4.8, 3.6, 2.4, 1.4] });
assert.equal(ridingCam.distance, 4.8);

globalThis.location = { search: "" };
const dormant = mountStreetLife({});
assert.equal(dormant.enabled, false);
dormant.update(1);
globalThis.location = { search: "?life=1" };
assert.equal(new URLSearchParams("?life=1").get("life"), "1");
console.log("street life ok");
