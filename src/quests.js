import { pointInRing } from "./geo.js";

/** Street quests for 鎮撫街. Anchors are filled from landmark views, not copied OSM ids. */
export const QUEST_STORAGE_KEY = "zhenfu-garden-quests-v1";
export const QUEST_FACE_SECONDS = 2;
export const QUEST_WAYPOINT_RADIUS = 5;
export const QUEST_FACE_COS = 0.82;

export const STREET_QUESTS = Object.freeze([
  Object.freeze({
    id: "Q1", name: "找到雅善圓", place: "鎮撫街46號", anchor: "yashan",
    range: 8, mode: "face-or-interact", action: "查看",
    hint: "這就是雅善圓門口了。", reward: "心田+5", points: 5,
  }),
  Object.freeze({
    id: "Q2", name: "朝陽宮參拜", place: "朝陽宮", anchor: "chaoyang",
    range: 6, mode: "interact", action: "參拜",
    hint: "雙手合十，心先安下來。", reward: "心田+8", points: 8,
  }),
  Object.freeze({
    id: "Q3", name: "市場找攤", place: "朝陽市場", anchor: "market",
    range: 10, stallRange: 3, mode: "stall", action: "看攤",
    hint: "找找有沒有熟悉的攤位字樣。", reward: "心田+6", points: 6,
  }),
  Object.freeze({
    id: "Q4", name: "公園繞一圈", place: "朝陽公園", anchor: "park",
    mode: "waypoints",
    hint: "沿公園走一圈，別漏停車場。", reward: "心田+10", points: 10,
  }),
  Object.freeze({
    id: "Q5", name: "活動中心打卡", place: "活動中心", anchor: "activity",
    range: 6, mode: "interact", action: "打卡",
    hint: "活動中心，打個卡。", reward: "心田+5", points: 5,
  }),
  Object.freeze({
    id: "Q6", name: "派出所報到", place: "青溪派出所", anchor: "station",
    range: 6, mode: "interact", action: "報到",
    hint: "路過派出所，報個到。", reward: "心田+5", points: 5,
  }),
  Object.freeze({
    id: "Q7", name: "地基主小祈福", place: "地基主祠", anchor: "shrine",
    range: 5, mode: "interact", action: "祈福",
    hint: "跟地基主說聲平安。", reward: "心田+8", points: 8,
  }),
]);

const BY_ID = new Map(STREET_QUESTS.map((quest) => [quest.id, quest]));

function blankRow() {
  return { status: "open", face: 0, step: 0, entered: false, rewardSource: "", rewardText: "" };
}

export function emptyQuestProgress() {
  const quests = {};
  for (const quest of STREET_QUESTS) quests[quest.id] = blankRow();
  return { version: 1, quests };
}

export function normalizeQuestProgress(raw) {
  const progress = emptyQuestProgress();
  const rows = raw && typeof raw === "object" ? raw.quests : null;
  if (!rows || typeof rows !== "object") return progress;
  for (const quest of STREET_QUESTS) {
    const row = rows[quest.id];
    if (!row || typeof row !== "object") continue;
    const done = row.status === "done";
    progress.quests[quest.id] = {
      status: done ? "done" : "open",
      face: Number.isFinite(Number(row.face)) ? Math.max(0, Number(row.face)) : 0,
      step: Number.isFinite(Number(row.step)) ? Math.max(0, Math.floor(Number(row.step))) : 0,
      entered: Boolean(row.entered),
      rewardSource: done && row.rewardSource === "xintian" ? "xintian" : done ? "local" : "",
      rewardText: done ? (typeof row.rewardText === "string" && row.rewardText ? row.rewardText : quest.reward) : "",
    };
  }
  return progress;
}

export function loadQuestProgress(storage) {
  try {
    const raw = storage?.getItem?.(QUEST_STORAGE_KEY);
    return normalizeQuestProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyQuestProgress();
  }
}

export function saveQuestProgress(progress, storage) {
  try {
    storage?.setItem?.(QUEST_STORAGE_KEY, JSON.stringify(normalizeQuestProgress(progress)));
  } catch {
    /* private mode or a full quota still keeps the in-memory book */
  }
}

export function currentQuestId(progress) {
  return STREET_QUESTS.find((quest) => progress?.quests?.[quest.id]?.status !== "done")?.id || "";
}

export function distance2d(ax, az, bx, bz) {
  if (![ax, az, bx, bz].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, az - bz);
}

export function isFacingPoint(px, pz, dx, dz, tx, tz, cosMin = QUEST_FACE_COS) {
  if (![px, pz, tx, tz].every(Number.isFinite)) return false;
  const vx = tx - px;
  const vz = tz - pz;
  const len = Math.hypot(vx, vz);
  if (len < 0.35) return true;
  const dlen = Math.hypot(dx || 0, dz || 0);
  if (dlen < 1e-4) return false;
  return (vx * dx + vz * dz) / (len * dlen) >= cosMin;
}

function lookPoint(view) {
  if (!view || !Number.isFinite(view.lookX) || !Number.isFinite(view.lookZ)) return null;
  return { x: view.lookX, z: view.lookZ };
}

export function bindQuestAnchors({ landmarkViews = {}, brandViews = [], parkQuest = null } = {}) {
  const yashan = (brandViews || []).find((item) => item.brand === "yashanyuan") || null;
  const stall = landmarkViews.marketStall;
  return {
    yashan: lookPoint(yashan),
    chaoyang: lookPoint(landmarkViews.chaoyang),
    market: lookPoint(landmarkViews.market),
    stall: stall && Number.isFinite(stall.x) && Number.isFinite(stall.z)
      ? { x: stall.x, z: stall.z, name: stall.name || "熟食攤" }
      : null,
    activity: lookPoint(landmarkViews.activity),
    station: lookPoint(landmarkViews.station),
    shrine: lookPoint(landmarkViews.shrine),
    park: parkQuest?.waypoints?.length ? parkQuest : null,
  };
}

function cloneProgress(progress) {
  return normalizeQuestProgress(JSON.parse(JSON.stringify(normalizeQuestProgress(progress))));
}

function persistedShape(progress) {
  const rows = {};
  for (const quest of STREET_QUESTS) {
    const row = progress.quests[quest.id];
    rows[quest.id] = { status: row.status, step: row.step, entered: row.entered, rewardSource: row.rewardSource, rewardText: row.rewardText };
  }
  return JSON.stringify(rows);
}

function complete(row, quest) {
  if (row.status === "done") return false;
  row.status = "done";
  row.rewardSource = "local";
  row.rewardText = quest.reward;
  return true;
}

function pointOf(anchors, key) {
  const point = anchors?.[key];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return point;
}

export function advanceQuests(progress, input = {}) {
  const next = cloneProgress(progress);
  const anchors = input.anchors || {};
  const walk = input.mode === "walk";
  const x = Number(input.x);
  const z = Number(input.z);
  const dt = walk && Number.isFinite(input.dt) ? Math.max(0, input.dt) : 0;
  const completed = [];
  const actionable = [];

  const q1 = BY_ID.get("Q1");
  const yashan = pointOf(anchors, "yashan");
  const q1row = next.quests.Q1;
  const q1Dist = yashan ? distance2d(x, z, yashan.x, yashan.z) : Infinity;
  const q1Near = walk && q1Dist <= q1.range;
  const q1Facing = q1Near && yashan && isFacingPoint(x, z, input.dirX, input.dirZ, yashan.x, yashan.z);
  if (q1row.status !== "done") {
    if (q1Facing) q1row.face += dt;
    else q1row.face = 0;
    if (q1row.face >= QUEST_FACE_SECONDS && complete(q1row, q1)) completed.push(q1);
    if (q1Near && q1row.status !== "done") actionable.push(q1);
  }

  const nearInteract = (quest) => {
    if (next.quests[quest.id].status === "done") return false;
    const point = pointOf(anchors, quest.anchor);
    if (!walk || !point) return false;
    return distance2d(x, z, point.x, point.z) <= quest.range;
  };

  for (const id of ["Q2", "Q5", "Q6", "Q7"]) {
    const quest = BY_ID.get(id);
    if (nearInteract(quest)) actionable.push(quest);
  }

  const q3 = BY_ID.get("Q3");
  const market = pointOf(anchors, "market");
  const stall = pointOf(anchors, "stall");
  const q3row = next.quests.Q3;
  const marketNear = walk && market && distance2d(x, z, market.x, market.z) <= q3.range;
  const stallNear = walk && stall && distance2d(x, z, stall.x, stall.z) <= q3.stallRange;
  if (q3row.status !== "done" && stallNear) actionable.push(q3);

  const q4 = BY_ID.get("Q4");
  const q4row = next.quests.Q4;
  const park = anchors.park;
  const insidePark = walk && park?.ring?.length ? pointInRing(x, z, park.ring) : false;
  if (q4row.status !== "done" && insidePark) q4row.entered = true;
  if (q4row.status !== "done" && q4row.entered && park?.waypoints?.length) {
    const waypoint = park.waypoints[q4row.step];
    if (waypoint && distance2d(x, z, waypoint.x, waypoint.z) <= QUEST_WAYPOINT_RADIUS) {
      q4row.step += 1;
      if (q4row.step >= park.waypoints.length && complete(q4row, q4)) completed.push(q4);
    }
  }

  let affordance = null;
  if (walk && input.interact) {
    const current = currentQuestId(next);
    const preferred = actionable.find((quest) => quest.id === current) || actionable[0] || null;
    if (preferred && next.quests[preferred.id].status !== "done") {
      if (preferred.mode !== "waypoints" && complete(next.quests[preferred.id], preferred)) {
        completed.push(preferred);
      }
    }
  }
  const openActions = actionable.filter((quest) => next.quests[quest.id].status !== "done" && quest.mode !== "waypoints");
  const current = currentQuestId(next);
  const chosen = openActions.find((quest) => quest.id === current) || openActions[0] || null;
  if (chosen) {
    affordance = { id: chosen.id, action: chosen.action, label: `E ${chosen.action}` };
  }

  const hintQuest = BY_ID.get(current);
  let inHintRange = false;
  if (hintQuest && next.quests[current]?.status !== "done") {
    if (hintQuest.id === "Q1") inHintRange = q1Near;
    else if (hintQuest.id === "Q3") inHintRange = Boolean(marketNear || stallNear);
    else if (hintQuest.id === "Q4") inHintRange = Boolean(q4row.entered || insidePark);
    else inHintRange = nearInteract(hintQuest);
  }

  let objective = "街巷任務都完成了。";
  if (hintQuest && next.quests[hintQuest.id]?.status !== "done") {
    if (hintQuest.id === "Q4" && q4row.entered) {
      const waypoint = park?.waypoints?.[q4row.step];
      const label = waypoint?.label || "下一處";
      objective = `下一處：${label}（${Math.min(q4row.step + 1, park?.waypoints?.length || 3)}／${park?.waypoints?.length || 3}）。${hintQuest.hint}`;
    } else if (inHintRange) objective = hintQuest.hint;
    else objective = `前往${hintQuest.place}。`;
  }

  const rows = STREET_QUESTS.map((quest) => {
    const row = next.quests[quest.id];
    const done = row.status === "done";
    return {
      id: quest.id,
      name: quest.name,
      place: quest.place,
      current: quest.id === current,
      done,
      status: done ? "完成" : quest.id === current ? "進行中" : "未完成",
      reward: done ? (row.rewardText || quest.reward) : "",
    };
  });

  return {
    progress: next,
    completed,
    affordance,
    objective,
    rows,
    changed: persistedShape(progress) !== persistedShape(next),
    inHintRange,
  };
}

export function questMarkerPoints(progress, anchors = {}) {
  const book = normalizeQuestProgress(progress);
  const points = [];
  for (const quest of STREET_QUESTS) {
    if (book.quests[quest.id].status === "done") continue;
    let point = null;
    if (quest.id === "Q3") point = pointOf(anchors, "stall") || pointOf(anchors, "market");
    else if (quest.id === "Q4") {
      const step = book.quests.Q4.step;
      const waypoint = anchors.park?.waypoints?.[step] || anchors.park?.waypoints?.[0];
      point = waypoint && Number.isFinite(waypoint.x) ? waypoint : null;
    } else point = pointOf(anchors, quest.anchor);
    if (!point) continue;
    points.push({ id: quest.id, name: quest.name, x: point.x, z: point.z });
  }
  return points;
}

export function findHeartRewardHook(scope = globalThis, extra = null) {
  const found = [];
  const consider = (bag) => {
    if (!bag || typeof bag !== "object") return;
    if (typeof bag.grantHeart === "function") found.push(bag.grantHeart.bind(bag));
    else if (typeof bag.addHeart === "function") found.push(bag.addHeart.bind(bag));
  };
  consider(extra);
  try { consider(scope?.__xintian); } catch { /* cross-origin parent */ }
  try {
    const parent = scope?.parent;
    if (parent && parent !== scope) consider(parent.__xintian);
  } catch { /* embedded page cannot read a cross-origin host */ }
  return found[0] || null;
}

export async function grantQuestReward(quest, hooks = {}) {
  const text = quest?.reward || "";
  const points = Number(quest?.points) || 0;
  const hook = typeof hooks.grantHeart === "function"
    ? hooks.grantHeart
    : findHeartRewardHook(hooks.scope || globalThis, hooks.extra || null);
  if (typeof hook !== "function") return { source: "local", text, points };
  try {
    const result = await Promise.race([
      Promise.resolve(hook({ points, questId: quest.id, label: text })),
      new Promise((resolve) => setTimeout(() => resolve(undefined), 2500)),
    ]);
    const accepted = result === true || (result && typeof result === "object" && result.ok !== false);
    if (accepted) return { source: "xintian", text, points };
  } catch {
    /* the street still records the completion locally */
  }
  return { source: "local", text, points };
}
