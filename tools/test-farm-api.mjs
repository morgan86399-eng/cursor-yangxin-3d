import assert from "node:assert/strict";
import { FarmAPI } from "../src/farm-api.js";

const content = { ok: true, crops: { rice: { name: "稻米", unlock: 0 } }, water: { max_count: 2, cooldown_seconds: 60 } };
let plot = { slot: 0, state: "empty" };
let plantWrites = 0;
const fetcher = async (url, options = {}) => {
  if (url.endsWith("/content")) return response(content);
  if (url.endsWith("/me")) return response({ ok: true, server_now: 100, water_cooldown: 60, user: { slots: 1, total_harvests: 0 }, plots: [plot] });
  if (url.endsWith("/plant")) {
    plantWrites += 1;
    plot = { slot: 0, state: "growing", crop_id: "rice", planted_at: 100, ready_at: 200, water_count: 0 };
    return response({ ok: true, plot });
  }
  throw new Error(`unexpected ${url} ${options.method}`);
};
function response(data, status = 200) { return { ok: status < 400, status, json: async () => data }; }

const api = new FarmAPI(fetcher);
await api.refresh();
assert.equal(api.status(0).kind, "plant");
await api.plant(0, "rice");
assert.equal(plantWrites, 1, "a write must never be replayed");
assert.equal(api.plot(0).crop_id, "rice");
assert.equal(api.status(1).kind, "locked");

const timeoutApi = new FarmAPI((_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
}), 5);
await assert.rejects(() => timeoutApi.request("content"), /連線逾時/);
console.log("✓ farm API uses the shared server state and performs one write");
