/* Image Archive mode: mode switching, FITS import, library table */

import { $, $$, esc, api, toast, setBusy, fmtSize, fmtDT, TYPE_LABEL } from "./util.js";
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
  $("#archiveInfo").classList.toggle("hidden", !dir);
}

/* ---------------- import pane ---------------- */

const BATCH = 8;

async function ingestFiles(files, frame, session) {
  const list = Array.from(files || []).filter(
    f => /\.(fit|fits)$/i.test(f.name));
  if (!list.length) {
    toast("No .fit or .fits files selected.", "err", 4000);
    return;
  }
  // one run id per import action: the server merges the per-chunk history
  // rows, so a whole session stays ONE entry in "Recent imports"
  const runId = crypto.randomUUID();
  const results = [];
  setBusy(true, `Importing 0/${list.length}`);
  try {
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const fd = new FormData();
      for (const f of chunk) fd.append("files", f);
      if (frame) fd.append("frame", frame);
      if (session) fd.append("session", session);
      fd.append("run_id", runId);
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
  if (!results.length) {
    box.innerHTML = `<p class="hint">Nothing imported yet.</p>`;
    return;
  }
  const ok = results.filter(r => r.ok).length;
  const fails = results.filter(r => !r.ok);
  box.innerHTML =
    `<div class="ingest-count">${ok}/${results.length} imported` +
    (fails.length ? ` &middot; ${fails.length} failed` : "") + `</div>` +
    (fails.length
      ? fails.map(r => {
          const o = r.object || {};
          return `<div class="ingest-item err">
            <span class="ic">\u2717</span>
            <span class="nm" title="${esc(r.file)}">${esc(r.file)}</span>
            <span class="obj"><span class="bad">${esc(r.error || "failed")}</span></span>
          </div>`;
        }).join("")
      : '<p class="hint">All files imported successfully.</p>');
}

let _ingestCache = [];

/* ---------------- recent imports (per-session history) ---------------- */

let _impSession = null;     // pending {slug, session} for the calibration picker

function renderImports(list) {
  const box = $("#importHistory");
  if (!box) return;
  if (!list || !list.length) {
    box.innerHTML = '<p class="hint">Nothing imported yet.</p>';
    return;
  }
  box.innerHTML = list.map(b => {
    const dur = b.total_exposure > 0 ? ` \u00B7 ${fmtDur(b.total_exposure)}` : "";
    const loc = `${esc(b.slug)}/${esc(b.session)}/${esc(b.frame)}s`;
    return `<div class="imp-item">
      <div class="imp-head">
        <b>${esc(b.object_name || b.slug)}</b>
        <span class="hint">${esc(b.session)} \u00B7 ${esc(b.frame)} \u00D7 ${b.n_files}${dur}</span>
      </div>
      <div class="imp-path mono" title="archive folder">${loc}</div>
      <div class="imp-btns">
        <button class="ghost" data-imp="dark">+ darks</button>
        <button class="ghost" data-imp="flat">+ flats</button>
        <button class="ghost" data-imp="bias">+ bias</button>
        <button class="ghost imp-open" data-open="${esc(b.slug)}/${esc(b.session)}" title="open this session's folder in the file explorer">&#128194;</button>
      </div>
    </div>`;
  }).join("");
}

async function loadImports() {
  try {
    const list = await api("/api/library/imports", { silent: true });
    renderImports(list);
  } catch (err) { /* non-fatal */ }
}

function openFolder(rel) {
  api("/api/library/open_folder", {
    method: "POST", silent: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rel })
  }).then(() => {}).catch(() => toast("Cannot open folder - is the archive path still valid?", "err", 5000));
}

/* ---------------- library pane ---------------- */

let _editTarget = null;

export async function loadLibrary() {
  try {
    S.library = await api("/api/library");
    S.cfg = await api("/api/state");
    applyArchiveUI();
    renderLibrary();
    renderArchiveStats();
    loadImports();
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
      <td>${editable ? `<button class="ghost lib-edit" data-edit="${key}" title="rename / set type">Edit</button>` : ""}
        <button class="ghost lib-open" data-openobj="${key}" title="open the object's folder in the file explorer">&#128194;</button></td>
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
  const sessRows = sess.length ? sess.map(s => {
    const per = s.n_images ? s.exposure / s.n_images : 0;
    const when = s.undated
      ? "<span class='hint'>no date recorded</span>"
      : `${fmtDT(s.start)} \u2013 ${fmtDT(s.end)}`;
    const chips = (map, key) => (map && Object.keys(map).length)
      ? Object.entries(map).map(([k, v]) =>
          `<span class="chip" title="${key === "types" ? (typeL[k] || k) : "filter"}">${esc(k)} ${v.n}\u00D7${fmtDur(v.exposure)}</span>`).join("")
      : "";
    const sTypes = chips(s.types, "types");
    const sFilters = chips(s.filters, "filters");
    return `<div class="sess">
      <div class="sess-when">${when}</div>
      <div class="sess-meta">${s.n_images} \u00D7 ${fmtDur(per)} = ${fmtDur(s.exposure)}</div>
      ${(sTypes || sFilters) ? `<div class="lib-rollup">${sTypes}${sFilters}</div>` : ""}
    </div>`;
  }).join("") : '<p class="hint">No sessions.</p>';
  return `<div class="lib-frames">${sessRows}</div>`;
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
  $("#brand").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleMode(); }
  });
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
  $("#btnArcReindex").addEventListener("click", async () => {
    setBusy(true, "Scanning archive folder...");
    try {
      // a big archive needs more than the default 30 s request timeout
      const res = await api("/api/library/reindex",
        { method: "POST", signal: new AbortController().signal });
      toast(`Reindex: ${res.added} added, ${res.skipped} already known, ${res.failed} failed.`,
            "info", 6000);
      S.library = null;
      await loadLibrary();
    } catch (err) { /* api() already toasted */ }
    finally { setBusy(false); }
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
  let calFrame = "dark";   // set by the per-session +darks/+flats/+bias buttons
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
  $("#btnClearResults").addEventListener("click", () => {
    _ingestCache = [];
    $("#ingestResults").innerHTML = '<p class="hint">Nothing imported yet.</p>';
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
    const op = e.target.closest(".lib-open");
    if (op) {
      const o = (S.library.objects || []).find(x => x.name === op.dataset.openobj);
      const slug = o && o.images && o.images[0]
        ? o.images[0].file.split(/[\\/]/)[0] : op.dataset.openobj;
      openFolder(slug);
    }
  });
  const impBox = $("#importHistory");
  if (impBox) {
    impBox.addEventListener("click", e => {
      const open = e.target.closest(".imp-open");
      if (open) { openFolder(open.dataset.open); return; }
      const imp = e.target.closest("[data-imp]");
      if (imp) {
        const item = imp.closest(".imp-item");
        const loc = item.querySelector(".imp-path").textContent.split("/");
        _impSession = { slug: loc[0], session: loc[1] };
        calFrame = imp.dataset.imp;   // per-session buttons force the frame too
        $("#fitFilesCal").click();
      }
    });
  }
  $("#fitFilesCal").addEventListener("change", e => {
    const t = _impSession;
    ingestFiles(e.target.files, calFrame,
                t ? t.session : null);   // bare folder name; slug is server-side
    e.target.value = "";
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