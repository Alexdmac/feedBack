<#
.SYNOPSIS
Copy the preview clip of each Rocksmith 2014 .psarc into its loose-folder song.

.DESCRIPTION
A Rocksmith pack holds two audio files: the full song and a 30 s preview that
the charter picked. Convert-Psarc.ps1 keeps only the full song (audio.wem).
This script finds the song folder of each pack in -Source (by the source name
in .psarc-import.json) and writes the preview next to the song:
    audio_preview.wem         the preview clip of the pack, copied as is

The Song Preview plugin then plays that clip on hover, and does not cut a clip
from the full song. The library scan skips each .wem with "preview" in its
name, so the song itself does not change.

The script uses the libraries that Convert-Psarc.ps1 unpacked from DLC Builder
(the newest folder in %LOCALAPPDATA%\FeedBack\dlcbuilder-libs). DLCBuilder.exe
itself is not necessary. The source .psarc files are only read, never changed.
The script skips a song pack (more than one preview in one .psarc). Run it
again to continue: it skips each song that already has a preview, unless you
give -Force.

.EXAMPLE
pwsh -File tools\psarc_import\Extract-Previews.ps1 -Source 'D:\Application\Rocksmith 2014 Remastered\dlc'
#>
param(
    [Parameter(Mandatory)] [string]$Source,
    [string]$Library = (Join-Path $HOME 'FeedBackData\library\Rocksmith'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$previewName = 'audio_preview.wem'

# ── Libraries unpacked by Convert-Psarc.ps1 ──────────────────────────────────
$libRoot = Join-Path $env:LOCALAPPDATA 'FeedBack\dlcbuilder-libs'
$libDir = Get-ChildItem -LiteralPath $libRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Rocksmith2014.DLCProject.dll') } |
    Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } |
    Select-Object -Last 1 -ExpandProperty FullName
if (-not $libDir) { throw "No DLC Builder libraries in $libRoot. Run Convert-Psarc.ps1 one time first." }

# Load every managed library now, on this thread. Library code runs on worker
# threads, where a PowerShell AssemblyResolve script block cannot run.
# Native DLLs in the folder fail with BadImageFormatException: skip them.
foreach ($dll in Get-ChildItem -LiteralPath $libDir -Filter '*.dll' -File) {
    try { [void][System.Reflection.Assembly]::LoadFrom($dll.FullName) } catch { }
}
$pc = [Rocksmith2014.Common.Platform]::PC
$importUtils = [Rocksmith2014.DLCProject.PsarcImportUtils]

# ── Song folder of each source pack ──────────────────────────────────────────
$folders = @{}
Get-ChildItem -LiteralPath $Library -Directory | ForEach-Object {
    # -LiteralPath: folder names such as "Song [key]" are wildcard patterns otherwise.
    $marker = Join-Path $_.FullName '.psarc-import.json'
    if (Test-Path -LiteralPath $marker) {
        $src = (Get-Content -Raw -LiteralPath $marker | ConvertFrom-Json).source
        if ($src) { $folders[$src.ToLowerInvariant()] = $_.FullName }
    }
}

$files = @(Get-ChildItem -LiteralPath $Source -Filter '*.psarc' -File | Sort-Object Name)
$made = 0; $had = 0; $noSong = 0; $noPreview = 0; $failed = 0
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($f in $files) {
    $folder = $folders[$f.Name.ToLowerInvariant()]
    if (-not $folder) { $noSong++; continue }
    $target = Join-Path $folder $previewName
    if ((Test-Path -LiteralPath $target) -and -not $Force) { $had++; continue }

    $psarc = $null
    try {
        $psarc = [Rocksmith2014.PSARC.PSARC]::OpenFile($f.FullName)
        $banks = @($psarc.Manifest | Where-Object { $_ -like 'audio/windows/*_preview.bnk' })
        if ($banks.Count -ne 1) {
            $noPreview++
            Write-Host ("skip    {0}: {1} preview banks" -f $f.Name, $banks.Count)
            continue
        }
        # The bank names its .wem by the Wwise file ID.
        $id = $importUtils::getVolumeAndFileId($psarc, $pc, [string]$banks[0]).GetAwaiter().GetResult().Item2
        $wem = $psarc.Manifest | Where-Object { $_ -eq "audio/windows/$id.wem" } | Select-Object -First 1
        if (-not $wem) { throw "the bank names $id.wem, which is not in the pack" }
        # Write to a temporary name first, so a stopped run leaves no half file.
        $partial = "$target.partial"
        # [string] casts: MethodInfo.Invoke rejects PSObject-wrapped strings.
        [void]$psarc.InflateFile([string]$wem, [string]$partial).GetAwaiter().GetResult()
        Move-Item -LiteralPath $partial -Destination $target -Force
        $made++
        Write-Host ("ok      {0} -> {1}" -f $f.Name, (Split-Path $folder -Leaf))
    } catch {
        $failed++
        Write-Host ("FAILED  {0}: {1}" -f $f.Name, ($_.Exception.GetBaseException().Message -replace '\s+', ' '))
        if ($partial -and (Test-Path -LiteralPath $partial)) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
    } finally {
        if ($psarc) { $psarc.Dispose() }
        $partial = $null
    }
}

Write-Host ("Done in {0:N0} s: {1} previews written, {2} already there, {3} packs with no song folder, {4} with no single preview, {5} failed." -f `
    $sw.Elapsed.TotalSeconds, $made, $had, $noSong, $noPreview, $failed)
