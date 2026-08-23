# Builds AstroPilot.exe with PyInstaller in an isolated venv.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv-build")) {
    python -m venv .venv-build
}
$py = ".\.venv-build\Scripts\python.exe"

& $py -m pip install --upgrade pip wheel --quiet
& $py -m pip install -r requirements.txt --quiet

# make sure no running instance locks the output file
Get-Process AstroPilot -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# bake the current git version into the frozen app (app/_version_baked.py is gitignored)
$ver = (& git describe --tags --always 2>$null).Trim().TrimStart("v")
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
