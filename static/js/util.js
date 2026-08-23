/* shared helpers, formatting and notifications */

export const $  = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

export async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      if (j.detail) {
        msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      }
    } catch (e) {}
    const err = new Error(msg);
    err.status = r.status;
    if (!(opts && opts.silent)) toast(`Request failed: ${msg}`);
    throw err;
  }
  return r.json();
}

export const parseUTC = iso => new Date(iso + "Z");
export const fmtHM = iso => iso ? parseUTC(iso).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "--:--";
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
export const tzOff = () => new Date().getTimezoneOffset();

export function durStr(aIso, bIso) {
  if (!aIso || !bIso) return "";
  let m = Math.max(0, Math.round((parseUTC(bIso) - parseUTC(aIso)) / 60000));
  return `${Math.floor(m/60)}h ${String(m%60).padStart(2,"0")}m`;
}

export const TYPE_LABEL = {
  galaxy:"Galaxy", globular:"Globular", open_cluster:"Open cluster",
  nebula:"Nebula", planetary:"Planetary", supernova_remnant:"SN remnant",
  star_cloud:"Star cloud", asterism:"Asterism"
};
export const TYPE_COLOR = {
  galaxy:"#ff9e64", globular:"#ffd166", open_cluster:"#7ee787",
  nebula:"#ff7b72", planetary:"#79c0ff", supernova_remnant:"#d2a8ff",
  star_cloud:"#e3b341", asterism:"#9ca5b5"
};

export const CONST_FULL = {
  And:"Andromeda", Ant:"Antlia", Aps:"Apus", Aqr:"Aquarius", Aql:"Aquila",
  Ara:"Ara", Ari:"Aries", Aur:"Auriga", Boo:"Bootes", Cae:"Caelum",
  Cam:"Camelopardalis", Cnc:"Cancer", CVn:"Canes Venatici", CMa:"Canis Major",
  CMi:"Canis Minor", Cap:"Capricornus", Car:"Carina", Cas:"Cassiopeia",
  Cen:"Centaurus", Cep:"Cepheus", Cet:"Cetus", Cha:"Chamaeleon",
  Cir:"Circinus", Col:"Columba", Com:"Coma Berenices", CrA:"Corona Australis",
  CrB:"Corona Borealis", Crv:"Corvus", Crt:"Crater", Cru:"Crux",
  Cyg:"Cygnus", Del:"Delphinus", Dor:"Dorado", Dra:"Draco", Equ:"Equuleus",
  Eri:"Eridanus", For:"Fornax", Gem:"Gemini", Gru:"Grus", Her:"Hercules",
  Hor:"Horologium", Hya:"Hydra", Hyi:"Hydrus", Ind:"Indus", Lac:"Lacerta",
  Leo:"Leo", LMi:"Leo Minor", Lep:"Lepus", Lib:"Libra", Lup:"Lupus",
  Lyn:"Lynx", Lyr:"Lyra", Men:"Mensa", Mic:"Microscopium",
  Mon:"Monoceros", Mus:"Musca", Nor:"Norma", Oct:"Octans", Oph:"Ophiuchus",
  Ori:"Orion", Pav:"Pavo", Peg:"Pegasus", Per:"Perseus", Phe:"Phoenix",
  Pic:"Pictor", Psc:"Pisces", PsA:"Piscis Austrinus", Pup:"Puppis",
  Pyx:"Pyxis", Ret:"Reticulum", Sge:"Sagitta", Sgr:"Sagittarius",
  Sco:"Scorpius", Scl:"Sculptor", Sct:"Scutum", Ser:"Serpens",
  Sex:"Sextans", Tau:"Taurus", Tel:"Telescopium", Tri:"Triangulum",
  TrA:"Triangulum Australe", Tuc:"Tucana", UMa:"Ursa Major",
  UMi:"Ursa Minor", Vel:"Vela", Vir:"Virgo", Vol:"Volans", Vul:"Vulpecula"
};
export const constName = ab => CONST_FULL[ab] || ab || "";

export function phaseName(k) {
  if (k < 0.05) return "New";
  if (k < 0.35) return "Crescent";
  if (k < 0.65) return "Quarter";
  if (k < 0.95) return "Gibbous";
  return "Full";
}

/* catalog sizes are arcminutes; displayed in ONE user-chosen unit */
export function fmtSize(s, sizeUnit = "arcmin") {
  if (!s) return "\u2014";
  const parts = String(s).split(/[x\u00D7]/).map(parseFloat).filter(v => !isNaN(v));
  if (!parts.length) return esc(s);
  const f = v => {
    if (sizeUnit === "deg")   return parseFloat((v/60).toFixed(2)) + "\u00B0";
    if (sizeUnit === "arcsec") return Math.round(v*60) + "\u2033";
    return parseFloat(v.toFixed(1)) + "\u2032";
  };
  return parts.map(f).join("\u00D7");
}

export function fmtFov(am) {
  return `${parseFloat(am.toFixed(1))}\u2032 (${parseFloat((am/60).toFixed(2))}\u00B0)`;
}
export function fmtFovPair(fov_w, fov_h) {
  return `${fmtFov(fov_w)} \u00D7 ${fmtFov(fov_h)}`;
}

/* ---------------- notifications & busy state ---------------- */
export function toast(msg, type = "err", timeout = 7000) {
  const box = document.createElement("div");
  box.className = "toast " + type;
  const span = document.createElement("span");
  span.textContent = msg;
  box.appendChild(span);
  const x = document.createElement("button");
  x.className = "ghost"; x.textContent = "\u00D7";
  x.addEventListener("click", () => box.remove());
  box.appendChild(x);
  $("#toasts").appendChild(box);
  if (timeout) setTimeout(() => box.remove(), timeout);
  return box;
}

export function setBusy(on, label) {
  const el = $("#busy");
  if (!el) return;
  el.classList.toggle("hidden", !on);
  const txt = el.querySelector(".busy-txt");
  if (txt) txt.textContent = label || "";
}

/* show a warning while Caps Lock is active inside a form container */
export function watchCaps(container, warnEl) {
  if (!container || !warnEl) return;
  const upd = e => {
    let on = false;
    if (e.getModifierState) {
      try { on = e.getModifierState("CapsLock"); } catch (_) {}
    }
    warnEl.classList.toggle("hidden", !on);
  };
  container.addEventListener("keydown", upd);
  container.addEventListener("keyup", upd);
  container.addEventListener("focusout", () => warnEl.classList.add("hidden"));
}
