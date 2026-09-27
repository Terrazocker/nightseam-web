/* Image Archive mode: mode switching, FITS import, library table */

import { $, esc, api, toast, setBusy, fmtSize, fmtDT, TYPE_LABEL } from "./util.js";
import { S } from "./state.js";
import { renderSkyMap } from "./skymap.js";

let _bound = false;
let _selectedLibraryObject = null;
let _selectedLibrarySession = 0;

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
    if ($("#tab-image-catalog.active") && $("#tab-skymap.active")) renderSkyMap();
    return true;
  } catch (err) { /* api() already toasted */ return false; }
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
    $("#libraryHeroIdentity").innerHTML = '<p class="eyebrow">Image archive</p><h1>Library</h1><p class="sub">Import FITS exposures to start a local observing archive.</p>';
    $("#libSummary").innerHTML = libraryMetricHTML(null);
    $("#libraryObjectList").innerHTML = '<p class="hint">No indexed objects.</p>';
    $("#librarySessions").innerHTML = '<tr><td colspan="8" class="hint">No capture sessions yet. Import FITS exposures to build the library.</td></tr>';
    $("#librarySessionDetail").textContent = "No session selected.";
    $("#librarySessionActions").innerHTML = '<p class="hint">Session actions appear when a session is selected.</p>';
    $("#librarySessionCount").textContent = "0 recorded";
    $("#libObjectCount").textContent = "0";
    return;
  }
  const sort = $("#libSort").value;
  const allObjects = [...L.objects].sort((a, b) => {
    if (sort === "integ") return b.total_exposure - a.total_exposure;
    if (sort === "sessions") return b.n_sessions - a.n_sessions;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  const q = $("#libSearch").value.trim().toLocaleLowerCase();
  const objs = q ? allObjects.filter((o) =>
    [o.name, o.designation, o.otype].some((x) => String(x || "").toLocaleLowerCase().includes(q))) : allObjects;
  if (!allObjects.some((o) => o.name === _selectedLibraryObject))
    _selectedLibraryObject = allObjects[0]?.name || null;
  const selected = allObjects.find((o) => o.name === _selectedLibraryObject) || allObjects[0];
  const selectedSessions = selected.sessions || [];
  if (_selectedLibrarySession >= selectedSessions.length) _selectedLibrarySession = 0;
  const selectedSession = selectedSessions[_selectedLibrarySession] || null;
  $("#libObjectCount").textContent = q ? `${objs.length}/${allObjects.length}` : String(allObjects.length);
  $("#libraryObjectList").innerHTML = objs.length ? objs.map((o) => {
    const key = esc(o.name || "");
    return `<button class="library-object${o.name === _selectedLibraryObject ? " active" : ""}" type="button" data-library-object="${key}" aria-pressed="${o.name === _selectedLibraryObject}">
      <span><b>${esc(o.name || "?")}</b><small>${esc(o.designation || "no designation")}</small></span>
      <small>${o.n_sessions} session${o.n_sessions === 1 ? "" : "s"}</small>
    </button>`;
  }).join("") : '<p class="hint">No objects match this search.</p>';
  box.innerHTML = objs.map(o => {
    const type = o.otype ? esc(TYPE_LABEL[o.otype] || o.otype) : "unknown";
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
  $("#libraryHeroIdentity").innerHTML = libraryIdentityHTML(selected);
  $("#libSummary").innerHTML = libraryMetricHTML(selected);
  renderLibrarySessions(selected, selectedSessions, selectedSession);
}

function libraryIdentityHTML(object) {
  if (!object) return '<p class="eyebrow">Image archive</p><h1>Library</h1><p class="sub">No selected object.</p>';
  const designation = String(object.designation || object.object_id || "").trim();
  const name = String(object.name || "Unresolved object").trim();
  const type = object.otype ? (TYPE_LABEL[object.otype] || object.otype) : "Type not recorded";
  return `<p class="eyebrow">Image archive · ${esc(type)}</p><h1>${esc(designation || name)}</h1>` +
    `<p class="library-hero-common">${esc(name)}${designation && name !== designation ? ` <span>${esc(designation)}</span>` : ""}</p>`;
}

function libraryObjectRollup(sessions) {
  const totals = { light: 0, dark: 0, flat: 0, bias: 0, lightExposure: 0, filters: new Set() };
  for (const session of sessions || []) {
    const types = Object.entries(session.types || {});
    for (const kind of ["light", "dark", "flat", "bias"]) {
      const entry = types.find(([name]) => String(name).toLowerCase().includes(kind));
      if (!entry) continue;
      totals[kind] += Number(entry[1]?.n) || 0;
      if (kind === "light") totals.lightExposure += Number(entry[1]?.exposure) || 0;
    }
    for (const [name] of Object.entries(session.filters || {}))
      if (name !== "?") totals.filters.add(name);
  }
  return totals;
}

function libraryMetricHTML(object) {
  const total = libraryObjectRollup(object?.sessions || []);
  const fields = [
    ["Sessions", (object?.sessions || []).length.toLocaleString()],
    ["Light integration", fmtDur(total.lightExposure)],
    ["Lights", total.light.toLocaleString()],
    ["Darks", total.dark.toLocaleString()],
    ["Flats", total.flat.toLocaleString()],
    ["Bias", total.bias.toLocaleString()],
    ["Filters", [...total.filters].sort().join(" · ") || "—"],
  ];
  return fields.map(([label, value]) =>
    `<div class="library-metric"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("");
}

function sessionFolderPaths(object, session) {
  const images = object?.images || [];
  const start = session?.start ? Date.parse(session.start) : null;
  const end = session?.end ? Date.parse(session.end) : null;
  const matching = images.filter((image) => {
    const t = image.date_obs ? Date.parse(image.date_obs) : NaN;
    return session?.undated ? !Number.isFinite(t)
      : Number.isFinite(t) && t >= start && t <= end;
  });
  return [...new Set(matching.map((image) => String(image.file || "").split(/[\\/]/).slice(0, 2).filter(Boolean).join("/")))].filter(Boolean);
}

function renderLibrarySessions(object, sessions, activeSession) {
  const heading = $("#librarySessionsHeading");
  const count = $("#librarySessionCount");
  if (heading) heading.textContent = object ? `Capture sessions · ${object.name}` : "Capture sessions";
  if (count) count.textContent = `${sessions.length} recorded`;
  const list = $("#librarySessions");
  if (!list) return;
  if (!sessions.length) {
    list.innerHTML = '<tr><td colspan="8" class="hint">No capture sessions for this object.</td></tr>';
    $("#librarySessionDetail").innerHTML = '<p class="hint">No session selected.</p>';
    $("#librarySessionActions").innerHTML = '<p class="hint">Session actions appear when a session is selected.</p>';
    return;
  }
  list.innerHTML = sessions.map((s, i) => {
    const when = s.undated ? "No date recorded" : `${fmtDT(s.start)} – ${fmtDT(s.end)}`;
    const filters = Object.keys(s.filters || {}).filter((name) => name !== "?").join(" · ");
    const folders = sessionFolderPaths(object, s);
    const typeCount = (needle) => Object.entries(s.types || {}).reduce((sum, [name, value]) =>
      name.toLowerCase().includes(needle) ? sum + (Number(value.n) || 0) : sum, 0);
    const folder = folders.length ? `<button class="library-folder-link" type="button" data-open-library-folder="${esc(folders[0])}" title="${esc(folders.join(" · "))}">${esc(folders[0].split("/").at(-1))}${folders.length > 1 ? ` +${folders.length - 1}` : ""}</button>` : '<span class="hint">Not recorded</span>';
    const lightEntry = Object.entries(s.types || {}).find(([name]) => name.toLowerCase().includes("light"));
    const lightExposure = Number(lightEntry?.[1]?.exposure) || 0;
    return `<tr class="library-session${sessions.indexOf(activeSession) === i ? " active" : ""}" data-library-session="${i}" tabindex="0" aria-selected="${sessions.indexOf(activeSession) === i}">
      <td>${esc(when)}</td><td class="mono">${typeCount("light")}</td><td class="mono">${typeCount("dark")}</td><td class="mono">${typeCount("flat")}</td><td class="mono">${typeCount("bias")}</td>
      <td class="mono" title="Light frames only">${esc(fmtDur(lightExposure))}</td><td>${esc(filters || "—")}</td><td>${folder}</td></tr>`;
  }).join("");
  if (!activeSession) return;
  const typeLabels = { light: "Lights", dark: "Darks", flat: "Flats", bias: "Bias" };
  const typeRows = Object.entries(activeSession.types || {}).map(([kind, value]) =>
    `<div><span>${esc(typeLabels[kind] || kind)}</span><b>${Number(value.n) || 0} · ${esc(fmtDur(value.exposure))}</b></div>`).join("");
  const lightEntry = Object.entries(activeSession.types || {}).find(([name]) => name.toLowerCase().includes("light"));
  const lightExposure = Number(lightEntry?.[1]?.exposure) || 0;
  const filterText = Object.keys(activeSession.filters || {}).map(esc).join(" · ");
  const folders = sessionFolderPaths(object, activeSession);
  $("#librarySessionDetail").innerHTML = `<p class="session-date">${esc(activeSession.undated ? "No date recorded" : `${fmtDT(activeSession.start)} – ${fmtDT(activeSession.end)}`)}</p>
    <dl class="library-session-facts"><div><dt>Frames</dt><dd>${activeSession.n_images}</dd></div><div><dt>Total exposure</dt><dd>${esc(fmtDur(activeSession.exposure))}</dd></div></dl>
    <dl class="library-session-facts"><div><dt>Light integration</dt><dd>${esc(fmtDur(lightExposure))}</dd></div></dl>
    <div class="library-frame-rollup">${typeRows || '<p class="hint">No frame-type rollup recorded.</p>'}</div>
    <p class="library-filter-rollup"><span class="hint">Filters</span><br>${filterText || "No filter recorded"}</p>
    <p class="library-filter-rollup"><span class="hint">Archive folders</span><br>${folders.length ? folders.map((rel) => `<button class="library-folder-link" data-open-library-folder="${esc(rel)}" type="button">${esc(rel)}</button>`).join(" ") : "Not recorded"}</p>`;
  const actions = $("#librarySessionActions");
  if (actions) {
    const rel = folders[0] || "";
    const canTargetSession = rel.split("/").filter(Boolean).length >= 2;
    actions.innerHTML = `<h3>Actions</h3><div class="btnrow">
      <button class="ghost" type="button" data-library-add="dark" data-library-folder="${esc(rel)}" ${canTargetSession ? "" : "disabled"}>+ Darks</button>
      <button class="ghost" type="button" data-library-add="flat" data-library-folder="${esc(rel)}" ${canTargetSession ? "" : "disabled"}>+ Flats</button>
      <button class="ghost" type="button" data-library-add="bias" data-library-folder="${esc(rel)}" ${canTargetSession ? "" : "disabled"}>+ Bias</button>
      <button class="ghost" type="button" data-open-library-folder="${esc(rel)}" ${rel ? "" : "disabled"}>Open folder</button>
      </div>`;
  }
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
  $("#btnLibraryIngest")?.addEventListener("click", () => $("#fitFiles").click());
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
  const libraryDrop = $("#libraryDropZone");
  if (libraryDrop) {
    libraryDrop.addEventListener("dragover", (e) => { e.preventDefault(); libraryDrop.classList.add("over"); });
    libraryDrop.addEventListener("dragleave", () => libraryDrop.classList.remove("over"));
    libraryDrop.addEventListener("drop", (e) => {
      e.preventDefault(); libraryDrop.classList.remove("over"); ingestFiles(e.dataTransfer.files);
    });
  }
  $("#btnClearResults").addEventListener("click", () => {
    _ingestCache = [];
    $("#ingestResults").innerHTML = '<p class="hint">Nothing imported yet.</p>';
  });

  // library controls
  $("#libUnit").addEventListener("change", async e => {
    S.cfg.size_unit = e.target.value;
    const plannerSizeUnit = $("#sizeUnit");
    if (plannerSizeUnit) plannerSizeUnit.value = e.target.value;
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
      return;
    }
    const row = e.target.closest("tr.librow");
    if (row) {
      _selectedLibraryObject = row.dataset.lib;
      _selectedLibrarySession = 0;
      renderLibrary();
    }
  });
  $("#libSearch").addEventListener("input", renderLibrary);
  $("#libraryObjectList").addEventListener("click", (e) => {
    const button = e.target.closest("[data-library-object]");
    if (!button) return;
    _selectedLibraryObject = button.dataset.libraryObject;
    _selectedLibrarySession = 0;
    renderLibrary();
  });
  $("#librarySessions").addEventListener("click", (e) => {
    const folder = e.target.closest("[data-open-library-folder]");
    if (folder) { e.stopPropagation(); openFolder(folder.dataset.openLibraryFolder); return; }
    const button = e.target.closest("[data-library-session]");
    if (!button) return;
    _selectedLibrarySession = Number(button.dataset.librarySession) || 0;
    renderLibrary();
  });
  $("#librarySessions").addEventListener("keydown", (e) => {
    const row = e.target.closest("tr[data-library-session]");
    if (!row || e.target.closest("[data-open-library-folder]") || !["Enter", " "].includes(e.key)) return;
    e.preventDefault();
    _selectedLibrarySession = Number(row.dataset.librarySession) || 0;
    renderLibrary();
  });
  $("#librarySessionRail").addEventListener("click", (e) => {
    const folderButton = e.target.closest("[data-open-library-folder]");
    if (folderButton) {
      const rel = folderButton.dataset.openLibraryFolder;
      if (rel) openFolder(rel);
      return;
    }
    const addButton = e.target.closest("[data-library-add]");
    if (!addButton) return;
    const [slug, session] = String(addButton.dataset.libraryFolder || "").split("/");
    if (!slug || !session) return;
    _impSession = { slug, session };
    calFrame = addButton.dataset.libraryAdd;
    $("#catalog-tab-import").click();
    $("#fitFilesCal").click();
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
  // DE-13: every other dialog in the shell closes on Escape (detail.js,
  // weather.js) - this one was click-only, so a keyboard user had to Tab to
  // Cancel. The shared focus trap only implements Tab.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("#libEditModal").classList.contains("hidden")) return;
    e.preventDefault();
    $("#libEditModal").classList.add("hidden");
    _editTarget = null;
  });
}
