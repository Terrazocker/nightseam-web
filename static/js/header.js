/* top bar: site/date/prefs/scrubber bindings + night summary line */

import { $, fmtHM, fmtT, esc, api, phaseName, applyEdgeSpace } from "./util.js";
import { S, announcePlannerChange } from "./state.js";
import { moonUpDownText, effectiveMinAlt, scrubWindowRange } from "./derive.js";
import { scheduleLoadNight } from "./night.js";
import { openSites } from "./setup.js";
import { refreshWeatherForSite } from "./weather.js";

export function bindHeader() {
  $("#siteSelect").addEventListener("change", async e => {
    const id = +e.target.value;
    S.cfg.active_site_id = id;         // keep client state + server in sync
    S.activeSiteId = id;
    announcePlannerChange("site", { cause: "active-site", siteId: id });
    api("/api/settings", { method: "POST",
      headers: { "Content-Type": "application/json" }, silent: true,
      body: JSON.stringify({ active_site_id: id })}).catch(() => {});
    scheduleLoadNight(300);
    refreshWeatherForSite();
    document.dispatchEvent(new CustomEvent("site:changed"));
  });
  $("#dateInput").addEventListener("change", () => {
    announcePlannerChange("date", {
      cause: "calendar", dateKey: $("#dateInput").value || null,
    });
    scheduleLoadNight(300);
    refreshWeatherForSite();
    document.dispatchEvent(new CustomEvent("date:changed"));
  });
  $("#btnSites").addEventListener("click", () => {
    $("#menuPanel").classList.add("hidden");   // Setup now lives in the menu
    openSites();
  });

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
      announcePlannerChange("selection", { cause: "scrub", tIdx: S.tIdx });
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
    if (e.type === "change") {
      announcePlannerChange("preferences", { cause: "min-useful-alt" });
    }
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
    // DE-09: the local cfg is applied first, so the re-derive must still run when
    // the POST fails. `api()` toasts and RETHROWS; without this catch the
    // prefs:changed dispatch below was skipped, leaving the visible scores on the
    // old ranking while the checkbox showed the new value.
    try {
      await api("/api/settings", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ moon_aware: e.target.checked })});
    } catch { /* api() already toasted; the local value stays applied */ }
    announcePlannerChange("preferences", { cause: "moon-aware" });
    document.dispatchEvent(new CustomEvent("prefs:changed"));
  });
  // View full day: widen the scrub to the whole payload grid; off (default)
  // keeps it on the dark window the planner scores on. Clamp the selected
  // sample back inside the new range so it never points outside the slider.
  $("#viewFullDay").addEventListener("change", async e => {
    S.cfg.view_full_day = e.target.checked;
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"}, silent: true,
      body: JSON.stringify({ view_full_day: e.target.checked })}).catch(() => {});
    announcePlannerChange("preferences", { cause: "view-full-day" });
    applyScrubRange();
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
    if (e.type === "change") {
      announcePlannerChange("preferences", { cause: "bortle" });
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
  name = name === "dome" ? "dome" : "workbench";
  document.documentElement.setAttribute("data-theme", name);
  for (const b of document.querySelectorAll("#themeRow .theme-btn"))
    b.classList.toggle("active", (b.dataset.theme || "") === name);
  document.dispatchEvent(new Event("theme:changed"));
}

function bindTheme() {
  const row = $("#themeRow");
  if (!row) return;
  row.addEventListener("click", e => {
    const b = e.target.closest(".theme-btn");
    if (!b) return;
    const name = b.dataset.theme === "dome" ? "dome" : "workbench";
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

/** Re-derive the scrub slider bounds (night window by default, whole payload
 *  grid with view_full_day) and clamp S.tIdx inside them. Called after a night
 *  load and when the View full day toggle flips. */
export function applyScrubRange() {
  const slider = $("#timeSlider");
  if (!slider || !S.night) return;
  const [lo, hi] = scrubWindowRange();
  slider.min = String(lo);
  slider.max = String(hi);
  S.tIdx = Math.max(lo, Math.min(hi, S.tIdx));
  slider.value = String(S.tIdx);
  updateTimeLabel();
  document.dispatchEvent(new CustomEvent("time:changed"));
}
