// Same-origin adapter. The existing Xintian server remains the only authority.
export const FARM_SYNC_LABEL = {
  idle: "正在與心田同步…",
  syncing: "正在與心田同步…",
  retrying: "重新同步中…",
  guest: "尚未登入心田",
  ready: "已與心田同步",
  offline: "連線失敗，請重新同步",
};

const STAGE_THRESHOLDS = [0.05, 0.12, 0.2, 0.3, 0.4, 0.52, 0.7, 0.85, 1];

export function cropImageDisposition(contentType, ok = true) {
  if (!ok) return "fallback";
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/")) return "fallback";
  return "use";
}

export class FarmAPI {
  constructor(fetcher = (...args) => fetch(...args), timeoutMs = 12000) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.state = {
      content: null,
      me: null,
      authenticated: false,
      phase: "idle",
      error: "",
      busy: false,
    };
    this.fetchedAt = 0;
    this.refreshing = null;
  }

  syncLabel() {
    return FARM_SYNC_LABEL[this.state.phase] || FARM_SYNC_LABEL.idle;
  }

  async request(path, body) {
    const controller = new AbortController();
    let settled = false;
    const res = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        controller.abort();
        if (settled) return;
        settled = true;
        reject(new Error("連線逾時，請重新同步農田狀態。"));
      }, this.timeoutMs);
      Promise.resolve(this.fetcher(`/api/xintian/${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })).then(
        (value) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (controller.signal.aborted || err?.name === "AbortError") {
            reject(new Error("連線逾時，請重新同步農田狀態。"));
          } else {
            reject(err instanceof Error ? err : new Error("農田連線暫時無法使用，請重新同步。"));
          }
        },
      );
    });
    const status = Number(res?.status || 0);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (status === 401 || status === 403) {
      const err = new Error(data?.error || "請先登入");
      err.status = status;
      throw err;
    }
    if (!res?.ok || !data?.ok) {
      const err = new Error(data?.error || "農田連線暫時無法使用，請重新同步。");
      err.status = status;
      throw err;
    }
    return data;
  }

  async refresh(options = {}) {
    if (this.refreshing) return this.refreshing;
    const retry = options.retry === true || this.state.phase === "offline";
    this.refreshing = this.read({ retry });
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }

  async read({ retry = false } = {}) {
    this.state.phase = retry ? "retrying" : "syncing";
    try {
      if (!this.state.content) this.state.content = await this.request("content");
      const me = await this.request("me");
      this.state.me = me;
      this.fetchedAt = Date.now();
      this.state.authenticated = true;
      this.state.error = "";
      this.state.phase = "ready";
      return me;
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        this.state.authenticated = false;
        this.state.me = null;
        this.state.error = "";
        this.state.phase = "guest";
        return null;
      }
      this.state.error = err?.message || "農田連線暫時無法使用，請重新同步。";
      this.state.phase = "offline";
      return null;
    }
  }

  serverNow() {
    return this.state.me
      ? Number(this.state.me.server_now) + (Date.now() - this.fetchedAt) / 1000
      : Date.now() / 1000;
  }

  plot(slot) {
    return this.state.me?.plots?.find((plot) => Number(plot.slot) === slot) || null;
  }

  crops() {
    const count = Number(this.state.me?.user?.total_harvests || 0);
    return Object.entries(this.state.content?.crops || {})
      .filter(([, crop]) => !crop.tutorialOnly)
      .map(([id, crop]) => ({ ...crop, id, unlocked: count >= Number(crop.unlock || 0) }));
  }

  plotView(slot) {
    const me = this.state.me;
    if (!me) {
      return {
        locked: false,
        guest: this.state.phase === "guest" || !this.state.authenticated,
        unsynced: true,
        plot: null,
        growing: false,
        stage: 0,
        wet: false,
        url: "",
        empty: false,
      };
    }
    const slots = Number(me.user?.slots || 0);
    const locked = slot >= slots;
    const plot = this.plot(slot);
    const growing = !locked && plot?.state === "growing" && Boolean(plot.crop_id);
    const stage = growing ? this.cropStage(slot) : 0;
    return {
      locked,
      guest: false,
      unsynced: false,
      plot,
      growing,
      stage,
      wet: Boolean(plot?.last_watered_at) && !locked,
      url: growing ? this.imageURL(plot.crop_id, stage) : "",
      empty: !locked && !growing,
    };
  }

  status(slot) {
    const value = (kind, label, hint, canAct = false) => ({ kind, label, hint, canAct });
    const phase = this.state.phase;
    if (phase === "idle" || phase === "syncing") {
      return value("syncing", "同步中…", "正在讀取心田田地", false);
    }
    if (phase === "retrying") return value("syncing", "重新同步中…", "正在重新讀取心田田地", false);
    if (phase === "offline") {
      return value("offline", "重新同步", this.state.error || FARM_SYNC_LABEL.offline, true);
    }
    if (phase === "guest" || !this.state.authenticated) {
      return value("login", "登入種植", "登入後會與心田同步", true);
    }
    if (slot >= Number(this.state.me?.user?.slots || 0)) {
      return value("locked", "尚未開墾", "請先到心田開墾此田地");
    }
    const plot = this.plot(slot);
    if (!plot || plot.state === "empty" || !plot.crop_id) {
      return value("plant", "選種播種", "與心田使用同一塊田地", true);
    }
    if (plot.state !== "growing") return value("wait", "同步田地", "這塊田地狀態已更新");
    const name = this.state.content?.crops?.[plot.crop_id]?.name || "作物";
    const remaining = Number(plot.ready_at) - this.serverNow();
    if (remaining <= 0) return value("harvest", "採收", `${name}已成熟`, true);
    const water = this.state.content?.water || { max_count: 0, cooldown_seconds: 0 };
    const cool = Number(plot.last_watered_at || 0) + Number(this.state.me.water_cooldown ?? water.cooldown_seconds) - this.serverNow();
    const minutes = Math.max(1, Math.ceil(remaining / 60));
    if (Number(plot.water_count) < Number(water.max_count) && (!plot.last_watered_at || cool <= 0)) {
      return value("water", "澆水", `${name} · 約 ${minutes} 分鐘成熟`, true);
    }
    return value("wait", "成長中", `${name} · 約 ${minutes} 分鐘成熟`);
  }

  async mutate(action, slot, cropId) {
    if (this.state.busy) throw new Error("正在處理，請稍候。");
    this.state.busy = true;
    try {
      await this.refresh();
      if (this.state.phase !== "ready" || !this.state.authenticated) {
        throw new Error(this.state.phase === "guest" ? "請先登入並同步農田。" : (this.state.error || "請先登入並同步農田。"));
      }
      const data = await this.request(action, { slot, ...(cropId ? { crop_id: cropId } : {}) });
      await this.refresh();
      return data;
    } catch (err) {
      await this.refresh();
      throw err;
    } finally {
      this.state.busy = false;
    }
  }

  plant(slot, cropId) { return this.mutate("plant", slot, cropId); }
  water(slot) { return this.mutate("water", slot); }
  harvest(slot) { return this.mutate("harvest", slot); }

  cropStage(slot) {
    const plot = this.plot(slot);
    if (!plot || plot.state !== "growing") return 0;
    const span = Math.max(1, Number(plot.ready_at) - Number(plot.planted_at));
    const ratio = (this.serverNow() - Number(plot.planted_at)) / span;
    const stage = STAGE_THRESHOLDS.findIndex((threshold) => ratio < threshold);
    return stage < 0 ? 9 : stage;
  }

  imageURL(id, stage) {
    if (!/^[a-z0-9_-]+$/.test(id)) return "";
    const safeStage = Math.max(0, Math.min(9, stage | 0));
    return `/xintian/assets/img/crops/${id}-${safeStage}.png`;
  }
}
