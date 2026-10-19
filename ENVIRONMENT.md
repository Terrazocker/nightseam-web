# Windows development environment

The current workspace is the website repository. Browser tests use Playwright
with system Chrome, Node parses JavaScript, and Python runs build/test guards.
Install development packages with `python -m pip install -r requirements-dev.txt`;
the website's build/catalog tools use the standard library (requirements.txt).
Use an installed Node.js and Chrome for the JavaScript and real-browser gates.
See README.md for the normal check sequence.

Run the full Python suite separately from JavaScript, browser, release and
publication checks. Core-drift regression tests temporarily replace or remove
shipped modules to prove the guards reject them; overlapping processes can see
those deliberately invalid files and report misleading failures.

This machine's restricted sandbox has allowed plain process pipes but denied
Chromium named pipes and Playwright overlapped-pipe startup. Use one elevated
browser gate when needed; an infrastructure launch failure must return exit 2,
never count as a passed/skipped check. Ordinary pytest and source guards may
also need an elevated run when old sandbox-owned directory ACLs deny cleanup.
Keep temporary directories under ignored logs/ rather than the repository root.
pytest.ini routes pytest's basetemp and cache to logs/.pytest-basetemp and
logs/.pytest-cache. The custom tmp_path fixture and JS syntax/token guards use
scripts/scratchspace.py's owned runs under logs/.scratch. Runs hold an OS file
lock; the next allocation recovers abandoned marked runs, preserves live runs
and refuses unknown/unmarked data. Cleanup retries transient directory locks
and read-only files; persistent failure is visible and blocks new allocation
instead of silently accumulating more scratch. Lock metadata is retained and tiny.
There is no fallback to a user-profile/system temp directory for these probes.

Browser screenshots/failure JSON overwrite per-check filenames. Publication and
release builders replace fixed staging directories; core builds retain current
plus N-1. These default outputs do not grow by one full copy per run. Intentional
dated transcripts, recovery snapshots and deployment rollback backups remain
retained evidence, with no blanket automatic deletion or claim of a total disk
quota. Arbitrary ad-hoc logs/build destinations still require deliberate cleanup.

Git local maintenance.auto=false and gc.auto=0 avoid background maintenance
dialogs/process failures under restricted tokens. Do not run git gc casually.
Text writes must use explicit UTF-8 without BOM; do not use a legacy PowerShell
Get-Content/Set-Content roundtrip for non-ASCII shipped text.

CI runs the same gates on GitHub with Python 3.14, Node 22 and the runner's
installed Chrome (`.github/workflows/checks.yml`): the guards and pytest on
windows-latest, the browser suite on ubuntu-latest (deliberately unpinned: it
follows GitHub's move to Ubuntu 26 from October 19, 2026). The sandbox limits
above apply only to this development machine. Windows-specific browser
behaviour is covered by local runs here.

Linux Chrome renders the planner in DejaVu Sans / DejaVu Sans Mono, which are
wider than Segoe UI / Cascadia Mono. To reproduce a Linux-only layout failure
here, temporarily put `Verdana` first in the body font stacks
(`web/style.css`, `landing/style.css`) and `"Courier New"` first in `--mono`
(`web/themes.css`); their widths are close to DejaVu's. Run the failing check
with `--only`, then restore the files. Never commit the substitution. The repository is public, so the
GitHub-hosted runners cost no Actions minutes.

## Claude Code cloud sessions

Cloud sessions run in a Linux container with Playwright's Chromium at
`/opt/pw-browsers/chromium` and no system Chrome. `.claude/hooks/session-start.sh`
prepares each one: it fetches the version tags when the clone has none,
installs the pinned `requirements-dev.txt`, bakes `web/version.json`, and sets
`NIGHTSEAM_BROWSER_EXECUTABLE`, which `check_browser.py` takes as its
`--executable` default. The commands in AGENTS.md then run unchanged. The
hook does nothing outside cloud sessions.
