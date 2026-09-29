import { pointInRing } from "./geo.js";

// Floors were counted by weiyo on site on 2026-09-18. The metre heights below
// remain modelling estimates; neither survey measured a roof elevation.
const LOCAL_FLOORS = Object.freeze({
  "nlsc/414": Object.freeze({
    address: "鎮撫街46號",
    floors: 3,
    point: Object.freeze({ lat: 24.997987, lon: 121.3146923 }),
    estimatedHeightMeters: 9.9,
    source: "engine/unity-outdoor/RealFarm/LOCAL_BUILDING_SPLITS.json",
  }),
  "nlsc/410": Object.freeze({
    address: "鎮撫街48號",
    floors: 5,
    point: Object.freeze({ lat: 24.9980007, lon: 121.3147446 }),
    estimatedHeightMeters: 14.65,
    source: "engine/unity-outdoor/RealFarm/LOCAL_FLOOR_SURVEY.json",
  }),
});

export function localFloorEvidenceForLot(building, project) {
  const evidence = LOCAL_FLOORS[building?.id];
  if (!evidence || !building?.ring?.length || !project) return null;
  // Both the NLSC id and address point must still agree with the baked footprint.
  // This prevents a future map refresh from silently reassigning the survey.
  const p = project.toLocal(evidence.point.lat, evidence.point.lon);
  const ring = building.ring.map(([lon, lat]) => project.toLocal(lat, lon));
  return pointInRing(p.x, p.z, ring) ? evidence : null;
}
