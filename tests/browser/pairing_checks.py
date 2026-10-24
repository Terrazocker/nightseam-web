"""Phone pairing (docs/horizon/HORIZON_PAIRING_PLAN.md) in real Chrome.

A desktop page and a phone page, each in its own browser context (own
storage), talk through a stub of web/relay.php served by `page.route`; the
static test server cannot run PHP, and tests/test_relay.py drives the real
script. The stub keeps the relay's rules: one box per id, the offer readable
until expiry, one reply, delivered until the desktop closes the box.
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

from harness import check
from web_suite import active_horizon, boot, horizon_state, tab

HORIZON_FILE = b"0 10\n90 20.5\n180 15\n270 12.25\n"


class StubRelay:
    def __init__(self):
        self.boxes: dict[str, dict] = {}
        self.ops: list[tuple[str, str]] = []

    def handle(self, route):
        req = route.request
        q = parse_qs(urlsplit(req.url).query)
        op, box = q.get("op", [""])[0], q.get("box", [""])[0]
        self.ops.append((op, box))
        rec = self.boxes.get(box)

        def empty(status, state=None):
            headers = {"Cache-Control": "no-store", "X-Relay-Remaining": "600"}
            if state:
                headers["X-Relay-State"] = state
            route.fulfill(status=status, headers=headers, body=b"")

        def data(body):
            route.fulfill(status=200, body=body, headers={
                "Cache-Control": "no-store", "X-Relay-Remaining": "600",
                "Content-Type": "application/octet-stream"})

        if op == "open":
            self.boxes[box] = {"offer": req.post_data_buffer, "reply": None, "state": "open"}
            return empty(201, "open")
        if op == "close":
            self.boxes.pop(box, None)
            return empty(204)
        if rec is None:
            return route.fulfill(status=404, json={"error": "no such box"})
        if op == "offer":
            rec["state"] = "connected"
            return data(rec["offer"])
        if op == "reply":
            if rec["reply"] is not None:
                return route.fulfill(status=409, json={"error": "already answered"})
            rec["reply"], rec["state"] = req.post_data_buffer, "answered"
            return empty(201, "answered")
        if op == "poll":
            if rec["reply"] is None:
                return empty(204, rec["state"])
            return data(rec["reply"])
        return route.fulfill(status=400, json={"error": "unknown operation"})


def open_phone(c, relay, link):
    """A phone that has never used the planner opens the QR code's address."""
    ctx = c.page.context.browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    phone = ctx.new_page()
    errors: list[str] = []
    phone.on("pageerror", lambda e: errors.append(str(e)))
    phone.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    phone.route("**/relay.php?*", relay.handle)
    phone.goto(link.replace(c.base.rstrip("/") + "/", c.base.rstrip("/") + "/index.html"),
               wait_until="domcontentloaded")
    return ctx, phone, errors


def start_desktop_pairing(c):
    c.page.click("#hz-pair-start")
    c.page.wait_for_selector(".ed-confirm .pair-qr path", timeout=10000)
    return c.page.input_value("#pair-link")


@check("web-pairing-phone-to-desktop", "web")
def web_pairing_phone_to_desktop(c):
    """Get from phone shows a QR code for /#pair=<box>.<key>; the phone opening
    it loses the key from its address at once, even behind the first-run
    welcome, shows the desktop's site and sends its horizon; the desktop
    notices the phone, asks before adding, and adds an exact copy."""
    relay = StubRelay()
    c.page.route("**/relay.php?*", relay.handle)
    boot(c)
    tab(c, "horizon")
    before = len((horizon_state(c) or {}).get("horizons", []))
    link = start_desktop_pairing(c)
    c.expect("#pair=" in link and "?" not in link.split("#")[0][len(c.base):], f"the code carries a pairing address: {link}")
    box = link.split("#pair=")[1].split(".")[0]
    c.expect(box in relay.boxes, "the desktop opened a box")
    c.expect(b"Berlin" not in relay.boxes[box]["offer"], "the offered site travels encrypted")
    c.expect("Waiting for the phone" in c.page.inner_text("#pair-status"), "the dialog says it waits")
    c.expect_eq(c.page.evaluate("() => document.activeElement?.dataset?.cancel !== undefined"), True,
                "focus starts on Cancel")

    ctx, phone, errors = open_phone(c, relay, link)
    try:
        phone.wait_for_selector("#w-skip", state="visible", timeout=15000)
        c.expect_eq(phone.evaluate("() => location.hash"), "#horizon",
                    "the key leaves the address before the welcome asks anything")
        phone.click("#w-skip")
        phone.wait_for_selector("#hz-pair-send", timeout=20000)
        text = phone.inner_text("#hz-pair")
        c.expect("Berlin (default)" in text, f"the phone names the desktop's site: {text!r}")
        c.page.wait_for_function("() => /Phone connected/.test(document.querySelector('#pair-status').textContent)",
                                 timeout=10000)

        phone.locator("#hz-import-file").set_input_files({"name": "balcony.hrz", "mimeType": "text/plain",
                                                          "buffer": HORIZON_FILE})
        phone.wait_for_function("() => /Imported 4 points/.test(document.querySelector('#hz-note').textContent)")
        phone.wait_for_function("() => /balcony/.test(document.querySelector('#hz-pair-text').textContent)")
        sent = phone.evaluate("""() => JSON.parse(localStorage.getItem('nightseam_horizons_v2')).horizons[0]""")
        phone.click("#hz-pair-send")
        phone.wait_for_function("() => /Sent .*balcony/.test(document.querySelector('#hz-pair').textContent)",
                                timeout=10000)
        reply = (relay.boxes.get(box) or {}).get("reply") or b""
        c.expect(reply and b"balcony" not in reply, "the horizon travels encrypted")
        c.expect(not errors, f"no errors on the phone: {errors[:3]}")
    finally:
        ctx.close()

    c.page.wait_for_selector(".ed-confirm [data-ok]", timeout=15000)
    offer = c.page.inner_text(".ed-confirm")
    c.expect("From your phone" in offer and "4 skyline points" in offer, f"the desktop asks first: {offer!r}")
    c.expect_eq(len((horizon_state(c) or {}).get("horizons", [])), before, "nothing is saved before the user agrees")
    c.page.wait_for_timeout(300)
    c.expect(box not in relay.boxes and ("close", box) in relay.ops,
             "the desktop closes the box once it has decrypted the reply")
    c.page.click(".ed-confirm [data-ok]")
    c.page.wait_for_function("() => /from your phone/.test(document.querySelector('#hz-note').textContent)",
                             timeout=5000)
    added = active_horizon(c)
    c.expect_eq(added["points"], sent["points"], "an exact copy of the phone's skyline")
    c.expect(added["name"].startswith("balcony"), f"named as on the phone: {added['name']}")
    c.assert_clean()


@check("web-pairing-cancel-refuse-expire", "web")
def web_pairing_cancel_refuse_expire(c):
    """Cancel deletes the box and stops polling; a refused horizon writes
    nothing; a phone that opens an expired code says so and sends nothing."""
    relay = StubRelay()
    c.page.route("**/relay.php?*", relay.handle)
    boot(c)
    tab(c, "horizon")
    before = len((horizon_state(c) or {}).get("horizons", []))

    link = start_desktop_pairing(c)
    box = link.split("#pair=")[1].split(".")[0]
    c.page.keyboard.press("Escape")
    c.page.wait_for_selector(".ed-confirm", state="detached", timeout=5000)
    c.expect_eq(c.page.evaluate("() => document.activeElement?.id"), "hz-pair-start", "focus returns to the button")
    c.page.wait_for_timeout(300)
    c.expect(("close", box) in relay.ops and box not in relay.boxes, "Cancel deletes the box")
    polls = sum(1 for op, b in relay.ops if op == "poll" and b == box)
    c.page.wait_for_timeout(3500)
    c.expect_eq(sum(1 for op, b in relay.ops if op == "poll" and b == box), polls, "and polling stops")

    # A refused horizon: the phone's reply arrives, the user says no.
    link = start_desktop_pairing(c)
    box = link.split("#pair=")[1].split(".")[0]
    ctx, phone, errors = open_phone(c, relay, link)
    try:
        phone.wait_for_selector("#w-skip", state="visible", timeout=15000)
        phone.click("#w-skip")
        phone.wait_for_selector("#hz-pair-send", timeout=20000)
        c.expect(not phone.is_enabled("#hz-pair-send"), "with no horizon there is nothing to send yet")
        phone.click("#hz-pair-new")
        phone.wait_for_selector("#hz-capture-panel[open] #hz-cap-start", timeout=5000)
        c.expect(not phone.is_enabled("#hz-pair-send") and phone.is_visible("#hz-pair"),
                 "New horizon opens the editor with Phone capture; an empty skyline is not sent")
        phone.locator("#hz-import-file").set_input_files({"name": "roof.hrz", "mimeType": "text/plain",
                                                          "buffer": HORIZON_FILE})
        phone.wait_for_function("() => /roof/.test(document.querySelector('#hz-pair-text').textContent)")
        phone.click("#hz-pair-send")
        phone.wait_for_function("() => /Sent/.test(document.querySelector('#hz-pair').textContent)", timeout=10000)
    finally:
        ctx.close()
    # the pairing dialog also has a Cancel; the question has Add horizon
    c.page.wait_for_selector(".ed-confirm [data-ok]", timeout=15000)
    c.page.click(".ed-confirm:has([data-ok]) [data-cancel]")
    c.page.wait_for_function("() => /from the phone was not added/.test(document.querySelector('#hz-note').textContent)",
                             timeout=5000)
    c.expect_eq(len((horizon_state(c) or {}).get("horizons", [])), before, "a refusal writes nothing")

    # An expired code on the phone.
    c.allow_failed_responses("the phone's expired box answers 404 by design")
    ctx, phone, errors = open_phone(c, relay, link)
    try:
        phone.wait_for_selector("#w-skip", state="visible", timeout=15000)
        phone.click("#w-skip")
        phone.wait_for_function("() => /expired or was cancelled/.test(document.querySelector('#hz-pair')?.textContent || '')",
                                timeout=20000)
        c.expect_eq(phone.locator("#hz-pair-send").count(), 0, "nothing can be sent into an expired pairing")
        replies = sum(1 for op, _ in relay.ops if op == "reply")
        phone.click("#hz-pair-end")
        c.expect_eq(phone.locator("#hz-pair").is_hidden(), True, "Close removes the banner")
        c.expect_eq(phone.evaluate("() => document.activeElement?.id"), "hz-pair-start", "and focus stays in the list")
        c.expect_eq(sum(1 for op, _ in relay.ops if op == "reply"), replies, "and sends nothing")
    finally:
        ctx.close()
    c.assert_clean()
