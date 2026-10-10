"""WEB-REV-003: selected-target continuity across Tonight, Catalog and Sky View.

One authoritative target identity (`S.detailId`) plus explicit inspector
visibility (`S.detailOpen`) - so the selection survives closing the inspector,
view switches, rerenders, time scrubs and filters, while a deleted target clears
it everywhere. These checks run in isolated browser contexts over SYNTHETIC
catalog fixtures and custom targets (never real user data) and assert the
observable contract: inspector title, highlighted rows, the Sky View rail and
inspector visibility - not only internal state. A target that is filtered out or
below the horizon is never required to stay plotted; it must stay SELECTED with
truthful facts and no fabricated row or marker.

Registered from `scripts/check_browser.py` (see also
`tests/test_browser_gate.py::test_browser_gate_registers_the_selection_checks`).
"""

from __future__ import annotations

import json

from harness import WEB_DIR, check
from web_suite import READY, boot, click_sky_target, photo_routes, scrub_sky_to_wall, search_catalog_row, tab

# Deterministic synthetic catalog (served in place of web/catalog.json): two
# bright near-zenith targets and one deliberately faint target that the default
# magnitude limit (10) filters out of the sky plot. Coordinates place all three
# high in the sky at the pinned plan (2026-08-12, 22:00 site time at 52.5N).
FIXTURE = [
    {"id": "synalpha", "primary_name": "Synth Alpha", "otype": "nebula",
     "ra_hours": 20.5, "dec_deg": 52.0, "vmag": 5.0, "size_am": "8x6",
     "messier": None, "ngcic": None, "other": "", "constellation": "Cep",
     "blurb": "", "search": "", "popularity": 1000, "_adv": False},
    {"id": "synbeta", "primary_name": "Synth Beta", "otype": "galaxy",
     "ra_hours": 21.5, "dec_deg": 50.0, "vmag": 6.0, "size_am": "5x5",
     "messier": None, "ngcic": None, "other": "", "constellation": "Cep",
     "blurb": "", "search": "", "popularity": 800, "_adv": False},
    {"id": "synfaint", "primary_name": "Synth Faint", "otype": "open_cluster",
     "ra_hours": 20.0, "dec_deg": 55.0, "vmag": 12.0, "size_am": "3x3",
     "messier": None, "ngcic": None, "other": "", "constellation": "Cep",
     "blurb": "", "search": "", "popularity": 100, "_adv": False},
]


def custom_target(oid: str, name: str, ra_hours: float) -> dict:
    """A synthetic custom target (ids `u_*`) as saveTargetForm stores them."""
    return {"id": oid, "primary_name": name, "otype": "nebula",
            "ra_hours": ra_hours, "dec_deg": 51.5, "vmag": 5.5, "size_am": "4x3",
            "constellation": "Cep", "blurb": "", "wiki": None, "messier": None,
            "ngcic": None, "other": "", "_adv": False}


def synth_boot(c, targets=()):
    """Isolated synthetic world: 3 fixture rows + optional custom targets,
    one fixed site and a pinned date/selected instant. No user data is used."""
    c.page.route("**/catalog.json?*", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps(FIXTURE)))
    boot(c)
    c.page.evaluate("""async (targets) => {
      const WS = await import('./webstore.js');
      const Hor = await import('./horizon.js');
      await WS.saveSiteRec({ id: 'selection-check-berlin',
        name: 'Selection check Berlin', lat: 52.52, lon: 13.40, elev: 0,
        tz: null });
      for (const t of targets) await WS.saveTargetRec(t);
      Hor.setPrefs({ activeSiteId: 'selection-check-berlin', minAlt: 20,
        viewFullDay: false, moonAware: false, advMode: false });
    }""", list(targets))
    c.page.reload(wait_until="domcontentloaded")
    c.page.wait_for_selector(READY, timeout=60000)
    c.page.wait_for_function("() => typeof window.__ns_scrub_range === 'function'")
    # Pin the planned night and the selected instant explicitly - never the
    # wall clock the harness may happen to start at.
    c.page.locator("#tb-date").fill("2026-08-12")
    c.page.locator("#tb-date").dispatch_event("change")
    tab(c, "sky")
    scrub_sky_to_wall(c, "2026-08-12T22:00")


def selected_ids(c):
    """The observable selection: whichever table row is highlighted."""
    return c.page.eval_on_selector_all(
        "#tonight-rank-table tr.selected, .cat-results table tr.selected",
        "els => els.map(e => e.dataset.tonightId || e.dataset.id)")


def wait_modal_open(c):
    c.page.wait_for_selector("#modal:not([hidden]) .modal", state="visible",
                            timeout=20000)


def wait_modal_closed(c):
    c.page.wait_for_function(
        "() => document.querySelector('#modal')?.hidden === true", timeout=10000)


def inspector_title(c) -> str:
    return c.page.inner_text("#m-title").strip()


def open_row(c, object_id: str, search: str):
    search_catalog_row(c, object_id, search).click()
    wait_modal_open(c)


def expand_catalog_details(c):
    disclosure = c.page.locator("#modal .catalog-details > summary")
    if not c.page.locator("#modal .catalog-details").evaluate("el => el.open"):
        disclosure.click()


def wait_credit_settled(c):
    """The photo credit renders ASYNC and appends an `a[href]` tab stop. Settle
    it before snapshotting the inspector's tab order."""
    c.page.wait_for_function(
        """() => { const el = document.querySelector('#d-imagecredit');
             return el && !el.hidden && el.querySelector('a'); }""",
        timeout=15000)


def scrub_topbar(c, minutes: int):
    c.page.eval_on_selector(
        "#tb-scrub", """(el, m) => {
            el.value = String(m);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }""", minutes)


@check("web-sky-single-inspector", "web")
def web_sky_single_inspector(c):
    """Full details live once in the Sky rail, including across layout rebuilds."""
    synth_boot(c)
    for width in (1672, 1240, 900, 360):
        c.page.set_viewport_size({"width": width, "height": 900})
        click_sky_target(c, FIXTURE[0])
        wait_modal_open(c)
        c.expect_eq(c.page.locator("#modal").count(), 1, "one shared inspector exists")
        c.expect_eq(c.page.locator("#sky-detail-host #modal.detail-inline").count(), 1,
                    "full detail occupies the Sky rail")
        c.expect_eq(c.page.locator("#sky-selected-altitude, #sky-selected-target").count(), 0,
                    "compact facts and duplicate altitude chart are removed")
        c.expect_eq(c.page.locator("#modal .modal").get_attribute("role"), "complementary",
                    "inline details are complementary at every width")
        c.expect(c.page.locator("#modal .modal").get_attribute("aria-modal") is None,
                 "inline inspector does not isolate the map")
        c.expect(not c.page.locator("#view").evaluate("el => el.inert"), "map remains usable")
        c.expect(not c.page.locator("body").evaluate("el => el.classList.contains('detail-open')"),
                 "Sky does not reserve a second detail column")
        c.expect(c.page.evaluate("""() => {
          const side = document.querySelector('.sky-side');
          const tray = side.firstElementChild;
          return tray.matches('details.sky-controls-tray') && !tray.open &&
            tray.getBoundingClientRect().bottom <= document.querySelector('#m-title').getBoundingClientRect().top;
        }"""), "chart controls come first and start collapsed")
        c.expect(c.page.evaluate("() => document.documentElement.scrollWidth <= innerWidth + 1"),
                 f"{width}px Sky rail fits the page")
        # A full Sky rebuild must preserve the actual photo node, not destroy
        # the shared modal with #view.innerHTML or restart its image request.
        c.page.evaluate("() => { window.skyPhotoNode = document.querySelector('#objimg-wrap'); }")
        c.page.locator("#tb-date").dispatch_event("change")
        c.page.wait_for_selector("#sky-detail-host #m-title")
        c.expect_eq(inspector_title(c), "Synth Alpha", "rebuild retains the open target")
        c.expect(c.page.evaluate("() => skyPhotoNode === document.querySelector('#objimg-wrap')"),
                 "rebuild preserves the inspector photo node")
        c.page.locator("#m-close").click()
        wait_modal_closed(c)
        c.page.locator("#tb-date").dispatch_event("change")
        c.expect(c.page.locator("#modal").evaluate("el => el.hidden && el.parentElement === document.body"),
                 "closed inspector is parked safely and stays closed on rebuild")
        c.expect_in("Synth Alpha", c.page.inner_text("#sky-detail-empty"), "selected identity can be reopened")
        c.page.locator("#sky-selected-detail").click()
        wait_modal_open(c)
        c.page.get_by_role("button", name="Options", exact=True).click()
        c.page.locator("#btn-settings").click()
        c.page.wait_for_selector("#m-set-title")
        c.expect(c.page.locator("#modal").evaluate("el => el.parentElement === document.body"),
                 "Setup is outside the isolated background")
        c.expect(not c.page.locator("#modal").evaluate("el => !!el.closest('[inert]')"),
                 "Setup remains interactive after taking over inline detail")
        c.page.keyboard.press("Escape")
        wait_modal_closed(c)
        c.page.locator("#sky-selected-detail").click()
        tab(c, "catalog")
        wait_modal_closed(c)
        c.expect_eq(c.page.locator("#modal").count(), 1, "route keeps the shared modal")
        tab(c, "sky")
    c.assert_clean()


@check("web-selection-continuity", "web")
def web_selection_continuity(c):
    """Catalog -> close -> Sky View -> Tonight keeps ONE target; reopening the
    object from any surface uses the preserved identity."""
    synth_boot(c)
    tab(c, "catalog")
    open_row(c, "synalpha", "Synth Alpha")
    c.expect_eq(inspector_title(c), "Synth Alpha",
                "the inspector must show the clicked target")
    c.expect_eq(selected_ids(c), ["synalpha"],
                "selecting must highlight exactly the selected row")
    c.page.click("#m-close")
    wait_modal_closed(c)
    c.expect_eq(selected_ids(c), ["synalpha"],
                "the close button must preserve the selection and its highlight")

    tab(c, "sky")
    c.page.wait_for_selector("#sky-detail-empty")
    rail = c.page.inner_text("#sky-detail-empty")
    c.expect_in("Synth Alpha", rail,
                "Sky View must show the target selected in Catalog")
    c.expect_in('Synth Alpha', c.page.locator('#sky-selected-detail').inner_text(),
                'the Sky reopen action retains the shared selection')
    c.page.click("#sky-selected-detail")
    wait_modal_open(c)
    c.expect_eq(inspector_title(c), "Synth Alpha",
                "reopening from Sky View must reuse the preserved identity")
    c.page.click("#m-close")
    wait_modal_closed(c)

    tab(c, "tonight")
    c.wait_tonight_render()
    c.expect(c.page.locator(
        "#tonight-rank-table tr[data-tonight-id='synalpha']").evaluate(
            "el => el.classList.contains('selected')"),
        "Tonight must highlight the target selected in Catalog")
    c.expect(c.page.evaluate("() => document.querySelector('#modal')?.hidden"),
             "a view change must close the inspector")
    c.expect_eq(selected_ids(c), ["synalpha"],
                "a view change must preserve the selection")

    # requirement 9: a round trip through Horizon keeps the selection and does
    # not disturb the Horizon view's own state handling
    tab(c, "horizon")
    c.page.wait_for_selector("#pano-blank", timeout=20000)
    tab(c, "tonight")
    c.wait_tonight_render()
    c.expect_eq(selected_ids(c), ["synalpha"],
                "returning through Horizon must keep the selected target")
    c.expect(c.page.evaluate("() => document.querySelector('#modal')?.hidden"),
             "returning through Horizon must not reopen the inspector")
    c.assert_clean()


@check("web-selection-origins", "web")
def web_selection_origins(c):
    """Selections originating in Tonight and in Sky View land in the same
    identity; a deliberate Sky rail selection opens the full inspector."""
    synth_boot(c)
    # --- origin: Tonight ranked row ---
    tab(c, "tonight")
    c.wait_tonight_render()
    c.page.locator("#tonight-rank-table tr[data-tonight-id='synbeta']").click()
    wait_modal_open(c)
    c.expect_eq(inspector_title(c), "Synth Beta",
                "Tonight must open the clicked ranked target")
    c.page.keyboard.press("Escape")
    wait_modal_closed(c)
    c.expect_eq(selected_ids(c), ["synbeta"],
                "the Tonight selection must survive closing the inspector")
    tab(c, "catalog")
    c.page.wait_for_selector(".cat tbody tr[data-id]")
    c.expect_eq(selected_ids(c), ["synbeta"],
                "Catalog must highlight the target selected in Tonight")
    open_row(c, "synbeta", "Synth Beta")
    c.expect_eq(inspector_title(c), "Synth Beta",
                "opening the object again must reuse the identity")
    c.page.click("#m-close")
    wait_modal_closed(c)

    # --- origin: Sky View map ---
    tab(c, "sky")
    click_sky_target(c, FIXTURE[0])
    wait_modal_open(c)
    c.expect_eq(inspector_title(c), 'Synth Alpha',
                'map picking opens the selected object in the shared inspector')
    c.expect_eq(inspector_title(c), "Synth Alpha",
                "the map detail action must open the shared selection")
    c.page.click("#m-close")
    wait_modal_closed(c)
    # the earlier search filter must not hide the carried selection
    tab(c, "catalog")
    row = search_catalog_row(c, "synalpha", "Synth Alpha")
    c.expect(row.evaluate("el => el.classList.contains('selected')"),
             "Catalog must highlight the target selected in Sky View")
    tab(c, "tonight")
    c.wait_tonight_render()
    c.page.wait_for_selector("#tonight-rank-table tr[data-tonight-id='synalpha']")
    c.expect(c.page.locator(
        "#tonight-rank-table tr[data-tonight-id='synalpha']").evaluate(
            "el => el.classList.contains('selected')"),
        "Tonight must highlight the target selected in Sky View")
    c.assert_clean()


@check("web-selection-close-modes", "web")
def web_selection_close_modes(c):
    """Close button, Escape and the compact backdrop all preserve identity and
    highlighting; the docked panel stays complementary and the compact modal
    keeps its focus trap and focus restoration."""
    c.page.set_viewport_size({"width": 1366, "height": 900})
    # This keyboard probe needs a real credit link as its final tab stop.
    # Supply an online photo/metadata fixture now that local photos are gone.
    photo_routes(c)
    synth_boot(c)
    tab(c, "catalog")
    open_row(c, "synalpha", "Synth Alpha")
    c.expect(c.page.locator("#modal").evaluate(
        "el => el.classList.contains('detail-docked')"),
        "the wide inspector must stay docked")
    panel = c.page.locator("#modal .modal")
    c.expect_eq(panel.get_attribute("role"), "complementary",
                "the docked inspector must stay a complementary region")
    c.expect(panel.get_attribute("aria-modal") is None,
             "the docked inspector must not claim to be modal")
    # Chromium reports rects for links inside a CLOSED <details> but refuses to
    # focus them, so the disclosure must be open for a real tab-order probe.
    # The photo credit renders ASYNC and appends the final `a[href]` tab stop.
    expand_catalog_details(c)
    wait_credit_settled(c)
    c.page.locator("#d-imagecredit a").focus()
    c.page.keyboard.press("Tab")
    c.expect(not c.page.evaluate(
        "() => !!document.querySelector('#modal .modal')?.contains(document.activeElement)"),
        "Tab must continue out of the docked inspector")

    c.page.keyboard.press("Escape")
    wait_modal_closed(c)
    c.expect_eq(selected_ids(c), ["synalpha"],
                "Escape must preserve the selection and its highlight")
    open_row(c, "synalpha", "Synth Alpha")
    c.page.click("#m-close")
    wait_modal_closed(c)
    c.expect_eq(selected_ids(c), ["synalpha"],
                "the close button must preserve the selection and its highlight")

    # compact modal: dialog semantics, focus trap, focus restoration, backdrop
    c.page.set_viewport_size({"width": 900, "height": 800})
    c.page.wait_for_timeout(250)
    open_row(c, "synalpha", "Synth Alpha")
    c.page.wait_for_selector(
        "#modal:not([hidden]) .modal[role='dialog'][aria-modal='true']")
    expand_catalog_details(c)
    wait_credit_settled(c)
    # the trap must confine Tab inside the compact modal and wrap at its end
    c.page.locator("#d-imagecredit a").focus()
    c.page.keyboard.press("Tab")
    c.expect_eq(c.page.evaluate("() => document.activeElement?.id"),
                "m-close",
                "Tab at the end of the compact modal must wrap to its first stop")
    c.page.keyboard.press("Escape")
    wait_modal_closed(c)
    c.expect(c.page.evaluate(
        "() => document.activeElement?.matches('.cat tbody tr[data-id] .target-open')"),
        "closing the compact inspector must restore focus to its target button")
    c.expect_eq(selected_ids(c), ["synalpha"],
                "compact Escape must preserve the selection and its highlight")

    open_row(c, "synalpha", "Synth Alpha")
    box = c.page.locator("#modal").bounding_box()
    c.expect(box and box["width"] > 100, f"the modal wrapper must cover the page: {box}")
    c.page.mouse.click(box["x"] + 8, box["y"] + box["height"] - 8)
    wait_modal_closed(c)
    c.expect_eq(selected_ids(c), ["synalpha"],
                "the backdrop close must preserve the selection and its highlight")
    c.assert_clean()


@check("web-selection-filter-restore", "web")
def web_selection_filter_restore(c):
    """Filtering the selection out of the catalog table or the sky plot must
    not erase it, fabricate a row/marker, or replace it with a fallback - and
    restoring the filter must show the same selection again."""
    synth_boot(c)
    tab(c, "catalog")
    open_row(c, "synalpha", "Synth Alpha")
    c.page.click("#m-close")
    wait_modal_closed(c)
    # exclude it from the table
    search_catalog_row(c, "synbeta", "Synth Beta")
    c.expect_eq(c.page.locator(".cat tbody tr[data-id='synalpha']").count(), 0,
                "a filtered-out row must simply be absent")
    c.expect_eq(c.page.locator(".cat tbody tr.selected").count(), 0,
                "filtering must not fabricate a selected row or re-point the selection")
    c.expect(c.page.evaluate("() => document.querySelector('#modal')?.hidden"),
             "filtering must not reopen the inspector")
    # restore the filter: the same selection reappears on its row
    search_catalog_row(c, "synalpha", "Synth Alpha")
    c.expect_eq(selected_ids(c), ["synalpha"],
                "the selection must survive a filter excursion")

    # the faint target is excluded from the sky plot by the magnitude limit
    open_row(c, "synfaint", "Synth Faint")
    c.page.click("#m-close")
    wait_modal_closed(c)
    tab(c, "sky")
    c.page.wait_for_selector("#sky-detail-empty")
    rail = c.page.inner_text("#sky-detail-empty")
    c.expect_in("Synth Faint", rail,
                "an unplotted target must keep its identity in the Sky rail")
    c.expect_in("Not plotted", rail,
                "an unplotted selection must say so instead of disappearing")
    c.expect_in('2 catalog objects', c.page.locator('#skyChartSummary').inner_text(),
                'the faint target is excluded from the actual plot')
    c.expect(c.page.evaluate("() => document.querySelector('#modal')?.hidden"),
             "a filtered-out target must not reopen the inspector")
    # restore the filter (raise the magnitude limit): re-plotted, same selection
    c.page.evaluate("""() => { const s = document.querySelector('#sky-mag');
        s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); }""")
    c.page.wait_for_function(
        "() => document.querySelector('#skyChartSummary')?.textContent.includes('3 catalog objects')",
        timeout=10000)
    rail2 = c.page.inner_text("#sky-detail-empty")
    c.expect_in("Synth Faint", rail2,
                "restoring the filter must not re-point the selection")
    c.expect("Not plotted" not in rail2,
             f"restoring the filter must restore the plot: {rail2[:200]!r}")
    c.assert_clean()


@check("web-selection-refresh-keeps-closed", "web")
def web_selection_refresh_keeps_closed(c):
    """Time scrubs, date changes and rerenders update an OPEN inspector's facts
    without switching targets - and never revive a CLOSED one."""
    synth_boot(c)
    tab(c, "catalog")
    open_row(c, "synalpha", "Synth Alpha")
    before = c.page.inner_text("#m-selected-position")
    scrub_topbar(c, 240)
    c.page.wait_for_function(
        """(prev) => (document.querySelector('#m-selected-position')?.textContent || '')
             !== prev""", arg=before, timeout=10000)
    c.expect_eq(inspector_title(c), "Synth Alpha",
                "scrubbing must update facts without silently selecting another object")
    c.page.click("#m-close")
    wait_modal_closed(c)

    # the closed inspector stays closed through time, date and rerenders
    scrub_topbar(c, 60)
    c.page.locator("#tb-date").fill("2026-08-13")
    c.page.locator("#tb-date").dispatch_event("change")
    c.page.fill("#cat-q", "Synth")
    c.page.dispatch_event("#cat-q", "input")
    c.page.wait_for_timeout(500)
    c.expect(c.page.evaluate("() => document.querySelector('#modal')?.hidden"),
             "a closed inspector must not revive on rerender, scrub or date change")
    c.expect_eq(selected_ids(c), ["synalpha"],
                "time/date/rerender must keep the selected identity")
    c.assert_clean()


@check("web-selection-replace-and-delete", "web")
def web_selection_replace_and_delete(c):
    """A deliberate new selection replaces the old one everywhere; deleting the
    selected custom target clears its identity and closes its inspector without
    disturbing the current view."""
    synth_boot(c, [custom_target("u_synthdel1", "Synth Custom One", 20.2),
                   custom_target("u_synthdel2", "Synth Custom Two", 20.8)])
    tab(c, "catalog")
    open_row(c, "synalpha", "Synth Alpha")
    open_row(c, "synbeta", "Synth Beta")
    c.expect_eq(inspector_title(c), "Synth Beta",
                "a deliberate second selection must replace the inspector target")
    c.expect_eq(selected_ids(c), ["synbeta"],
                "a deliberate second selection must replace the selection everywhere")
    c.page.click("#m-close")
    wait_modal_closed(c)

    # delete from the inspector (Catalog origin)
    open_row(c, "u_synthdel1", "Synth Custom One")
    expand_catalog_details(c)
    c.page.click("#m-del")
    wait_modal_closed(c)
    c.expect_eq(c.page.locator(".cat tbody tr[data-id='u_synthdel1']").count(), 0,
                "the deleted custom target must leave the table")
    c.expect_eq(selected_ids(c), [],
                "a deleted target must clear its selection everywhere")

    # delete from the inspector opened in Sky View: the view must stay Sky View
    tab(c, "sky")
    click_sky_target(c, custom_target('u_synthdel2', 'Synth Custom Two', 20.8))
    wait_modal_open(c)
    expand_catalog_details(c)
    c.page.click("#m-del")
    wait_modal_closed(c)
    c.expect_eq(c.page.locator("#sky").count(), 1,
                "deleting from Sky View must not swap in another view's body")
    c.expect_in("Select a target", c.page.inner_text("#sky-detail-empty"),
                "a deleted selection must leave the Sky rail empty, not a fallback")
    tab(c, "catalog")
    c.expect_eq(selected_ids(c), [],
                "a deleted selection must leave no highlighted row")
    c.assert_clean()
