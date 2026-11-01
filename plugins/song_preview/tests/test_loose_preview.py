"""Loose-folder previews: source pick (pack preview vs audio.wem) and the
background warm-up. Decoding is stubbed: no vgmstream or ffmpeg needed."""

import pytest
from fastapi import HTTPException

import routes


def _song(root, name, preview=False):
    d = root / name
    d.mkdir(parents=True)
    (d / "audio.wem").write_bytes(b"full" * 100)
    (d / "arr_lead_RS2.xml").write_text("<song/>", encoding="utf-8")
    if preview:
        (d / "audio_preview.wem").write_bytes(b"prev" * 10)
    return d


@pytest.fixture
def cache(tmp_path, monkeypatch):
    c = tmp_path / "cache"
    c.mkdir()
    monkeypatch.setattr(routes, "_cache_dir", c)
    monkeypatch.setattr(routes, "_warmup_failed_keys", set())
    return c


def test_source_prefers_the_pack_preview(tmp_path):
    d = _song(tmp_path, "With Preview", preview=True)
    wem, key, official = routes._loose_preview_source(d)
    assert official is True
    assert wem == (d / "audio_preview.wem").resolve()
    assert key


def test_source_falls_back_to_audio_wem(tmp_path):
    d = _song(tmp_path, "No Preview")
    wem, _key, official = routes._loose_preview_source(d)
    assert official is False
    assert wem == (d / "audio.wem").resolve()


def test_pack_preview_gets_its_own_cache_key(tmp_path):
    d = _song(tmp_path, "Song")
    _wem, key_full, _ = routes._loose_preview_source(d)
    (d / "audio_preview.wem").write_bytes(b"prev" * 10)
    _wem, key_preview, _ = routes._loose_preview_source(d)
    assert key_full != key_preview


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
        _wem, key, _ = routes._loose_preview_source(song_dir)
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
