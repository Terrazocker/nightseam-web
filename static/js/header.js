/* top bar: site/date/prefs/scrubber bindings + night summary line */

import { $, fmtHM, esc, api, phaseName } from "./util.js";
import { S } from "./state.js";
import { moonUpDownText } from "./derive.js";
import { scheduleLoadNight } from "./night.js";
import { openSites } from "./setup.js";

export function bindHeader() {
  $("#siteSelect").addEventListener("change", () => scheduleLoadNight(300));
  $("#dateInput").addEventListener("change", () => scheduleLoadNight(300));
  $("#btnSites").addEventListener("click", openSites);
  $("#btnPrefs").addEventListener("click", e => {
    e.stopPropagation();
    $("#prefsPanel").classList.toggle("hidden");
  });
  document.addEventListener("mousedown", e => {
    if (!e.target.closest(".popwrap")) $("#prefsPanel").classList.add("hidden");
  });
  $("#prefsPanel").addEventListener("mousedown", e => e.stopPropagation());

  const slider = $("#timeSlider");
  let raf = null;
  slider.addEventListener("input", e => {
    S.tIdx = +e.target.value;
    if (raf) return;                       // coalesce to one update per frame
    raf = requestAnimationFrame(() => {
      raf = null;
      updateTimeLabel();
      document.dispatchEvent(new CustomEvent("time:changed"));
    });
  });

  // preferences popover controls
  let _muaPersist = null;
  $("#minUsefulAlt").addEventListener("input", e => {
    S.minAlt = +e.target.value;
    $("#muaVal").textContent = S.minAlt + "\u00B0";
    document.dispatchEvent(new CustomEvent("prefs:changed"));
    clearTimeout(_muaPersist);
    _muaPersist = setTimeout(() => api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ min_useful_alt: S.minAlt })
    }).catch(() => {}), 400);
  });
  $("#moonAware").addEventListener("change", async e => {
    S.cfg.moon_aware = e.target.checked;
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ moon_aware: e.target.checked })});
    document.dispatchEvent(new CustomEvent("prefs:changed"));
  });
}

export function renderNightInfo() {
  const N = S.night;
  if (!N) return;
  const lvlName = {astronomical:"astronomical", nautical:"nautical",
                   civil:"civil"}[N.twilight_level];
  $("#nightInfo").innerHTML =
    `Sunset <b>${fmtHM(N.sunset)}</b> &middot; Sunrise <b>${fmtHM(N.sunrise)}</b> &middot; ` +
    `${lvlName ? lvlName[0].toUpperCase()+lvlName.slice(1) : "Dark"} night ` +
    `<b>${fmtHM(N.dusk)}&ndash;${fmtHM(N.dawn)}</b> (${durStrLocal(N)}) &middot; ` +
    `Moon <b>${Math.round(N.moon_illum*100)}%</b> (${phaseName(N.moon_illum)})` +
    ` &middot; ${esc(moonUpDownText())}`;
  updateTimeLabel();
}

function durStrLocal(N) {
  const mins = Math.max(0, Math.round(
    (new Date(N.dawn + "Z") - new Date(N.dusk + "Z")) / 60000));
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

export function updateTimeLabel() {
  const el = $("#timeLabel");
  if (!el) return;
  if (!S.night) { el.textContent = ""; return; }
  const d = new Date(S.night.timeline.times_iso[S.tIdx] + "Z");
  el.textContent = d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}
