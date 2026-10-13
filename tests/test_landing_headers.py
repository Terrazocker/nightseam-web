"""Security headers for the public landing pages (landing/.htaccess).

Every landing page carries its CSP and referrer policy as meta tags. Two
protections only work as response headers: frame-ancestors (browsers ignore it
in a meta CSP) and X-Content-Type-Options. The header form must therefore be
the meta policy plus frame-ancestors 'none', so neither carrier can drift.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "landing"


def _headers():
    text = (LANDING / ".htaccess").read_text(encoding="utf-8")
    return dict(re.findall(r'^\s*Header\s+always\s+set\s+(\S+)\s+"([^"]+)"', text, re.M))


def _directives(policy):
    out = {}
    for part in policy.split(";"):
        part = part.strip()
        if part:
            name, _, value = part.partition(" ")
            out[name] = " ".join(value.split())
    return out


def _meta(page, pattern):
    m = re.search(pattern, page.read_text(encoding="utf-8"))
    assert m, f"{page.name} lost its meta tag: {pattern}"
    return m.group(1)


def test_landing_sends_the_security_headers():
    headers = _headers()
    assert headers.get("X-Content-Type-Options") == "nosniff", headers
    assert "Referrer-Policy" in headers, headers
    csp = _directives(headers.get("Content-Security-Policy", ""))
    assert csp.get("frame-ancestors") == "'none'", csp
    assert csp.get("script-src") == "'none'", csp


def test_header_and_meta_policies_agree_on_every_page():
    headers = _headers()
    header_csp = _directives(headers["Content-Security-Policy"])
    pages = sorted(LANDING.glob("*.html"))
    assert pages
    for page in pages:
        meta_csp = _directives(_meta(page, r'http-equiv="Content-Security-Policy" content="([^"]+)"'))
        assert set(header_csp) - set(meta_csp) == {"frame-ancestors"}, (page.name, header_csp, meta_csp)
        assert {k: v for k, v in header_csp.items() if k != "frame-ancestors"} == meta_csp, page.name
        assert _meta(page, r'<meta name="referrer" content="([^"]+)"') == headers["Referrer-Policy"], page.name
