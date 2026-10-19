<#
.SYNOPSIS
Convert Rocksmith 2014 .psarc files into FeedBack loose-folder songs.

.DESCRIPTION
Uses the PSARC importer from the installed Rocksmith 2014 DLC Builder
(Rocksmith2014.NET). The script unpacks the libraries from DLCBuilder.exe
once, into %LOCALAPPDATA%\FeedBack\dlcbuilder-libs\<version>.

Each song becomes one folder in -Library:
    audio.wem                 main audio (the app decodes it at play time)
    arr_<part>_RS2.xml        arrangements, vocals and showlights (<offset> set to 0)
    cover.jpg                 album art
    manifest.json             title, artist, album, year
    .psarc-import.json        the source file (used to skip it on the next run)

The source .psarc files are only read, never changed. Run the script again to
continue: it skips each source that already has a song folder. Results go to
_import-log.csv in -Library.

.EXAMPLE
pwsh -File tools\psarc_import\Convert-Psarc.ps1 -Source 'D:\Rocksmith 2014 Edition - Remastered\dlc' -Limit 5
#>
param(
    [Parameter(Mandatory)] [string]$Source,
    [string]$Library = (Join-Path $HOME 'FeedBackData\library\Rocksmith'),
    [int]$Limit = 0,
    [string[]]$Only = @(),
    [string]$DlcBuilder = 'C:\Program Files\Rocksmith 2014 DLC Builder'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$python = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "No Python environment at $python. See scripts\run-local.ps1." }

# ── Libraries from DLCBuilder.exe ────────────────────────────────────────────
$exe = Join-Path $DlcBuilder 'DLCBuilder.exe'
if (-not (Test-Path $exe)) { throw "DLC Builder not found at $exe" }
$version = (Get-Item $exe).VersionInfo.FileVersion
$libDir = Join-Path $env:LOCALAPPDATA "FeedBack\dlcbuilder-libs\$version"
if (-not (Test-Path (Join-Path $libDir 'Rocksmith2014.DLCProject.dll'))) {
    Write-Host "Unpacking DLC Builder $version libraries to $libDir"
    & $python -I (Join-Path $PSScriptRoot 'extract_bundle.py') $exe $libDir
    if ($LASTEXITCODE -ne 0) { throw "Could not unpack the libraries from $exe" }
}

# Load every managed library now, on this thread. The importer runs on worker
# threads, where a PowerShell AssemblyResolve script block cannot run.
# Assembly.LoadFrom also probes this folder for any dependency it still needs.
# Native DLLs in the folder fail with BadImageFormatException: skip them.
foreach ($dll in Get-ChildItem -LiteralPath $libDir -Filter '*.dll' -File) {
    try { [void][System.Reflection.Assembly]::LoadFrom($dll.FullName) } catch { }
}

$importer = [System.Reflection.Assembly]::LoadFrom((Join-Path $libDir 'Rocksmith2014.DLCProject.dll')).
    GetType('Rocksmith2014.DLCProject.PsarcImporter').GetMethod('import')
$funcConvert = [System.Reflection.Assembly]::LoadFrom((Join-Path $libDir 'FSharp.Core.dll')).
    GetType('Microsoft.FSharp.Core.FuncConvert')
# The importer calls its progress callback on worker threads, where a
# PowerShell script block cannot run. Use a compiled no-op instead.
if (-not ('FbPsarcNoop' -as [type])) {
    Add-Type -TypeDefinition 'public static class FbPsarcNoop { public static void Run() {} }'
}
$fromAction = $funcConvert.GetMethods() |
    Where-Object { $_.Name -eq 'FromAction' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1
$progress = $fromAction.Invoke($null, @([Delegate]::CreateDelegate([Action], [FbPsarcNoop].GetMethod('Run'))))

# ── Helpers ──────────────────────────────────────────────────────────────────
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-SafeName([string]$name) {
    $clean = ($name -replace '[\\/:*?"<>|\x00-\x1f]', '_').Trim().TrimEnd('.', ' ')
    if ($clean.Length -gt 120) { $clean = $clean.Substring(0, 120).TrimEnd('.', ' ') }
    if (-not $clean) { $clean = 'Unknown' }
    return $clean
}

function Write-Log($row) {
    $line = ($row.Source, $row.Status, $row.Folder, $row.Message | ForEach-Object { '"' + ("$_" -replace '"', '""') + '"' }) -join ','
    [System.IO.File]::AppendAllText($logFile, $line + "`r`n", $utf8)
}

# ── Work list ────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $Library | Out-Null
$logFile = Join-Path $Library '_import-log.csv'
if (-not (Test-Path $logFile)) { [System.IO.File]::WriteAllText($logFile, "source,status,folder,message`r`n", $utf8) }

$done = @{}
Get-ChildItem -LiteralPath $Library -Directory | ForEach-Object {
    # -LiteralPath: folder names such as "Song [key]" are wildcard patterns otherwise.
    $marker = Join-Path $_.FullName '.psarc-import.json'
    if (Test-Path -LiteralPath $marker) { $done[(Get-Content -Raw -LiteralPath $marker | ConvertFrom-Json).source] = $_.Name }
}

$files = Get-ChildItem -LiteralPath $Source -Filter '*.psarc' -File | Sort-Object Name
if ($Only.Count) { $files = $files | Where-Object { $Only -contains $_.Name } }
$todo = @($files | Where-Object { -not $done.ContainsKey($_.Name) })
if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }
Write-Host ("{0} .psarc files, {1} already converted, {2} to convert now" -f @($files).Count, $done.Count, $todo.Count)

$tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'fb-psarc-import'
$covers = New-Object System.Collections.Generic.List[string]
$ok = 0; $failed = 0; $i = 0
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($f in $todo) {
    $i++
    $tmp = Join-Path $tmpRoot ([guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        # [string] casts: MethodInfo.Invoke rejects PSObject-wrapped strings.
        $importArgs = [object[]]@($progress, [string]$f.FullName, [string]$tmp)
        $result = $importer.Invoke($null, $importArgs).GetAwaiter().GetResult()
        $p = $result.GeneratedProject
        $artist = "$($p.ArtistName.Value)"; $title = "$($p.Title.Value)"
        $album = "$($p.AlbumName.Value)"; $key = "$($p.DLCKey)"

        $folderName = Get-SafeName "$artist - $title"
        # Several versions of one song (DD / NDD / v2 ...) share artist, title
        # and sometimes the DLC key: fall back to the source file name.
        if (Test-Path -LiteralPath (Join-Path $Library $folderName)) { $folderName = Get-SafeName "$artist - $title [$key]" }
        if (Test-Path -LiteralPath (Join-Path $Library $folderName)) { $folderName = Get-SafeName "$artist - $title [$($f.BaseName)]" }
        if (Test-Path -LiteralPath (Join-Path $Library $folderName)) { throw "Folder '$folderName' already exists" }
        $dest = Join-Path $Library $folderName
        $stage = "$dest.partial"
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
        New-Item -ItemType Directory -Path $stage | Out-Null

        $audio = "$($p.AudioFile.Path)"
        if (-not $audio -or -not (Test-Path -LiteralPath $audio)) { throw 'No main audio in the package' }
        Move-Item -LiteralPath $audio -Destination (Join-Path $stage 'audio.wem')
        $xmls = @(Get-ChildItem -LiteralPath $tmp -Filter 'arr_*.xml' -File)
        if (-not $xmls.Count) { throw 'No arrangement XML in the package' }
        $xmls | Move-Item -Destination $stage
        # Note times in these XMLs are already absolute audio times. DLC Builder
        # writes <offset> = -startBeat. FeedBack adds a loose folder's <offset>
        # to the playback time, so every note would come startBeat seconds
        # late. Set it to 0.
        foreach ($x in Get-ChildItem -LiteralPath $stage -Filter 'arr_*.xml' -File) {
            $bytes = [System.IO.File]::ReadAllBytes($x.FullName)
            $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
            $text = [System.Text.Encoding]::UTF8.GetString($bytes, $(if ($bom) { 3 } else { 0 }), $bytes.Length - $(if ($bom) { 3 } else { 0 }))
            $fixed = ([regex]'<offset>[^<]*</offset>').Replace($text, '<offset>0.000</offset>', 1)
            if ($fixed -ne $text) {
                [System.IO.File]::WriteAllText($x.FullName, $fixed, (New-Object System.Text.UTF8Encoding($bom)))
            }
        }
        $art = "$($p.AlbumArtFile)"
        if ($art -and (Test-Path -LiteralPath $art)) { Move-Item -LiteralPath $art -Destination (Join-Path $stage 'cover.dds') }

        $manifest = [ordered]@{ title = $title; artist = $artist; album = $album; year = "$($p.Year)" }
        [System.IO.File]::WriteAllText((Join-Path $stage 'manifest.json'), ($manifest | ConvertTo-Json), $utf8)
        $marker = [ordered]@{ source = $f.Name; size = $f.Length; dlc_key = $key; imported_at = (Get-Date).ToString('o') }
        [System.IO.File]::WriteAllText((Join-Path $stage '.psarc-import.json'), ($marker | ConvertTo-Json), $utf8)

        Move-Item -LiteralPath $stage -Destination $dest
        if (Test-Path -LiteralPath (Join-Path $dest 'cover.dds')) { $covers.Add((Join-Path $dest 'cover.dds')) }
        $ok++
        Write-Log @{ Source = $f.Name; Status = 'ok'; Folder = $folderName; Message = "$($xmls.Count) xml" }
        Write-Host ("[{0}/{1}] ok      {2} -> {3}" -f $i, $todo.Count, $f.Name, $folderName)
    } catch {
        $failed++
        $msg = ($_.Exception.GetBaseException().Message -replace '\s+', ' ')
        if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
        Write-Log @{ Source = $f.Name; Status = 'failed'; Folder = ''; Message = $msg }
        Write-Host ("[{0}/{1}] FAILED  {2}: {3}" -f $i, $todo.Count, $f.Name, $msg)
    } finally {
        $stage = $null
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($covers.Count) {
    $list = Join-Path $tmpRoot 'covers.txt'
    [System.IO.File]::WriteAllLines($list, $covers, $utf8)
    & $python -I (Join-Path $PSScriptRoot 'dds_to_jpg.py') $list
}
Write-Host ("Done in {0:N0} s: {1} converted, {2} failed. Log: {3}" -f $sw.Elapsed.TotalSeconds, $ok, $failed, $logFile)
