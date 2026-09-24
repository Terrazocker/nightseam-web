/* Provider contract: one binary wire format, provider-specific physics. */
const C = await import(new URL("../../core/index.js", import.meta.url).href);

const grid = {
  minLon: 0,
  minLat: 0,
  stepLon: 0.05,
  stepLat: 0.05,
  width: 3,
  height: 3,
  radiance: new Float32Array([0, 0, 0, 0, 100, 0, 0, 0, 0]),
  coverage: new Uint16Array(9).fill(65535),
  coverageScale: 65535,
};

let ok = true;
const fail = (message) => { ok = false; console.log("  FAIL:", message); };
const eog = C.estimateSkyBrightnessFromGrid(grid, 0.075, 0.075, "eog");
const nasa = C.estimateSkyBrightnessFromGrid(
  grid, 0.075, 0.075, "blackmarble");
if (!eog.available || eog.model !== "eog-zenith-v1") {
  fail(`EOG dispatch failed: ${JSON.stringify(eog)}`);
}
if (!nasa.available || nasa.model !== "blackmarble-zenith-v1") {
  fail(`NASA dispatch failed: ${JSON.stringify(nasa)}`);
}
if (eog.modelVersion !== "1.0.0" || nasa.modelVersion !== "1.0.0") {
  fail("both providers must return explicit model versions");
}
if (!(Math.abs(eog.zenithMpsas - nasa.zenithMpsas) > 1e-6)) {
  fail("NASA must not silently use the EOG calibration path");
}
const unknown = C.estimateSkyBrightnessFromGrid(grid, 0.075, 0.075, "future");
if (unknown.available || unknown.reason !== "unknown-provider") {
  fail(`unknown provider must fail closed: ${JSON.stringify(unknown)}`);
}

console.log(ok ? "sky brightness provider contract held" :
  "sky brightness provider contract FAILED");
process.exit(ok ? 0 : 1);
