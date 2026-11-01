from __future__ import annotations

import asyncio
import hashlib
import os
import re
import sys
import tempfile
import threading
import zipfile
import yaml
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

# server.py normally puts lib/ on the path; this is just for direct/reloaded use.
_LIB = Path(__file__).resolve().parents[2] / "lib"
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

_context: dict = {}
_cache_dir: Path | None = None

# The backfill sibling module, loaded once in setup(). Module-level helpers
# (e.g. _loose_preview_ogg, run from the /audio executor) reach it through
# here rather than re-importing, so the host's load_sibling namespacing is
# honoured exactly once.
_backfill = None

# One lock per cache key so concurrent requests for the same file don't both transcode.
_transcode_locks: dict[str, threading.Lock] = {}
_locks_mutex = threading.Lock()

# Cap the OGG cache. Without this, the directory grows one file per song forever.
# A clip is about 420 KB, so 1 GiB holds about 2400 clips: a whole library of
# loose folders fits, and the warm-up below can fill it without eviction.
_CACHE_MAX_BYTES = 1024 * 1024 * 1024

# Background warm-up of loose-folder previews: make every missing clip one
# time, so a hover never waits for a decode. FEEDBACK_PREVIEW_WARMUP=0 turns
# it off. One worker, one song at a time, so it takes about one CPU core.
_WARMUP_START_DELAY_S = 20.0
_WARMUP_REPEAT_S = 600.0
# Stop a warm-up pass at this fraction of the cap, so it never evicts clips.
_WARMUP_CACHE_FRACTION = 0.9
_warmup_stop = threading.Event()
_warmup_thread: threading.Thread | None = None
_warmup_state_lock = threading.Lock()
_warmup_failed_keys: set[str] = set()
_warmup_state: dict = {
    "enabled": False, "running": False, "passes": 0,
    "total": 0, "done": 0, "made": 0, "failed": 0, "stopped": "",
}

# The official preview clip of a Rocksmith pack, extracted next to audio.wem
# by tools/psarc_import/Extract-Previews.ps1. Any other *.wem with "preview"
# in its name also counts (the library scan already skips those as main audio).
_PREVIEW_WEM_NAMES = ("audio_preview.wem",)

# Hard cap on a single preview clip we'll read into memory. Real previews are
# tens of KB to a few MB; anything larger is either malformed or a crafted
# (zip-bomb-style) sloppak trying to exhaust memory, so we refuse it.
_MAX_PREVIEW_BYTES = 32 * 1024 * 1024


def _get_cache_dir() -> Path:
    global _cache_dir
    if _cache_dir is not None:
        return _cache_dir
    config_dir = _context.get("config_dir") or os.environ.get("CONFIG_DIR", "")
    base = Path(config_dir) if config_dir else Path(tempfile.gettempdir())
    _cache_dir = base / "song_preview_cache"
    _cache_dir.mkdir(parents=True, exist_ok=True)
    return _cache_dir


def _transcode_lock(key: str) -> threading.Lock:
    with _locks_mutex:
        if key not in _transcode_locks:
            _transcode_locks[key] = threading.Lock()
        return _transcode_locks[key]


def _evict_cache(max_bytes: int = _CACHE_MAX_BYTES) -> None:
    """Bound the OGG cache by deleting the oldest entries until under max_bytes."""
    try:
        entries: list[tuple[float, int, Path]] = []
        total = 0
        for p in _get_cache_dir().glob("*.ogg"):
            try:
                st = p.stat()
            except OSError:
                continue
            entries.append((st.st_mtime, st.st_size, p))
            total += st.st_size
        if total <= max_bytes:
            return
        entries.sort(key=lambda e: e[0])
        for _, size, p in entries:
            if total <= max_bytes:
                break
            try:
                p.unlink()
                total -= size
            except OSError:
                pass
    except Exception as e:
        print(f"[song_preview] cache eviction failed: {e}")


def _touch_cache_entry(path: Path) -> None:
    # Bumps mtime so LRU eviction keeps the recently-used entries.
    try:
        os.utime(path, None)
    except OSError:
        pass


def _read_sloppak_preview(sloppak_path: Path) -> bytes | None:
    """Return the raw bytes of the embedded preview clip from a sloppak, or
    None if the sloppak doesn't declare one.

    Sloppaks produced by `sloppak_converter` >= the preview-embed branch
    carry a baked preview clip (OGG) as `preview.ogg` at sloppak root,
    referenced via a top-level `preview:` field in manifest.yaml. Older /
    hand-authored sloppaks without that field return None and the caller
    surfaces a 404 — there's no sensible auto-fallback because the split
    stems are full-length, so picking "the smallest stem" would land on a
    4-minute drum track, not a 20-second preview clip.

    Handles both sloppak forms: zip-archive (the converter's default
    output) and on-disk directory (the authoring shape).
    """
    if sloppak_path.is_dir():
        for candidate in ("manifest.yaml", "manifest.yml"):
            mf = sloppak_path / candidate
            if mf.exists():
                break
        else:
            return None
        try:
            manifest = yaml.safe_load(mf.read_text(encoding="utf-8")) or {}
        except Exception as e:
            print(f"[song_preview] failed to parse sloppak manifest {mf}: {e}")
            return None
        rel = manifest.get("preview")
        if not isinstance(rel, str) or not rel:
            return None
        # Defence against `preview: ../foo` AND a symlink inside the sloppak
        # pointing outside it — either would otherwise let a crafted sloppak
        # have us read (and /audio stream straight back) an arbitrary host file.
        rel_p = Path(rel)
        if rel_p.is_absolute() or any(p == ".." for p in rel_p.parts):
            return None
        try:
            base = sloppak_path.resolve()
            target = (base / rel_p).resolve()
            target.relative_to(base)
        except (OSError, ValueError):
            return None
        if not target.is_file():
            return None
        if target.stat().st_size > _MAX_PREVIEW_BYTES:
            print(f"[song_preview] preview in {sloppak_path.name} exceeds size cap; ignoring")
            return None
        return target.read_bytes()

    # Zip form. Open once and pull both manifest + preview without ever
    # extracting to disk — preview clips are tens of KB to ~MB at most,
    # so an in-memory round-trip is cheaper than the zipfile setup cost
    # of doing it twice.
    try:
        with zipfile.ZipFile(str(sloppak_path), "r") as zf:
            names = set(zf.namelist())
            mf_name = next(
                (n for n in ("manifest.yaml", "manifest.yml") if n in names),
                None,
            )
            if mf_name is None:
                return None
            with zf.open(mf_name) as f:
                manifest = yaml.safe_load(f.read().decode("utf-8")) or {}
            rel = manifest.get("preview")
            if not isinstance(rel, str) or not rel:
                return None
            rel_p = Path(rel)
            if rel_p.is_absolute() or any(p == ".." for p in rel_p.parts):
                return None
            # zipfile uses forward-slash internal paths regardless of OS.
            zip_rel = rel.replace("\\", "/")
            try:
                info = zf.getinfo(zip_rel)
            except KeyError:
                return None
            # Refuse a zip-bomb preview entry before reading it into memory —
            # check the declared uncompressed size first.
            if info.file_size > _MAX_PREVIEW_BYTES:
                print(f"[song_preview] preview in {sloppak_path.name} exceeds size cap; ignoring")
                return None
            with zf.open(info) as f:
                return f.read()
    except (zipfile.BadZipFile, OSError) as e:
        print(f"[song_preview] failed to read sloppak {sloppak_path.name}: {e}")
        return None


def _sloppak_preview_ogg(sloppak_path: Path) -> Path:
    """Extract a sloppak's embedded preview OGG into the on-disk cache and
    return the cached path.

    No transcoding is needed — sloppaks store the preview as OGG already
    (baked in at convert/backfill time). We still materialise to disk
    because `_range_response` streams from a file path so HTTP byte-range
    seeks work — without that the `<audio>` element can't scrub.

    Cache key includes mtime+size: a re-converted or re-backfilled sloppak
    overwrites the same path with new preview bytes, and a path-only key
    would serve stale audio.
    """
    stat = sloppak_path.stat()
    key_input = f"v1-sloppak:{sloppak_path}:{stat.st_mtime}:{stat.st_size}"
    cache_key = hashlib.sha256(key_input.encode()).hexdigest()[:20]
    out = _get_cache_dir() / f"{cache_key}.ogg"
    lock = _transcode_lock(cache_key)
    with lock:
        if out.exists() and out.stat().st_size > 1000:
            _touch_cache_entry(out)
            return out

        data = _read_sloppak_preview(sloppak_path)
        if not data:
            raise HTTPException(
                status_code=404,
                detail="sloppak has no embedded preview clip "
                       "(re-convert with the latest sloppak_converter to backfill)",
            )
        # Atomic write so a partial-write crash doesn't pollute the cache
        # with a truncated OGG the size-check above would still accept on
        # the next request. The finally clears a leftover .tmp if write/replace
        # is interrupted — the eviction sweep only matches *.ogg, so a stranded
        # .ogg.tmp would otherwise linger uncounted.
        tmp = out.with_suffix(out.suffix + ".tmp")
        try:
            tmp.write_bytes(data)
            tmp.replace(out)
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
        # Keep the sloppak preview cache under the same LRU cap as everything
        # else in the cache dir. Without this the cache grows without bound.
        _evict_cache()
    return out


def _contained_file(path: Path, root: Path) -> Path | None:
    """Resolve ``path`` and return it only when it is a file inside ``root``.

    Defeats a symlinked .wem that points outside the folder, which would
    otherwise turn convert_wem into an arbitrary-file decode primitive.
    """
    try:
        resolved = path.resolve()
        resolved.relative_to(root)
    except (OSError, ValueError):
        return None
    return resolved if resolved.is_file() else None


def _find_preview_wem(song_dir: Path) -> Path | None:
    """Return the pack's own preview clip in a loose folder, or None."""
    root = song_dir.resolve()
    candidates = [song_dir / n for n in _PREVIEW_WEM_NAMES]
    try:
        candidates += sorted(
            p for p in song_dir.glob("*.wem") if "preview" in p.stem.lower()
        )
    except OSError:
        pass
    for cand in candidates:
        found = _contained_file(cand, root)
        if found is not None:
            return found
    return None


def _loose_preview_source(song_dir: Path) -> tuple[Path, str, bool]:
    """Pick the source WEM of a loose-folder preview and its cache key.

    Returns ``(wem_path, cache_key, official)``. ``official`` is True when the
    source is the pack's own preview clip. The key includes the source's
    mtime+size, so a re-encoded or newly extracted WEM invalidates the clip
    (mirrors how the host's own loose-folder audio cache is keyed). Raises
    ``HTTPException`` (400/404) when the folder has no usable audio.
    """
    # Host libs (lib/ is on sys.path via the plugin loader / the _LIB shim
    # above). Imported lazily so module import doesn't hard-depend on the
    # host being fully wired — matches how the audio module is pulled in
    # elsewhere in this plugin.
    try:
        import loosefolder as loosefolder_mod  # noqa: PLC0415
    except ImportError as e:
        print(f"[song_preview] loose-folder preview unavailable (host libs): {e}")
        raise HTTPException(status_code=404, detail="loose-folder preview unavailable")

    official = True
    wem_resolved = _find_preview_wem(song_dir)
    if wem_resolved is None:
        official = False
        wem = loosefolder_mod.find_audio(song_dir)
        if wem is None:
            raise HTTPException(status_code=404, detail="loose folder has no audio")
        # Re-resolve and re-confirm containment. Mirrors the host's own guard.
        wem_resolved = _contained_file(wem, song_dir.resolve())
        if wem_resolved is None:
            raise HTTPException(status_code=400, detail="audio escapes the loose folder")

    try:
        wem_stat = wem_resolved.stat()
    except OSError:
        raise HTTPException(status_code=404, detail="loose folder has no audio")

    # v2-loose: a clip cut from audio.wem starts at the chorus. The v1-loose
    # clips (loudest 30 s) are made again, and LRU eviction removes them.
    kind = "v1-loose-preview" if official else "v2-loose"
    key_input = f"{kind}:{song_dir}:{wem_stat.st_mtime}:{wem_stat.st_size}"
    cache_key = hashlib.sha256(key_input.encode()).hexdigest()[:20]
    return wem_resolved, cache_key, official


def _is_cached(cache_key: str) -> bool:
    """True when the clip of ``cache_key`` is already in the cache."""
    try:
        return (_get_cache_dir() / f"{cache_key}.ogg").stat().st_size > 1000
    except OSError:
        return False


def _loose_preview_ogg(song_dir: Path) -> Path:
    """Generate (and cache) a preview OGG for a loose-folder song.

    Loose folders are unpacked song directories (``audio.wem`` + arrangement
    XMLs) with no sloppak manifest, so there's no baked ``preview.ogg`` to
    extract and nowhere natural to inject one. Instead we generate a preview
    on demand from the folder's own WEM — decode it via the host's
    ``convert_wem`` (vgmstream → ogg/mp3), trim+fade a clip out of it — and
    cache the result. No file is written into the user's loose folder.

    Cache key includes the WEM's mtime+size, so re-encoding the audio
    in place naturally invalidates a stale preview (mirrors how the host's
    own loose-folder audio cache is keyed).

    When the folder holds the pack's own preview clip (``audio_preview.wem``),
    that clip is the source: the charter picked it, and it is only 30 s to
    decode. Otherwise the clip comes from ``audio.wem``.

    Any failure to produce a preview (missing decoder, song too short, no
    audio) raises ``HTTPException(404)`` so the client memoises it and the
    hover loop stops retrying — there's no per-card Fix affordance for loose
    songs, and these failure modes are persistent, not transient.
    """
    try:
        from audio import convert_wem, _ffmpeg_cmd  # noqa: PLC0415
    except ImportError as e:
        print(f"[song_preview] loose-folder preview unavailable (host libs): {e}")
        raise HTTPException(status_code=404, detail="loose-folder preview unavailable")

    wem_resolved, cache_key, official = _loose_preview_source(song_dir)
    out = _get_cache_dir() / f"{cache_key}.ogg"
    lock = _transcode_lock(cache_key)
    with lock:
        if out.exists() and out.stat().st_size > 1000:
            _touch_cache_entry(out)
            return out

        try:
            with tempfile.TemporaryDirectory(prefix="song_preview_loose_") as td:
                tmp_dir = Path(td)
                # keep_wav: the clip builder reads the audio with ffmpeg again,
                # so the MP3 encode of the full song (about 2 s) is waste.
                converted = convert_wem(
                    str(wem_resolved), str(tmp_dir / "full"), keep_wav=True
                )
                if official:
                    # The pack's preview is already the clip: no start search.
                    data = _backfill._render_preview_clip(
                        Path(converted), 0.0, _ffmpeg_cmd(), tmp_dir
                    )
                else:
                    data, _reason = _backfill.build_preview_from_audio_file(
                        Path(converted), _ffmpeg_cmd(), tmp_dir,
                        start_hint=_backfill.loose_chorus_start(song_dir),
                    )
        except HTTPException:
            raise
        except Exception as e:
            # Persistent failure (no decoder, too short, corrupt WEM) — surface
            # as 404 so the client's no-preview memo kicks in. Detail is logged,
            # not echoed verbatim to the client.
            print(f"[song_preview] loose-folder preview failed for {song_dir.name}: {e}")
            raise HTTPException(status_code=404, detail="could not generate preview")

        if not data:
            raise HTTPException(status_code=404, detail="could not generate preview")

        # Atomic write, same discipline as the sloppak preview cache.
        tmp = out.with_suffix(out.suffix + ".tmp")
        try:
            tmp.write_bytes(data)
            tmp.replace(out)
        finally:
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
        _evict_cache()
    return out


def _loose_song_dirs(dlc_root: Path) -> list[Path]:
    """Every loose-folder song under ``dlc_root``.

    Same rule as the library scan (lib/scan.py): a folder with a non-preview
    *.wem and an arrangement XML, and not a sloppak/feedpak directory.
    """
    try:
        import loosefolder as loosefolder_mod  # noqa: PLC0415
    except ImportError:
        return []
    found: list[Path] = []
    seen: set[Path] = set()
    for wem in sorted(dlc_root.rglob("*.wem")):
        if "preview" in wem.stem.lower():
            continue
        d = wem.parent
        if d in seen:
            continue
        seen.add(d)
        if d.name.lower().endswith((".sloppak", ".feedpak")):
            continue
        if loosefolder_mod.is_loose_song(d):
            found.append(d)
    return found


def _cache_bytes() -> int:
    total = 0
    for p in _get_cache_dir().glob("*.ogg"):
        try:
            total += p.stat().st_size
        except OSError:
            pass
    return total


def _set_warmup(**fields) -> None:
    with _warmup_state_lock:
        _warmup_state.update(fields)


def _warmup_pass(dlc_root: Path) -> None:
    """Make the missing preview clip of each loose folder, one at a time."""
    dirs = _loose_song_dirs(dlc_root)
    budget = int(_CACHE_MAX_BYTES * _WARMUP_CACHE_FRACTION)
    used = _cache_bytes()
    made = failed = 0
    _set_warmup(running=True, total=len(dirs), done=0, made=0, failed=0, stopped="")
    for i, d in enumerate(dirs, 1):
        if _warmup_stop.is_set():
            _set_warmup(stopped="shutdown")
            break
        # Resolve like /audio does ((dlc_root / file).resolve()), so the
        # cache key matches the key of a hover on the same song.
        full = d.resolve()
        key = None
        try:
            _wem, key, _official = _loose_preview_source(full)
            if key in _warmup_failed_keys:
                failed += 1
            elif not _is_cached(key):
                if used >= budget:
                    _set_warmup(stopped="cache full")
                    break
                out = _loose_preview_ogg(full)
                used += out.stat().st_size
                made += 1
        except Exception as e:
            # A song that fails once (too short, corrupt WEM) fails again:
            # skip it in later passes until its audio changes (new key).
            failed += 1
            if key:
                _warmup_failed_keys.add(key)
            if not isinstance(e, HTTPException):
                print(f"[song_preview] warm-up failed for {d.name}: {e}")
        _set_warmup(done=i, made=made, failed=failed)
    with _warmup_state_lock:
        _warmup_state["running"] = False
        _warmup_state["passes"] += 1
        first_pass = _warmup_state["passes"] == 1
    if made or first_pass:
        print(f"[song_preview] warm-up pass: {made} clips made, {failed} failed, "
              f"{len(dirs)} loose songs")


def _warmup_loop() -> None:
    if _warmup_stop.wait(_WARMUP_START_DELAY_S):
        return
    while True:
        get_dlc = _context.get("get_dlc_dir")
        if callable(get_dlc):
            try:
                root = Path(get_dlc())
                if root.is_dir():
                    _warmup_pass(root)
            except Exception as e:
                _set_warmup(running=False)
                print(f"[song_preview] warm-up pass failed: {e}")
        # Repeat, so songs imported later also get a clip.
        if _warmup_stop.wait(_WARMUP_REPEAT_S):
            return


def _start_warmup() -> None:
    global _warmup_thread
    if os.environ.get("FEEDBACK_PREVIEW_WARMUP", "1").strip() == "0":
        return
    if _warmup_thread is not None and _warmup_thread.is_alive():
        return
    _warmup_stop.clear()
    _set_warmup(enabled=True)
    _warmup_thread = threading.Thread(
        target=_warmup_loop, name="song_preview-warmup", daemon=True
    )
    _warmup_thread.start()


def _range_response(path: Path, request: Request) -> StreamingResponse:
    """Stream the file with HTTP range support so <audio> can seek."""
    file_size = path.stat().st_size
    range_header = request.headers.get("range", "")
    match = re.match(r"bytes=(\d*)-(\d*)", range_header)

    if match:
        start = int(match.group(1) or 0)
        end = int(match.group(2)) if match.group(2) else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        def _iter_range():
            with open(path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            _iter_range(),
            status_code=206,
            media_type="audio/ogg",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(length),
                "Accept-Ranges": "bytes",
            },
        )

    def _iter_full():
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter_full(),
        media_type="audio/ogg",
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        },
    )


def _resolve_dlc_path(file: str) -> Path:
    """Validate ``file`` is a sloppak-form path under the DLC root and return it.

    Centralises the same traversal guards `/audio` already uses so the
    backfill endpoints can't be tricked into reading or writing outside
    the DLC dir. Raises HTTPException with a 400/404/503 status — caller
    can let it propagate.
    """
    if not file:
        raise HTTPException(status_code=400, detail="file parameter required")
    try:
        p = Path(file)
        if p.is_absolute() or any(part == ".." for part in p.parts):
            raise ValueError("path traversal")
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid file path")
    get_dlc = _context.get("get_dlc_dir")
    if not callable(get_dlc):
        raise HTTPException(status_code=503, detail="DLC folder not configured")
    dlc_root = Path(get_dlc()).resolve()
    full = (dlc_root / file).resolve()
    try:
        full.relative_to(dlc_root)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid file path")
    if not full.exists():
        raise HTTPException(status_code=404, detail="file not found")
    return full


def setup(app: FastAPI, context: dict) -> None:
    global _context
    _context = context

    # backfill ships as a sibling module so we can load it under a
    # plugin-namespaced name (per the host's plugin-loader convention).
    # A bare `import backfill` would risk colliding with another plugin
    # shipping the same module name.
    global _backfill
    loader = context.get("load_sibling")
    if callable(loader):
        backfill = loader("backfill")
    else:
        # Older hosts without load_sibling: fall back to bare import.
        # The plugin dir is on sys.path via the host plugin loader.
        import backfill  # type: ignore[import-not-found]  # noqa: PLC0415

    # Stash for module-level helpers (e.g. _loose_preview_ogg) that run off
    # the request path and need the same loaded instance.
    _backfill = backfill

    _bulk_runner = backfill.BulkRunner()

    # Per-file backfill progress, driving the determinate progress bar in the
    # UI. Keyed by the sloppak relpath (the same value the client passes as
    # ?file=). A single fix is a handful of discrete blocking steps, not a
    # streamable byte count, so progress is coarse: each step reports a
    # stage name + a fraction the bar animates to. Updated from worker threads
    # (the single-fix executor and BulkRunner both call _do_backfill_one), read
    # by the /backfill-progress poll — hence the lock.
    _file_progress: dict[str, dict] = {}
    _file_progress_lock = threading.Lock()

    def _set_progress(filename: str, stage: str, fraction: float) -> None:
        with _file_progress_lock:
            _file_progress[filename] = {"stage": stage, "progress": round(fraction, 3)}

    def _clear_progress(filename: str) -> None:
        with _file_progress_lock:
            _file_progress.pop(filename, None)

    def _do_backfill_one(entry) -> None:
        """Single-song backfill body shared by /backfill and Fix-All.

        Generates a preview from the sloppak's own full-mix audio:
        section-aware start, 30s clip, 1s fades.

        Reports coarse progress stages via _set_progress so the UI bar
        advances through the real work instead of flashing. The long
        opaque step (generate) holds at its checkpoint until the next one
        fires — honest about what's actually known.
        """
        fn = entry.filename
        _set_progress(fn, "resolving", 0.08)
        sloppak_path = _resolve_dlc_path(fn)
        with tempfile.TemporaryDirectory(prefix="song_preview_backfill_") as td:
            tmp_dir = Path(td)
            # Resolve ffmpeg lazily — the audio module owns discovery
            # (PATH, bundled-binary fallbacks) so we don't duplicate it.
            _set_progress(fn, "generating", 0.45)
            from audio import _ffmpeg_cmd  # noqa: PLC0415
            ogg_bytes, _ = backfill.build_preview_from_full_audio(
                sloppak_path, _ffmpeg_cmd(), tmp_dir
            )
        _set_progress(fn, "injecting", 0.85)
        backfill.inject_preview(sloppak_path, ogg_bytes)
        _set_progress(fn, "done", 1.0)

    @app.get("/api/plugins/song_preview/audit")
    async def get_audit():
        """Return every sloppak under the DLC root that lacks a preview."""
        get_dlc = _context.get("get_dlc_dir")
        if not callable(get_dlc):
            raise HTTPException(status_code=503, detail="DLC folder not configured")
        dlc_root = Path(get_dlc())
        # Walk happens on a worker so a big library doesn't block the
        # event loop. The walk is read-only — multiple concurrent audits
        # are fine (no shared state to coordinate).
        entries = await asyncio.get_event_loop().run_in_executor(
            None, backfill.audit, dlc_root
        )
        return {
            "missing": [
                {
                    "filename": e.filename,
                    "format": e.format,
                    "title": e.title,
                    "artist": e.artist,
                }
                for e in entries
            ],
            "count": len(entries),
        }

    @app.post("/api/plugins/song_preview/backfill")
    async def post_backfill(file: str):
        """Backfill a single sloppak's preview from its own audio.

        Synchronous from the client's perspective; the heavy work
        (audio decode + clip generation + sloppak repack) runs on a
        worker thread so the event loop stays responsive.
        """
        # Resolve once up front for cheap validation; the actual work
        # repeats the resolution (cheap) inside the worker via the
        # shared helper so a single audit-then-backfill flow stays
        # consistent.
        _resolve_dlc_path(file)

        # Build a one-off MissingEntry so the worker path matches the
        # bulk path exactly — no duplicate logic to drift between.
        entry = backfill.MissingEntry(
            filename=file,
            format="",
        )
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _do_backfill_one, entry
            )
        except HTTPException:
            raise
        except Exception as e:
            print(f"[song_preview] backfill failed for {file!r}: {e}")
            # Echo the message — the UI surfaces it in a toast, and
            # the failure modes here ("song too short", "no usable
            # stems") are actionable for users.
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            # The client snaps its bar to 100% on the 200, so dropping the
            # entry here is safe — and keeps the dict from growing one stale
            # 'done' record per single fix over a long session.
            _clear_progress(file)
        return {"ok": True, "filename": file}

    @app.post("/api/plugins/song_preview/backfill-all")
    async def post_backfill_all():
        """Kick off a Fix-All over every sloppak missing a preview."""
        get_dlc = _context.get("get_dlc_dir")
        if not callable(get_dlc):
            raise HTTPException(status_code=503, detail="DLC folder not configured")
        dlc_root = Path(get_dlc())
        entries = await asyncio.get_event_loop().run_in_executor(
            None, backfill.audit, dlc_root
        )
        # Every missing entry is actionable — each is generated from the
        # song's own audio. Individual failures still get caught and
        # surfaced via BulkState.errors so a problem with one song
        # (e.g. malformed manifest, unsupported audio codec) doesn't
        # abort the whole run.
        started = _bulk_runner.start(entries, _do_backfill_one)
        if not started:
            raise HTTPException(status_code=409, detail="a backfill is already running")
        return {
            "started": True,
            "total": len(entries),
        }

    @app.get("/api/plugins/song_preview/backfill-status")
    def get_backfill_status():
        """Poll-friendly snapshot of the in-flight Fix-All run, if any."""
        return _bulk_runner.state()

    @app.get("/api/plugins/song_preview/backfill-progress")
    def get_backfill_progress(file: str):
        """Coarse per-file progress for the single-fix determinate bar.

        Returns the file's current {stage, progress} while a fix runs, or a
        zeroed idle snapshot if nothing is in flight for it (the client's bar
        is monotonic, so an idle read never drags a live bar backwards).
        """
        with _file_progress_lock:
            return _file_progress.get(file, {"stage": "idle", "progress": 0})

    @app.get("/api/plugins/song_preview/warmup-status")
    def get_warmup_status():
        """Snapshot of the loose-folder preview warm-up (see _warmup_pass)."""
        with _warmup_state_lock:
            return dict(_warmup_state)

    _start_warmup()

    @app.get("/api/plugins/song_preview/js/{filename}")
    def get_js(filename: str, request: Request):
        """Serve modular JS class files from ./js/.

        The host's plugin loader exposes exactly one URL per plugin (the
        manifest's `script` field). To split screen.js across multiple
        classes we have to be our own static-file server for the rest.
        Locked down to bare `.js` filenames inside the js/ subdir — no
        traversal, no other extensions.

        Strong ETag + `must-revalidate` so the browser always asks but
        gets a 304 (no body) when the file is unchanged. Cheaper than
        re-shipping the body on every plugin reload, and doesn't break
        the dev cycle the way a long `max-age` would.
        """
        if not filename.endswith(".js") or "/" in filename \
                or "\\" in filename or filename.startswith("."):
            raise HTTPException(status_code=400, detail="invalid filename")
        js_dir = (Path(__file__).resolve().parent / "js").resolve()
        target = (js_dir / filename).resolve()
        try:
            target.relative_to(js_dir)
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid filename")
        if not target.is_file():
            raise HTTPException(status_code=404, detail="not found")
        body = target.read_bytes()
        etag = '"' + hashlib.sha256(body).hexdigest()[:16] + '"'
        cache_headers = {
            "ETag": etag,
            "Cache-Control": "public, max-age=0, must-revalidate",
        }
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=cache_headers)
        return Response(
            content=body,
            media_type="application/javascript",
            headers=cache_headers,
        )

    @app.api_route("/api/plugins/song_preview/audio", methods=["GET", "HEAD"])
    async def get_audio(file: str, request: Request):
        # HEAD is accepted explicitly so the frontend can probe for
        # "preview available?" without paying for the OGG body. Starlette
        # automatically drops the body when the request method is HEAD,
        # so the same handler covers both. Without this declaration HEAD
        # responses come back 405, which broke the AudioController's
        # 404-memo (it gated on `status === 404` to mark a file as
        # missing-preview, so a 405 just got dropped and the hover loop
        # retried GET indefinitely — visible as hundreds of /audio GETs
        # per second in the access log).
        if not file:
            raise HTTPException(status_code=400, detail="file parameter required")

        # Reject anything that smells like traversal before we touch disk.
        try:
            p = Path(file)
            if p.is_absolute() or any(part == ".." for part in p.parts):
                raise ValueError("path traversal")
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid file path")

        get_dlc = _context.get("get_dlc_dir")
        if not callable(get_dlc):
            raise HTTPException(status_code=503, detail="DLC folder not configured")
        dlc_root = Path(get_dlc())

        # Belt-and-braces: even after resolving symlinks, stay inside the DLC root.
        full = (dlc_root / file).resolve()
        try:
            full.relative_to(dlc_root.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid file path")

        if not full.exists():
            raise HTTPException(status_code=404, detail="file not found")

        file_lower = file.lower()
        try:
            if file_lower.endswith((".sloppak", ".feedpak")):
                # Covers both forms (zip-file and directory) of both package
                # extensions: the legacy `.sloppak` and the current `.feedpak`
                # (identical on-disk layout — manifest.yaml + stems/ + a
                # top-level `preview:` clip — just a renamed container).
                ogg = await asyncio.get_event_loop().run_in_executor(
                    None, _sloppak_preview_ogg, full
                )
            elif full.is_dir():
                # Loose-folder song (audio.wem + arrangement XMLs). No baked
                # preview — generate one on demand from the folder's WEM and
                # cache it. _loose_preview_ogg raises 404 (not 400) on failure
                # so the client memoises and stops retrying on every hover.
                ogg = await asyncio.get_event_loop().run_in_executor(
                    None, _loose_preview_ogg, full
                )
            else:
                raise HTTPException(status_code=400, detail="unsupported file format")
        except HTTPException:
            raise
        except Exception as e:
            # Keep the detail in server logs; don't echo raw exception text to the client.
            print(f"[song_preview] audio preparation failed for {file!r}: {e}")
            raise HTTPException(status_code=500, detail="audio preparation failed")

        return _range_response(ogg, request)