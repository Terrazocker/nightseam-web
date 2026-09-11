/* orchestrator: boot sequence, tabs, cross-view events */

import { $, $$, todayLocal, initFocusTrap } from "./util.js";
import { S } from "./state.js";
import { api } from "./util.js";
import { loadNight } from "./night.js";
import { recomputeNightDerived, effectiveMinAlt,
         SCRUB_STEP_MIN, SCRUB_SHIFT_STEP_MIN } from "./derive.js";
import { bindHeader, renderNightInfo, updateTimeLabel, applySavedTheme } from "./header.js";
import { bindTonight, renderTonight } from "./tonight.js";
import { bindFilters, renderTargets, populateConstFilter } from "./targets.js";
import { bindSetup, applyCfgToUI } from "./setup.js";
import { bindDetail, drawAltChart } from "./detail.js";
import { bindSky, renderSky } from "./skyview.js";
import { bindWeather, refreshWeatherForSite } from "./weather.js";
import { checkForUpdates } from "./updater.js";
import { Pano } from "./pano.js";
import { bindArchive, applyArchiveUI, loadLibrary } from "./archive.js";
import { bindSkyMap, renderSkyMap } from "./skymap.js";
import { initDragWindows } from "./dragwin.js";
import { requestPrefsDerived } from "./planning_client.js";

/* ---------------- tabs ---------------- */
function bindTabs() {
  for (const nav of [$("#tabs"), $("#tabs-cat")]) {
    for (const b of nav.querySelectorAll(".tab")) {
      b.addEventListener("click", () => {
        for (const n of [$("#tabs"), $("#tabs-cat")])
          n.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        $$(".tabpane").forEach(p => p.classList.remove("active"));
        $(`#tab-${b.dataset.tab}`).classList.add("active");
        if (b.dataset.tab === "sky") renderSky();
        if (b.dataset.tab === "horizon") Pano.onShow();
        if (b.dataset.tab === "library") loadLibrary();
        if (b.dataset.tab === "skymap") renderSkyMap();
      });
    }
  }
}

/* ---------------- full refresh ---------------- */
function renderAll() {
  renderNightInfo();
  renderTonight();
  renderTargets();
  renderSky();
  updateTimeLabel();
  if (Pano.refreshOverlay) Pano.refreshOverlay();
}

/* ---------------- state loading ---------------- */
async function loadState() {
  S.cfg = await api("/api/state");
  S.minAlt = effectiveMinAlt(S.cfg);
  S.catalog = await api("/api/catalog" + (S.cfg.adv_mode ? "?adv=1" : ""));
  S.meta = {};
  for (const o of S.catalog) S.meta[o.id] = o;
  S.panos = await api("/api/panoramas");
  const vt = $("#versionTag");
  if (vt) vt.textContent = "NightSeam v" + (S.cfg.version || "1.0.0");
  const av = $("#aboutVersion");
  if (av) av.textContent = "v" + (S.cfg.version || "1.0.0");

  applySavedTheme(S.cfg.theme);   // syncs the menu when the head script missed

  applyCfgToUI();
  $("#dateInput").value = todayLocal();   // zone-aware local date

  // No site means the planner cannot run (`/api/night` 400s), so (re)open the
  // guided setup even when wizard_done is already set - otherwise skipping the
  // location step left a permanent 0-site dead-end with no way back in.
  if (!S.cfg.sites.length) {
    const w = await import("./wizard.js");
    w.openWizard();
  }
  populateConstFilter();
}

/* ---------------- boot ---------------- */
async function init() {
  $("#dateInput").value = new Date().toLocaleDateString("sv"); // YYYY-MM-DD local

  // draggable popup windows (active in the Glass theme)
  initDragWindows();

  // cross-view reactions
  document.addEventListener("night:loaded", () => {
    // a worker-built payload already carries the derived fields (bound during
    // the load); the sync/server paths derive here as before
    if (!S.night._derivedReady) recomputeNightDerived();
    renderAll();
  });
  document.addEventListener("time:changed", () => {
    renderTonight(); renderTargets(); renderSky();
  });
  document.addEventListener("favs:changed", () => {
    if ($("#tab-sky").classList.contains("active")) renderSky();
  });
  document.addEventListener("prefs:changed", async () => {
    // worker-side rescore on the retained tracks (async, cancellable); the
    // synchronous definition remains the fallback and the single reference
    const async_ok = await requestPrefsDerived();
    if (!async_ok) recomputeNightDerived();
    renderTonight(); renderTargets(); renderSky();
    if (DETAIL_OPEN()) drawAltChart();
  });

  // re-render canvases after window resizes (debounced)
  let _rsT = null;
  window.addEventListener("resize", () => {
    clearTimeout(_rsT);
    _rsT = setTimeout(() => {
      if ($("#tab-sky").classList.contains("active")) renderSky();
      if ($("#tab-skymap").classList.contains("active")) renderSkyMap();
      if ($("#tab-horizon").classList.contains("active") && window.Pano &&
          window.Pano.img) window.Pano.render && window.Pano.render();
      if (DETAIL_OPEN()) drawAltChart();
    }, 150);
  });

  bindTabs();
  bindHeader();
  bindTonight();
  bindFilters();
  bindSetup();
  bindDetail();
  bindSky();
  bindArchive();
  bindSkyMap();
  initFocusTrap();

  // keyboard shortcuts: arrows scrub the night, n cycles the tabs.
  // Modals and text entry keep their own keys.
  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (document.querySelector(".modal:not(.hidden)")) return;  // modals own keys
    if (S.night) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const slider = $("#timeSlider");
        if (!slider) return;
        e.preventDefault();
        // fine step = one 6-min grid sample, coarse = Shift (60 min) - the
        // same steps as the web (pinned by tests/test_js_parity.py)
        const step = e.shiftKey
          ? Math.round(SCRUB_SHIFT_STEP_MIN / SCRUB_STEP_MIN)
          : 1;
        S.tIdx = Math.max(+slider.min || 0, Math.min(+slider.max,
          S.tIdx + (e.key === "ArrowRight" ? step : -step)));
        slider.value = S.tIdx;
        updateTimeLabel();
        document.dispatchEvent(new CustomEvent("time:changed"));
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        nextTab();
      }
    }
  });

  await loadState();
  // bindWeather reads S.cfg.weather_auto, so it must run AFTER loadState -
  // otherwise "always load on startup" was always read as false
  bindWeather();
  await loadNight();
  Pano.init();
  applyArchiveUI();
  checkForUpdates();   // silent version check against the website
}

function DETAIL_OPEN() {
  return !$("#detailModal").classList.contains("hidden");
}

/* cycle to the next tab of the active mode */
function nextTab() {
  const nav = document.querySelector(S.catmode ? "#tabs-cat" : "#tabs");
  if (!nav) return;
  const tabs = [...nav.querySelectorAll(".tab")];
  const cur = nav.querySelector(".tab.active");
  const idx = Math.max(0, tabs.indexOf(cur));
  tabs[(idx + 1) % tabs.length].click();
}

init().catch(err => {
  console.error(err);
  const banner = document.createElement("div");
  banner.style.cssText = "background:#5c1a1a;color:#fff;padding:10px 16px;font-weight:600";
  banner.textContent = "Failed to start: " + String(err.message || err);
  document.body.prepend(banner);
});
