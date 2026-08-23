/* first-run wizard: welcome -> location -> panorama */

import { $, api, watchCaps, esc } from "./util.js";
import { S } from "./state.js";
import { applyCfgToUI } from "./setup.js";
import { loadNight } from "./night.js";

let _bound = false;
let _step = 0;

const STEPS = [
  {
    title: "Welcome to AstroPilot",
    body: () => `
      <p>AstroPilot plans deep-sky imaging sessions around <b>your</b> sky:</p>
      <ul style="margin:8px 0 0 18px;line-height:1.7">
        <li>197 curated targets &mdash; plus your own custom objects</li>
        <li>a painted horizon mask from a phone panorama</li>
        <li>altitude charts showing exactly where trees block your view</li>
        <li>framing previews for your camera + telescope</li>
      </ul>
      <p style="margin-top:10px" class="hint">A few quick steps and you are ready.</p>`,
  },
  {
    title: "Where do you observe?",
    body: () => `
      <form id="wizForm" class="formrow" style="flex-direction:column;align-items:stretch">
        <input id="wizName" placeholder="Site name (e.g. Backyard)" value="Backyard">
        <div style="display:flex;gap:8px">
          <input id="wizLat" type="number" step="0.0001" min="-89.9" max="89.9"
                 placeholder="Latitude" required style="flex:1">
          <input id="wizLon" type="number" step="0.0001" min="-180" max="180"
                 placeholder="Longitude" required style="flex:1">
          <input id="wizElev" type="number" step="1" value="0" title="elevation m" style="width:80px">
        </div>
        <button type="button" id="wizGeo" class="ghost">Use my location</button>
      </form>
      <p id="wizCapsWarn" class="hint hidden" style="color:var(--warn)">&#9888; Caps Lock is ON</p>
      <p class="hint">Coordinates drive every altitude calculation. You can add more
      sites later under Setup.</p>`,
    validate: async () => {
      const lat = parseFloat($("#wizLat").value);
      const lon = parseFloat($("#wizLon").value);
      if (isNaN(lat) || isNaN(lon)) { alert("Please enter latitude and longitude."); return false; }
      await api("/api/sites", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name: $("#wizName").value || "Backyard",
                               lat, lon, elev: +($("#wizElev").value || 0) })});
      S.cfg = await api("/api/state");
      applyCfgToUI();     // site select in the header must know the new site
      await loadNight();  // first real night computation for this location
      return true;
    },
  },
  {
    title: "Where should your captures live?",
    body: () => `
      <p>AstroPilot can catalog the images you have already taken. When you
      import .fit / .fits files they are <b>copied</b> into an archive folder
      on this computer &mdash; your originals never move.</p>
      <form id="wizForm" class="formrow" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:8px">
          <input id="wizArcDir" spellcheck="false" style="flex:1"
                 value="${esc(S.cfg.image_dir || "")}">
          <button type="button" id="wizArcBrowse" class="ghost">Browse...</button>
        </div>
      </form>
      <p class="hint">Leave the default if you are unsure &mdash; you can change
      the folder anytime under the <b>Import Exposures</b> tab.</p>`,
    validate: async () => {
      const v = $("#wizArcDir").value.trim();
      await api("/api/settings", { method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ image_dir: v })});
      return true;
    },
  },
  {
    title: "Teach AstroPilot your horizon",
    body: () => `
      <p>The most powerful feature: show it which parts of your sky are blocked
      by trees or houses.</p>
      <ol style="margin:8px 0 0 18px;line-height:1.7">
        <li>Stand at your telescope and shoot a 360&deg; panorama (phone pano mode).</li>
        <li>Open the <b>Horizon &amp; Obstacles</b> tab and import it.</li>
        <li>Match the N/E/S/W labels with reality, paint over obstacles, done.</li>
      </ol>
      <p style="margin-top:10px" class="hint">Until then every target is treated as
      unobstructed &mdash; you can refine the mask anytime.</p>`,
    nextLabel: "Open panorama editor \u2192",
  },
];

export function openWizard() {
  $("#wizardModal").classList.remove("hidden");
  if (!_bound) {
    _bound = true;
    bind();
  }
  _step = 0;
  renderStep();
}

/* the location step is mandatory: no skipping until a site exists */
function updateSkipGate() {
  const hasSite = S.cfg.sites.length > 0;
  $("#wizSkip").classList.toggle("hidden", !hasSite);
}

function bind() {
  $("#wizNext").addEventListener("click", next);
  $("#wizBack").addEventListener("click", () => { if (_step > 0) { _step--; renderStep(); } });
  $("#wizSkip").addEventListener("click", finish);

  document.addEventListener("click", e => {
    if (e.target.id === "wizGeo" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        $("#wizLat").value = pos.coords.latitude.toFixed(4);
        $("#wizLon").value = pos.coords.longitude.toFixed(4);
      }, () => {}, {});
    }
    if (e.target.id === "wizArcBrowse") {
      const bridge = window.pywebview && window.pywebview.api;
      if (!bridge || !bridge.pick_archive_dir) {
        alert("Folder dialog is only available in the native window - type the path instead.");
        return;
      }
      bridge.pick_archive_dir($("#wizArcDir").value.trim()).then(dir => {
        if (dir) $("#wizArcDir").value = dir;
      });
    }
  });
}

async function next() {
  const st = STEPS[_step];
  if (st.validate && !(await st.validate())) return;
  updateSkipGate();
  if (_step >= STEPS.length - 1) { await finish(); switchToHorizon(); return; }
  _step++;
  renderStep();
}

function renderStep() {
  const st = STEPS[_step];
  $("#wizTitle").textContent = st.title;
  $("#wizBody").innerHTML = typeof st.body === "function" ? st.body() : st.body;
  $("#wizNext").textContent = st.nextLabel ||
      (_step === STEPS.length - 1 ? "Finish" : "Next \u2192");
  $("#wizBack").classList.toggle("hidden", _step === 0);
  // Caps Lock warning while typing coordinates
  if (_step === 1) watchCaps($("#wizForm"), $("#wizCapsWarn"));
  updateSkipGate();
}

async function finish() {
  try {
    await api("/api/settings", { method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ wizard_done:true })});
  } catch (err) {}
  $("#wizardModal").classList.add("hidden");
}

function switchToHorizon() {
  // route through the real tab handler so Pano.onShow() runs
  const btn = document.querySelector('#tabs .tab[data-tab="horizon"]');
  if (btn) btn.click();
}
