# Windows development environment

The current workspace is the website repository. Browser tests use Playwright
with system Chrome, Node parses JavaScript, and Python runs build/test guards.

This machine's restricted sandbox has allowed plain process pipes but denied
Chromium named pipes and Playwright overlapped-pipe startup. Use one elevated
browser gate when needed; an infrastructure launch failure must return exit 2,
never count as a passed/skipped check. Ordinary pytest and source guards may
also need an elevated run when old sandbox-owned directory ACLs deny cleanup.
Keep temporary directories under ignored logs/ rather than the repository root.

Git local maintenance.auto=false and gc.auto=0 avoid background maintenance
dialogs/process failures under restricted tokens. Do not run git gc casually.
Text writes must use explicit UTF-8 without BOM; do not use a legacy PowerShell
Get-Content/Set-Content roundtrip for non-ASCII shipped text.

The former desktop environment and executable were moved to the independent
Nightseam-catalog repository. The website has no desktop build or SQLite
dependency. Historical measurements survive in Git/recovery snapshots.
