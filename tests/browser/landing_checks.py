"""Real-browser acceptance for factual public copy and static release history."""
from __future__ import annotations

from contextlib import contextmanager
import json
import sys

from harness import Ctx, ROOT, StaticServer, _attach, _dump_failure, _install_stubs, check

sys.path.insert(0, str(ROOT / "scripts"))
from preview_site import PublicSiteHandler


@contextmanager
def landing_server(c):
    server = StaticServer(ROOT / "landing", handler_class=PublicSiteHandler)
    original = c.base
    try:
        c.base = server.start()
        yield
    finally:
        c.base = original
        server.stop()


def assert_history(c):
    page = c.page
    records = json.loads((ROOT / "landing/changelog.json").read_text(encoding="utf-8"))
    c.expect_eq([entry["version"] for entry in records], ["0.7.0", "0.1.1", "0.1.0"],
                "the independent ledger keeps the new release and fresh 0.1.0 start")
    c.expect_eq(page.locator("#clList article.release-entry").count(), len(records))
    c.expect_eq(page.locator(".release-archive").count(), 0,
                "the owner removed the old public archive")
    c.expect_in("v" + records[0]["version"], page.locator(".release-heading").first.inner_text())
    c.expect_eq(page.locator(".cl-sum").all_text_contents(), [r["summary"] for r in records])
    text = page.locator("main").inner_text()
    c.expect("0.6." not in text and "Latest tagged" not in text,
             "old version history and invented tag status must not remain")


def assert_phone_width(c):
    c.page.set_viewport_size({"width": 360, "height": 800})
    c.expect(c.page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),
             "the release page must not overflow horizontally at 360 pixels")
    c.expect(c.page.locator(".release-heading").first.is_visible(),
             "the fresh release entry must remain readable on a phone")


@check("web-landing-pages", "web")
def public_pages(c):
    source_requests = []

    def on_request(request):
        if "/changelog.json" in request.url:
            source_requests.append(request.url)

    c.page.on("request", on_request)
    with landing_server(c):
        for path in ("/", "/features.html", "/about.html", "/download.html",
                     "/privacy.html", "/impressum.html"):
            c.goto(path)
            c.page.wait_for_load_state("load")
            c.expect_eq(c.page.locator("h1").count(), 1, "each public page needs a main heading")
            nav = c.page.locator(".desktop-nav nav")
            c.expect_eq(nav.locator('a[href="download.html"]').inner_text(), "Changes",
                        "all public navigation must use Changes")
            c.expect_eq(nav.get_by_role("link", name="Download", exact=True).count(), 0,
                        "no current desktop download promotion belongs in navigation")
            c.expect(c.page.locator('a[href="/astro/"]').count() > 0, "planner must remain reachable")
            c.expect(c.page.locator('a[href*="NightSeam-latest.zip"]').count() == 0,
                     "the public site must not offer the old combined download")
            c.expect_eq(c.page.locator(".brand").inner_text(), "NightSeam", "compact wordmark must be present")
            c.expect_eq(c.page.locator(".brand-ico").count(), 0, "the approved public header has no oversized logo")
            c.expect(c.page.locator(".site-header").evaluate("e => getComputedStyle(e).display !== 'inline'"),
                     "public stylesheet must load")
            if path != "/download.html":
                text = c.page.locator("main").inner_text().lower()
                for claim in ("no server", "works offline", "servers involved",
                              "never leave the page", "nothing fetched until you click"):
                    c.expect(claim not in text, "misleading product claim remains: " + claim)
        c.goto("/")
        c.expect_eq(c.page.locator("h1").inner_text(), "Know what you can see.")
        c.expect_eq(c.page.locator(".two-facts h2").count(), 2, "Home must stay concise")
        c.expect_eq(c.page.locator(".cta").count(), 1, "Home has one primary action")
        c.goto("/features.html")
        c.page.locator(".disclosure > summary").click()
        features = c.page.locator("main").inner_text()
        for fact in ("air-quality", "Always load on startup", "coordinates and timezone",
                     "Reopening or reloading offline is not guaranteed"):
            c.expect_in(fact, features)
        c.goto("/about.html")
        c.expect(c.page.get_by_role("heading", name="Questions or feedback?").is_visible(),
                 "a verified help route must be available")
        c.expect(c.page.locator('main a[href="impressum.html"]').is_visible(),
                 "help must use the established local contact route")
        c.goto("/impressum.html")
        c.expect_eq(c.page.locator('a[href="mailto:terraza@proton.me"]').inner_text(),
                    "terraza@proton.me", "established owner contact must be preserved")
        c.goto("/privacy.html")
        for summary in c.page.locator(".disclosure > summary").all():
            summary.click()
        privacy = c.page.locator("main").inner_text()
        for fact in ("latitude, longitude and selected", "timezone", "air-quality",
                     "Always load on", "Wikipedia", "Wikimedia", "ZAP-Hosting GmbH",
                     "without a content delivery network (CDN)"):
            c.expect_in(fact, privacy)
        c.expect_eq(c.page.locator('a[href="https://zap-hosting.com/en/webhosting-rent-a-webspace/"]').inner_text(),
                    "ZAP-Hosting GmbH", "provider link must name the verified host")
        c.goto("/download.html")
        assert_history(c)
        assert_phone_width(c)
        c.expect_eq(source_requests, [], "the enhanced page must not fetch its source release JSON")
        c.assert_clean()


@check("web-landing-history-no-js", "web")
def static_history(c):
    with landing_server(c):
        # Neither unavailable JSON nor disabled JavaScript may remove the notes.
        # Routes are tripwires: static history must never request its source JSON.
        for failure in ("503", "abort"):
            context = c.page.context.browser.new_context(
                java_script_enabled=False, viewport={"width": 360, "height": 800},
                locale="en-US", color_scheme="dark", reduced_motion="reduce")
            page = context.new_page()
            child = Ctx(page, c.base, "web", c.artifacts)
            _attach(child)
            _install_stubs(page)
            requests = []

            def unavailable(route):
                requests.append(route.request.url)
                if failure == "abort":
                    route.abort()
                else:
                    route.fulfill(status=503, content_type="application/json", body="{}")

            page.route("**/changelog.json*", unavailable)
            try:
                child.goto("/download.html")
                page.wait_for_load_state("load")
                assert_history(child)
                assert_phone_width(child)
                child.expect_eq(requests, [], "release history must have no startup JSON request")
                child.expect_eq(page.locator("main p").filter(has_text="loading…").count(), 0,
                                "static notes must not be stuck on a loading placeholder")
                child.assert_clean()
            except Exception as exc:
                _dump_failure(child, "web-landing-history-no-js-" + failure, str(exc))
                raise
            finally:
                context.close()


@check("web-public-design-responsive", "web")
def public_design(c):
    """Public pages stay usable with open disclosures, zoom and no JavaScript."""
    pages = ("/", "/features.html", "/about.html", "/download.html",
             "/privacy.html", "/impressum.html")
    with landing_server(c):
        for path in pages:
            c.page.set_viewport_size({"width": 1366, "height": 900})
            c.goto(path)
            c.page.wait_for_load_state("load")
            c.expect_eq(c.page.locator('html').get_attribute('data-theme'), 'workbench')
            c.expect_eq(c.page.locator('.sky-map').get_attribute('aria-hidden'), 'true',
                        'decorative map must not become assistive content')
            c.expect_eq(c.page.locator('link[rel="canonical"]').get_attribute('href'),
                        'https://nightseam.de/' + path.lstrip('/'))
            c.expect_eq(c.page.request.get(c.url('/sky-map.svg?v=1')).status, 200)
            c.expect_eq(c.page.request.get(c.url('/astro/themes.css?v=16')).status, 200)
            c.expect_eq(c.page.request.get(c.url('/social-preview.png?v=2')).status, 200)
            ratios = c.page.evaluate("""() => {
              const channels = s => s.match(/[\\d.]+/g).slice(0,3).map(Number);
              const luminance = a => a.map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
                .reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
              const contrast = (a,b) => { const x=luminance(channels(a)), y=luminance(channels(b)); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
              const body=getComputedStyle(document.body), text=getComputedStyle(document.querySelector('.hero-sub'));
              const cta=document.querySelector('.cta'), button=cta && getComputedStyle(cta);
              return { main:contrast(body.color,body.backgroundColor), secondary:contrast(text.color,body.backgroundColor),
                button:button ? contrast(button.color,button.backgroundColor) : 100 };
            }""")
            for role, ratio in ratios.items():
                c.expect(ratio >= 4.5, f'{path}: {role} text contrast is {ratio:.2f}')
            # CSS zoom exercises enlarged content, not only a larger screenshot.
            c.page.locator('body').evaluate("e => e.style.zoom='2'")
            c.expect(c.page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                     path + ': enlarged content causes page overflow')
            c.page.locator('body').evaluate("e => e.style.zoom='1'")
            for width in (640, 360, 320):
                c.page.set_viewport_size({"width": width, "height": 800})
                c.expect(c.page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                         path + ': phone page overflows')
                action=c.page.locator('.header-cta')
                c.expect(action.is_visible(), 'planner action must be visible outside the phone menu')
                c.expect_eq(action.get_attribute('href'), '/astro/')
                c.expect(c.page.locator('.navrow').evaluate('''e => {
                    const boxes=[...e.querySelectorAll('.brand, .header-cta, .mobile-menu > summary')]
                      .map(a => a.getBoundingClientRect());
                    return boxes.every((b,i) => b.left >= 0 && b.right <= innerWidth
                      && Math.abs(b.top+b.height/2-boxes[0].top-boxes[0].height/2) < 1
                      && (i === 0 || b.left >= boxes[i-1].right));
                }'''), 'phone header actions must align without overlap')
                menu=c.page.locator('.mobile-menu > summary')
                menu.focus()
                c.page.keyboard.press('Enter')
                c.expect(c.page.locator('.mobile-menu').evaluate('e => e.open'),
                         'phone navigation must open with keyboard')
                c.expect(c.page.locator('.mobile-menu nav a[href="download.html"]').is_visible(),
                         'Changes must be reachable through the phone menu')
                c.page.keyboard.press('Enter')
                c.expect(not c.page.locator('.mobile-menu').evaluate('e => e.open'),
                         'phone navigation must close with keyboard')
                for summary in c.page.locator('main > .disclosure > summary').all():
                    if not summary.locator('..').evaluate('e => e.open'):
                        summary.focus()
                        c.page.keyboard.press('Enter')
                c.expect(c.page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                         path + ': expanded phone content overflows')
            c.assert_clean()
        # The public phone menu is a native disclosure; it needs no script.
        context = c.page.context.browser.new_context(java_script_enabled=False,
                    viewport={"width": 360, "height": 800})
        try:
            page=context.new_page()
            page.goto(c.url('/features.html'), wait_until='load')
            c.expect(page.locator('.header-cta').is_visible(),
                     'planner must remain directly reachable without JavaScript or opening a menu')
            page.locator('.mobile-menu > summary').focus()
            page.keyboard.press('Enter')
            page.locator('.disclosure > summary').click()
            c.expect(page.get_by_role('heading', name='Your first night').is_visible(),
                     'optional first-night guidance must work without JavaScript')
        finally:
            context.close()
