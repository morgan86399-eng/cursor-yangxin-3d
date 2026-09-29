import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync(new URL("../public/data/ground-surface-evidence.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.equal(evidence.calibrationStatus, "estimated-not-site-calibrated");
assert.ok(evidence.sources.some((source) => source.id === "nlsc-photo2-local" && source.imageCaptureDate === null));
assert.ok(evidence.sources.some((source) => source.id === "mapillary-chunri-2019" && source.photoDate === "2019-11-29"));
assert.ok(evidence.layers.length >= 4);
assert.ok(evidence.layers.every((layer) => layer.siteMeasured === false), "unmeasured surface must not be labeled surveyed");
assert.match(html, /ground-surface-evidence\.json/);
assert.match(html, /路面與地坪色彩含推估/);
console.log("地坪來源與未校準標示：pass");
