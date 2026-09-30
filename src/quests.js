import { applyDialogue } from "./dialogue.js";
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
    range: 8, mode: "interact", action: "參拜",
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
  Object.freeze({
    id: "Q8", name: "跟劉師父打招呼", place: "鎮撫街46號", anchor: "yashan",
    npc: "liu", range: 3.2, mode: "dialogue", action: "打招呼",
    hint: "跟劉師父說一聲。", reward: "心田+4", points: 4,
  }),
  Object.freeze({
    id: "Q9", name: "幫攤販遞紙袋", place: "朝陽市場", anchor: "market",
    npc: "ahua", range: 3, pickupRange: 5, mode: "delivery", action: "遞紙袋",
    hint: "紙袋送到阿花攤。", reward: "心田+6", points: 6,
  }),
  Object.freeze({
    id: "Q10", name: "聽阿伯講舊街", place: "朝陽公園", anchor: "park",
    npc: "uncle", range: 4.5, mode: "dialogue", action: "聽舊街",
    hint: "把兩句舊街的事聽完。", reward: "心田+6", points: 6,
  }),
  Object.freeze({
    id: "Q11", name: "跟志工報名活動", place: "活動中心", anchor: "activity",
    npc: "chen", range: 3.2, mode: "dialogue", action: "報名",
    hint: "聽完跟志工說一聲。", reward: "心田+5", points: 5,
  }),
  Object.freeze({
    id: "Q12", name: "跟廟祝問香火", place: "朝陽宮", anchor: "chaoyang",
    npc: "keeper", range: 3.2, mode: "dialogue", action: "請問",
    hint: "問廟祝一句，再把話收起來。", reward: "心田+6", points: 6,
  }),
]);

const BY_ID = new Map(STREET_QUESTS.map((quest) => [quest.id, quest]));

function blankRow() {
  return {
    status: "open", face: 0, step: 0, entered: false,
    bag: false, heard: 0, choice: "",
    rewardSource: "", rewardText: "",
  };
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
      bag: Boolean(row.bag),
      heard: Number.isFinite(Number(row.heard)) ? Math.max(0, Math.floor(Number(row.heard))) : 0,
      choice: typeof row.choice === "string" ? row.choice : "",
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

function spotFromView(view, out, side) {
  const look = lookPoint(view);
  if (!look || !Number.isFinite(view.x) || !Number.isFinite(view.z)) return null;
  const dx = view.x - look.x;
  const dz = view.z - look.z;
  const len = Math.hypot(dx, dz) || 1;
  const ox = dx / len;
  const oz = dz / len;
  return {
    x: look.x + ox * out - oz * side,
    z: look.z + oz * out + ox * side,
  };
}

function namedNpc(point, fields) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  return { x: point.x, z: point.z, ...fields };
}

function parkUnclePoint(park) {
  const gate = park?.waypoints?.find((point) => point.id === "gate") || park?.waypoints?.[0];
  const far = park?.waypoints?.find((point) => point.id === "far") || park?.waypoints?.[1] || gate;
  if (!gate || !far) return null;
  const dx = far.x - gate.x;
  const dz = far.z - gate.z;
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  const px = -fz;
  const pz = fx;
  const ring = park?.ring;
  for (const side of [1, -1]) {
    for (const dist of [3.6, 4.4, 2.8]) {
      const spot = {
        x: gate.x + px * side * dist + fx * 1.4,
        z: gate.z + pz * side * dist + fz * 1.4,
      };
      if (ring?.length && !pointInRing(spot.x, spot.z, ring)) continue;
      const onPad = (park.waypoints || []).some((point) => Math.hypot(spot.x - point.x, spot.z - point.z) < 2.2);
      if (onPad) continue;
      return spot;
    }
  }
  return { x: gate.x + fx * 4 + px * 2.4, z: gate.z + fz * 4 + pz * 2.4 };
}

function waypointLitIds(row, waypoints = []) {
  const known = new Set(waypoints.map((point) => point.id));
  const fromChoice = String(row?.choice || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => known.has(id));
  if (fromChoice.length) return fromChoice;
  const step = Math.max(0, Math.floor(Number(row?.step) || 0));
  if (step > 0) return waypoints.slice(0, step).map((point) => point.id);
  return [];
}

export function withNpcs(anchors = {}) {
  if (anchors?.npcs?.liu && anchors?.npcs?.ahua && anchors?.npcs?.keeper) return anchors;
  const beside = (point, dx, dz) => (point ? { x: point.x + dx, z: point.z + dz } : null);
  return {
    ...anchors,
    npcs: {
      liu: namedNpc(beside(anchors.yashan, 1.6, 2), { name: "劉師父", range: 3.2, questId: "Q8" }),
      keeper: namedNpc(beside(anchors.chaoyang, 3.2, 1.2), { name: "廟祝", range: 3.2, questId: "Q12" }),
      ahua: namedNpc(beside(anchors.stall, 3.4, 0), { name: "阿花", range: 3, questId: "Q9" }),
      uncle: namedNpc(parkUnclePoint(anchors.park), { name: "散步阿伯", range: 4.5, questId: "Q10" }),
      chen: namedNpc(beside(anchors.activity, 3.2, 1.0), { name: "志工小陳", range: 3.2, questId: "Q11" }),
      officer: namedNpc(beside(anchors.station, -2.2, 6.6), { name: "巡邏警員", range: 3.2, questId: "" }),
    },
  };
}

export function bindQuestAnchors({ landmarkViews = {}, brandViews = [], parkQuest = null } = {}) {
  const yashan = (brandViews || []).find((item) => item.brand === "yashanyuan") || null;
  const stall = landmarkViews.marketStall;
  const park = parkQuest?.waypoints?.length ? parkQuest : null;
  const anchors = {
    yashan: lookPoint(yashan),
    chaoyang: lookPoint(landmarkViews.chaoyang),
    market: lookPoint(landmarkViews.market),
    stall: stall && Number.isFinite(stall.x) && Number.isFinite(stall.z)
      ? { x: stall.x, z: stall.z, name: stall.name || "熟食攤" }
      : null,
    activity: lookPoint(landmarkViews.activity),
    station: lookPoint(landmarkViews.station),
    shrine: lookPoint(landmarkViews.shrine),
    park,
  };
  const fallback = withNpcs(anchors).npcs;
  const uncle = namedNpc(parkUnclePoint(park), { name: "散步阿伯", range: 4.5, questId: "Q10" }) || fallback.uncle;
  return {
    ...anchors,
    npcs: {
      liu: namedNpc(spotFromView(yashan, 2.2, 1.5), { name: "劉師父", range: 3.2, questId: "Q8" }) || fallback.liu,
      keeper: namedNpc(spotFromView(landmarkViews.chaoyang, 2.4, 3.2), { name: "廟祝", range: 3.2, questId: "Q12" }) || fallback.keeper,
      ahua: namedNpc(
        anchors.stall ? { x: anchors.stall.x + 3.4, z: anchors.stall.z } : null,
        { name: "阿花", range: 3, questId: "Q9" },
      ) || fallback.ahua,
      uncle,
      chen: namedNpc(spotFromView(landmarkViews.activity, 2.4, 3.0), { name: "志工小陳", range: 3.2, questId: "Q11" }) || fallback.chen,
      officer: namedNpc(spotFromView(landmarkViews.station, 7.2, -1.6), { name: "巡邏警員", range: 3.2, questId: "" }) || fallback.officer,
    },
  };
}

function cloneProgress(progress) {
  return normalizeQuestProgress(JSON.parse(JSON.stringify(normalizeQuestProgress(progress))));
}

function persistedShape(progress) {
  const rows = {};
  for (const quest of STREET_QUESTS) {
    const row = progress.quests[quest.id];
    rows[quest.id] = {
      status: row.status, step: row.step, entered: row.entered,
      bag: row.bag, heard: row.heard, choice: row.choice,
      rewardSource: row.rewardSource, rewardText: row.rewardText,
    };
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

const INSTANT_MODES = new Set(["interact", "face-or-interact", "stall"]);

export function advanceQuests(progress, input = {}) {
  const next = cloneProgress(progress);
  const anchors = withNpcs(input.anchors || {});
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
  const nearAnyPad = walk && (park?.waypoints || []).some((point) => distance2d(x, z, point.x, point.z) <= QUEST_WAYPOINT_RADIUS + 6);
  if (q4row.status !== "done" && insidePark) q4row.entered = true;
  if (q4row.status !== "done" && park?.waypoints?.length) {
    const lit = new Set(waypointLitIds(q4row, park.waypoints));
    if (walk) {
      for (const point of park.waypoints) {
        if (lit.has(point.id)) continue;
        if (distance2d(x, z, point.x, point.z) <= QUEST_WAYPOINT_RADIUS) lit.add(point.id);
      }
    }
    const ordered = park.waypoints.filter((point) => lit.has(point.id)).map((point) => point.id);
    q4row.choice = ordered.join(",");
    q4row.step = ordered.length;
    if (ordered.length >= park.waypoints.length && complete(q4row, q4)) completed.push(q4);
  }

  const talking = Boolean(input.talk);
  const current = currentQuestId(next);
  const proximity = actionable
    .filter((quest) => next.quests[quest.id].status !== "done" && INSTANT_MODES.has(quest.mode))
    .map((quest) => {
      const point = quest.id === "Q1" ? yashan : quest.id === "Q3" ? stall : pointOf(anchors, quest.anchor);
      return {
        id: quest.id,
        action: quest.action,
        label: `E ${quest.action}`,
        kind: "proximity",
        dist: point ? distance2d(x, z, point.x, point.z) : Infinity,
        quest,
      };
    });
  const preview = applyDialogue(next, {
    quests: BY_ID,
    anchors,
    mode: input.mode,
    x,
    z,
    interact: false,
    consumed: true,
    currentId: current,
  });
  const talkOffer = preview.affordance?.dist >= 0 ? preview.affordance : null;
  const currentProx = proximity.find((item) => item.id === current) || null;
  const otherProx = proximity.filter((item) => item.id !== current).sort((a, b) => a.dist - b.dist)[0] || null;
  const besideNpc = talkOffer && talkOffer.dist <= 1.75;
  let offer = null;
  if (!talking) {
    if (besideNpc && (!currentProx || talkOffer.dist + 0.35 < currentProx.dist)) offer = talkOffer;
    else if (currentProx) offer = currentProx;
    else if (talkOffer && otherProx) offer = talkOffer.dist <= otherProx.dist ? talkOffer : otherProx;
    else offer = talkOffer || otherProx;
  }
  let interactUsed = false;
  if (walk && input.interact && !talking && offer?.kind === "proximity" && offer.quest) {
    if (complete(next.quests[offer.id], offer.quest)) {
      completed.push(offer.quest);
      interactUsed = true;
      offer = null;
    }
  }
  const dialogue = (offer && offer.kind !== "proximity") || talking
    ? applyDialogue(next, {
      quests: BY_ID,
      anchors,
      mode: input.mode,
      x,
      z,
      interact: walk && input.interact === true && !interactUsed,
      talkInteract: walk && input.interact === true,
      consumed: interactUsed,
      talk: input.talk || null,
      choiceId: input.choiceId || "",
      talkNext: input.talkNext === true,
      talkClose: input.talkClose === true,
      currentId: current,
    })
    : preview;
  completed.push(...(dialogue === preview ? [] : dialogue.completed));
  let affordance = null;
  if (dialogue.dialog) affordance = null;
  else if (interactUsed) affordance = dialogue.affordance && dialogue.affordance.dist <= 1.75 ? dialogue.affordance : null;
  else if (offer?.kind === "proximity") affordance = { id: offer.id, action: offer.action, label: offer.label, kind: "proximity" };
  else affordance = dialogue.affordance;

  const nextId = currentQuestId(next);
  const hintQuest = BY_ID.get(nextId);
  let inHintRange = false;
  if (hintQuest && nextId === current && next.quests[nextId]?.status !== "done") {
    if (hintQuest.id === "Q1") inHintRange = q1Near;
    else if (hintQuest.id === "Q3") inHintRange = Boolean(marketNear || stallNear);
    else if (hintQuest.id === "Q4") inHintRange = Boolean(insidePark || nearAnyPad || q4row.step > 0);
    else if (hintQuest.mode === "dialogue" || hintQuest.mode === "delivery") inHintRange = dialogue.inRange;
    else inHintRange = nearInteract(hintQuest);
  }

  let objective = "街巷任務都完成了。";
  const actingId = dialogue.dialog?.questId || (affordance && affordance.kind !== "proximity" ? affordance.id : "");
  if (dialogue.dialog || (affordance && affordance.kind !== "proximity")) {
    objective = dialogue.objective || BY_ID.get(actingId)?.hint || "跟對方說一聲。";
  } else if (affordance?.kind === "proximity") {
    objective = BY_ID.get(affordance.id)?.hint || objective;
  } else if (hintQuest && next.quests[hintQuest.id]?.status !== "done") {
    if (hintQuest.id === "Q4" && q4row.status !== "done" && (insidePark || nearAnyPad || q4row.step > 0)) {
      const lit = new Set(waypointLitIds(q4row, park?.waypoints || []));
      const missing = (park?.waypoints || []).filter((point) => !lit.has(point.id)).map((point) => point.label);
      const total = park?.waypoints?.length || 3;
      objective = `踩亮地上的光圈：${missing.join("、") || "都亮了"}（${Math.min(q4row.step, total)}／${total}）。${hintQuest.hint}`;
    } else if (inHintRange) objective = hintQuest.hint;
    else objective = `前往${hintQuest.place}。靠近別的地點也能先做。`;
  }

  const rows = STREET_QUESTS.map((quest) => {
    const row = next.quests[quest.id];
    const done = row.status === "done";
    return {
      id: quest.id,
      name: quest.name,
      place: quest.place,
      current: quest.id === nextId,
      done,
      status: done ? "完成" : quest.id === nextId ? "進行中" : "可進行",
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
    dialog: dialogue.dialog,
    talk: dialogue.talk,
    closeDialog: dialogue.closeDialog,
  };
}

export function questMarkerPoints(progress, anchors = {}) {
  const book = normalizeQuestProgress(progress);
  const placed = withNpcs(anchors);
  const points = [];
  for (const quest of STREET_QUESTS) {
    if (book.quests[quest.id].status === "done") continue;
    let point = null;
    if (quest.npc) point = placed.npcs?.[quest.npc] || pointOf(placed, quest.anchor);
    else if (quest.id === "Q3") point = pointOf(placed, "stall") || pointOf(placed, "market");
    else if (quest.id === "Q4") {
      const waypoints = anchors.park?.waypoints || [];
      const lit = new Set(waypointLitIds(book.quests.Q4, waypoints));
      const waypoint = waypoints.find((point) => !lit.has(point.id)) || waypoints[0];
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
