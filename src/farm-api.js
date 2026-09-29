// Same-origin adapter. The existing Xintian server remains the only authority.
export class FarmAPI {
  constructor(fetcher = (...args) => fetch(...args), timeoutMs = 12000) {
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.state = { content: null, me: null, authenticated: false, error: "正在同步農田", busy: false };
    this.fetchedAt = 0;
    this.refreshing = null;
  }
  async request(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetcher(`/api/xintian/${path}`, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (err) {
      if (controller.signal.aborted) throw new Error("連線逾時，請重新同步農田狀態。");
      throw err;
    } finally {
      clearTimeout(timer);
    }
    let data;
    try { data = await res.json(); } catch { throw new Error("農田連線暫時無法使用，請重新同步。"); }
    if (!res.ok || !data.ok) {
      const err = new Error(data.error || "農田同步失敗");
      err.status = res.status;
      throw err;
    }
    return data;
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.read();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  async read() {
    try {
      if (!this.state.content) this.state.content = await this.request("content");
      this.state.me = await this.request("me");
      this.fetchedAt = Date.now();
      this.state.authenticated = true;
      this.state.error = "";
      return this.state.me;
    } catch (err) {
      this.state.error = err.message;
      if (err.status === 401 || err.status === 403) {
        this.state.authenticated = false;
        this.state.me = null;
      }
      return null;
    }
  }
  serverNow() { return this.state.me ? Number(this.state.me.server_now) + (Date.now() - this.fetchedAt) / 1000 : Date.now() / 1000; }
  plot(slot) { return this.state.me?.plots?.find((plot) => Number(plot.slot) === slot) || null; }
  crops() {
    const count = Number(this.state.me?.user?.total_harvests || 0);
    return Object.entries(this.state.content?.crops || {}).filter(([, crop]) => !crop.tutorialOnly)
      .map(([id, crop]) => ({ ...crop, id, unlocked: count >= Number(crop.unlock || 0) }));
  }
  status(slot) {
    const value = (kind, label, hint, canAct = false) => ({ kind, label, hint, canAct });
    if (!this.state.authenticated) return value("login", "登入種植", "登入後會與心田同步", true);
    if (this.state.error) return value("offline", "重新同步", this.state.error, true);
    if (slot >= Number(this.state.me.user.slots)) return value("locked", "尚未開墾", "請先到心田開墾此田地");
    const plot = this.plot(slot);
    if (!plot) return value("offline", "重新同步", "尚未取得這塊田地", true);
    if (plot.state === "empty") return value("plant", "選種播種", "與心田使用同一塊田地", true);
    const name = this.state.content.crops[plot.crop_id]?.name || "作物";
    const remaining = Number(plot.ready_at) - this.serverNow();
    if (remaining <= 0) return value("harvest", "採收", `${name}已成熟`, true);
    const water = this.state.content.water;
    const cool = Number(plot.last_watered_at || 0) + Number(this.state.me.water_cooldown ?? water.cooldown_seconds) - this.serverNow();
    if (Number(plot.water_count) < water.max_count && (!plot.last_watered_at || cool <= 0)) return value("water", "澆水", `${name} · 約 ${Math.ceil(remaining / 60)} 分鐘成熟`, true);
    return value("wait", "成長中", `${name} · 約 ${Math.ceil(remaining / 60)} 分鐘成熟`);
  }
  async mutate(action, slot, cropId) {
    if (this.state.busy) throw new Error("正在處理，請稍候。");
    this.state.busy = true;
    try {
      await this.refresh(); // Verify current server state before every write.
      if (!this.state.authenticated || this.state.error) throw new Error("請先登入並同步農田。");
      const data = await this.request(action, { slot, ...(cropId ? { crop_id: cropId } : {}) });
      await this.refresh();
      return data;
    } catch (err) {
      await this.refresh(); // Unknown result: refresh, never retry the write automatically.
      throw err;
    } finally { this.state.busy = false; }
  }
  plant(slot, cropId) { return this.mutate("plant", slot, cropId); }
  water(slot) { return this.mutate("water", slot); }
  harvest(slot) { return this.mutate("harvest", slot); }
  cropStage(slot) {
    const plot = this.plot(slot);
    if (!plot || plot.state !== "growing") return 0;
    const ratio = (this.serverNow() - Number(plot.planted_at)) / Math.max(1, Number(plot.ready_at) - Number(plot.planted_at));
    const stage = [.05, .12, .2, .3, .4, .52, .7, .85, 1].findIndex((threshold) => ratio < threshold);
    return stage < 0 ? 9 : stage;
  }
  imageURL(id, stage) {
    if (!/^[a-z0-9_-]+$/.test(id)) return "";
    return `/xintian/assets/img/crops/${id}-${stage}.png`;
  }
}
