# Start FeedBack on this PC without Docker.
#
# First-time setup (from the repo root):
#   uv venv --python 3.12 .venv
#   uv pip install --python .venv\Scripts\python.exe -r requirements.txt colorama
#
# colorama is not in requirements.txt. On Windows the console logger needs it,
# or the server stops at start with a SystemError.
#
# Then run:  pwsh -File scripts\run-local.ps1
# Open http://localhost:8000 in a browser. Press Ctrl+C to stop the server.
#
# Override any folder or the port with an environment variable before you run
# the script, for example:  $env:DLC_DIR = 'D:\Songs'

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$dataRoot = Join-Path $HOME 'FeedBackData'

if (-not $env:DLC_DIR)    { $env:DLC_DIR    = Join-Path $dataRoot 'library' }
if (-not $env:CONFIG_DIR) { $env:CONFIG_DIR = Join-Path $dataRoot 'config' }
if (-not $env:HOST)       { $env:HOST       = '127.0.0.1' }
if (-not $env:PORT)       { $env:PORT       = '8000' }
$env:PYTHONPATH = "$repo\lib;$repo"
# Offline by default: no outbound network calls (see lib/netpolicy.py).
# To allow networking for one run:  $env:FEEDBACK_OFFLINE = '0'
if (-not $env:FEEDBACK_OFFLINE) { $env:FEEDBACK_OFFLINE = '1' }
if ($env:FEEDBACK_OFFLINE -in @('1', 'true', 'yes', 'on')) {
    # Stop model downloads from Hugging Face if WhisperX is ever installed.
    $env:HF_HUB_OFFLINE = '1'
    $env:TRANSFORMERS_OFFLINE = '1'
}
# The logs contain characters such as an arrow. The default Windows console
# code page (cp1252) cannot encode them, so force UTF-8.
$env:PYTHONUTF8 = '1'

New-Item -ItemType Directory -Force -Path $env:DLC_DIR, $env:CONFIG_DIR | Out-Null

# Decode .wem audio with DLC Builder's ww2ogg + revorb (no vgmstream on this PC).
$dlcBuilderTools = 'C:\Program Files\Rocksmith 2014 DLC Builder\Tools'
if (Test-Path (Join-Path $dlcBuilderTools 'ww2ogg.exe')) { $env:PATH = "$dlcBuilderTools;$env:PATH" }

$python = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    throw "No Python environment at $python. Do the first-time setup at the top of this script."
}

Write-Host "Library: $env:DLC_DIR"
Write-Host "Config:  $env:CONFIG_DIR"
Write-Host "URL:     http://localhost:$env:PORT"
Write-Host "Offline: $env:FEEDBACK_OFFLINE"

Set-Location $repo
& $python main.py
