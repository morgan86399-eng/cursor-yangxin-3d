/** NPC dialogue, delivery, and check-in for Q8–Q12. No network calls. */

function distance2d(ax, az, bx, bz) {
  if (![ax, az, bx, bz].every(Number.isFinite)) return Infinity;
  return Math.hypot(ax - bx, az - bz);
}

export const Q8_CHOICES = Object.freeze([
  Object.freeze({ id: "morning", label: "劉師父早。", reply: "早。雅善圓早上十一點開門，晚上九點打烊。" }),
  Object.freeze({ id: "hello", label: "你好，我來找雅善圓。", reply: "你好。就這扇門，午餐時間人會多一點。" }),
]);

export const Q10_LINES = Object.freeze([
  "這條街以前店都開到很晚，燈一盞一盞留著。",
  "公園這一側有停車場，繞過去就看得到。",
]);

export const Q11_CHOICES = Object.freeze([
  Object.freeze({ id: "know", label: "我知道了", reply: "報名就記在活動中心門口，待會見。" }),
  Object.freeze({ id: "later", label: "再想想", reply: "沒關係，想好再來跟我說。" }),
]);

export const Q12_CHOICES = Object.freeze([
  Object.freeze({ id: "busy", label: "香火平常旺不旺？", reply: "初一十五人多，平日來很安靜，心比較定。" }),
  Object.freeze({ id: "how", label: "參拜要注意什麼？", reply: "雙手合十就好，香放門口的爐，不必進太深。" }),
]);

export const OFFICER_TIP = "報到收到了。夜裡慢一點走，店門口的燈會留著。";
export const OFFICER_WAIT = "先到門口報個到，我在這邊巡邏。";
export const KEEPER_AFTER_WORSHIP = "剛才的參拜，心裡會比較穩。";

function questOf(quests, id) {
  if (!quests) return null;
  if (typeof quests.get === "function") return quests.get(id) || null;
  return quests[id] || null;
}

function nearPoint(walk, x, z, point, range) {
  return Boolean(walk && point && Number.isFinite(point.x) && distance2d(x, z, point.x, point.z) <= range);
}

function replyDialog(name, text, extra = {}) {
  return {
    questId: extra.questId || "",
    name,
    text,
    choices: extra.choices || [],
    canNext: Boolean(extra.canNext),
    nextLabel: extra.nextLabel || "繼續",
    canClose: extra.canClose !== false,
    closeLabel: extra.closeLabel || "關閉",
  };
}

function finish(row, quest, completed) {
  if (!quest || row.status === "done") return;
  row.status = "done";
  row.rewardSource = "local";
  row.rewardText = quest.reward;
  completed.push(quest);
}

/**
 * One frame of NPC talk. Mutates the cloned quest book.
 * `talk` is the open dialog session; choice / next / close are that frame's clicks.
 */
export function applyDialogue(progress, ctx = {}) {
  const quests = ctx.quests;
  const anchors = ctx.anchors || {};
  const npcs = anchors.npcs || {};
  const walk = ctx.mode === "walk";
  const x = Number(ctx.x);
  const z = Number(ctx.z);
  const talk = ctx.talk || null;
  const choiceId = typeof ctx.choiceId === "string" ? ctx.choiceId : "";
  const talkNext = ctx.talkNext === true;
  const talkClose = ctx.talkClose === true;
  const interact = ctx.interact === true && !talk;
  const talkInteract = ctx.talkInteract === true && Boolean(talk);
  const consumed = ctx.consumed === true;
  const completed = [];
  let dialog = null;
  let nextTalk = talk ? { ...talk } : null;
  let closeDialog = false;
  let affordance = null;
  let objective = "";

  const q8 = progress.quests.Q8;
  const q9 = progress.quests.Q9;
  const q10 = progress.quests.Q10;
  const q11 = progress.quests.Q11;
  const q12 = progress.quests.Q12;
  const liu = npcs.liu;
  const ahua = npcs.ahua;
  const uncle = npcs.uncle;
  const chen = npcs.chen;
  const keeper = npcs.keeper;
  const officer = npcs.officer;
  const liuNear = q8 && nearPoint(walk, x, z, liu, liu?.range || 3.2);
  const ahuaNear = q9 && nearPoint(walk, x, z, ahua, q9 ? (questOf(quests, "Q9")?.range || ahua?.range || 3) : 3);
  const uncleNear = q10 && nearPoint(walk, x, z, uncle, uncle?.range || 3.5);
  const chenNear = q11 && nearPoint(walk, x, z, chen, chen?.range || 3.2);
  const keeperNear = q12 && nearPoint(walk, x, z, keeper, keeper?.range || 3.2);
  const officerNear = nearPoint(walk, x, z, officer, officer?.range || 3.2);
  const pickupRange = questOf(quests, "Q9")?.pickupRange || 6;
  const marketNear = q9 && nearPoint(walk, x, z, anchors.market, pickupRange);

  const open = (questId, stage, extra = {}) => {
    nextTalk = { questId, stage, ...extra };
  };

  if (talk?.questId === "Q8" && q8) {
    const picked = Q8_CHOICES.find((choice) => choice.id === (choiceId || q8.choice));
    if (q8.status !== "done" && choiceId && Q8_CHOICES.some((choice) => choice.id === choiceId)) {
      q8.choice = choiceId;
      finish(q8, questOf(quests, "Q8"), completed);
      open("Q8", "reply");
    } else if (talkClose || (talkInteract && (q8.status === "done" || talk.stage === "reply"))) {
      closeDialog = true;
      nextTalk = null;
    }
    const shown = Q8_CHOICES.find((choice) => choice.id === q8.choice) || picked;
    if (!closeDialog) {
      if (q8.status === "done" && shown) {
        dialog = replyDialog("劉師父", shown.reply, { questId: "Q8" });
      } else {
        dialog = replyDialog("劉師父", "劉師父在門口點點頭。", {
          questId: "Q8",
          choices: Q8_CHOICES.map(({ id, label }) => ({ id, label })),
          canClose: true,
        });
      }
    }
  } else if (talk?.questId === "Q10" && q10) {
    const line = Math.max(0, Math.min(1, Number(talk.line) || 0));
    const revealSecond = (talkNext || (talkInteract && line === 0)) && q10.status !== "done" && q10.heard >= 1 && line === 0;
    const acknowledgeSecond = (talkClose || (talkInteract && line === 1)) && line === 1 && q10.status !== "done" && q10.heard >= 1;
    if (revealSecond) {
      q10.heard = 2;
      finish(q10, questOf(quests, "Q10"), completed);
      open("Q10", "line", { line: 1 });
    } else if (acknowledgeSecond) {
      q10.heard = 2;
      finish(q10, questOf(quests, "Q10"), completed);
      closeDialog = true;
      nextTalk = null;
    } else if (talkClose || (talkInteract && q10.status === "done")) {
      closeDialog = true;
      nextTalk = null;
    }
    if (!closeDialog) {
      const index = nextTalk?.line === 1 || q10.heard >= 2 ? 1 : 0;
      dialog = replyDialog("散步阿伯", Q10_LINES[index], {
        questId: "Q10",
        canNext: index === 0 && q10.status !== "done",
        nextLabel: "繼續",
        canClose: index === 1 || q10.status === "done",
        closeLabel: index === 1 && q10.status !== "done" ? "聽完了" : "關閉",
      });
    }
  } else if (talk?.questId === "Q11" && q11) {
    if (q11.status !== "done" && choiceId === "know") {
      q11.choice = "know";
      finish(q11, questOf(quests, "Q11"), completed);
      open("Q11", "reply");
    } else if (q11.status !== "done" && choiceId === "later") {
      q11.choice = "later";
      open("Q11", "reply");
    } else if (talkClose || talkInteract) {
      if (q11.choice === "later" && q11.status !== "done") q11.choice = "";
      closeDialog = true;
      nextTalk = null;
    }
    if (!closeDialog) {
      if (q11.status === "done") {
        dialog = replyDialog("志工小陳", Q11_CHOICES[0].reply, { questId: "Q11" });
      } else if (q11.choice === "later" && nextTalk?.stage === "reply") {
        dialog = replyDialog("志工小陳", Q11_CHOICES[1].reply, { questId: "Q11" });
      } else {
        dialog = replyDialog("志工小陳", "活動中心這週有個小活動，要我幫你記一個名嗎？", {
          questId: "Q11",
          choices: Q11_CHOICES.map(({ id, label }) => ({ id, label })),
          canClose: true,
        });
      }
    }
  } else if (talk?.questId === "Q12" && q12) {
    const asked = Q12_CHOICES.find((choice) => choice.id === choiceId);
    if (q12.status !== "done" && asked) {
      q12.choice = asked.id;
      q12.heard = 1;
      open("Q12", "reply");
    } else if (talkClose || talkInteract) {
      if (q12.heard >= 1 && q12.choice) finish(q12, questOf(quests, "Q12"), completed);
      closeDialog = true;
      nextTalk = null;
    }
    if (!closeDialog) {
      const selected = Q12_CHOICES.find((choice) => choice.id === q12.choice);
      if (q12.heard >= 1 && selected) {
        dialog = replyDialog("廟祝", selected.reply, { questId: "Q12", closeLabel: "關閉" });
      } else {
        const worshipped = progress.quests.Q2?.status === "done";
        const lead = worshipped ? `${KEEPER_AFTER_WORSHIP}` : "廟祝站在門口。";
        dialog = replyDialog("廟祝", `${lead}想問香火的事，挑一句就好。`, {
          questId: "Q12",
          choices: Q12_CHOICES.map(({ id, label }) => ({ id, label })),
          canClose: true,
        });
      }
    }
  } else if (talk?.questId === "Q9" && q9) {
    if (talkClose || talkInteract) {
      closeDialog = true;
      nextTalk = null;
    } else {
      const text = q9.status === "done"
        ? "謝謝，紙袋我收下了。"
        : (q9.bag ? "紙袋拿好了，拿去給阿花。" : "紙袋在市場門口，幫我拿過來。");
      dialog = replyDialog(q9.status === "done" || q9.bag ? "阿花" : "阿花", text, { questId: "Q9" });
    }
  } else if (talk?.questId === "officer") {
    if (talkClose || talkInteract) {
      closeDialog = true;
      nextTalk = null;
    } else {
      const done = progress.quests.Q6?.status === "done";
      dialog = replyDialog("巡邏警員", done ? OFFICER_TIP : OFFICER_WAIT, { questId: "officer" });
    }
  }

  if (talk) {
    return {
      completed,
      affordance: null,
      dialog,
      talk: closeDialog ? null : nextTalk,
      closeDialog,
      objective: "",
      inRange: false,
    };
  }

  const offers = [];
  const pushOffer = (id, action, kind, dist) => {
    if (!Number.isFinite(dist)) return;
    offers.push({ id, action, label: `E ${action}`, kind, dist });
  };
  if (q8?.status !== "done" && liuNear) pushOffer("Q8", "打招呼", "talk", distance2d(x, z, liu.x, liu.z));
  if (q9?.status !== "done" && q9.bag && ahuaNear) pushOffer("Q9", "遞紙袋", "deliver", distance2d(x, z, ahua.x, ahua.z));
  if (q9?.status !== "done" && !q9.bag && marketNear) pushOffer("Q9", "拿紙袋", "pickup", distance2d(x, z, anchors.market.x, anchors.market.z));
  if (q9?.status !== "done" && !q9.bag && ahuaNear) pushOffer("Q9", "詢問", "talk", distance2d(x, z, ahua.x, ahua.z));
  if (q10?.status !== "done" && uncleNear) pushOffer("Q10", "聽故事", "talk", distance2d(x, z, uncle.x, uncle.z));
  if (q11?.status !== "done" && chenNear) pushOffer("Q11", "報名", "talk", distance2d(x, z, chen.x, chen.z));
  if (q12?.status !== "done" && keeperNear) pushOffer("Q12", "請問", "talk", distance2d(x, z, keeper.x, keeper.z));
  offers.sort((a, b) => a.dist - b.dist);
  if (offers.length) affordance = offers[0];
  else if (officerNear) {
    affordance = { id: "officer", action: "問候", label: "E 問候", kind: "tip", dist: distance2d(x, z, officer.x, officer.z) };
  }

  if (interact && !consumed && affordance) {
    if (affordance.id === "Q8") {
      open("Q8", "choose");
      dialog = replyDialog("劉師父", "劉師父在門口點點頭。", {
        questId: "Q8",
        choices: Q8_CHOICES.map(({ id, label }) => ({ id, label })),
      });
    } else if (affordance.id === "Q9" && affordance.kind === "pickup") {
      q9.bag = true;
      open("Q9", "reply");
      dialog = replyDialog("阿花", "紙袋拿好了，拿去給阿花。", { questId: "Q9" });
    } else if (affordance.id === "Q9" && affordance.kind === "deliver") {
      finish(q9, questOf(quests, "Q9"), completed);
      open("Q9", "reply");
      dialog = replyDialog("阿花", "謝謝，紙袋我收下了。", { questId: "Q9" });
    } else if (affordance.id === "Q9") {
      open("Q9", "reply");
      dialog = replyDialog("阿花", "紙袋在市場門口，幫我拿過來。", { questId: "Q9" });
    } else if (affordance.id === "Q10") {
      const resume = q10.heard >= 1;
      if (!resume) q10.heard = 1;
      open("Q10", "line", { line: resume ? 1 : 0 });
      dialog = replyDialog("散步阿伯", Q10_LINES[resume ? 1 : 0], {
        questId: "Q10",
        canNext: !resume,
        nextLabel: "繼續",
        canClose: resume,
        closeLabel: resume ? "聽完了" : "關閉",
      });
    } else if (affordance.id === "Q11") {
      open("Q11", "choose");
      dialog = replyDialog("志工小陳", "活動中心這週有個小活動，要我幫你記一個名嗎？", {
        questId: "Q11",
        choices: Q11_CHOICES.map(({ id, label }) => ({ id, label })),
      });
    } else if (affordance.id === "Q12") {
      open("Q12", "choose");
      const worshipped = progress.quests.Q2?.status === "done";
      const lead = worshipped ? KEEPER_AFTER_WORSHIP : "廟祝站在門口。";
      dialog = replyDialog("廟祝", `${lead}想問香火的事，挑一句就好。`, {
        questId: "Q12",
        choices: Q12_CHOICES.map(({ id, label }) => ({ id, label })),
      });
    } else if (affordance.id === "officer") {
      open("officer", "reply");
      const done = progress.quests.Q6?.status === "done";
      dialog = replyDialog("巡邏警員", done ? OFFICER_TIP : OFFICER_WAIT, { questId: "officer" });
    }
    affordance = null;
  }

  const shown = affordance?.id || "";
  if (shown === "Q8") objective = "先跟劉師父說一聲。";
  else if (shown === "Q9" && q9?.bag) objective = "把紙袋遞給阿花。";
  else if (shown === "Q9" && affordance?.kind === "pickup") objective = "市場門口有一袋紙，先拿起來。";
  else if (shown === "Q9") objective = "紙袋在市場門口，幫我拿過來。";
  else if (shown === "Q10") objective = q10.heard >= 1 ? "還有一句，聽完再走。" : "坐下來聽阿伯說。";
  else if (shown === "Q11") objective = "聽完跟志工說一聲。";
  else if (shown === "Q12") objective = q12.heard >= 1 ? "把話收起來再離開。" : "問廟祝一句香火的事。";
  else if (shown === "officer") objective = progress.quests.Q6?.status === "done" ? "跟巡邏警員問一聲。" : "先到門口報個到。";

  const currentId = ctx.currentId || "";
  const inRange = Boolean(
    (currentId === "Q8" && liuNear)
    || (currentId === "Q9" && (marketNear || ahuaNear))
    || (currentId === "Q10" && uncleNear)
    || (currentId === "Q11" && chenNear)
    || (currentId === "Q12" && keeperNear),
  );

  return { completed, affordance, dialog, talk: nextTalk, closeDialog, objective, inRange };
}
