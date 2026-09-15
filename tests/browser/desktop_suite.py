"""Desktop browser checks against the PACKED exe (tests/browser/harness.py
runs `dist/NightSeam.exe --no-browser` in a throwaway temp dir, so the user's
real database is never touched).  The UI served at `/` is `static/`."""

from __future__ import annotations

import struct
import tempfile
import zlib
from pathlib import Path

from harness import check

COUNT_RE = r"filtered"
READY = "#targetRows tr[data-id]"

# TR-04 (0.6.32 review): installed BEFORE the app boots so the wrapper sees the
# worker the app really creates. `__NS_KILL_WORKER` claims to terminate it and
# null it out; counting real `terminate()` calls (and later `new Worker()` calls)
# is what makes the sync-fallback check able to fail.
WATCH_WORKERS = """
(() => {
  const Orig = window.Worker;
  window.__nsWorkerCtor = 0;
  window.__nsWorkerTerm = 0;
  if (typeof Orig !== 'function') return;
  window.Worker = function (...args) {
    const w = new Orig(...args);
    const term = w.terminate.bind(w);
    w.terminate = () => { window.__nsWorkerTerm++; return term(); };
    window.__nsWorkerCtor++;
    return w;
  };
})();
"""


def boot(c):
    c.goto("/")
    c.page.wait_for_selector(READY, state="attached", timeout=90000)
    c.page.wait_for_function(
        """() => { const n = document.querySelector('#nightInfo');
                   return n && n.textContent.trim().length > 8; }""",
        timeout=90000)
    c.page.wait_for_function(
        """() => { const b = document.querySelector('#busy');
                   return !b || b.classList.contains('hidden'); }""",
        timeout=90000)


def text(c, selector: str) -> str:
    """textContent even when the element is on an inactive (hidden) tab."""
    return (c.page.evaluate(
        """(sel) => document.querySelector(sel)?.textContent || ''""",
        selector) or "").strip()


def count_text(c) -> str:
    return text(c, "#resultCount")


def rows(c) -> int:
    return c.page.locator(READY).count()


def arm_night_loaded(c):
    c.page.evaluate(
        """() => { window.__gateNight = false;
             document.addEventListener('night:loaded',
               () => { window.__gateNight = true; }, { once: true }); }""")


def wait_night_loaded(c, timeout: float = 90000.0):
    c.page.wait_for_function("() => window.__gateNight === true", timeout=timeout)
    c.page.wait_for_function(
        """() => { const b = document.querySelector('#busy');
                   return !b || b.classList.contains('hidden'); }""", timeout=20000)


def set_date(c, iso: str):
    c.page.evaluate(
        """(d) => { const el = document.querySelector('#dateInput');
             el.value = d;
             el.dispatchEvent(new Event('change', { bubbles: true })); }""", iso)


# ---------------------------------------------------------------- checks

@check("desktop-boot", "desktop")
def desktop_boot(c):
    boot(c)
    ver = text(c, "#versionTag")
    c.expect("NightSeam" in ver and any(ch.isdigit() for ch in ver),
             f"version tag missing: {ver!r}")
    c.expect(rows(c) > 0, "the target table must render rows")
    info = text(c, "#nightInfo")
    c.expect(("Sunset" in info) or ("Sun" in info),
             f"the night summary must be populated: {info[:120]!r}")
    c.assert_clean()


@check("desktop-worker-date-change", "desktop")
def desktop_worker_date_change(c):
    """FIX-1 scenario: a date change must clear the busy chip and keep a plan."""
    boot(c)
    c.page.evaluate("() => { window.__NS_DEBUG_WORKER = true; }")
    arm_night_loaded(c)
    set_date(c, "2026-08-16")
    wait_night_loaded(c)
    c.expect(rows(c) > 0, "a superseded/edited night must still render targets")
    c.expect("of" in count_text(c), f"the count must be populated: {count_text(c)!r}")
    c.assert_clean()


@check("desktop-worker-kill-sync-fallback", "desktop")
def desktop_worker_kill_sync_fallback(c):
    """A dead worker must fall back to the in-thread build, not hang.

    TR-04 (0.6.32 review): this check could not fail. It asserted
    `killed is False or killed is True` (true for any bool) and then ran the
    plain date-change sequence `desktop-worker-date-change` already covers -
    a no-op `__NS_KILL_WORKER` was undetectable. It now asserts the hook's REAL
    effect (the live Worker instance is terminated), that the fallback still
    produced a plan, and that after `__NS_REVIVE_WORKER` the next build
    constructs a FRESH worker - which is only true if the kill truly disposed of
    the old one (a no-op kill leaves it alive and is reused)."""
    c.page.add_init_script(WATCH_WORKERS)
    boot(c)
    c.page.evaluate("() => { window.__NS_DEBUG_WORKER = true; }")
    killed = c.page.evaluate("() => window.__NS_KILL_WORKER()")
    c.expect(killed is True, "the dev kill hook must report that it ran when armed")
    terminated = c.page.evaluate("() => window.__nsWorkerTerm")
    c.expect(terminated >= 1,
             f"the kill hook must TERMINATE the live worker, not just claim it "
             f"(terminate() calls: {terminated})")
    arm_night_loaded(c)
    set_date(c, "2026-08-17")
    wait_night_loaded(c)
    c.expect(rows(c) > 0, "the sync fallback must still produce a plan")
    c.expect("of" in count_text(c), f"the count must be populated: {count_text(c)!r}")
    revived = c.page.evaluate("() => window.__NS_REVIVE_WORKER()")
    c.expect(revived is True, "the dev revive hook must report that it ran")
    constructed = c.page.evaluate("() => window.__nsWorkerCtor")
    arm_night_loaded(c)
    set_date(c, "2026-08-18")
    wait_night_loaded(c)
    c.expect(c.page.evaluate("() => window.__nsWorkerCtor") > constructed,
             "after the revive the next build must construct a FRESH worker - "
             "proof the kill really disposed of the old one")
    c.assert_clean()


@check("desktop-pref-rescore", "desktop")
def desktop_pref_rescore(c):
    """A client-side min-alt change re-derives without a reload."""
    boot(c)
    before = count_text(c)
    before_val = text(c, "#muaVal")
    c.page.evaluate(
        """() => { const s = document.querySelector('#minUsefulAlt');
             const v = Number(s.value);
             s.value = String(Math.min(Number(s.max), v + 15));
             s.dispatchEvent(new Event('input', { bubbles: true }));
             s.dispatchEvent(new Event('change', { bubbles: true })); }""")
    try:
        c.page.wait_for_function(
            """(prev) => (document.querySelector('#resultCount')?.textContent
                          || '').trim() !== prev""", arg=before, timeout=15000)
    except Exception:
        raise AssertionError(f"min-alt change did not re-derive ({before!r})")
    c.expect(text(c, "#muaVal") != before_val,
             "the min-alt readout must follow the slider")
    c.assert_clean()


@check("desktop-advanced-mode", "desktop")
def desktop_advanced_mode(c):
    """Advanced mode ships 12k objects and still renders responsively."""
    boot(c)
    c.page.evaluate(
        """() => fetch('/api/settings', { method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ adv_mode: true }) })""")
    c.goto("/")
    c.page.wait_for_selector("#resultCount", state="attached", timeout=90000)
    c.page.wait_for_function(
        """() => /\\d+ of (\\d{4,}) objects/.test(
                     document.querySelector('#resultCount')?.textContent || '')""",
        timeout=180000)
    total = int(c.page.evaluate(
        """() => { const m = (document.querySelector('#resultCount')?.textContent || '')
                     .match(/of (\\d+) objects/); return m ? Number(m[1]) : 0; }"""))
    c.expect(total >= 10000, f"advanced mode total too small: {total}")
    c.page.wait_for_function(
        """() => { const b = document.querySelector('#busy');
                   return !b || b.classList.contains('hidden'); }""", timeout=60000)
    c.expect(rows(c) > 0, "advanced mode must render rows")
    c.page.evaluate(
        """() => fetch('/api/settings', { method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ adv_mode: false }) })""")
    c.assert_clean()


@check("desktop-catalog-tier-minvis", "desktop")
def desktop_catalog_tier_minvis(c):
    """0.6.30: the targets table leads with the popularity TIER (A-F letters, and
    the tier sort is the DEFAULT) and the Min-visibility slider gates the LIST.
    Same method as the web, and the popularity source SCORE never appears."""
    boot(c)
    heads = c.page.evaluate(
        """() => Array.from(document.querySelectorAll('#targetTable thead th'))
                   .map(th => th.textContent.trim())""")
    c.expect("Tier" in heads, f"the targets table must have a Tier column: {heads}")
    c.expect(c.page.evaluate("() => document.querySelector('#fSort').value") == "tier",
             "the tier sort must be the default")

    tiers = c.page.evaluate(
        """() => Array.from(document.querySelectorAll('#targetRows .tierbadge'))
                   .map(e => e.textContent.trim())""")
    c.expect(len(tiers) >= 10, f"expected tier letters in the table, got {len(tiers)}")
    c.expect(set(tiers) <= set("ABCDEF"), f"tier letters must be A-F: {set(tiers)}")
    order = {t: i for i, t in enumerate("ABCDEF")}
    c.expect([order[t] for t in tiers] == sorted(order[t] for t in tiers),
             f"the default view must be sorted A->F: {tiers[:12]}")

    # the score itself must never be rendered: the top popularity values cannot
    # collide with a magnitude/size/percentage, so finding one in a row is a leak
    leaked = c.page.evaluate(
        """async () => {
             const txt = Array.from(document.querySelectorAll('#targetRows tr'))
                              .slice(0, 25).map(tr => tr.textContent).join(' ');
             const cat = await (await fetch('/api/catalog')).json();
             const top = cat.map(o => Number(o.popularity) || 0)
                            .sort((a, b) => b - a).slice(0, 50).map(String);
             return top.filter(p => p.length >= 5 && txt.includes(p));
           }""")
    c.expect(not leaked, f"a popularity SCORE leaked into the table: {leaked[:3]}")

    before = rows(c)
    c.page.evaluate(
        """() => { const el = document.querySelector('#fMinVis');
                   el.value = 60;
                   el.dispatchEvent(new Event('input', { bubbles: true })); }""")
    c.page.wait_for_function(
        """() => /below 60%/.test(document.querySelector('#resultCount')?.textContent || '')""",
        timeout=60000)
    pcts = c.page.evaluate(
        """() => Array.from(document.querySelectorAll('#targetRows tr'))
                   .map(tr => parseInt(tr.children[8]?.textContent || '', 10))
                   .filter(v => Number.isFinite(v))""")
    c.expect(pcts and min(pcts) >= 60,
             f"a row below the threshold survived the gate: {sorted(pcts)[:5]}")
    c.expect(rows(c) < before, "the 60% gate must remove rows")

    # 0 disables the gate again
    c.page.evaluate(
        """() => { const el = document.querySelector('#fMinVis');
                   el.value = 0;
                   el.dispatchEvent(new Event('input', { bubbles: true })); }""")
    c.page.wait_for_function(
        """() => !/below/.test(document.querySelector('#resultCount')?.textContent || '')""",
        timeout=60000)
    c.expect(rows(c) >= before, "0% must show every row again")
    c.page.evaluate(
        """() => fetch('/api/settings', { method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ min_vis: 1 }) })""")

    # ---- layout stability: progress and counts must not move anything -------
    def desk_geometry():
        return c.page.evaluate(
            """() => { const tb = document.querySelector('#topbar');
                 const t = document.querySelector('#targetTable');
                 const ths = Array.from(t.querySelectorAll('thead th'))
                              .map(th => Math.round(th.getBoundingClientRect().width));
                 return { barH: Math.round(tb.getBoundingClientRect().height),
                          cols: ths }; }""")

    g0 = desk_geometry()
    c.page.evaluate(
        """() => { const b = document.querySelector('#busy');
             b.classList.remove('hidden');
             document.querySelector('#busy .busy-txt').textContent =
               'computing visibility… 100%'; }""")
    c.page.wait_for_timeout(200)
    g1 = desk_geometry()
    c.page.evaluate(
        """() => { const b = document.querySelector('#busy');
             b.classList.add('hidden');
             document.querySelector('#busy .busy-txt').textContent = ''; }""")
    c.page.wait_for_timeout(200)
    g2 = desk_geometry()
    c.expect(g0["barH"] == g1["barH"] == g2["barH"],
             f"the busy chip moves the topbar: {g0['barH']} -> {g1['barH']} -> {g2['barH']}")
    c.expect(g0["cols"] == g1["cols"],
             f"the columns changed when the status appeared: {g0['cols']} -> {g1['cols']}")

    c.page.evaluate(
        """() => { document.querySelector('#resultCount').textContent =
             '12,176 of 12,176 objects · 1,234 below 60% · filtered'; }""")
    c.page.wait_for_timeout(200)
    g3 = desk_geometry()
    c.expect(g3["barH"] == g0["barH"],
             f"the result count re-wrapped the filter bar: {g0['barH']} -> {g3['barH']}")
    c.assert_clean()


@check("desktop-scrub-window", "desktop")
def desktop_scrub_window(c):
    """View-full-day widens the scrub to the whole day and clamps."""
    boot(c)

    def span():
        return c.page.evaluate(
            """() => { const s = document.querySelector('#timeSlider');
                 return { min: Number(s.min), max: Number(s.max),
                          value: Number(s.value) }; }""")

    before = span()
    c.page.evaluate(
        """() => { const cb = document.querySelector('#viewFullDay');
             cb.checked = true;
             cb.dispatchEvent(new Event('change', { bubbles: true })); }""")
    try:
        c.page.wait_for_function(
            """(prev) => { const s = document.querySelector('#timeSlider');
                 return (Number(s.max) - Number(s.min)) > prev; }""",
            arg=before["max"] - before["min"], timeout=15000)
    except Exception:
        raise AssertionError("View full day did not widen the scrub range")
    after = span()
    c.expect(after["min"] <= after["value"] <= after["max"],
             f"the selected time must stay inside the range: {after}")
    label = text(c, "#timeLabel")
    c.expect(label, "the scrub must carry a heading/time label")
    c.assert_clean()


def _wide_png(w: int = 1024, h: int = 16) -> Path:
    """A real RGB PNG wide enough that a crop keeps >=16 px (the desktop refuses
    to keep a sliver). Written once under the temp dir - no third-party lib."""
    p = Path(tempfile.gettempdir()) / "ns-crop-gate.png"
    if not p.exists():
        raw = b"".join(b"\x00" + bytes([40, 60, 90]) * w for _ in range(h))

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (struct.pack(">I", len(data)) + tag + data
                    + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
        p.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
                      + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return p


PANO_READY = """(prev) => window.Pano && window.Pano.cur
     && window.Pano.cur.id !== prev
     && window.Pano.img && window.Pano.img.complete"""


def upload_pano(c, png, prev, timeout: float = 180000.0, attempts: int = 2):
    """Upload `png` and wait for the NEW panorama to be selected and DECODED.

    TR-12 (0.6.32 review): the first upload round-trip on a COLD exe overshot
    even the 90 s budget this check was raised to (measured 91.9 s on a first
    launch, then 3.0 s on an immediate re-run of the same check), so the release
    gate could go red for a cold machine and pass on a re-run. Two changes make
    the wait robust instead of lucky: a generous 180 s budget (above the measured
    worst case) and ONE retry, which is safe because the wait asks for a
    DIFFERENT panorama id than `prev` - a second upload is simply another id."""
    last = None
    for _ in range(attempts):
        c.page.set_input_files("#panoFile", png)
        try:
            c.page.wait_for_function(PANO_READY, arg=prev, timeout=timeout)
            return c.page.evaluate("() => window.Pano.cur.id")
        except Exception as exc:  # noqa: BLE001 - retried once, then raised
            last = exc
    raise AssertionError(
        f"the panorama upload/decode round-trip did not land after {attempts} "
        f"attempt(s) of {timeout / 1000:.0f} s: {last}")


@check("desktop-pano-crop-fov", "desktop")
def desktop_pano_crop_fov(c):
    """The desktop crop must store the KEPT-band FOV (via the shared core
    helper), not the retired removed-fraction formula: select-all -> 360,
    center 80% -> 288 (the bug stored 72), off-center 20% -> 72 / az 108."""
    boot(c)
    c.page.click('.tab[data-tab="horizon"]')
    c.page.wait_for_selector("#panoFile", state="attached", timeout=30000)
    # the editor is tall; give the viewport room so the crop drag lands on the
    # canvas instead of below the fold
    c.page.set_viewport_size({"width": 1366, "height": 1500})
    png = str(_wide_png())
    cases = [
        (0.0, 1.0, 360.0, 0.0),    # select all keeps the full frame
        (0.1, 0.9, 288.0, 36.0),   # center 80%
        (0.3, 0.5, 72.0, 108.0),   # off-center 20%
    ]
    # TR-12: pay the COLD first-upload/decode cost ONCE, outside the timed cases
    # (a fresh onefile exe unpacks to %TEMP% on first launch; measured 91.9 s on
    # the old 90 s budget, 3.0 s once warm).
    prev = upload_pano(c, png, None, timeout=240000.0, attempts=2)
    c.expect(prev, "a panorama must be selected after the warm-up upload")
    for x0, x1, want_fov, want_az in cases:
        pid = upload_pano(c, png, prev)
        prev = pid
        c.expect(pid, "a panorama must be selected after upload")
        # default full-frame calibration for this fresh image
        c.page.evaluate(
            """() => { const f = document.querySelector('#fovAz');
                 f.value = '360'; f.dispatchEvent(new Event('input', { bubbles: true }));
                 const a = document.querySelector('#azOffset');
                 a.value = '0'; a.dispatchEvent(new Event('input', { bubbles: true })); }""")
        c.page.click("#toolCrop")
        c.page.locator("#panoCanvas").scroll_into_view_if_needed()
        c.page.wait_for_timeout(200)
        box = c.page.locator("#panoCanvas").bounding_box()
        c.expect(box and box["width"] > 20, "the desktop pano canvas must have a size")
        y = box["y"] + box["height"] * 0.5
        sx = box["x"] + box["width"] * x0
        ex = box["x"] + box["width"] * x1
        c.page.mouse.move(sx, y)
        c.page.mouse.down()
        for i in range(1, 9):
            c.page.mouse.move(sx + (ex - sx) * i / 8, y)
        c.page.mouse.up()
        c.page.wait_for_timeout(150)
        c.page.click("#btnCropApply")
        c.page.wait_for_function(
            """([pid, want]) => fetch('/api/panoramas').then((r) => r.json())
                 .then((rows) => { const p = rows.find((x) => x.id === pid);
                   return !!p && Math.abs(Number(p.fov) - want) < 0.5; })""",
            arg=[pid, want_fov], timeout=20000)
        row = c.page.evaluate(
            """async (pid) => { const rows = await (await fetch('/api/panoramas')).json();
                 return rows.find((r) => r.id === pid) || null; }""", pid)
        c.expect(abs(float(row["fov"]) - want_fov) < 0.5,
                 f"stored FOV must be the kept fraction for {x0}-{x1}: "
                 f"{row['fov']} vs {want_fov}")
        c.expect(abs(float(row["az_offset"]) - want_az) < 0.05,
                 f"stored az_offset for {x0}-{x1}: {row['az_offset']} vs {want_az}")
    c.assert_clean()
