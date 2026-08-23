/* orchestrator: boot sequence, tabs, cross-view events */

import { $, $$ } from "./util.js";
import { S } from "./state.js";
import { api } from "./util.js";
import { scheduleLoadNight, loadNight } from "./night.js";
import { recomputeNightDerived } from "./derive.js";
import { bindHeader, renderNightInfo, updateTimeLabel } from "./header.js";
import { bindTonight, renderTonight } from "./tonight.js";
import { bindFilters, renderTargets } from "./targets.js";
import { bindSetup, applyCfgToUI } from "./setup.js";
import { bindDetail, drawAltChart } from "./detail.js";
import { bindSky, renderSky } from "./skyview.js";
import { Pano } from "./pano.js";
import { bindArchive, applyArchiveUI, loadLibrary } from "./archive.js";
import { bindSkyMap, renderSkyMap } from "./skymap.js";

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
  S.minAlt = S.cfg.min_useful_alt ?? 25;
  S.catalog = await api("/api/catalog");
  S.meta = {};
  for (const o of S.catalog) S.meta[o.id] = o;
  S.panos = await api("/api/panoramas");
  const vt = $("#versionTag");
  if (vt) vt.textContent = "AstroPilot v" + (S.cfg.version || "1.0.0");

  applyCfgToUI();

  // first-run: guided setup instead of a bare locations dialog
  if (!S.cfg.sites.length && !S.cfg.wizard_done) {
    const w = await import("./wizard.js");
    w.openWizard();
  }
}

/* ---------------- boot ---------------- */
async function init() {
  $("#dateInput").value = new Date().toLocaleDateString("sv"); // YYYY-MM-DD local

  // cross-view reactions
  document.addEventListener("night:loaded", () => {
    recomputeNightDerived();
    renderAll();
  });
  document.addEventListener("time:changed", () => {
    renderTonight(); renderTargets(); renderSky();
  });
  document.addEventListener("favs:changed", () => {
    if ($("#tab-sky").classList.contains("active")) renderSky();
  });
  document.addEventListener("prefs:changed", () => {
    recomputeNightDerived();
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

  await loadState();
  await loadNight();
  Pano.init();
  applyArchiveUI();
}

function DETAIL_OPEN() {
  return !$("#detailModal").classList.contains("hidden");
}

init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML("afterbegin",
    `<div style="background:#5c1a1a;color:#fff;padding:10px 16px;font-weight:600">Failed to start: ${String(err.message || err)}</div>`);
});
