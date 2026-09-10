/* Startup update check: compare the running version against the release
   served on the project website (JSONP — script tags bypass CORS, which
   the plain /downloads/version.json fetch from a localhost origin cannot).
   Silent and optional: any failure is swallowed, no data is transmitted
   beyond the request itself. */

import { S } from "./state.js";
import { toast } from "./util.js";

const REMOTE = "https://nightseam.de/downloads/ns-version.js";
const SITE = "https://nightseam.de/#download";

function cmpVersion(a, b) {
  const pa = String(a || "").split(".").map(n => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

export function checkForUpdates() {
  // give the UI a moment to settle first; never block startup
  setTimeout(() => {
    if (typeof window.__NS_RELEASE !== "undefined") {
      window.__NS_RELEASE = undefined; // stale from a previous check
    }
    try {
      const script = document.createElement("script");
      script.src = REMOTE + "?v=" + Date.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        const rel = window.__NS_RELEASE;
        if (!rel || !rel.version) return;
        const local = (S.cfg && S.cfg.version) || "0";
        if (cmpVersion(rel.version, local) > 0) {
          const box = toast(
            `Update available: NightSeam v${rel.version} — click for the download page.`,
            "info", 20000);
          box.style.cursor = "pointer";
          box.addEventListener("click", () => {
            window.open(SITE, "_blank");
          });
        }
      };
      const timer = setTimeout(finish, 8000);    // remote hangs → silent
      script.onload = () => { clearTimeout(timer); finish(); };
      script.onerror = () => { clearTimeout(timer); finish(); };
      document.head.appendChild(script);
    } catch (e) { /* offline or blocked — never bother the user */ }
  }, 3000);
}