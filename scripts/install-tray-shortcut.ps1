# Add a "RockStar" shortcut that starts the server behind a tray icon.
#
# The shortcut runs scripts\rockstar_tray.py with the venv's pythonw.exe, so
# no console window opens. A RockStar icon appears in the taskbar's tray area
# (click the ^ arrow if Windows hides it) while the server runs:
#   double-click or "Open RockStar"  opens the app in the browser
#   "Open log"                       opens the server log
#   "Quit"                           stops the server
#
# Needs the venv from scripts\run-local.ps1. Run once from the repo root:
#   pwsh -File scripts\install-tray-shortcut.ps1
# Add -Startup to also start RockStar when you sign in to Windows.
# Add -Port 8080 (or any port) to have the shortcut use that port.

param(
    [switch]$Startup,
    [string]$Port = ''
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repo '.venv\Scripts\python.exe'
$pythonw = Join-Path $repo '.venv\Scripts\pythonw.exe'
if (-not (Test-Path $pythonw)) {
    throw "No Python environment at $pythonw. Do the first-time setup in scripts\run-local.ps1 first."
}

Write-Host 'Installing the tray packages (pystray, pillow)'
if (Get-Command uv -ErrorAction SilentlyContinue) {
    & uv pip install --python $python -r (Join-Path $repo 'requirements-tray.txt')
} else {
    & $python -m pip install -r (Join-Path $repo 'requirements-tray.txt')
}
if ($LASTEXITCODE -ne 0) { throw 'Could not install the tray packages.' }

# A shortcut needs an .ico file for its icon. Make one from the app icon.
$iconDir = Join-Path $env:LOCALAPPDATA 'RockStar'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$ico = Join-Path $iconDir 'rockstar.ico'
& $python -I -c "import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], sizes=[(16,16),(32,32),(48,48),(64,64),(128,128)])" `
    (Join-Path $repo 'static\v3\brand\icon-192.png') $ico
if ($LASTEXITCODE -ne 0) { throw 'Could not make the shortcut icon.' }

$tray = Join-Path $repo 'scripts\rockstar_tray.py'
$shell = New-Object -ComObject WScript.Shell
$places = @(
    [Environment]::GetFolderPath('Desktop'),
    (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs')
)
if ($Startup) { $places += [Environment]::GetFolderPath('Startup') }

foreach ($dir in $places) {
    $lnk = $shell.CreateShortcut((Join-Path $dir 'RockStar.lnk'))
    if ($Port) {
        # pythonw cannot take an environment variable on its command line, so
        # go through cmd with a hidden window to set PORT first.
        $lnk.TargetPath = "$env:SystemRoot\System32\cmd.exe"
        $lnk.Arguments = "/c set PORT=$Port&& start `"`" `"$pythonw`" `"$tray`""
        $lnk.WindowStyle = 7  # minimized, so the cmd window does not flash
    } else {
        $lnk.TargetPath = $pythonw
        $lnk.Arguments = "`"$tray`""
    }
    $lnk.WorkingDirectory = $repo
    $lnk.IconLocation = $ico
    $lnk.Description = 'Start RockStar with a tray icon'
    $lnk.Save()
    Write-Host "Shortcut: $(Join-Path $dir 'RockStar.lnk')"
}

Write-Host ''
Write-Host 'Done. Close the RockStar server terminal if it is running, then open the RockStar shortcut.'
