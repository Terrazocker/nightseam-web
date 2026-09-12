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
    """A dead worker must fall back to the in-thread build, not hang."""
    boot(c)
    c.page.evaluate("() => { window.__NS_DEBUG_WORKER = true; }")
    killed = c.page.evaluate("() => window.__NS_KILL_WORKER()")
    c.expect(killed is False or killed is True,
             "the dev kill hook must be callable when armed")
    arm_night_loaded(c)
    set_date(c, "2026-08-17")
    wait_night_loaded(c)
    c.expect(rows(c) > 0, "the sync fallback must still produce a plan")
    c.page.evaluate("() => window.__NS_REVIVE_WORKER()")
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
    prev = None
    for x0, x1, want_fov, want_az in cases:
        c.page.set_input_files("#panoFile", png)
        # wait for the NEW panorama to be selected (a stale id means the upload
        # round-trip has not landed yet) and its image decoded
        c.page.wait_for_function(
            """(prev) => window.Pano && window.Pano.cur
                 && window.Pano.cur.id !== prev
                 && window.Pano.img && window.Pano.img.complete""",
            arg=prev, timeout=30000)
        pid = c.page.evaluate("() => window.Pano.cur.id")
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
