/* top bar: site/date/prefs/scrubber bindings + night summary line */

import { $, fmtHM, fmtT, esc, api, phaseName, applyEdgeSpace } from "./util.js";
import { S } from "./state.js";
import { moonUpDownText, effectiveMinAlt } from "./derive.js";
import { scheduleLoadNight } from "./night.js";
import { openSites } from "./setup.js";
import { refreshWeatherForSite } from "./weather.js";

export function bindHeader() {
  $("#siteSelect").addEventListener("change", async e => {
    const id = +e.target.value;
    S.cfg.active_site_id = id;         // keep client state + server in sync
    S.activeSiteId = id;
    api("/api/settings", { method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ active_site_id: id })}).catch(() => {});
    scheduleLoadNight(300);
    refreshWeatherForSite();
  });
  $("#dateInput").addEventListener("change", () => scheduleLoadNight(300));
  $("#btnSites").addEventListener("click", openSites);

  // hamburger options menu
  $("#btnMenu").addEventListener("click", e => {
    e.stopPropagation();
    $("#menuPanel").classList.toggle("hidden");
  });
  document.addEventListener("mousedown", e => {
    if (!e.target.closest(".menuwrap")) $("#menuPanel").classList.add("hidden");
  });
  $("#menuPanel").addEventListener("mousedown", e => e.stopPropagation());
  let _esT = null;
  $("#edgeSpace").addEventListener("input", e => {
    const v = +e.target.value;
    applyEdgeSpace(v);
    clearTimeout(_esT);
    _esT = setTimeout(() => api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ edge_space: v })
    }).catch(() => {}), 400);
  });

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
    S.cfg.min_useful_alt = S.minAlt;         // an explicit value now exists
    S.cfg.min_useful_alt_explicit = true;    // ... so Bortle must not override it
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
  let _bortleT = null;
  $("#bortle").addEventListener("input", e => {
    const v = +e.target.value;
    $("#bortleVal").textContent = v;
    S.cfg.bortle = v;
    // no explicit min altitude stored? the Bortle-derived default moves with
    // it (17 + 2*bortle), exactly like the web and the server - the threshold
    // must not stay frozen at the boot value
    if (!S.cfg.min_useful_alt_explicit) {
      S.minAlt = effectiveMinAlt(S.cfg);
      const mua = $("#minUsefulAlt");
      if (mua) mua.value = S.minAlt;
      const muaVal = $("#muaVal");
      if (muaVal) muaVal.textContent = S.minAlt + "\u00B0";
    }
    document.dispatchEvent(new CustomEvent("prefs:changed"));
    clearTimeout(_bortleT);
    _bortleT = setTimeout(() => api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ bortle: v })
    }).catch(() => {}), 400);
  });

  bindTheme();
}

/* ---------- appearance themes ---------- */

export function applySavedTheme(name) {
  name = name || "";
  document.documentElement.setAttribute("data-theme", name);
  for (const b of document.querySelectorAll("#themeRow .theme-btn"))
    b.classList.toggle("active", (b.dataset.theme || "") === name);
}

function bindTheme() {
  const row = $("#themeRow");
  if (!row) return;
  row.addEventListener("click", e => {
    const b = e.target.closest(".theme-btn");
    if (!b) return;
    const name = b.dataset.theme || "";
    applySavedTheme(name);
    api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ theme: name })
    }).catch(() => {});
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
  // high latitudes have no astronomical night: nightcalc sends null dusk/dawn,
  // and an unguarded subtraction would print "NaNh NaNm" (same guard as
  // tonight.js's dark-time line)
  if (!N || !N.dusk || !N.dawn) return "\u2014";
  const mins = Math.max(0, Math.round(
    (new Date(N.dawn + "Z") - new Date(N.dusk + "Z")) / 60000));
  if (!Number.isFinite(mins)) return "\u2014";
  return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
}

export function updateTimeLabel() {
  const el = $("#timeLabel");
  if (!el) return;
  if (!S.night) { el.textContent = ""; return; }
  const d = new Date(S.night.timeline.times_iso[S.tIdx] + "Z");
  el.textContent = fmtT(d);
}
