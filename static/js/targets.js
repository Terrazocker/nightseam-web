/* Targets tab: filters, sorting, paginated table rendering */

import { $, esc, api, fmtSize, TYPE_LABEL, TYPE_COLOR, constName } from "./util.js";
import { S, IMG_VER } from "./state.js";
import { statusOf, windowText, desigLine,
         objScore, filterAdvice, frameCoverage, coverageCell } from "./derive.js";

const PAGE_SIZE = 250;
let _page = 0;

function resetPage() { _page = 0; }

export function bindFilters() {
  let deb;
  $("#fSearch").addEventListener("input", () => {
    clearTimeout(deb); deb = setTimeout(() => { resetPage(); renderTargets(); }, 120);
  });
  $("#fType").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#fMag").addEventListener("input", e => {
    $("#magVal").textContent = (+e.target.value).toFixed(1);
    resetPage(); renderTargets();
  });
  $("#fUnblocked").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#fFav").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#fObserved").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#fConst").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#fSort").addEventListener("change", () => { resetPage(); renderTargets(); });
  $("#pagerPrev").addEventListener("click", () => {
    if (_page > 0) { _page--; renderTargets(true); }
  });
  $("#pagerNext").addEventListener("click", () => {
    const n = Math.ceil((S.lastRows ? S.lastRows.length : 0) / PAGE_SIZE);
    if (_page < n - 1) { _page++; renderTargets(true); }
  });
  $("#targetRows").addEventListener("click", e => {
    const star = e.target.closest("[data-fav]");
    if (star) {
      // toggle in place first - instant visual feedback, then persist
      e.preventDefault();
      e.stopPropagation();
      const id = star.dataset.fav;
      const cur = new Set(S.cfg.favorites || []);
      const on = !cur.has(id);
      on ? cur.add(id) : cur.delete(id);
      S.cfg.favorites = [...cur];
      star.classList.toggle("on", on);
      api("/api/settings", { method:"POST",
        headers:{"Content-Type":"application/json"}, silent:true,
        body: JSON.stringify({ favorites:S.cfg.favorites })}).catch(()=>{})
        .finally(() => {
          renderTargets();
          document.dispatchEvent(new CustomEvent("favs:changed"));
        });
      return;
    }
    const obs = e.target.closest("[data-obs]");
    if (obs) {
      e.preventDefault();
      e.stopPropagation();
      const id = obs.dataset.obs;
      const isObs = S.observedIds.has(id);
      const p = isObs
        ? api(`/api/object/${id}/observed`, { method: "GET" })
            .then(list => Promise.all((list || []).map(r =>
              api(`/api/object/${id}/observed/${r.id}`, { method: "DELETE", silent: true }))))
        : api(`/api/object/${id}/observed`, { method: "POST", silent: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date_obs: new Date().toISOString().slice(0, 10) }) });
      p.then(async () => {
        S.cfg = await api("/api/state");
        S.observedIds = new Set((S.cfg.observed || []).map(x => x.object_id));
        renderTargets();
      }).catch(() => {});
      return;
    }
    const tr = e.target.closest("tr[data-id]");
    if (tr) openDetail(tr.dataset.id);
  });

  // late import to avoid a circular dependency at module init
  async function openDetail(id) {
    const mod = await import("./detail.js");
    mod.openDetail(id);
  }
}

export function passesFilters(m, o) {
  const q = $("#fSearch").value.trim().toLowerCase();
  if (q && !(m.search || "").toLowerCase().includes(q)) return false;
  const ty = $("#fType").value;
  if (ty && m.otype !== ty) return false;
  const magMax = +$("#fMag").value;
  if (m.vmag != null && m.vmag > magMax + 0.001) return false;
  if ($("#fUnblocked").checked && !(o.best && o.best[1]-o.best[0] >= 3)) return false;
  if ($("#fFav") && $("#fFav").checked &&
      !(S.cfg.favorites || []).includes(m.id)) return false;
  if ($("#fObserved") && $("#fObserved").checked &&
      (S.observedIds || []).has(m.id)) return false;
  const fc = $("#fConst").value;
  if (fc && m.constellation !== fc) return false;
  return true;
}

/* populate the constellation dropdown once the catalog is loaded */
export function populateConstFilter() {
  const sel = $("#fConst");
  if (!sel || sel.dataset.done) return;
  const names = new Set();
  for (const o of S.catalog) if (o.constellation) names.add(o.constellation);
  if (!names.size) return;
  sel.dataset.done = "1";
  sel.insertAdjacentHTML("beforeend",
    [...names].sort().map(c => `<option value="${esc(c)}">${esc(constName(c))}</option>`).join(""));
}

function sortObjects(list) {
  const mode = $("#fSort").value;
  const cmp = {
    score:   (a,b) => objScore(b.o) - objScore(a.o),
    pct:     (a,b) => (b.o.obs_pct||0) - (a.o.obs_pct||0),
    maxalt:  (a,b) => b.o.max_alt - a.o.max_alt,
    beststart:(a,b) => (a.o.best?a.o.best[0]:999) - (b.o.best?b.o.best[0]:999),
    mag:     (a,b) => (a.m.vmag??99) - (b.m.vmag??99),
    name:    (a,b) => a.m.primary_name.localeCompare(b.m.primary_name)
  }[mode];
  return list.sort(cmp);
}

function thumbHTML(id) {
  return `<img class="thumb" loading="lazy" src="/api/object/${id}/image?thumb=1&v=${IMG_VER}"
    onerror="this.onerror=null;this.src='data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='">`;
}

export function renderTargets(fromPager = false) {
  if (!S.night) return;
  let rows;
  if (fromPager && S.lastRows) {
    rows = S.lastRows;
  } else {
    rows = [];
    for (const o of S.night.objects) {
      const m = S.meta[o.id];
      if (!m) continue;
      if (!passesFilters(m, o)) continue;
      rows.push({o, m});
    }
    sortObjects(rows);
    S.filteredIds = rows.map(r => r.m.id);
    S.lastRows = rows;
    // NB: the page is NOT reset here - scrub re-renders must keep it.
    // resetPage() runs in the filter/sort handlers instead.
  }
  $("#resultCount").textContent =
    `${rows.length} of ${S.catalog.length} objects` +
    (rows.length < S.catalog.length ? " \u00B7 filtered" : "");

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (_page >= pages) _page = pages - 1;
  const pageRows = rows.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE);

  const stClass = {vis:"st-vis", blk:"st-blk", low:"st-low", hor:"st-hor"};
  const unit = (S.cfg && S.cfg.size_unit) || "arcmin";
  const favs = new Set(S.cfg.favorites || []);

  $("#targetRows").innerHTML = pageRows.map(({o,m}) => {
    const st = statusOf(o, S.tIdx);
    const adv = filterAdvice(m);
    const cov = frameCoverage(m);
    const fav = favs.has(m.id);
    return `<tr data-id="${m.id}">
      <td>${thumbHTML(m.id)}</td>
      <td class="objcell"><button class="starbtn${fav?" on":""}" data-fav="${m.id}" title="mark for session">&#9733;</button><button class="obsbtn${S.observedIds.has(m.id)?" on":""}" data-obs="${m.id}" title="logged as observed (session journal)">&#10003;</button><b>${esc(m.primary_name)}</b><span>${esc(desigLine(m))}${m.constellation?" \u00B7 "+esc(constName(m.constellation)):""}</span></td>
      <td><span class="typebadge" style="color:${TYPE_COLOR[m.otype]};border-color:${TYPE_COLOR[m.otype]}55">${TYPE_LABEL[m.otype]||m.otype}</span>${adv ? " " + adv.pill : ""}</td>
      <td>${m.vmag!=null?m.vmag.toFixed(1):"&mdash;"}</td>
      <td>${fmtSize(m.size_am, unit)}</td>
      <td class="col-opt">${coverageCell(cov)}</td>
      <td>${o.max_alt.toFixed(0)}&deg;</td>
      <td title="share of the astronomical night above ${S.minAlt}\u00B0 and unobstructed">${o.obs_pct!=null?o.obs_pct+"<small>%</small>":"&mdash;"}</td>
      <td>${windowText(o)}</td>
      <td><span class="statuspill ${stClass[st.code]}">${st.text}</span></td>
    </tr>`;
  }).join("");

  const pager = $("#targetPager");
  pager.classList.toggle("hidden", pages <= 1);
  $("#pagerInfo").textContent =
    `Page ${_page + 1} / ${pages} \u00B7 ${pageRows.length} shown`;
  $("#pagerPrev").disabled = _page === 0;
  $("#pagerNext").disabled = _page >= pages - 1;
}
