/* Weather for the active site (Open-Meteo) — load-on-demand from the top
   bar chip. Nothing is fetched until the user clicks (unless "always load
   on startup" is on). Mirrors the web version's behavior. */

import { $, api } from "./util.js";
import { S } from "./state.js";

const WX_STATE = { data: null, loading: false, error: false };

const WMO_INFO = {
  0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Icy fog"],
  51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌦️", "Dense drizzle"],
  56: ["🌧️", "Freezing drizzle"], 57: ["🌧️", "Freezing drizzle"],
  61: ["🌧️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["🌨️", "Heavy snow"], 77: ["🌨️", "Snow grains"],
  80: ["🌦️", "Rain showers"], 81: ["🌦️", "Rain showers"], 82: ["🌧️", "Violent rain showers"],
  85: ["🌨️", "Snow showers"], 86: ["🌨️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Thunderstorm, hail"],
};
function wxInfo(code) { return WMO_INFO[code] || ["🌡️", "Condition " + code]; }

function activeSite() {
  if (!S.cfg || !S.cfg.sites) return null;
  return S.cfg.sites.find(s => s.id === S.cfg.active_site_id) || S.cfg.sites[0] || null;
}

// DE-06: every request carries a generation. The panel is labelled with the
// CURRENT site, so a response that lands after the user changed the site is
// DROPPED - otherwise the chip/panel showed one site's name over another site's
// numbers, and a late failure nulled a newer success.
let _wxGen = 0;

async function loadWeather() {
  const chip = $("#wxChip");
  if (!chip) return;
  const gen = ++_wxGen;
  WX_STATE.loading = true; WX_STATE.error = false;
  wxRenderChip();
  const site = activeSite();
  const lat = site ? site.lat : (S.cfg && S.cfg.lat);
  const lon = site ? site.lon : (S.cfg && S.cfg.lon);
  if (lat == null || lon == null) {
    WX_STATE.error = true; WX_STATE.loading = false;
    wxRenderChip();
    return;
  }
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=auto&forecast_days=4";
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error("HTTP " + r.status);
    if (gen !== _wxGen) return;             // superseded by a newer site
    WX_STATE.data = await r.json();
  } catch {
    if (gen !== _wxGen) return;             // a stale failure must not win
    WX_STATE.error = true; WX_STATE.data = null;
  } finally {
    if (gen === _wxGen) WX_STATE.loading = false;
  }
  if (gen !== _wxGen) return;
  wxRenderChip();
  const panel = $("#weatherPanel");
  if (panel && !panel.classList.contains("hidden")) wxRenderPanel();
}

function wxChipText() {
  if (WX_STATE.loading) return "⏳ loading weather…";
  if (WX_STATE.error) return "⚠️ weather unavailable — click to retry";
  if (!WX_STATE.data) return "☁️ Weather — click to load";
  const c = WX_STATE.data.current;
  const [icon] = wxInfo(c.weather_code);
  return `${icon} ${Math.round(c.temperature_2m)}°C · ${Math.round(c.wind_speed_10m)} km/h`;
}

function wxRenderChip() {
  const chip = $("#wxChip");
  if (chip) chip.textContent = wxChipText();
}

function wxRenderPanel() {
  const body = $("#wxBody"), siteEl = $("#wxSite");
  if (!body) return;
  const site = activeSite();
  if (siteEl) siteEl.textContent = site ? site.name : "active site";
  if (WX_STATE.loading) { body.innerHTML = '<p class="hint">loading…</p>'; return; }
  if (WX_STATE.error || !WX_STATE.data) {
    body.innerHTML = '<p class="wx-err">⚠️ Could not load weather' +
      (WX_STATE.error ? " — are you offline?" : "") + "</p>" +
      '<p class="hint">Weather comes from Open-Meteo and is only fetched when you click the chip. Try again in a moment.</p>';
    return;
  }
  const d = WX_STATE.data, c = d.current, daily = d.daily || {};
  const [icon, label] = wxInfo(c.weather_code);
  const days = (daily.time || []).map((t, i) => {
    const dt = new Date(t + "T12:00:00");
    const [di] = wxInfo((daily.weather_code || [])[i] ?? 0);
    const hi = daily.temperature_2m_max ? Math.round(daily.temperature_2m_max[i]) : "—";
    const lo = daily.temperature_2m_min ? Math.round(daily.temperature_2m_min[i]) : "—";
    const pc = daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : null;
    return `<div class="wx-day"><div class="wx-di">${di}</div><div>${dt.toLocaleDateString(undefined, { weekday: "short" })}</div><div class="wx-t">${hi}°/${lo}°</div>${pc != null ? `<div class="wx-p">💧${pc}%</div>` : ""}</div>`;
  }).join("");
  body.innerHTML = `
    <div class="wx-now">
      <span class="wx-icon">${icon}</span>
      <span class="wx-big">${Math.round(c.temperature_2m)}°C</span>
      <span class="sub" style="flex:1">${label}<br>feels like ${Math.round(c.apparent_temperature)}°</span>
    </div>
    <div class="wx-grid">
      <div><span>Wind</span><b>${Math.round(c.wind_speed_10m)} km/h</b></div>
      <div><span>Gusts</span><b>${Math.round(c.wind_gusts_10m)} km/h</b></div>
      <div><span>Humidity</span><b>${Math.round(c.relative_humidity_2m)}%</b></div>
      <div><span>Clouds</span><b>${Math.round(c.cloud_cover)}%</b></div>
      <div><span>Rain now</span><b>${c.precipitation ? c.precipitation.toFixed(1) + " mm" : "0 mm"}</b></div>
      <div><span>Updated</span><b>${(c.time || "").slice(11, 16) || "—"}</b></div>
    </div>
    ${days ? `<div class="wx-days">${days}</div>` : ""}
    <p class="hint" style="margin-top:8px">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener" style="color:var(--accent)">Open-Meteo</a>, for the active site.</p>`;
}

/** Re-fetch when the site changed, but only if weather was already loaded
 *  (or auto-load is on) — never fetch unasked. */
export function refreshWeatherForSite() {
  if (WX_STATE.data || WX_STATE.error || (S.cfg && S.cfg.weather_auto)) loadWeather();
}

export function bindWeather() {
  const wxBtn = $("#btnWeather"), wxPanel = $("#weatherPanel");
  if (!wxBtn || !wxPanel) return;
  wxBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (wxPanel.classList.contains("hidden")) {
      wxPanel.classList.remove("hidden");
      if (!WX_STATE.data && !WX_STATE.error && !WX_STATE.loading) loadWeather();
      else wxRenderPanel();
    } else {
      wxPanel.classList.add("hidden");
    }
  });
  document.addEventListener("mousedown", e => {
    if (!(e.target instanceof Element)) return;
    if (!wxPanel.classList.contains("hidden") &&
        !e.target.closest("#weatherPanel") && !e.target.closest("#btnWeather")) {
      wxPanel.classList.add("hidden");
    }
  });
  wxPanel.addEventListener("mousedown", e => e.stopPropagation());
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") wxPanel.classList.add("hidden");
  });

  const wxAuto = $("#wxAuto");
  if (wxAuto) {
    wxAuto.checked = !!(S.cfg && S.cfg.weather_auto);
    wxAuto.addEventListener("change", async e => {
      S.cfg.weather_auto = e.target.checked;
      await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, silent: true,
        body: JSON.stringify({ weather_auto: e.target.checked })
      }).catch(() => {});
      if (e.target.checked && !WX_STATE.data) loadWeather(); // first flip loads immediately too
    });
  }
  if (S.cfg && S.cfg.weather_auto) loadWeather(); // auto-load on startup
}