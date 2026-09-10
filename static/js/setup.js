/* Setup dialog: observing locations, imaging rigs, backup/transfer */

import { $, esc, api, toast, fmtFovPair, watchCaps, applyEdgeSpace, num,
         setDisplayZone, todayLocal } from "./util.js";
import { S } from "./state.js";
import { loadNight, scheduleLoadNight } from "./night.js";
import { updateTimeLabel } from "./header.js";
import { renderTargets } from "./targets.js";
import { effectiveMinAlt } from "./derive.js";

export async function openSites() {
  $("#sitesModal").classList.remove("hidden");
  showMtab("sites");
  hideRigAdd();
  renderSitesTable(await api("/api/sites"));
  renderRigsTable();
  renderCustomList();
}
export function closeSites() {
  $("#sitesModal").classList.add("hidden");
}

function showMtab(name) {
  for (const b of document.querySelectorAll("#sitesModal .modal-tabs .tab")) {
    b.classList.toggle("active", b.dataset.mtab === name);
  }
  for (const p of document.querySelectorAll("#sitesModal .mtabpane")) {
    p.classList.toggle("hidden", p.id !== "mtab-" + name);
  }
}

export function bindSetup() {
  $("#sitesClose").addEventListener("click", closeSites);
  $("#sitesModal").addEventListener("mousedown", e => {
    if (e.target.id === "sitesModal") closeSites();
  });
  document.querySelectorAll("#sitesModal .modal-tabs .tab").forEach(b => {
    b.addEventListener("click", () => showMtab(b.dataset.mtab));
  });

  // locations
  $("#siteForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    try {
      await api("/api/sites", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:f.name.value, lat:num(f.lat.value),
                               lon:num(f.lon.value),
                               elev:Math.round(num(f.elev.value) || 0) })});
      f.reset();
      await refreshCfgOnly();
      renderSitesTable(await api("/api/sites"));
      loadNight();
    } catch (err) { /* api() already toasted */ }
  });
  $("#btnGeoLocate").addEventListener("click", () => {
    if (!navigator.geolocation) return alert("Geolocation unavailable");
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude:lat, longitude:lon } = pos.coords;
      const form = $("#siteForm");
      form.lat.value = lat.toFixed(4); form.lon.value = lon.toFixed(4);
      form.name.value = form.name.value || "My location";
    }, err => alert("Could not get position: " + err.message));
  });
  watchCaps($("#siteForm"), $("#siteCapsWarn"));

  // rigs
  const rigForm = $("#rigForm");
  rigForm.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("/api/rigs", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:rigForm.name.value,
                               focal_mm:num(rigForm.focal_mm.value),
                               sensor_w:num(rigForm.sensor_w.value),
                               sensor_h:num(rigForm.sensor_h.value) })});
      rigForm.reset(); $("#rigFovPreview").textContent="";
      hideRigAdd();
      S.cfg = await api("/api/state");
      applyCfgToUI(); renderRigsTable();
    } catch (err) { /* api() already toasted */ }
  });
  for (const n of ["focal_mm","sensor_w","sensor_h"]) {
    rigForm.querySelector(`[name=${n}]`).addEventListener("input", () => {
      const fl = num(rigForm.focal_mm.value),
            sw = num(rigForm.sensor_w.value),
            sh = num(rigForm.sensor_h.value);
      if (!(fl > 0 && sw > 0 && sh > 0)) { $("#rigFovPreview").textContent=""; return; }
      const w = 2*Math.atan(sw/2/fl)*180/Math.PI*60;
      const h = 2*Math.atan(sh/2/fl)*180/Math.PI*60;
      $("#rigFovPreview").textContent = `FOV \u2248 ${fmtFovPair(w, h)}`;
    });
  }
  // "Add rig" is a PICKER: smart telescope off the list, or a custom rig.
  // Nothing is preinstalled - a fresh setup has an empty rig table.
  $("#btnAddRig").addEventListener("click", () => {
    hideRigAdd();
    renderRigPicker();
    $("#rigPicker").classList.remove("hidden");
  });
  $("#btnRigCustom").addEventListener("click", () => {
    $("#rigPicker").classList.add("hidden");
    rigForm.reset(); $("#rigFovPreview").textContent="";
    rigForm.classList.remove("hidden");
    rigForm.name.focus();
  });
  $("#btnRigPickCancel").addEventListener("click", hideRigAdd);
  $("#btnRigFormCancel").addEventListener("click", hideRigAdd);

  // preferences that live in the popover but persist through settings
  $("#sizeUnit").addEventListener("change", async e => {
    S.cfg.size_unit = e.target.value;
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ size_unit: e.target.value })});
    renderTargets();
    if ($("#libUnit")) $("#libUnit").value = e.target.value;
    document.dispatchEvent(new CustomEvent("detail:changed"));
  });
  $("#rigSelect").addEventListener("change", async e => {
    const id = e.target.value ? +e.target.value : null;
    S.cfg.active_rig_id = id;
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ active_rig_id: id === null ? 0 : id })});
    renderTargets();
    document.dispatchEvent(new CustomEvent("detail:changed"));
  });
  for (const id of ["fltBb","fltHa","fltOiii"]) {
    $("#"+id).addEventListener("change", async () => {
      const filters = { broadband:$("#fltBb").checked,
                        narrowband_ha:$("#fltHa").checked,
                        narrowband_oiii:$("#fltOiii").checked };
      S.cfg.filters = filters;
      await api("/api/settings", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ filters })});
      renderTargets();
      document.dispatchEvent(new CustomEvent("detail:changed"));
    });
  }

  // advanced catalog mode
  $("#advMode").addEventListener("change", async e => {
    $("#tzSection").classList.toggle("hidden", !e.target.checked);
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ adv_mode: e.target.checked })});
    toast(e.target.checked
      ? "Advanced mode enabled - loading the full catalog..."
      : "Advanced mode disabled - loading the standard catalog...",
      "info", 4000);
    setTimeout(() => location.reload(), 700);
  });

  // timezone (advanced mode only): IANA zone for display + offset-at-date
  $("#tzSelect").addEventListener("change", async e => {
    const v = e.target.value;
    try {
      await api("/api/settings", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ timezone: v })});
    } catch (err) { return; }
    S.cfg.timezone = v;
    setDisplayZone(v);
    $("#dateInput").value = todayLocal();
    updateTimeLabel();
    scheduleLoadNight(0);
    toast(v ? `Timezone set to ${v}.` : "Timezone set to machine local.",
          "info", 3500);
  });

  // backup / transfer
  $("#btnImport").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!confirm("Importing replaces all locations, rigs, panorama masks, custom targets, image library and preferences. Continue?")) {
      e.target.value = ""; return;
    }
    const fd = new FormData();
    fd.append("file", f);
    try {
      // restoring a multi-GB library can take minutes: no client timeout
      const res = await api("/api/import", { method:"POST", body:fd, timeout: 0 });
      const safety = res.auto_backup
        ? " Your previous data was kept in a safety copy next to the database."
        : "";
      toast(`Imported ${res.sites} locations, ${res.rigs} rigs, ` +
            `${res.panoramas} panoramas, ${res.images} library images. Reloading...` + safety,
            "info", 8000);
      setTimeout(() => location.reload(), 900);
    } catch (err) { /* api() already toasted */ }
    e.target.value = "";
  });
  $("#btnWizardReplay").addEventListener("click", async () => {
    closeSites();
    const w = await import("./wizard.js");
    w.openWizard();
  });

  // ---- custom targets ----
  $("#customForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target;
    try {
      const res = await api("/api/catalog/custom", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:f.name.value, ra:f.ra.value, dec:f.dec.value,
          otype:f.otype.value, vmag:f.vmag.value.trim() !== "" ? num(f.vmag.value) : null })});
      f.reset();
      toast("Target added to your catalog.", "info", 3500);
      await refreshCatalogMeta(); renderCustomList(); renderTargets();
    } catch (err) { /* api() already toasted */ }
  });
}

async function refreshCatalogMeta() {
  S.catalog = await api("/api/catalog" + (S.cfg.adv_mode ? "?adv=1" : ""));
  S.meta = {};
  for (const o of S.catalog) S.meta[o.id] = o;
}

function renderCustomList() {
  const box = $("#customList");
  if (!box) return;
  const customs = S.catalog.filter(o => o.id.startsWith("u_"));
  if (!customs.length) { box.innerHTML = "<span>No custom targets yet.</span>"; return; }
  box.innerHTML = customs.map(o => `<div class="pano-item">
      <span class="nm">${esc(o.primary_name)}</span>
      <span class="mono">${o.ra_hours.toFixed(2)}h ${o.dec_deg.toFixed(1)}\u00B0</span>
      <button data-delcust="${o.id}" class="danger ghost">Del</button>
    </div>`).join("");
  box.querySelectorAll("[data-delcust]").forEach(b => b.addEventListener("click", async () => {
    await api("/api/catalog/custom/" + b.dataset.delcust, { method:"DELETE" });
    await refreshCatalogMeta(); renderCustomList(); renderTargets();
  }));
}


/* push current cfg into all controls */
export function applyCfgToUI() {
  const sel = $("#siteSelect");
  sel.innerHTML = "";
  for (const s of S.cfg.sites) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`;
    sel.appendChild(opt);
  }
  S.activeSiteId = S.cfg.active_site_id ?? (S.cfg.sites[0] && S.cfg.sites[0].id);
  if (S.activeSiteId != null) sel.value = String(S.activeSiteId);

  S.minAlt = effectiveMinAlt(S.cfg);
  $("#minUsefulAlt").value = S.minAlt;
  $("#muaVal").textContent = S.minAlt + "\u00B0";
  $("#moonAware").checked = !!S.cfg.moon_aware;
  const F = S.cfg.filters || {};
  $("#fltBb").checked = !!F.broadband;
  $("#fltHa").checked = !!F.narrowband_ha;
  $("#fltOiii").checked = !!F.narrowband_oiii;
  $("#sizeUnit").value = S.cfg.size_unit || "arcmin";
  if ($("#libUnit")) $("#libUnit").value = S.cfg.size_unit || "arcmin";
  applyEdgeSpace(S.cfg.edge_space ?? 200);
  if ($("#advMode")) $("#advMode").checked = !!S.cfg.adv_mode;
  if ($("#tzSection")) {
    $("#tzSection").classList.toggle("hidden", !S.cfg.adv_mode);
  }
  if ($("#tzSelect")) $("#tzSelect").value = S.cfg.timezone || "";
  setDisplayZone(S.cfg.timezone || "");
  if ($("#bortle")) {
    $("#bortle").value = S.cfg.bortle ?? 4;
    $("#bortleVal").textContent = S.cfg.bortle ?? 4;
  }
  $("#fMag").max = S.cfg.adv_mode ? 20 : 16;
  if (+$("#fMag").value > +$("#fMag").max) {
    $("#fMag").value = $("#fMag").max;
    $("#magVal").textContent = (+$("#fMag").max).toFixed(1);
  }
  $("#skyMag").max = S.cfg.adv_mode ? 20 : 14;
  if (+$("#skyMag").value > +$("#skyMag").max) {
    $("#skyMag").value = $("#skyMag").max;
    $("#skyMagVal").textContent = (+$("#skyMag").max).toFixed(1);
  }
  refreshRigUI();
}

export async function refreshCfgOnly() {
  S.cfg = await api("/api/state");
  applyCfgToUI();
}

function refreshRigUI() {
  const sel = $("#rigSelect");
  if (!sel) return;
  const cur = S.cfg.active_rig_id;
  sel.innerHTML = '<option value="">none &mdash; no frame coverage shown</option>';
  for (const r of S.cfg.rigs || []) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = `${r.name} \u00B7 ${fmtFovPair(r.fov_w, r.fov_h)}`;
    sel.appendChild(opt);
  }
  sel.value = cur != null ? String(cur) : "";
}

function activeRigBtn(r) {
  return String(S.cfg.active_rig_id) === String(r.id) ? "primary" : "ghost";
}

function renderSitesTable(sites) {
  const tb = document.querySelector("#siteTable tbody");
  tb.innerHTML = sites.map(s => `<tr>
    <td>${esc(s.name)}</td><td class="mono">${s.lat.toFixed(4)}</td>
    <td class="mono">${s.lon.toFixed(4)}</td><td>${s.elev}</td>
    <td>
      <button data-use="${s.id}" class="${String(s.id)===String(S.cfg.active_site_id)?"primary":"ghost"}">${String(s.id)===String(S.cfg.active_site_id)?"Active":"Use"}</button>
      <button data-del="${s.id}" class="danger ghost">Delete</button>
    </td></tr>`).join("");
  tb.querySelectorAll("[data-use]").forEach(b => b.addEventListener("click", async () => {
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ active_site_id:+b.dataset.use })});
    await refreshCfgOnly(); renderSitesTable(sites); loadNight();
  }));
  tb.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    await api("/api/sites/"+b.dataset.del, { method:"DELETE" });
    await refreshCfgOnly();
    renderSitesTable(await api("/api/sites"));
    loadNight();
  }));
}

function renderRigsTable() {
  const rigs = S.cfg.rigs || [];
  const tb = document.querySelector("#rigTable tbody");
  if (!tb) return;
  if (!rigs.length) {
    tb.innerHTML = '<tr><td colspan="5" class="hint">No rigs yet &mdash; press &ldquo;Add rig&rdquo;.</td></tr>';
    return;
  }
  tb.innerHTML = rigs.map(r => `<tr>
    <td>${esc(r.name)}</td>
    <td class="mono">${r.focal_mm}</td>
    <td class="mono">${r.sensor_w}\u00D7${r.sensor_h}</td>
    <td class="mono">${fmtFovPair(r.fov_w, r.fov_h)}</td>
    <td>
      <button data-ur="${r.id}" class="${activeRigBtn(r)}">${String(S.cfg.active_rig_id)===String(r.id)?"Active":"Use"}</button>
      <button data-dr="${r.id}" class="danger ghost">Del</button>
    </td></tr>`).join("");

  tb.querySelectorAll("[data-ur]").forEach(b => b.addEventListener("click", async () => {
    S.cfg.active_rig_id = +b.dataset.ur;
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ active_rig_id:+b.dataset.ur })});
    refreshRigUI(); renderRigsTable(); renderTargets();
    document.dispatchEvent(new CustomEvent("detail:changed"));
  }));
  tb.querySelectorAll("[data-dr]").forEach(b => b.addEventListener("click", async () => {
    await api("/api/rigs/"+b.dataset.dr, { method:"DELETE" });
    S.cfg = await api("/api/state");
    applyCfgToUI(); renderRigsTable(); renderTargets();
    document.dispatchEvent(new CustomEvent("detail:changed"));
  }));
}

/* ---------------- "Add rig": picker (smart telescope) or custom ---------------- */

function hideRigAdd() {
  const pick = $("#rigPicker"); if (pick) pick.classList.add("hidden");
  const form = $("#rigForm"); if (form) form.classList.add("hidden");
  const prev = $("#rigFovPreview"); if (prev) prev.textContent = "";
}

function renderRigPicker() {
  const box = $("#rigPresetList");
  if (!box) return;
  const presets = S.cfg.rig_presets || [];
  if (!presets.length) {
    box.innerHTML = '<p class="hint">No preset telescopes available &mdash; use &ldquo;Custom rig&hellip;&rdquo;.</p>';
    return;
  }
  box.innerHTML = presets.map((p, i) => `<div class="pano-item">
      <span class="nm">${esc(p.name)}</span>
      <span class="mono">${p.focal_mm} mm &middot; ${fmtFovPair(p.fov_w, p.fov_h)}</span>
      <button type="button" class="ghost" data-rigpreset="${i}">Add</button>
    </div>`).join("");
  box.querySelectorAll("[data-rigpreset]").forEach(b => b.addEventListener("click", async () => {
    const p = presets[+b.dataset.rigpreset];
    if (!p) return;
    try {
      // a preset is plain data: POST it like any hand-typed rig, so the server
      // stays the single source for the FOV numbers
      await api("/api/rigs", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name:p.name, focal_mm:p.focal_mm,
                               sensor_w:p.sensor_w, sensor_h:p.sensor_h })});
      hideRigAdd();
      S.cfg = await api("/api/state");
      applyCfgToUI(); renderRigsTable();
      toast(`${p.name} added.`, "info", 3000);
    } catch (err) { /* api() already toasted */ }
  }));
}
