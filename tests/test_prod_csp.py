"""The production-CSP check for /astro (read-only, run by the browser gate).

`python scripts/check_browser.py --prod-url https://nightseam.de/astro/` is the
only place the DEPLOYED policy can be inspected from this repo, so the parsing
and the rules live in `tests/browser/harness.py::_csp_problems` and are pinned
here with absolute cases (the gate itself needs a live URL).

Why a policy at all: the web shell is the PUBLIC origin and it loads third-party
images while holding the user's sites, rigs, targets and panoramas in IndexedDB
and localStorage - the desktop shell ships a strict CSP in `app/server.py` and
the static shell had none.
"""

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser.harness import _csp_problems, _inline_script_hashes  # noqa: E402

# The deployed policy, copied from web/.htaccess.
GOOD = (
    "default-src 'self'; script-src 'self' 'sha256-L8aiDzZyJ9k2GW9FggYfWKbcrM22h1"
    "LPcHxs0Ov+uCE='; style-src 'self'; img-src 'self' data: "
    "https://upload.wikimedia.org; connect-src 'self' https://en.wikipedia.org; "
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; "
    "object-src 'none'"
)


def test_the_repo_ships_a_policy_and_it_passes_its_own_check():
    """The header the host applies must satisfy the rules, and its inline-script
    hash must be the CURRENT one - an edited index.html bootstrap would silently
    stop applying the saved theme before paint."""
    htaccess = ROOT / "web" / ".htaccess"
    assert htaccess.is_file(), (
        "web/.htaccess is missing - the static shell then has no CSP at all")
    text = htaccess.read_text(encoding="utf-8")
    # only a real directive: prose that merely NAMES the header must not be
    # parsed (a placeholder in a comment once hijacked this assertion)
    m = re.search(r'^\s*Header\s+\S+\s+set\s+Content-Security-Policy\s+"([^"]+)"',
                  text, re.M)
    assert m, ".htaccess must set a Content-Security-Policy header"
    policy = m.group(1)
    assert _csp_problems(policy) == []
    # no 'unsafe-inline' for scripts: the shell has no inline handler
    script_src = policy.split("script-src", 1)[1].split(";", 1)[0]
    assert "unsafe-inline" not in script_src
    assert "unsafe-eval" not in policy


def test_the_htaccess_hash_matches_the_inline_bootstrap():
    """Mutation shape: change index.html's bootstrap and the hash must be
    recomputed (this is the assertion that fails first when it is not)."""
    hashes = _inline_script_hashes()
    assert len(hashes) == 1, f"expected exactly one inline script, got {hashes}"
    text = (ROOT / "web" / ".htaccess").read_text(encoding="utf-8")
    assert hashes[0] in text, (
        f"the inline bootstrap hash {hashes[0]} is not in web/.htaccess")
    # the computed hash must come from the SHIPPED html, not a literal in a test
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")
    assert "nightseam_theme" in html, "the bootstrap changed shape"


@pytest.mark.parametrize("policy,expectation", [
    (None, "no Content-Security-Policy"),
    ("default-src 'self'", "no script-src"),
    (GOOD.replace("script-src 'self' ", "script-src 'unsafe-inline' ",
                  ).replace("'sha256-L8aiDzZyJ9k2GW9FggYfWKbcrM22h1"
                            "LPcHxs0Ov+uCE='", ""), "unsafe-inline"),
    (GOOD.replace("connect-src 'self' https://en.wikipedia.org; ", ""),
     "no connect-src"),
    (GOOD.replace("'sha256-L8aiDzZyJ9k2GW9FggYfWKbcrM22h1LPcHxs0Ov+uCE='",
                  "'sha256-STALEHASHSTALEHASHSTALEHASHSTALEHASHSTALEHASHSTAL='"),
     "inline theme bootstrap hash"),
])
def test_a_broken_policy_is_rejected(policy, expectation):
    problems = _csp_problems(policy)
    assert any(expectation in p for p in problems), (expectation, problems)


def test_unsafe_inline_is_flagged_even_alongside_a_hash():
    """'unsafe-inline' is IGNORED when a hash is present, so it adds nothing but
    silently widens the policy if the hash is ever dropped - it must be flagged
    whenever it appears in script-src."""
    policy = GOOD.replace("script-src 'self' ", "script-src 'self' 'unsafe-inline' ")
    assert any("unsafe-inline" in p for p in _csp_problems(policy))
