/* night payload loading: debounced, abortable */

import { $, api, setBusy, tzOff, toast } from "./util.js";
import { S } from "./state.js";
import { recomputeNightDerived, timeIndexFor,
         synthesizeAdvancedTracks } from "./derive.js";

let _nightCtl = null;
let _nightTimer = null;

export function scheduleLoadNight(delay = 300) {
  clearTimeout(_nightTimer);
  _nightTimer = setTimeout(doLoadNight, delay);
}

// compatibility alias for modules that just want a (re)load
export function loadNight() { scheduleLoadNight(0); }

async function doLoadNight() {
  const sel = $("#siteSelect");
  if (!sel || !sel.options.length) return;     // no observing site yet
  if (_nightCtl) _nightCtl.abort();
  _nightCtl = new AbortController();
  const ctl = _nightCtl;
  setBusy(true);
  try {
    const date = $("#dateInput").value || new Date().toLocaleDateString("sv");
    const q = new URLSearchParams({ date, tz_offset_min: tzOff() });
    if (sel.value) q.set("site", sel.value);   // empty string would 422
    if (S.cfg && S.cfg.adv_mode) q.set("adv", "1");
    const N = await api("/api/night?" + q, { signal: ctl.signal, silent: true });
    if (ctl !== _nightCtl) return;              // superseded meanwhile

    if (N.objects.some(o => o.adv)) await synthesizeAdvancedTracks(N);
    S.night = N;
    const n = N.timeline.n;
    const nowIdx = timeIndexFor(new Date());
    S.tIdx = nowIdx >= 0 ? nowIdx : Math.floor(n * 0.45);
    $("#timeSlider").max = n - 1;

    // views derive their own flags/scores from the raw tracks
    document.dispatchEvent(new CustomEvent("night:loaded"));
    setBusy(false);
  } catch (err) {
    if (err.name === "AbortError") return;      // superseded
    if (ctl === _nightCtl) setBusy(false);
    toast("Night calculation failed: " + err.message);
    console.error(err);
  }
}
