/* night payload loading: debounced, abortable */

import { $, api, setBusy, todayLocal, tzOffAt, toast } from "./util.js";
import { S } from "./state.js";
import { timeIndexFor, synthesizeAdvancedTracks } from "./derive.js";

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
    const date = $("#dateInput").value || todayLocal();
    const q = new URLSearchParams({ date, tz_offset_min: tzOffAt(date) });
    if (sel.value) q.set("site", sel.value);   // empty string would 422
    if (S.cfg && S.cfg.adv_mode) q.set("adv", "1");
    const N = await api("/api/night?" + q, { signal: ctl.signal, silent: true });
    if (ctl !== _nightCtl) return;              // superseded meanwhile

    // The synthesis awaits for seconds in advanced mode, so the supersede check
    // has to be repeated AFTER it: without this, a load superseded while
    // synthesising still committed its payload below and repainted every view
    // with the previous date's data (and cleared busy while the newer load was
    // still in flight).
    if (N.objects.some(o => o.adv)) {
      await synthesizeAdvancedTracks(N);
      if (ctl !== _nightCtl) return;            // superseded during synthesis
    }
    S.night = N;
    const n = N.timeline.n;
    const nowIdx = timeIndexFor(new Date());
    S.tIdx = nowIdx >= 0 ? nowIdx : Math.floor(n * 0.45);
    $("#timeSlider").max = n - 1;

    // views derive their own flags/scores from the raw tracks
    document.dispatchEvent(new CustomEvent("night:loaded"));
    if (ctl === _nightCtl) setBusy(false);      // only the current load clears it
  } catch (err) {
    if (err.name === "AbortError") return;      // superseded
    // A superseded load must not report its failure either: the newer request
    // is still in flight (or has already succeeded) and reports the real
    // problem itself - a stale toast only confuses the user.
    if (ctl !== _nightCtl) return;
    setBusy(false);
    toast("Night calculation failed: " + err.message);
    console.error(err);
  }
}
