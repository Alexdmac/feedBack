<#
.SYNOPSIS
Convert the songs in a Rocksmith 2014 song pack into FeedBack loose-folder songs.

.DESCRIPTION
Convert-Psarc.ps1 cannot import a song pack: the DLC Builder importer refuses a
.psarc that holds more than one .xblock file. This script reads the pack with
the same DLC Builder libraries and writes one folder per song in -Library, in
the layout of Convert-Psarc.ps1:
    audio.wem                 main audio (the app decodes it at play time)
    arr_<part>_RS2.xml        arrangements, vocals and showlights (<offset> set to 0)
    cover.jpg                 album art
    manifest.json             title, artist, album, year
    .psarc-import.json        the source pack and song key (used to skip it on the next run)

Charts: the arrangement helpers of the DLC Builder importer
(PsarcImportUtils.importInstrumental and importVocals) convert each .sng with
ConvertInstrumental.sngToXml or ConvertVocals.sngToXml and the attributes from
the pack manifest, and save the XML. Convert-Psarc.ps1 gets its XML from the
same helpers.

Audio: each manifest names a sound bank (SongBank). The bank holds the file ID
of the main .wem. A pack can keep its audio in another pack: for the songs of
rs1compatibilitydlc_p.psarc, the banks and the .wem files are in songs.psarc.
The script looks in the pack first, then in each -AudioPack. Without
-AudioPack, it uses songs.psarc from the folder of the pack or from the folder
above it, when that file exists.

The packs are only read, never changed. Run the script again to continue: it
skips each song that already has a song folder. Results go to _import-log.csv
in -Library.

.EXAMPLE
pwsh -File tools\psarc_import\Convert-SongPack.ps1 -Pack 'D:\Rocksmith 2014 Edition - Remastered\dlc\rs1compatibilitydlc_p.psarc' -ListOnly

.EXAMPLE
pwsh -File tools\psarc_import\Convert-SongPack.ps1 -Pack 'D:\Rocksmith 2014 Edition - Remastered\songs.psarc' -Limit 3

.EXAMPLE
pwsh -File tools\psarc_import\Convert-SongPack.ps1 -Pack 'D:\Rocksmith 2014 Edition - Remastered\songs.psarc' -Skip RS2Arpeggios,RS2ChordNameStress,RS2LevelBreak,RS2Tails
#>
param(
    [Parameter(Mandatory)] [string]$Pack,
    [string[]]$AudioPack = @(),
    [string]$Library = (Join-Path $HOME 'FeedBackData\library\Rocksmith'),
    [int]$Limit = 0,
    [string[]]$Only = @(),
    [string[]]$Skip = @(),
    [switch]$ListOnly,
    [string]$ListCsv = '',
    [string]$DlcBuilder = 'C:\Program Files\Rocksmith 2014 DLC Builder'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$python = Join-Path $repo '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw "No Python environment at $python. See scripts\run-local.ps1." }
$Pack = (Resolve-Path -LiteralPath $Pack).Path
$packName = Split-Path $Pack -Leaf
# pwsh -File passes "-Only a,b" as one string: split it here.
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$Skip = @($Skip | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$AudioPack = @($AudioPack | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

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

# Load every managed library now, on this thread. Library code runs on worker
# threads, where a PowerShell AssemblyResolve script block cannot run.
# Assembly.LoadFrom also probes this folder for any dependency it still needs.
# Native DLLs in the folder fail with BadImageFormatException: skip them.
foreach ($dll in Get-ChildItem -LiteralPath $libDir -Filter '*.dll' -File) {
    try { [void][System.Reflection.Assembly]::LoadFrom($dll.FullName) } catch { }
}

$pc = [Rocksmith2014.Common.Platform]::PC
$importUtils = [Rocksmith2014.DLCProject.PsarcImportUtils]
$manifestModule = [Rocksmith2014.Common.Manifest.ManifestModule]
$noAudioFiles = [Rocksmith2014.Common.AudioFile[]]::new(0)
$startAsTask = [Microsoft.FSharp.Control.FSharpAsync].GetMethod('StartAsTask')

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

# Runs an F# Async (SNGModule.fromStream returns one) and waits for the result.
function Invoke-FSharpAsync($computation) {
    $computation = $computation.psobject.BaseObject
    $run = $startAsTask.MakeGenericMethod($computation.GetType().GenericTypeArguments[0])
    # MethodInfo.Invoke rejects PSObject-wrapped arguments: pass the base object.
    return $run.Invoke($null, [object[]]@($computation, $null, $null)).GetAwaiter().GetResult()
}

function Open-Archive([string]$path) {
    $psarc = [Rocksmith2014.PSARC.PSARC]::OpenFile($path)
    $names = [System.Collections.Generic.Dictionary[string, string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($n in $psarc.Manifest) { $names[$n] = $n }
    $sizes = [System.Collections.Generic.Dictionary[string, uint64]]::new([StringComparer]::OrdinalIgnoreCase)
    $first = $psarc.TOC.Count - $names.Count
    $i = 0
    foreach ($n in $psarc.Manifest) { $sizes[$n] = $psarc.TOC[$first + $i].Length; $i++ }
    return [pscustomobject]@{ Name = (Split-Path $path -Leaf); Path = $path; Psarc = $psarc; Names = $names; Sizes = $sizes }
}

# Returns the entry name with its stored spelling, or $null.
function Get-Entry($archive, [string]$name) {
    $found = $null
    if ($archive.Names.TryGetValue($name, [ref]$found)) { return $found }
    return $null
}

function Read-EntryText($archive, [string]$name) {
    $s = $archive.Psarc.GetEntryStream($name).GetAwaiter().GetResult()
    try { return (New-Object System.IO.StreamReader($s)).ReadToEnd() } finally { $s.Dispose() }
}

function Save-Entry($archive, [string]$name, [string]$targetFile) {
    # [string] casts: MethodInfo.Invoke rejects PSObject-wrapped strings.
    [void]$archive.Psarc.InflateFile([string]$name, [string]$targetFile).GetAwaiter().GetResult()
}

# The last part of a URN such as "urn:application:musicgame-song:afterlife_bass".
function Get-UrnName([string]$urn) { return ($urn -split ':')[-1] }

# The bank names the main .wem by its file ID. Look in the pack first, then in
# the audio packs.
function Find-Audio($song) {
    if (-not $song.Bank) { return $null }
    foreach ($a in $archives) {
        $bank = Get-Entry $a "audio/windows/$($song.Bank)"
        if (-not $bank) { continue }
        $result = $importUtils::getVolumeAndFileId($a.Psarc, $pc, [string]$bank).GetAwaiter().GetResult()
        $wem = Get-Entry $a "audio/windows/$($result.Item2).wem"
        if ($wem) { return [pscustomobject]@{ Archive = $a; Bank = $bank; Wem = $wem; Size = $a.Sizes[$wem] } }
    }
    return $null
}

function Get-FolderName($song) {
    $base = "$($song.Artist) - $($song.Title)"
    # A song can also exist in -Library from another source (a single-song
    # .psarc or another pack): fall back to the song key, then to the pack.
    foreach ($candidate in @($base, "$base [$($song.Key)]", "$base [$($song.Key) $([IO.Path]::GetFileNameWithoutExtension($packName))]")) {
        $name = Get-SafeName $candidate
        if (-not (Test-Path -LiteralPath (Join-Path $Library $name))) { return $name }
    }
    throw "Folder '$(Get-SafeName $base)' already exists"
}

# ── Read the pack ────────────────────────────────────────────────────────────
if (-not $AudioPack.Count) {
    foreach ($dir in @((Split-Path $Pack), (Split-Path (Split-Path $Pack)))) {
        $candidate = if ($dir) { Join-Path $dir 'songs.psarc' } else { '' }
        if ($candidate -and (Test-Path -LiteralPath $candidate) -and $candidate -ne $Pack) { $AudioPack = @($candidate); break }
    }
}

New-Item -ItemType Directory -Force -Path $Library | Out-Null
$logFile = Join-Path $Library '_import-log.csv'
$archives = [System.Collections.Generic.List[object]]::new()
try {
    $main = Open-Archive $Pack
    $archives.Add($main)
    foreach ($p in $AudioPack) { $archives.Add((Open-Archive (Resolve-Path -LiteralPath $p).Path)) }
    Write-Host ("Pack: {0}. Audio is searched in: {1}" -f $packName, (($archives | ForEach-Object Name) -join ', '))

    # One manifest per arrangement. Group them by song key.
    $songs = [System.Collections.Generic.SortedDictionary[string, object]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($json in @($main.Names.Values | Where-Object { $_ -like 'manifests/*.json' })) {
        $attr = $manifestModule::getSingletonAttributes($manifestModule::fromJsonString((Read-EntryText $main $json)))
        $key = "$($attr.SongKey)"
        if (-not $key) { continue }
        if (-not $songs.ContainsKey($key)) {
            $songs[$key] = [pscustomobject]@{ Key = $key; Parts = [System.Collections.Generic.List[object]]::new()
                Artist = ''; Title = ''; Album = ''; Year = ''; Length = $null; Bank = ''; Art = ''; Showlights = ''; DlcKey = '' }
        }
        $song = $songs[$key]
        $sngName = Get-UrnName "$($attr.SongAsset)"
        $part = ($sngName -split '_')[-1].ToLowerInvariant()
        $song.Parts.Add([pscustomobject]@{
            Name = $part; Attributes = $attr
            Sng = Get-Entry $main "songs/bin/generic/$sngName.sng"
            Kind = $(if ($part -eq 'vocals' -or $part -eq 'jvocals') { 'vocals' } else { 'instrumental' })
        })
        # Vocals manifests leave the song fields empty: take them from an instrumental part.
        if (-not $song.Title -and "$($attr.SongName)") {
            $song.Title = "$($attr.SongName)"; $song.Artist = "$($attr.ArtistName)"; $song.Album = "$($attr.AlbumName)"
            $song.Year = "$($attr.SongYear)"; $song.Length = $attr.SongLength; $song.DlcKey = "$($attr.DLCKey)"
        }
        if (-not $song.Bank) { $song.Bank = "$($attr.SongBank)" }
        if (-not $song.Art) { $song.Art = Get-UrnName "$($attr.AlbumArt)" }
        if (-not $song.Showlights) { $song.Showlights = Get-UrnName "$($attr.ShowlightsXML)" }
    }

    foreach ($song in $songs.Values) { if (-not $song.Title) { $song.Title = $song.Key } }

    $done = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($dir in Get-ChildItem -LiteralPath $Library -Directory) {
        # -LiteralPath: folder names such as "Song [key]" are wildcard patterns otherwise.
        $marker = Join-Path $dir.FullName '.psarc-import.json'
        if (Test-Path -LiteralPath $marker) {
            $m = Get-Content -Raw -LiteralPath $marker | ConvertFrom-Json
            if ($m.song_key) { [void]$done.Add("$($m.source)|$($m.song_key)") }
        }
    }

    $all = @($songs.Values)
    if ($Only.Count) { $all = @($all | Where-Object { $Only -contains $_.Key }) }
    if ($Skip.Count) { $all = @($all | Where-Object { $Skip -notcontains $_.Key }) }

    # ── List only ────────────────────────────────────────────────────────────
    if ($ListOnly) {
        $rows = foreach ($song in $all) {
            $audio = Find-Audio $song
            $parts = @($song.Parts | Sort-Object Name)
            $missing = @($parts | Where-Object { -not $_.Sng } | ForEach-Object Name)
            [pscustomobject]@{
                Key = $song.Key; Artist = $song.Artist; Title = $song.Title
                Parts = ($parts.Name -join ' ')
                Charts = "$packName : songs/bin/generic/$($song.Key.ToLowerInvariant())_<part>.sng" + $(if ($missing.Count) { " (missing: $($missing -join ' '))" } else { '' })
                Audio = $(if ($audio) { "{0} : {1} ({2:N1} MB)" -f $audio.Archive.Name, $audio.Wem, ($audio.Size / 1MB) } else { "audio not found ($($song.Bank))" })
                SongLength = $song.Length
                Converted = $done.Contains("$packName|$($song.Key)")
                InLibrary = (Test-Path -LiteralPath (Join-Path $Library (Get-SafeName "$($song.Artist) - $($song.Title)")))
            }
        }
        if ($ListCsv) { $rows | Export-Csv -LiteralPath $ListCsv -NoTypeInformation -Encoding utf8 }
        $rows | Format-Table Key, Artist, Title, Parts, Audio -AutoSize | Out-String -Width 250 | Write-Host
        Write-Host ("{0} songs, {1} with audio, {2} already converted, {3} with the same artist and title in {4}" -f @($rows).Count,
            @($rows | Where-Object { $_.Audio -notlike 'audio not found*' }).Count, @($rows | Where-Object Converted).Count,
            @($rows | Where-Object InLibrary).Count, $Library)
        return
    }

    # ── Convert ──────────────────────────────────────────────────────────────
    if (-not (Test-Path $logFile)) { [System.IO.File]::WriteAllText($logFile, "source,status,folder,message`r`n", $utf8) }
    $todo = @($all | Where-Object { -not $done.Contains("$packName|$($_.Key)") })
    $already = @($songs.Values | Where-Object { $done.Contains("$packName|$($_.Key)") }).Count
    if ($Limit -gt 0) { $todo = @($todo | Select-Object -First $Limit) }
    Write-Host ("{0} songs in the pack, {1} already converted, {2} to convert now" -f $songs.Count, $already, $todo.Count)

    $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'fb-songpack-import'
    $covers = New-Object System.Collections.Generic.List[string]
    $ok = 0; $failed = 0; $i = 0
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    foreach ($song in $todo) {
        $i++
        $source = "$packName`:$($song.Key)"
        $tmp = Join-Path $tmpRoot ([guid]::NewGuid().ToString('N'))
        $stage = $null
        try {
            New-Item -ItemType Directory -Force -Path $tmp | Out-Null
            $audio = Find-Audio $song
            if (-not $audio) { throw "Audio not found: no bank '$($song.Bank)' with its .wem in $(($archives | ForEach-Object Name) -join ', ')" }

            foreach ($part in $song.Parts) {
                if (-not $part.Sng) { Write-Host "    no .sng for part '$($part.Name)', skipped"; continue }
                $s = $main.Psarc.GetEntryStream([string]$part.Sng).GetAwaiter().GetResult()
                try { $sng = Invoke-FSharpAsync ([Rocksmith2014.SNG.SNGModule]::fromStream($s, $pc)) } finally { $s.Dispose() }
                $target = Join-Path $tmp "arr_$($part.Name)_RS2.xml"
                if ($part.Kind -eq 'vocals') {
                    [void]$importUtils::importVocals([string]$tmp, [string]$target, $part.Attributes, $sng, ($part.Name -eq 'jvocals'))
                } else {
                    # The song key gives the bank name song_<key>.bnk, as a single-song DLC key does.
                    [void]$importUtils::importInstrumental($noAudioFiles, [string]$song.Key.ToLowerInvariant(), [string]$target, $part.Attributes, $sng)
                }
            }
            $xmls = @(Get-ChildItem -LiteralPath $tmp -Filter 'arr_*.xml' -File)
            if (-not @($song.Parts | Where-Object { $_.Kind -eq 'instrumental' -and $_.Sng }).Count) { throw 'No instrumental arrangement in the pack for this song' }

            $folderName = Get-FolderName $song
            $dest = Join-Path $Library $folderName
            $stage = "$dest.partial"
            if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
            New-Item -ItemType Directory -Path $stage | Out-Null

            Save-Entry $audio.Archive $audio.Wem (Join-Path $stage 'audio.wem')
            $xmls | Move-Item -Destination $stage
            $show = Get-Entry $main "songs/arr/$($song.Showlights).xml"
            if ($show) { Save-Entry $main $show (Join-Path $stage 'arr_showlights_RS2.xml') }
            # Note times in these XMLs are already absolute audio times. The
            # importer writes <offset> = -startBeat for information only, but
            # FeedBack adds a loose folder's <offset> to the clock, which would
            # put every note late by startBeat seconds. Set it to 0.
            foreach ($x in Get-ChildItem -LiteralPath $stage -Filter 'arr_*.xml' -File) {
                $bytes = [System.IO.File]::ReadAllBytes($x.FullName)
                $bom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
                $text = [System.Text.Encoding]::UTF8.GetString($bytes, $(if ($bom) { 3 } else { 0 }), $bytes.Length - $(if ($bom) { 3 } else { 0 }))
                $fixed = ([regex]'<offset>[^<]*</offset>').Replace($text, '<offset>0.000</offset>', 1)
                if ($fixed -ne $text) {
                    [System.IO.File]::WriteAllText($x.FullName, $fixed, (New-Object System.Text.UTF8Encoding($bom)))
                }
            }
            # Album art comes in 64, 128 and 256 pixel sizes: keep the largest.
            $art = @('256', '128', '64') | ForEach-Object { Get-Entry $main "gfxassets/album_art/$($song.Art)_$_.dds" } | Where-Object { $_ } | Select-Object -First 1
            if ($art) { Save-Entry $main $art (Join-Path $stage 'cover.dds') }

            $manifest = [ordered]@{ title = $song.Title; artist = $song.Artist; album = $song.Album; year = $song.Year }
            [System.IO.File]::WriteAllText((Join-Path $stage 'manifest.json'), ($manifest | ConvertTo-Json), $utf8)
            $marker = [ordered]@{ source = $packName; size = (Get-Item -LiteralPath $Pack).Length; song_key = $song.Key; dlc_key = $song.DlcKey
                audio_source = $audio.Archive.Name; imported_at = (Get-Date).ToString('o') }
            [System.IO.File]::WriteAllText((Join-Path $stage '.psarc-import.json'), ($marker | ConvertTo-Json), $utf8)

            Move-Item -LiteralPath $stage -Destination $dest
            if (Test-Path -LiteralPath (Join-Path $dest 'cover.dds')) { $covers.Add((Join-Path $dest 'cover.dds')) }
            $ok++
            Write-Log @{ Source = $source; Status = 'ok'; Folder = $folderName; Message = "$($xmls.Count) xml, audio from $($audio.Archive.Name)" }
            Write-Host ("[{0}/{1}] ok      {2} -> {3}" -f $i, $todo.Count, $song.Key, $folderName)
        } catch {
            $failed++
            $msg = ($_.Exception.GetBaseException().Message -replace '\s+', ' ')
            if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
            Write-Log @{ Source = $source; Status = 'failed'; Folder = ''; Message = $msg }
            Write-Host ("[{0}/{1}] FAILED  {2}: {3}" -f $i, $todo.Count, $song.Key, $msg)
        } finally {
            Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    if ($covers.Count) {
        New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
        $list = Join-Path $tmpRoot 'covers.txt'
        [System.IO.File]::WriteAllLines($list, $covers, $utf8)
        & $python -I (Join-Path $PSScriptRoot 'dds_to_jpg.py') $list
    }
    Write-Host ("Done in {0:N0} s: {1} converted, {2} failed. Log: {3}" -f $sw.Elapsed.TotalSeconds, $ok, $failed, $logFile)
} finally {
    foreach ($a in $archives) { $a.Psarc.Dispose() }
}
