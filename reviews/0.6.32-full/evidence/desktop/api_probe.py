"""Desktop-shell API probe (0.6.32 full review, desktop lane).

Runs the REAL entrypoint `main.main()` headless against a SCRATCH data dir
(`logs/desktop-probe/`), never `data/`, and checks the shell-level API contract
the desktop UI depends on:

  * /api/state, /api/catalog, /api/sites, /api/panoramas answer
  * the deleted Phase-C planning routes answer 404 (no server fallback)
  * the single-instance handoff: a second `main()` with the same scratch data
    dir exits 0 WITHOUT binding a second server (and, headless, does not open a
    window), while the first server stays the only listener
  * the idle exit path exits cleanly via /api/shutdown

Run: python reviews/0.6.32-full/evidence/desktop/api_probe.py
"""
from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

SCRATCH = ROOT / "logs" / "desktop-probe"
SCRATCH.mkdir(parents=True, exist_ok=True)

from app import paths  # noqa: E402

_ORIG_DATA_DIR = paths.data_dir
_ORIG_LOGS_DIR = paths.logs_dir
paths.data_dir = lambda: (SCRATCH / "data")      # never the user's database
paths.logs_dir = lambda: (SCRATCH / "logs")
(SCRATCH / "data").mkdir(exist_ok=True)
(SCRATCH / "logs").mkdir(exist_ok=True)

import main as nightseam_main  # noqa: E402

PORT = 8419


def _get(url: str):
    with urllib.request.urlopen(url, timeout=6) as r:
        return r.status, r.read().decode("utf-8", "replace")


def _code(url: str):
    try:
        return _get(url)[0]
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:                          # noqa: BLE001
        return f"ERR {e}"


def run_first() -> dict:
    """main() in a daemon thread; it blocks in wait_for_exit until shutdown."""
    sys.argv = ["main.py", "--no-browser", "--port", str(PORT),
                "--idle-exit-hours", "0"]
    rc: dict = {}

    def body():
        rc["code"] = nightseam_main.main()

    t = threading.Thread(target=body, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{PORT}"
    for _ in range(240):                 # first run seeds the catalog (~20-40 s)
        try:
            urllib.request.urlopen(base + "/api/state", timeout=1).read()
            break
        except Exception:                            # noqa: BLE001
            time.sleep(0.5)
    rc["thread"] = t
    return rc


rc = run_first()
base = f"http://127.0.0.1:{PORT}"
print("instance.json    :", (SCRATCH / "data" / "instance.json").read_text().strip())

st, body = _get(base + "/api/state")
cfg = json.loads(body)
print("/api/state       :", st, "keys", sorted(cfg)[:8], "version", cfg.get("version"))
print("/api/sites       :", _code(base + "/api/sites"))
print("/api/panoramas   :", _code(base + "/api/panoramas"))
print("/api/catalog     :", _code(base + "/api/catalog"))
print("/api/night (404) :", _code(base + "/api/night"))
print("/api/object/m42  :", _code(base + "/api/object/m42"))
print("/api/object/m42/image (thumb, cache only):",
      _code(base + "/api/object/m42/image?thumb=1"))

# ---- single-instance handoff ------------------------------------------------
sys.argv = ["main.py", "--no-browser", "--port", str(PORT), "--idle-exit-hours", "0"]
t0 = time.time()
rc2 = nightseam_main.main()
print("2nd main() rc    :", rc2, f"({time.time()-t0:.2f}s, headless handoff)")
print("still ONE server :", _code(base + "/api/state") == 200)

# ---- stale instance file ----------------------------------------------------
(SCRATCH / "data" / "instance.json").write_text(json.dumps({"port": 1, "pid": 1}))
print("stale url()      :", nightseam_main.existing_instance_url(),
      "| file removed:", not (SCRATCH / "data" / "instance.json").exists())

# ---- free_port --------------------------------------------------------------
print("free_port(8419)  :", nightseam_main.free_port(8419, "127.0.0.1"),
      "(busy -> random)")
print("free_port(8421)  :", nightseam_main.free_port(8421, "127.0.0.1"),
      "(free -> preferred)")

# ---- idle exit --------------------------------------------------------------
_get(base + "/api/shutdown")
for _ in range(80):
    if not rc["thread"].is_alive():
        break
    time.sleep(0.25)
print("first main() rc  :", rc.get("code"), "| thread alive:", rc["thread"].is_alive())
print("instance cleaned :", not (SCRATCH / "data" / "instance.json").exists())
print("listener after   :", _code(base + "/api/state"))
