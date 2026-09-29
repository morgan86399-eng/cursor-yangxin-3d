// Dev/test fixture only. Production never selects this unless ?farm=mock is present.
const SERVER_NOW = 1_000_000;

const CROPS = {
  chuxin: { id: "chuxin", name: "初心芽", tier: "tutorial", base_seconds: 90, unlock: 0, tutorialOnly: true },
  pingjing: { id: "pingjing", name: "平靜草", tier: "short", base_seconds: 1800, unlock: 0 },
  ganen: { id: "ganen", name: "感恩花", tier: "short", base_seconds: 7200, unlock: 0 },
  yuyi: { id: "yuyi", name: "翠皺羽衣", tier: "short", base_seconds: 3000, unlock: 0 },
  anmian: { id: "anmian", name: "安眠薰衣", tier: "short", base_seconds: 2400, unlock: 0 },
  weixiao: { id: "weixiao", name: "微笑三色堇", tier: "short", base_seconds: 3600, unlock: 0 },
  fangxia: { id: "fangxia", name: "隨風蒲公英", tier: "short", base_seconds: 5400, unlock: 2 },
  nairou: { id: "nairou", name: "奶油萵苣", tier: "short", base_seconds: 3600, unlock: 2 },
  jingshui: { id: "jingshui", name: "京水菜", tier: "mid", base_seconds: 14400, unlock: 4 },
  chaoyang: { id: "chaoyang", name: "朝陽葵", tier: "mid", base_seconds: 21600, unlock: 5 },
  qingming: { id: "qingming", name: "圓滿蓮", tier: "long", base_seconds: 259200, unlock: 10 },
};

function growing(slot, cropId, ratio, extra = {}) {
  const duration = 10_000;
  const planted = SERVER_NOW - ratio * duration;
  return {
    slot,
    state: "growing",
    crop_id: cropId,
    planted_at: planted,
    ready_at: planted + duration,
    water_count: 0,
    last_watered_at: null,
    ...extra,
  };
}

export function createFarmMockData() {
  return {
    serverNow: SERVER_NOW,
    harvests: 4,
    slots: 10,
    plots: [
      { slot: 0, state: "empty" },
      growing(1, "pingjing", 0.02),
      growing(2, "ganen", 0.18, { water_count: 1, last_watered_at: SERVER_NOW - 30 }),
      growing(3, "yuyi", 1.05, { water_count: 3, last_watered_at: SERVER_NOW - 400 }),
      growing(4, "anmian", 0.46),
      growing(5, "weixiao", 0.62, { water_count: 1, last_watered_at: SERVER_NOW - 20 }),
      growing(6, "fangxia", 0.78, { water_count: 2, last_watered_at: SERVER_NOW - 80 }),
      growing(7, "nairou", 0.33),
      growing(8, "jingshui", 0.9, { water_count: 2, last_watered_at: SERVER_NOW - 200 }),
      growing(9, "pingjing", 0.08, { water_count: 0 }),
    ],
  };
}

function response(data, status = 200) {
  return { ok: status < 400, status, json: async () => data };
}

export function farmMockRequested(search = "") {
  try {
    return new URLSearchParams(String(search || "")).get("farm") === "mock";
  } catch {
    return false;
  }
}

export function createFarmMockFetcher(seed = createFarmMockData()) {
  const plots = seed.plots.map((plot) => ({ ...plot }));
  let harvests = seed.harvests;
  const content = {
    ok: true,
    crops: CROPS,
    water: { cooldown_seconds: 60, max_count: 3 },
  };
  const me = () => ({
    ok: true,
    server_now: seed.serverNow,
    water_cooldown: 60,
    user: { slots: seed.slots, total_harvests: harvests },
    plots: plots.map((plot) => ({ ...plot })),
  });
  return async (url, options = {}) => {
    if (String(url).endsWith("/content")) return response(content);
    if (String(url).endsWith("/me")) return response(me());
    const body = options.body ? JSON.parse(options.body) : {};
    const slot = Number(body.slot);
    let plot = plots.find((item) => Number(item.slot) === slot);
    if (String(url).endsWith("/plant")) {
      if (!plot) {
        plot = { slot };
        plots.push(plot);
      }
      const crop = CROPS[body.crop_id];
      plot.state = "growing";
      plot.crop_id = body.crop_id;
      plot.planted_at = seed.serverNow;
      plot.ready_at = seed.serverNow + Number(crop?.base_seconds || 1800);
      plot.water_count = 0;
      plot.last_watered_at = null;
      return response({ ok: true, plot: { ...plot } });
    }
    if (String(url).endsWith("/water")) {
      if (!plot || plot.state !== "growing") return response({ ok: false, error: "現在不能澆水" }, 400);
      plot.water_count = Number(plot.water_count || 0) + 1;
      plot.last_watered_at = seed.serverNow;
      return response({ ok: true, plot: { ...plot } });
    }
    if (String(url).endsWith("/harvest")) {
      if (!plot || plot.state !== "growing") return response({ ok: false, error: "現在不能採收" }, 400);
      plot.state = "empty";
      delete plot.crop_id;
      delete plot.planted_at;
      delete plot.ready_at;
      plot.water_count = 0;
      plot.last_watered_at = null;
      harvests += 1;
      return response({ ok: true, plot: { ...plot } });
    }
    return response({ ok: false, error: "未知的農田操作" }, 404);
  };
}
