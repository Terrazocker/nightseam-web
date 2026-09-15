/* Tonight tab: summary cards + ranked pick lists */

import { $, esc, parseUTC, fmtHM, fmtT, TYPE_LABEL, phaseName } from "./util.js";
import { S, IMG_VER } from "./state.js";
import { statusOf, objScore, windowText, desigLine,
         curTimeISO, popularityFactor } from "./derive.js";
import { inTonightPool, TONIGHT_MAG_UNCAPPED } from "./core.js";
import { openDetail } from "./detail.js";

export function bindTonight() {
  document.addEventListener("click", e => {
    const card = e.target.closest(".pick");
    if (card && card.dataset.id) openDetail(card.dataset.id);
  });
  // the cards are keyboard-operable too (role=button in cardHTML)
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest && e.target.closest(".pick");
    if (card && card.dataset.id) { e.preventDefault(); openDetail(card.dataset.id); }
  });
}

function cardHTML({o, m}) {
  const st = statusOf(o, S.tIdx);
  return `<div class="pick ${st.code==="blk"?"blocked":st.code==="low"||st.code==="hor"?"low":""}" data-id="${m.id}" role="button" tabindex="0">
    <img class="pick-thumb" loading="lazy" src="/api/object/${m.id}/image?thumb=1&v=${IMG_VER}"
      onerror="this.onerror=null;this.style.visibility='hidden'">
    <div class="pick-body">
      <div class="nm">${esc(m.primary_name)}</div>
      <div class="ds">${esc(desigLine(m))} &middot; ${TYPE_LABEL[m.otype]||""}</div>
      <div class="win">${st.text} &middot; alt ${o.alt[S.tIdx].toFixed(0)}&deg; &middot; ${o.obs_pct!=null?o.obs_pct+"% of night":"-"}</div>
      <div class="ds">${windowText(o) || ""}</div>
    </div>
  </div>`;
}

export function renderTonight() {
  if (!S.night) return;
  const N = S.night;
  // The candidate pool is core/visibility.js::inTonightPool - ONE rule shared
  // with the web, so the two apps cannot disagree about which objects may reach
  // the headline list. `TONIGHT_MAG_UNCAPPED`: the desktop's payload is built
  // for the whole catalog, so it has no browser-scoring reason to cap it (the
  // web passes its own ADV_TONIGHT_MAG_CAP there).
  const objs = N.objects
    .filter(o => inTonightPool((S.meta[o.id] || {}).vmag, !!(o.adv || (S.meta[o.id] || {})._adv),
                               TONIGHT_MAG_UNCAPPED))
    .map(o => ({o, m:S.meta[o.id]})).filter(x => x.m);
  const visCount = objs.filter(x => x.o.best && x.o.best[1]-x.o.best[0] >= 5).length;
  const darkH = N.dusk && N.dawn ? (() => {
    const mins = Math.max(0, Math.round((new Date(N.dawn+"Z") - new Date(N.dusk+"Z"))/60000));
    return `${Math.floor(mins/60)}h ${String(mins%60).padStart(2,"0")}m`;
  })() : "\u2014";

  // busiest hour: the moment with the most observable targets
  const nT = N.timeline.n;
  const counts = new Array(nT).fill(0);
  for (const x of objs) {
    if (!x.o.vis) continue;
    for (let i = 0; i < nT; i++) if (x.o.vis[i]) counts[i]++;
  }
  let bi = 0;
  for (let i = 1; i < nT; i++) if (counts[i] > counts[bi]) bi = i;

  $("#tonightCards").innerHTML = `
    <div class="card"><div class="k">Dark time</div><div class="v">${darkH}</div>
      <div class="s">${fmtHM(N.dusk)} &ndash; ${fmtHM(N.dawn)}</div></div>
    <div class="card"><div class="k">Moon</div><div class="v">${Math.round(N.moon_illum*100)}%</div>
      <div class="s">${phaseName(N.moon_illum)}</div></div>
    <div class="card"><div class="k">Busiest hour</div>
      <div class="v">${counts[bi] ? fmtHM(N.timeline.times_iso[bi]) : "\u2014"}</div>
      <div class="s">${counts[bi]} of ${objs.length} targets observable</div></div>
    <div class="card"><div class="k">Targets w/ clear window</div><div class="v">${visCount}</div>
      <div class="s">of ${objs.length} catalog objects</div></div>`;

  const now = objs.filter(x => statusOf(x.o, S.tIdx).code === "vis")
                  .sort((a,b) => {
                    const d = objScore(b.o) - objScore(a.o);
                    return d !== 0 ? d : popularityFactor(b.m) - popularityFactor(a.m);
                  }).slice(0,8);
  $("#nowHeading").textContent = "Best targets at " + fmtT(parseUTC(curTimeISO()));
  $("#topPicks").innerHTML = now.length ? now.map(cardHTML).join("") :
     '<p class="hint">Nothing observable at the selected moment &mdash; scrub the time slider.</p>';

  const later = objs.filter(x => x.o.best && x.o.best[0] > S.tIdx)
                    .sort((a,b) => (a.o.best[0]-b.o.best[0]) || (objScore(b.o)-objScore(a.o)))
                    .slice(0,8);
  $("#laterList").innerHTML = later.length ? later.map(cardHTML).join("")
     : '<p class="hint">No further clear windows tonight.</p>';
}
