# Windows development environment

The current workspace is the website repository. Browser tests use Playwright
with system Chrome, Node parses JavaScript, and Python runs build/test guards.

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

The former desktop environment and executable were moved to the independent
Nightseam-catalog repository. The website has no desktop build or SQLite
dependency. Historical measurements survive in Git/recovery snapshots.
