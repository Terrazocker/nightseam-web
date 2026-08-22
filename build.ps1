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

& $py -m PyInstaller --clean --noconfirm --onefile --noconsole `
    --name AstroPilot `
    --icon "assets\app.ico" `
    --add-data "static;static" `
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
