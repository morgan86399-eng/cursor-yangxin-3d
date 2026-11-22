// North is -Z in this map (latitude grows as z shrinks). The radar is a top-down circle.
export function radarPoint(px, pz, x, z, range, size) {
  const center = size / 2;
  const scale = (size * 0.42) / range;
  const sx = center + (x - px) * scale;
  const sy = center + (z - pz) * scale;
  const dx = sx - center;
  const dy = sy - center;
  if (dx * dx + dy * dy > (size * 0.46) ** 2) return null;
  return { x: sx, y: sy };
}

export function radarGuide(px, pz, x, z, range, size) {
  const center = size / 2;
  const scale = (size * 0.42) / range;
  let sx = (x - px) * scale;
  let sy = (z - pz) * scale;
  const reach = size * 0.42;
  const dist = Math.hypot(sx, sy) || 1;
  if (dist > reach) {
    sx = sx / dist * reach;
    sy = sy / dist * reach;
  }
  return { x: center + sx, y: center + sy };
}

export function drawRadar(canvas, { px, pz, yaw = 0, blips = [], range = 70, guide = null, route = null }) {
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const center = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(center, center, size * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(18, 24, 20, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(212, 175, 55, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(center - 0.5, center - size * 0.46, 1, size * 0.92);
  ctx.fillRect(center - size * 0.46, center - 0.5, size * 0.92, 1);
  if (route?.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(226, 177, 58, 0.95)";
    ctx.lineWidth = 3;
    let drawing = false;
    for (const point of route) {
      const spot = radarPoint(px, pz, point.x, point.z, range, size);
      if (!spot) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(spot.x, spot.y);
        drawing = true;
      } else ctx.lineTo(spot.x, spot.y);
    }
    ctx.stroke();
  }
  if (guide && Number.isFinite(guide.x) && Number.isFinite(guide.z)) {
    const tip = radarGuide(px, pz, guide.x, guide.z, range, size);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(240, 160, 106, 0.95)";
    ctx.lineWidth = 3;
    ctx.moveTo(center, center);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }
  for (const blip of blips) {
    const point = radarPoint(px, pz, blip.x, blip.z, range, size);
    if (!point) continue;
    ctx.beginPath();
    ctx.fillStyle = blip.color || "#d4af37";
    ctx.arc(point.x, point.y, blip.radius || 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#f4f1ea";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
