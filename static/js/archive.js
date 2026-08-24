/* Image Archive mode: mode switching, FITS import, library table */

import { $, $$, esc, api, toast, setBusy, fmtSize, TYPE_LABEL } from "./util.js";
import { S } from "./state.js";
import { renderSkyMap } from "./skymap.js";

let _bound = false;

/* ---------------- mode switching ---------------- */

export function setMode(cat) {
  S.catmode = cat;
  document.body.classList.toggle("catmode", cat);
  $("#btnModeTxt").textContent = cat ? "Night Planner" : "Image Catalog";
  $("#btnMode .ic-tel").classList.toggle("hidden", cat);
  $("#btnMode .ic-night").classList.toggle("hidden", !cat);
  $("#btnMode").title = cat ? "Switch to the night planner" : "Switch to the image catalog";
  $$("#tabs .tab, #tabs-cat .tab").forEach(b => b.classList.remove("active"));
  $$(".tabpane").forEach(p => p.classList.remove("active"));
  const def = cat ? "import" : "tonight";
  document.querySelector(`#${cat ? "tabs-cat" : "tabs"} .tab[data-tab="${def}"]`)
    .classList.add("active");
  $(`#tab-${def}`).classList.add("active");
  if (cat) loadLibrary();
  document.dispatchEvent(new CustomEvent("mode:changed"));
}

export function toggleMode() {
  setMode(!S.catmode);
}

/* ---------------- state / archive folder ---------------- */

export function applyArchiveUI() {
  const dir = (S.cfg && S.cfg.image_dir) || "";
  const inp = $("#arcDir");
  if (inp) inp.value = dir;
  $("#archiveInfo").textContent = dir;
  $("#archiveInfo").title = "Image archive: " + dir;
}

/* ---------------- import pane ---------------- */

const BATCH = 8;

async function ingestFiles(files) {
  const list = Array.from(files || []).filter(
    f => /\.(fit|fits)$/i.test(f.name));
  if (!list.length) {
    toast("No .fit or .fits files selected.", "err", 4000);
    return;
  }
  const results = [];
  setBusy(true, `Importing 0/${list.length}`);
  try {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const fd = new FormData();
      for (const f of chunk) fd.append("files", f);
      let res;
      try {
        res = await api("/api/images/ingest", { method: "POST", body: fd });
      } catch (err) {
        for (const f of chunk) results.push({ file: f.name, ok: false,
          error: "request failed" });
        break;
      }
      results.push(...res.results);
      setBusy(true,
        `Importing ${Math.min(i + chunk.length, list.length)}/${list.length}`);
    }
    renderIngestResults(results);
    $("#ingestSummary").textContent =
      `${results.filter(r => r.ok).length} imported, ` +
      `${results.length - results.filter(r => r.ok).length} failed.`;
    S.library = null;                       // stale until refetched
    loadLibrary();
  } finally {
    setBusy(false);
  }
}

function renderIngestResults(results) {
  const box = $("#ingestResults");
  if (!box) return;
  _ingestCache = results;
  const errOnly = $("#chkErrOnly").checked;
  const shown = errOnly ? results.filter(r => !r.ok) : results;
  if (!shown.length) {
    box.innerHTML = `<p class="hint">${
      errOnly ? "No failed imports." : "Nothing imported yet."}</p>`;
    return;
  }
  box.innerHTML = shown.map(r => {
    const o = r.object || {};
    const meta = r.ok
      ? `${esc(o.name || "?")}${o.designation ? " (" + esc(o.designation) + ")" : ""}`
      : `<span class="bad">${esc(r.error || "failed")}</span>`;
    const exp = r.exposure != null ? ` \u00B7 ${fmtDur(r.exposure)}` : "";
    const dt = r.date_obs ? ` \u00B7 ${esc(r.date_obs.replace("T", " "))}` : "";
    const flt = r.filter ? ` \u00B7 ${esc(r.filter)}` : "";
    return `<div class="ingest-item ${r.ok ? "ok" : "err"}">
      <span class="ic">${r.ok ? "\u2713" : "\u2717"}</span>
      <span class="nm" title="${esc(r.file)}">${esc(r.file)}${exp}${flt}${dt}</span>
      <span class="obj">${meta}</span>
    </div>`;
  }).join("");
}

let _ingestCache = [];

/* ---------------- library pane ---------------- */

let _editTarget = null;

export async function loadLibrary() {
  try {
    S.library = await api("/api/library");
    S.cfg = await api("/api/state");
    applyArchiveUI();
    renderLibrary();
    renderArchiveStats();
    if (($("#tabs-cat .tab.active") || {}).dataset &&
        $("#tabs-cat .tab.active").dataset.tab === "skymap") renderSkyMap();
  } catch (err) { /* api() already toasted */ }
}

function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function renderArchiveStats() {
  const el = $("#archiveStats");
  if (!el) return;
  const L = S.library;
  if (!L) { el.innerHTML = ""; return; }
  const objs = (L.objects || []).length;
  el.innerHTML =
    `<div class="stat"><span class="k">objects</span><span class="v">${objs}</span></div>` +
    `<div class="stat"><span class="k">images</span><span class="v">${L.total_images}</span></div>` +
    `<div class="stat"><span class="k">integration</span><span class="v">${fmtDur(L.total_exposure)}</span></div>`;
}

export function renderLibrary() {
  const box = $("#libraryTable tbody");
  if (!box) return;
  const L = S.library;
  const unit = S.cfg.size_unit || "arcmin";
  $("#libEmpty").classList.toggle("hidden", !L || L.objects.length > 0);
  if (!L || !L.objects.length) {
    box.innerHTML = '<tr><td colspan="8" class="hint">Nothing here yet.</td></tr>';
    $("#libSummary").textContent = "";
    return;
  }
  const sort = $("#libSort").value;
  const objs = [...L.objects].sort((a, b) => {
    if (sort === "integ") return b.total_exposure - a.total_exposure;
    if (sort === "sessions") return b.n_sessions - a.n_sessions;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  box.innerHTML = objs.map(o => {
    const type = o.otype ? TYPE_LABEL[o.otype] || o.otype : "unknown";
    const editable = !o.object_id;
    const key = esc(o.name || "");
    return `<tr class="librow" data-lib="${key}">
      <td><button class="sess-toggle" data-toggle="${key}" title="show sessions"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M5 4 L9 8 L5 12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>
      <td class="objcell"><b>${esc(o.name || "?")}</b><span>${o.designation ? esc(o.designation) : "no designation"}</span></td>
      <td>${type}</td>
      <td class="mono">${fmtSize(o.size_am, unit)}</td>
      <td class="mono">${o.n_images}</td>
      <td class="mono">${fmtDur(o.total_exposure)}</td>
      <td class="mono">${o.n_sessions}</td>
      <td>${editable ? `<button class="ghost lib-edit" data-edit="${key}" title="rename / set type">Edit</button>` : ""}</td>
    </tr>`;
  }).join("");
  const tot = fmtDur(L.total_exposure);
  $("#libSummary").textContent =
    `${objs.length} object${objs.length === 1 ? "" : "s"} \u00B7 ` +
    `${L.total_images} image${L.total_images === 1 ? "" : "s"} \u00B7 ` +
    `${tot} total integration`;
}

function sessionRowsHTML(o) {
  const sess = o.sessions || [];
  const typeL = { light: "Lights", dark: "Darks", flat: "Flats", bias: "Bias" };
  const typeSummary = (o.types && Object.keys(o.types).length)
    ? Object.entries(o.types).map(([t, v]) =>
        `<span class="chip" title="${typeL[t] || t}">${esc(t)} ${v.n}\u00D7${fmtDur(v.exposure)}</span>`).join("")
    : "";
  const filterSummary = (o.filters && Object.keys(o.filters).length)
    ? Object.entries(o.filters).map(([fl, v]) =>
        `<span class="chip" title="filter">${esc(fl)} ${v.n}\u00D7${fmtDur(v.exposure)}</span>`).join("")
    : "";
  const imgs = (o.images || []).map(im => `
    <span class="frame" title="${esc(im.orig_name)} \u00B7 ${esc(im.imagetyp || "light")}${im.filter ? " \u00B7 " + esc(im.filter) : ""}${im.exposure != null ? " \u00B7 " + fmtDur(im.exposure) : ""}">
      <img loading="lazy" src="/api/images/${im.id}/preview" onerror="this.style.visibility='hidden'">
      <small>${esc(im.filter || "\u2014")}</small>
    </span>`).join("");
  const sessRows = sess.length ? sess.map(s => {
    const per = s.n_images ? s.exposure / s.n_images : 0;
    const when = s.undated
      ? "<span class='hint'>no date recorded</span>"
      : `${esc(s.start.replace("T", " "))} \u2013 ${esc(s.end.replace("T", " "))}`;
    return `<div class="sess">
      <span class="sess-when">${when}</span>
      <span class="sess-meta">${s.n_images} \u00D7 ${fmtDur(per)} = ${fmtDur(s.exposure)}</span>
    </div>`;
  }).join("") : '<p class="hint">No sessions.</p>';
  const summary = typeSummary || filterSummary
    ? `<div class="lib-rollup">${typeSummary}${filterSummary}</div>` : "";
  return `<div class="lib-frames">${summary}${imgs || '<span class="hint">no images</span>'}</div>${sessRows}`;
}

function toggleSessions(name) {
  const tr = document.querySelector(`tr[data-lib="${CSS.escape(name)}"]`);
  if (!tr) return;
  const btn = tr.querySelector(".sess-toggle");
  let det = tr.nextElementSibling;
  if (det && det.classList.contains("lib-sess")) {
    det.remove();
    btn.classList.remove("open");
    return;
  }
  const o = (S.library.objects || []).find(x => x.name === name);
  if (!o) return;
  tr.insertAdjacentHTML("afterend",
    `<tr class="lib-sess"><td></td><td colspan="7">${sessionRowsHTML(o)}</td></tr>`);
  btn.classList.add("open");
}

function openEdit(name) {
  const o = (S.library.objects || []).find(x => x.name === name);
  if (!o || o.object_id) return;
  _editTarget = o;
  $("#libEditName").value = o.name || "";
  $("#libEditType").value = o.otype || "";
  $("#libEditModal").classList.remove("hidden");
  $("#libEditName").focus();
}

async function saveEdit() {
  if (!_editTarget) return;
  const o = _editTarget;
  const newName = $("#libEditName").value.trim();
  const otype = $("#libEditType").value;
  if (!newName) { toast("Name must not be empty.", "err", 3000); return; }
  try {
    await api("/api/library/edit", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: o.name, new_name: newName, otype }) });
    $("#libEditModal").classList.add("hidden");
    _editTarget = null;
    S.library = null;
    await loadLibrary();
    renderSkyMap();
  } catch (err) { /* api() already toasted */ }
}

/* ---------------- bindings ---------------- */

export function bindArchive() {
  if (_bound) return;
  _bound = true;

  $("#brand").addEventListener("click", toggleMode);
  $("#btnMode").addEventListener("click", toggleMode);

  // archive folder
  $("#btnArcBrowse").addEventListener("click", async () => {
    const bridge = window.pywebview && window.pywebview.api;
    if (!bridge || !bridge.pick_archive_dir) {
      toast("Folder dialog is only available in the native window - type the path instead.",
            "err", 6000);
      return;
    }
    const dir = await bridge.pick_archive_dir($("#arcDir").value.trim());
    if (dir) {
      $("#arcDir").value = dir;
      $("#btnArcSave").click();
    }
  });
  $("#btnArcSave").addEventListener("click", async () => {
    const v = $("#arcDir").value.trim();
    if (!v) {
      $("#arcDirHint").textContent = "Empty = default folder is used.";
      return;
    }
    try {
      await api("/api/settings", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_dir: v })});
      S.cfg = await api("/api/state");
      applyArchiveUI();
      toast("Archive folder saved.", "info", 3000);
    } catch (err) { /* api() already toasted */ }
  });
  if ($("#arcDir")) {
    $("#arcDir").addEventListener("keydown", e => {
      if (e.key === "Enter") $("#btnArcSave").click();
    });
  }

  // import
  $("#btnIngest").addEventListener("click", () => $("#fitFiles").click());
  $("#fitFiles").addEventListener("change", e => {
    ingestFiles(e.target.files);
    e.target.value = "";
  });
  const dz = $("#dropZone");
  if (dz) {
    dz.addEventListener("dragover", e => {
      e.preventDefault();
      dz.classList.add("over");
    });
    dz.addEventListener("dragleave", () => dz.classList.remove("over"));
    dz.addEventListener("drop", e => {
      e.preventDefault();
      dz.classList.remove("over");
      ingestFiles(e.dataTransfer.files);
    });
  }
  $("#chkErrOnly").addEventListener("change", () => renderIngestResults(_ingestCache));
  $("#btnClearResults").addEventListener("click", () => {
    _ingestCache = [];
    $("#ingestResults").innerHTML = '<p class="hint">Nothing imported yet.</p>';
    $("#ingestSummary").textContent = "";
  });

  // library controls
  $("#libUnit").addEventListener("change", async e => {
    S.cfg.size_unit = e.target.value;
    $("#sizeUnit").value = e.target.value;
    await api("/api/settings", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size_unit: e.target.value })});
    renderLibrary();
  });
  $("#libSort").addEventListener("change", renderLibrary);
  $("#btnLibExport").addEventListener("click", () => {
    const fmt = $("#libExportFmt").value;
    window.location = `/api/library/export?format=${fmt}`;
  });
  $("#libraryTable tbody").addEventListener("click", e => {
    const tog = e.target.closest(".sess-toggle");
    if (tog) { toggleSessions(tog.dataset.toggle); return; }
    const ed = e.target.closest(".lib-edit");
    if (ed) { openEdit(ed.dataset.edit); return; }
  });

  // library edit modal
  $("#libEditClose").addEventListener("click", () => {
    $("#libEditModal").classList.add("hidden");
    _editTarget = null;
  });
  $("#libEditCancel").addEventListener("click", () => {
    $("#libEditModal").classList.add("hidden");
    _editTarget = null;
  });
  $("#libEditModal").addEventListener("mousedown", e => {
    if (e.target.id === "libEditModal") {
      $("#libEditModal").classList.add("hidden");
      _editTarget = null;
    }
  });
  $("#libEditSave").addEventListener("click", saveEdit);
  $("#libEditName").addEventListener("keydown", e => {
    if (e.key === "Enter") saveEdit();
  });
}