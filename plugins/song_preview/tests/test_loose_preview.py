"""Loose-folder previews: the source WEM, the clip in the song folder, and
the background warm-up. Decoding is stubbed: no
vgmstream or ffmpeg needed."""

import os
import sys
import types
from pathlib import Path

import pytest
from fastapi import HTTPException

import routes


def _song(root, name, preview=False):
    d = root / name
    d.mkdir(parents=True)
    (d / "audio.wem").write_bytes(b"full" * 100)
    (d / "arr_lead_RS2.xml").write_text("<song/>", encoding="utf-8")
    if preview:  # a preview WEM is never the main audio
        (d / "audio_preview.wem").write_bytes(b"prev" * 10)
    return d


@pytest.fixture
def cache(tmp_path, monkeypatch):
    c = tmp_path / "cache"
    c.mkdir()
    monkeypatch.setattr(routes, "_cache_dir", c)
    monkeypatch.setattr(routes, "_warmup_failed_keys", set())
    return c


def test_source_is_audio_wem_not_a_preview_wem(tmp_path):
    d = _song(tmp_path, "Song", preview=True)
    wem, key = routes._loose_preview_source(d)
    assert wem == (d / "audio.wem").resolve()
    assert key


def test_source_404s_without_audio(tmp_path):
    d = tmp_path / "Empty"
    d.mkdir()
    with pytest.raises(HTTPException) as exc:
        routes._loose_preview_source(d)
    assert exc.value.status_code == 404


def test_loose_song_dirs_skips_non_songs(tmp_path):
    _song(tmp_path, "A")
    _song(tmp_path, "B", preview=True)
    (tmp_path / "Junk").mkdir()
    (tmp_path / "Junk" / "x_preview.wem").write_bytes(b"x")
    found = {d.name for d in routes._loose_song_dirs(tmp_path)}
    assert found == {"A", "B"}


def _fake_make(cache_dir, made):
    def fake(song_dir):
        _wem, key = routes._loose_preview_source(song_dir)
        out = cache_dir / f"{key}.ogg"
        out.write_bytes(b"o" * 2000)
        made.append(song_dir.name)
        return out
    return fake


def test_warmup_makes_missing_clips_and_skips_cached(tmp_path, cache, monkeypatch):
    lib = tmp_path / "lib"
    _song(lib, "A")
    _song(lib, "B")
    made = []
    monkeypatch.setattr(routes, "_loose_preview_ogg", _fake_make(cache, made))
    routes._warmup_pass(lib)
    assert sorted(made) == ["A", "B"]
    assert routes._warmup_state["made"] == 2
    assert routes._warmup_state["running"] is False

    made.clear()
    routes._warmup_pass(lib)
    assert made == []
    assert routes._warmup_state["made"] == 0


def test_warmup_does_not_retry_a_failed_song(tmp_path, cache, monkeypatch):
    lib = tmp_path / "lib"
    _song(lib, "Short")
    calls = []

    def fail(song_dir):
        calls.append(song_dir.name)
        raise HTTPException(status_code=404, detail="could not generate preview")

    monkeypatch.setattr(routes, "_loose_preview_ogg", fail)
    routes._warmup_pass(lib)
    routes._warmup_pass(lib)
    assert calls == ["Short"]
    assert routes._warmup_state["failed"] == 1


def test_warmup_stops_before_the_cache_cap(tmp_path, cache, monkeypatch):
    lib = tmp_path / "lib"
    _song(lib, "A")
    _song(lib, "B")
    made = []
    monkeypatch.setattr(routes, "_loose_preview_ogg", _fake_make(cache, made))
    # 2000 bytes per fake clip: after the first clip the cache is past 90 %.
    monkeypatch.setattr(routes, "_CACHE_MAX_BYTES", 2000)
    routes._warmup_pass(lib)
    assert len(made) == 1
    assert routes._warmup_state["stopped"] == "cache full"


def test_warmup_status_route(client):
    r = client.get("/api/plugins/song_preview/warmup-status")
    assert r.status_code == 200
    body = r.json()
    assert {"enabled", "running", "total", "done", "made", "failed"} <= set(body)


# ── Clips in the song folder (preview.ogg) ──────────────────────────────────

def _clip(song_dir, age_vs_audio, size=2000):
    """Write preview.ogg, ``age_vs_audio`` seconds newer than audio.wem."""
    clip = song_dir / "preview.ogg"
    clip.write_bytes(b"c" * size)
    t = (song_dir / "audio.wem").stat().st_mtime
    os.utime(clip, (t + age_vs_audio, t + age_vs_audio))
    return clip


def test_library_clip_fresh_or_stale(tmp_path):
    d = _song(tmp_path, "Song")
    _clip(d, 10)
    assert routes._library_clip(d) == (d / "preview.ogg").resolve()
    _clip(d, -1)  # inside the 2 s slack of a FAT copy
    assert routes._library_clip(d) is not None
    _clip(d, -10)
    assert routes._library_clip(d) is None


def test_library_clip_too_small_is_ignored(tmp_path):
    d = _song(tmp_path, "Song")
    _clip(d, 10, size=10)
    assert routes._library_clip(d) is None


@pytest.fixture
def fake_decode(monkeypatch):
    """Stub the decode and the clip cut. Returns the start hints passed in."""
    hints = []

    def convert_wem(_src, base, keep_wav=False):
        wav = Path(base + ".wav")
        wav.write_bytes(b"wav")
        return str(wav)

    def build(_path, _ffmpeg, _tmp, start_hint=None):
        hints.append(start_hint)
        return b"o" * 3000, "test"

    monkeypatch.setitem(sys.modules, "audio", types.SimpleNamespace(
        convert_wem=convert_wem, _ffmpeg_cmd=lambda: "ffmpeg"))
    monkeypatch.setattr(routes, "_backfill", types.SimpleNamespace(
        build_preview_from_audio_file=build,
        loose_chorus_start=lambda _d: (9.0, "chorus"),
    ))
    return hints


def test_loose_clip_goes_into_the_song_folder(tmp_path, cache, fake_decode):
    d = _song(tmp_path, "Song").resolve()
    out = routes._loose_preview_ogg(d)
    assert out == d / "preview.ogg"
    assert out.read_bytes() == b"o" * 3000
    assert fake_decode == [(9.0, "chorus")]
    assert list(cache.glob("*.ogg")) == []
    # The next hover serves the same file and makes nothing.
    assert routes._loose_preview_ogg(d) == out
    assert len(fake_decode) == 1


def test_unwritable_song_folder_uses_the_cache(tmp_path, cache, fake_decode, capsys):
    d = _song(tmp_path, "Song").resolve()
    (d / "preview.ogg").mkdir()  # the clip cannot replace a directory
    out = routes._loose_preview_ogg(d)
    assert out.parent == cache
    assert "cannot write preview.ogg" in capsys.readouterr().out
    assert routes._loose_preview_ogg(d) == out
    assert len(fake_decode) == 1


def test_warmup_skips_a_song_with_a_library_clip(tmp_path, cache, monkeypatch):
    lib = tmp_path / "lib"
    _clip(_song(lib, "A"), 10)
    made = []
    monkeypatch.setattr(routes, "_loose_preview_ogg", _fake_make(cache, made))
    routes._warmup_pass(lib)
    assert made == []


def test_warmup_library_clips_ignore_the_cache_cap(tmp_path, cache, monkeypatch, fake_decode):
    lib = tmp_path / "lib"
    _song(lib, "A")
    _song(lib, "B")
    (cache / "old.ogg").write_bytes(b"x" * 5000)  # the cache is already full
    monkeypatch.setattr(routes, "_CACHE_MAX_BYTES", 2000)
    routes._warmup_pass(lib)
    assert routes._warmup_state["made"] == 2
    assert routes._warmup_state["stopped"] == ""
    assert (lib / "A" / "preview.ogg").is_file()
