import assert from "node:assert/strict";
import * as THREE from "three";
import { daylightPreset } from "../src/daylight.js";
import { LOOKS, makeCarMesh, makeCitizen, makeScooterMesh, poseCitizen, SIT_DROP } from "../src/street-art.js";
import { chasePose, clampPitch } from "../src/follow-camera.js";
import { radarGuide, radarPoint } from "../src/radar.js";
import { buildRoadGraph, createPedestrians, createVehicles, dismountSpot, parkSpot, placeNearbyWalker, rideReach, roadLanes, routeAlongRoads, stepPedestrians, stepScooter, stepVehicles } from "../src/traffic.js";
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
assert.ok(night.hemi < noon.hemi, "night drops the sky fill so the street lamps read");
const citizen = makeCitizen({ shirt: 0x224466 });
poseCitizen(citizen, { phase: Math.PI / 2, speed: 1.2 });
assert.ok(citizen.getObjectByName("leg-left").rotation.x > 0.4);
assert.ok(citizen.getObjectByName("leg-right").rotation.x < -0.4);
poseCitizen(citizen, { riding: true, speed: 8 });
assert.ok(citizen.getObjectByName("spine").rotation.x > 0.3, "the rider leans toward the bars");
let scoot = stepScooter({ x: 0, z: 0, yaw: 0, speed: 0 }, { gas: 1, steer: 0 }, 1, [], 200);
assert.ok(scoot.z > 2 && scoot.speed > 5, "W feeds the scooter forward");
const steered = stepScooter({ x: 0, z: 0, yaw: 0, speed: 8 }, { gas: 1, steer: 1 }, 0.5, [], 200);
assert.ok(steered.yaw > 0.2, "D steers the scooter");
const braked = stepScooter({ x: 0, z: 0, yaw: 0, speed: 8 }, { gas: -1, steer: 0 }, 0.6, [], 200);
assert.ok(braked.speed < 1, "S brakes");
const streetGraph = buildRoadGraph(roadLanes([
  { pts: [{ x: 0, z: 0 }, { x: 40, z: 0 }] },
  { pts: [{ x: 40, z: 0 }, { x: 40, z: 40 }] },
]));
const alongStreets = routeAlongRoads(streetGraph, 0, 0, 40, 40);
assert.ok(alongStreets.meters > 70 && alongStreets.meters < 100, "GPS follows the streets instead of cutting the corner");
assert.ok(alongStreets.points.some((point) => Math.hypot(point.x - 40, point.z) < 10));
const watcher = [{ lane: 0, along: 10, direction: 1, side: 1, speed: 1, x: 0, z: 10, yaw: 0 }];
stepPedestrians(watcher, roadLanes([{ pts: [{ x: 0, z: 0 }, { x: 0, z: 40 }] }]), 1, [], { x: 2, z: 10 });
assert.equal(watcher[0].x, 0);
assert.equal(watcher[0].looking, true);
const northGuide = radarGuide(0, 0, 0, -40, 70, 180);
assert.ok(northGuide.y < 90, "the quest line points north");
const highCam = chasePose({ x: 0, z: 0, yaw: 0, cameraLift: 0.95, lookAhead: 3.8 });
assert.ok(highCam.y > 2.3 && highCam.lookZ > 3, "the ride camera sits high and looks down the road");
const bike = makeScooterMesh({ color: 0x1b7a3c, hero: true });
assert.ok(bike.getObjectByName("wheel-front").position.z > bike.getObjectByName("wheel-rear").position.z);
assert.ok(bike.getObjectByName("headlamp"));
const beam = bike.getObjectByName("head-glow");
beam.geometry.computeBoundingBox();
assert.ok(beam.geometry.boundingBox.min.z > 1, "the headlight pool starts ahead of the rider");
assert.ok(beam.geometry.boundingBox.max.z > 12, "the pool runs far enough down the road");
assert.ok(bike.getObjectByName("handlebar").geometry.parameters.width > 1.1);
assert.ok(bike.getObjectByName("tail-lamp").position.z < bike.getObjectByName("wheel-rear").position.z + 0.2);
poseCitizen(citizen, { riding: true });
citizen.position.y = SIT_DROP;
citizen.updateWorldMatrix(true, true);
const shoe = new THREE.Vector3();
const hand = new THREE.Vector3();
citizen.getObjectByName("shoe-left").getWorldPosition(shoe);
citizen.getObjectByName("hand-left").getWorldPosition(hand);
assert.ok(shoe.z > 0.15, "riding feet stay ahead of the rear wheel");
assert.ok(Math.abs(shoe.x) > 0.2, "knees stay apart so the tail lamp can show");
assert.ok(hand.z > 0.75, "hands reach the handlebar");
const car = makeCarMesh(0xe6e1d6);
assert.ok(car.getObjectByName("roof"));
let tailLamps = 0;
car.traverse((node) => { if (node.name === "tail-lamp") tailLamps += 1; });
assert.equal(tailLamps, 2, "a car reads from behind by two tail lamps");
assert.ok(new Set(LOOKS.map((look) => look.shirt)).size >= 5);
assert.ok(LOOKS.some((look) => look.hood === false && look.sleeves === "short"));
assert.ok(!LOOKS.some((look) => look.shirt === 0x4d6a45), "pedestrians do not wear the rider jacket");
const passer = makeCitizen({ hood: false, sleeves: "short", bag: true, legs: "shorts" });
assert.equal(passer.getObjectByName("hood"), undefined);
assert.ok(passer.getObjectByName("hair"));
assert.ok(passer.getObjectByName("bag"));
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
assert.equal(placeNearbyWalker(spawned, lanes, [], 0, 8, 0), true);
assert.ok(Math.abs(spawned[0].x) > 1.5, "the nearby walker stays on the sidewalk");
assert.ok(spawned[0].z > 8 && spawned[0].z < 18, "the nearby walker starts ahead of the player");

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
