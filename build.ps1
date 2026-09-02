# Builds AstroPilot.exe with PyInstaller in an isolated venv.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv-build")) {
    python -m venv .venv-build
}
$py = ".\.venv-build\Scripts\python.exe"

& $py -m pip install --upgrade pip wheel --quiet
& $py -m pip install -r requirements-dev.txt --quiet

# make sure no running instance locks the output file
Get-Process AstroPilot -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# Bake the current git version into the frozen app (app/_version_baked.py is gitignored).
# The bake uses `--dirty` so a build from uncommitted work can never silently claim a
# clean tag (AGENTS.md: "Tag BEFORE rebuilding"). Warn loudly when the tree is dirty
# or HEAD is not exactly a tag - the baked version stays truthful either way.
# NOTE: run git through `cmd /c ... 2>nul` so its stderr can never trip
# $ErrorActionPreference = "Stop" (a PS 5.1 native-stderr kill).
$dirtyCount = ((& cmd /c "git status --porcelain 2>nul") | Measure-Object).Count
if ($dirtyCount -gt 0) {
    Write-Host "WARNING: working tree is dirty ($dirtyCount changed file(s)) - baked version will end in '-dirty'." -ForegroundColor Yellow
}
& cmd /c "git describe --tags --exact-match HEAD >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: HEAD is not exactly a git tag - baked version will carry a commit suffix (and/or '-dirty')." -ForegroundColor Yellow
}
$ver = ((& cmd /c "git describe --tags --always --dirty 2>nul") | Select-Object -First 1).Trim().TrimStart("v")
if (-not $ver) { $ver = "dev" }
Set-Content -Encoding utf8 "app\_version_baked.py" "BAKED_VERSION = '$ver'"
Write-Host "Baking version '$ver' into the build"

& $py -m PyInstaller --clean --noconfirm --onefile --noconsole `
    --name AstroPilot `
    --icon "assets\app.ico" `
    --add-data "static;static" `
    --add-data "app\data;app\data" `
    --collect-all uvicorn `
    --collect-all webview `
    --hidden-import python_multipart `
    main.py

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
}

$exe = Join-Path $PSScriptRoot "dist\AstroPilot.exe"
if (-not (Test-Path $exe)) { throw "Build produced no exe" }
Write-Host ""
Write-Host ("Build finished -> dist\AstroPilot.exe  (" +
    "{0:N1} MB, {1})" -f ((Get-Item $exe).Length / 1MB),
    (Get-Item $exe).LastWriteTime)
