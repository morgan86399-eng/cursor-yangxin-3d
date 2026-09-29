import * as THREE from "three";
import { dist2 } from "./geo.js";
import { localRing } from "./buildings.js";
import { createCurbs, createRoadMarkings } from "./roads.js";

/** 路網給招牌對位。斑馬線只放 OSM crossing:markings=zebra，不畫鎮撫街沒有的車道線。 */
export function createRoadsAndParks(osm, config, project, crossings = []) {
  const group = new THREE.Group();
  group.name = "roads-parks";
  const radius = config.radiusMeters;
  const roads = [];

  for (const road of osm.roads || []) {
    const pts = localRing(road.path, project);
    const mid = pts[Math.floor(pts.length / 2)];
    if (!mid || dist2(mid.x, mid.z, 0, 0) > (radius + 50) ** 2) continue;
    roads.push({ id: road.id, name: road.name, highway: road.highway, pts });
  }

  const localCrossings = (crossings || []).map((c) => {
    const p = project.toLocal(c.lat, c.lon);
    return { x: p.x, z: p.z, markings: c.markings || "" };
  });
  const marks = createRoadMarkings(roads, config, localCrossings);
  group.add(marks.group);
  group.add(createCurbs(roads, config));
  return {
    group,
    roads,
    roadStats: {
      crossings: marks.crossings,
      stripes: marks.stripes,
      dashes: marks.dashes,
      arrows: marks.arrows,
      centerlineStrips: marks.centerlineStrips,
      zebraPoints: marks.zebraPoints,
      shopZebra: marks.shopZebra,
    },
  };
}
