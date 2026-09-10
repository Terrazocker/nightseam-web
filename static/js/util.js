/* shared helpers, formatting and notifications */

export const $  = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

export async function api(path, opts) {
  const { timeout = 30000, ...o } = opts || {};
  // a hung local request must not wedge the UI forever; the night loader
  // passes its own abort signal and is exempt, and long operations (a backup
  // import of a multi-GB library) opt out with `timeout: 0`
  let timeoutCtl = null, timer = null;
  if (!o.signal && timeout > 0) {
    timeoutCtl = new AbortController();
    timer = setTimeout(() => timeoutCtl.abort(), timeout);
  }
  let r;
  try {
    r = await fetch(path, { ...o, signal: timeoutCtl ? timeoutCtl.signal : o.signal });
  } catch (e) {
    if (timeoutCtl && timeoutCtl.signal.aborted) {
      const err = new Error("Request timed out");
      err.status = 0;
      throw err;
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    if (!o.silent) toast(`Request failed: ${msg}`);
    throw err;
  }
  return r.json();
}

export const parseUTC = iso => new Date(iso + "Z");
export const fmtHM = iso => iso ? fmtT(parseUTC(iso)) : "--:--";
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

/* ---------------- timezone handling ----------------
   All server payload times are UTC; rendering applies the effective zone.
   The effective zone is the user's `timezone` setting (IANA name) or the
   machine zone - both applied per instant, so DST at the *selected date* is
   always correct (planning a December night in August no longer uses the
   August offset). */
const MACHINE_ZONE = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch { return ""; }
})();
let _zone = "";
export function setDisplayZone(z) {
  _zone = "";
  if (z) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: z }); _zone = z; }
    catch { /* invalid zone -> machine local */ }
  }
}
export function effZone() { return _zone || MACHINE_ZONE; }
function tzOpts() { const z = effZone(); return z ? { timeZone: z } : {}; }
export const fmtT = d => d ? d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", ...tzOpts()}) : "--:--";
export const zoneHour = d => {
  const z = effZone();
  if (!z || !d) return d ? d.getHours() : 0;
  const parts = new Intl.DateTimeFormat("en-US",
    { timeZone: z, hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return parseInt((parts.find(p => p.type === "hour") || {}).value || "0", 10);
};
export const todayLocal = () => new Date().toLocaleDateString("sv", tzOpts());
export const fmtDT = iso => iso ? parseUTC(iso).toLocaleString("sv",
  {year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", ...tzOpts()}) : "\u2014";

/* UTC offset in minutes EAST of UTC, in effect at local noon of YYYY-MM-DD.
   This is the API's convention - app/planning.local_utc() computes
   `local - tz_min` - and it is the OPPOSITE sign of Date#getTimezoneOffset()
   (which is minutes WEST): for Berlin it returns +120, for Los Angeles -420. */
export function tzOffAt(dateStr) {
  const [y, m, d] = (dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return -new Date().getTimezoneOffset();
  const z = effZone();
  if (!z) return -new Date(y, m - 1, d, 12).getTimezoneOffset();
  let ms = Date.UTC(y, m - 1, d, 12);
  for (let i = 0; i < 3; i++) {
    ms = Date.UTC(y, m - 1, d, 12) - zoneOffsetMin(z, ms) * 60000;
  }
  return -zoneOffsetMin(z, ms);
}
/* Offset in minutes WEST of UTC (the Date#getTimezoneOffset convention) for
   `zone` at instant `ms`. */
function zoneOffsetMin(z, ms) {
  const parts = new Intl.DateTimeFormat("en-US",
    { timeZone: z, hour12: false, timeZoneName: "shortOffset" })
    .formatToParts(new Date(ms));
  const tz = (parts.find(p => p.type === "timeZoneName") || {}).value || "";
  const m = tz.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "-" ? 1 : -1) *
    (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10));
}

/* parse a decimal number with a comma or dot separator (German locale).
   Returns NaN for empty/invalid input. */
export const num = v => {
  if (v == null || v === "") return NaN;
  const n = Number(String(v).trim().replace(",", "."));
  return n;
};

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

/* free space left/right of the tab content (px per side) */
export function applyEdgeSpace(px) {
  document.documentElement.style.setProperty("--edge-space", px + "px");
  const s = $("#edgeSpace");
  if (s) s.value = px;
  const v = $("#edgeSpaceVal");
  if (v) v.textContent = px + "px";
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

/* ------------------------------------------------------------------ a11y */

/* Wrap Tab focus inside the first open [role=dialog] so keyboard users
   cannot tab behind a modal. One delegated listener covers every modal. */
export function initFocusTrap() {
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  document.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    const dialog = document.querySelector('[role="dialog"]:not(.hidden)');
    if (!dialog) return;
    const els = dialog.querySelectorAll(FOCUSABLE);
    if (!els.length) { e.preventDefault(); return; }
    const first = els[0], last = els[els.length - 1];
    const cur = document.activeElement;
    if (e.shiftKey && (cur === first || !dialog.contains(cur))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault(); first.focus();
    } else if (!dialog.contains(cur)) {
      // focus arrived from outside (e.g. after open) - pin to the first
      e.preventDefault(); first.focus();
    }
  });
}

/* Keyboard activation for click-only controls (role=button on a div). */
export function bindKeyboardClick(el, fn) {
  if (!el) return;
  el.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  });
}
