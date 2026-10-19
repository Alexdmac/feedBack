"""Distinct arrangement names for a loose folder with two parts of one type.

The library index (lib/loosefolder.py) and the highway WebSocket number a
repeated name in the same way ("Combo", "Combo 2"), so the library card and
the arrangement switcher show the same distinct names. A scan probe makes an
existing library get the new names without a manual Refresh.
"""

from __future__ import annotations

import concurrent.futures
import importlib
import json
import sys
import unittest.mock as mock

import pytest
from fastapi.testclient import TestClient

import loosefolder


_XML = """<?xml version="1.0" encoding="utf-8"?>
<song>
  <title>T</title>
  <artistName>A</artistName>
  <albumName>Alb</albumName>
  <albumYear>2024</albumYear>
  <songLength>100</songLength>
  <arrangement>{arrangement}</arrangement>
  <offset>0</offset>
  <tuning string0="0" string1="0" string2="0" string3="0" string4="0" string5="0"/>
  <arrangementProperties pathLead="{lead}" pathRhythm="{rhythm}" pathBass="{bass}" bonusArr="0" represent="1"/>
  <levels count="1"><level difficulty="0">{notes}<chords count="0"/><anchors count="0"/><handShapes count="0"/></level></levels>
</song>
"""

_NO_NOTES = '<notes count="0"/>'
_ONE_NOTE = '<notes count="1"><note time="1.0" string="0" fret="3"/></notes>'


def _write_loose_song(dlc_root, *, lead_notes=_NO_NOTES):
    """Two combo parts and a bass part. combo1 is the Rhythm part and combo2
    the Lead part, so the Lead part has index 1 but comes first in display
    order and keeps the plain name "Combo"."""
    song = dlc_root / "Artist" / "Song"
    song.mkdir(parents=True)
    (song / "audio.wem").write_bytes(b"RIFF\x00")
    for fname, arrangement, flags, notes in (
        ("arr_combo1_RS2.xml", "Combo", {"rhythm": 1}, _NO_NOTES),
        ("arr_combo2_RS2.xml", "Combo", {"lead": 1}, lead_notes),
        ("arr_bass_RS2.xml", "Bass", {"bass": 1}, _NO_NOTES),
    ):
        flags = {"lead": 0, "rhythm": 0, "bass": 0, **flags}
        (song / fname).write_text(
            _XML.format(arrangement=arrangement, notes=notes, **flags),
            encoding="utf-8")
    return song


@pytest.fixture()
def make_client(tmp_path, monkeypatch):
    def _make(default_arrangement=None):
        cfg = tmp_path / "config"
        cfg.mkdir(exist_ok=True)
        if default_arrangement is not None:
            (cfg / "config.json").write_text(
                json.dumps({"default_arrangement": default_arrangement}),
                encoding="utf-8")
        monkeypatch.setenv("CONFIG_DIR", str(cfg))
        monkeypatch.setenv("DLC_DIR", str(tmp_path / "dlc"))
        monkeypatch.setenv("FEEDBACK_SYNC_STARTUP", "1")
        sys.modules.pop("server", None)
        server = importlib.import_module("server")
        monkeypatch.setattr(server, "load_plugins", lambda *a, **kw: None)
        monkeypatch.setattr(server, "startup_scan", lambda: None)
        monkeypatch.setattr(server, "SLOPPAK_CACHE_DIR", tmp_path / "cache")
        import appstate as _appstate
        monkeypatch.setattr(_appstate, "sloppak_cache_dir", tmp_path / "cache")
        # The test run has no WEM decoder. Make the conversion fail at once:
        # the song_info frame still comes, with an audio_error.
        from routers import ws_highway

        def _no_decoder(*a, **kw):
            raise RuntimeError("no WEM decoder in tests")
        monkeypatch.setattr(ws_highway, "convert_wem", _no_decoder)
        return server

    (tmp_path / "dlc").mkdir()
    yield _make
    server = sys.modules.get("server")
    conn = getattr(getattr(server, "meta_db", None), "conn", None)
    if conn is not None:
        getattr(server, "_join_background_db_threads", lambda: None)()
        conn.close()


def _song_info(client, path):
    with client.websocket_connect(path) as ws:
        for _ in range(200):
            msg = ws.receive_json()
            if msg.get("error"):
                raise AssertionError(f"WS error frame: {msg}")
            if msg.get("type") == "song_info":
                return msg
            if msg.get("type") == "ready":
                break
    raise AssertionError("no song_info frame received")


def test_switcher_names_match_the_library_index(make_client):
    server = make_client()
    song = _write_loose_song(server._get_dlc_dir())
    index = loosefolder.extract_meta(song)["arrangements"]
    with TestClient(server.app) as client:
        info = _song_info(client, "/ws/highway/Artist/Song?arrangement=0")

    ws_names = {a["index"]: (a["name"], a["smart_name"]) for a in info["arrangements"]}
    lib_names = {a["index"]: (a["name"], a["smart_name"]) for a in index}
    assert ws_names == lib_names == {
        0: ("Combo 2", "Rhythm"),
        1: ("Combo", "Lead"),
        2: ("Bass", "Bass"),
    }
    # The name of the loaded part (the HUD label) is the distinct name too.
    assert info["arrangement_index"] == 0
    assert info["arrangement"] == "Combo 2"
    assert info["arrangement_smart_name"] == "Rhythm"


def test_saved_plain_name_picks_the_main_part(make_client):
    # No notes anywhere, so the most-notes fallback would pick index 0.
    server = make_client(default_arrangement="Combo")
    _write_loose_song(server._get_dlc_dir())
    with TestClient(server.app) as client:
        info = _song_info(client, "/ws/highway/Artist/Song")
    assert info["arrangement_index"] == 1
    assert info["arrangement"] == "Combo"


def test_saved_numbered_name_picks_that_part(make_client):
    # The Lead part (index 1) has the most notes, so the fallback would pick it.
    server = make_client(default_arrangement="Combo 2")
    _write_loose_song(server._get_dlc_dir(), lead_notes=_ONE_NOTE)
    with TestClient(server.app) as client:
        info = _song_info(client, "/ws/highway/Artist/Song")
    assert info["arrangement_index"] == 0
    assert info["arrangement"] == "Combo 2"


# ── scan: rows without smart_name bypass the tree-signature fast path ────────

@pytest.fixture()
def scan_server(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("DLC_DIR", raising=False)
    sys.modules.pop("server", None)
    mod = importlib.import_module("server")
    import scan as scan_mod
    monkeypatch.setattr(
        scan_mod, "_make_scan_executor",
        lambda: concurrent.futures.ThreadPoolExecutor(max_workers=4),
    )
    yield mod
    conn = getattr(getattr(mod, "meta_db", None), "conn", None)
    if conn is not None:
        getattr(mod, "_join_background_db_threads", lambda: None)()
        conn.close()


def test_probe_sees_only_an_absent_smart_name_key(scan_server):
    scan = importlib.import_module("scan")
    db = scan.appstate.meta_db
    assert scan._has_arrangements_without_smart_name() is False
    old = {"type": "combo", "name": "Combo", "file": "a.xml", "index": 0}
    db.put("old/song", 1.0, 1, {"title": "Old", "arrangements": [old]})
    assert scan._has_arrangements_without_smart_name() is True
    # An explicit null is an extraction result, not an old row.
    db.put("old/song", 1.0, 1, {"title": "Old", "arrangements": [
        {**old, "smart_name": None}]})
    assert scan._has_arrangements_without_smart_name() is False


def test_old_rows_are_rescanned_without_a_manual_refresh(tmp_path, scan_server):
    """A settled library takes the fast path and extracts nothing. While a
    row has an arrangement without smart_name (a loose folder from before
    the index stored smart names), the scan takes the full pass instead and
    extracts that row again. After that, the fast path is back."""
    dlc = tmp_path / "dlc"
    dlc.mkdir()
    (dlc / "a.feedpak").write_bytes(b"")
    (tmp_path / "config.json").write_text(
        json.dumps({"dlc_dir": str(dlc)}), encoding="utf-8")
    scan = importlib.import_module("scan")

    seen: list[str] = []
    arr = {"type": "combo", "name": "Combo", "file": "a.xml", "index": 0}

    def old_extract(f, dlc_dir):
        seen.append(f.name)
        return {"title": f.name, "arrangements": [dict(arr)]}

    def new_extract(f, dlc_dir):
        seen.append(f.name)
        return {"title": f.name, "arrangements": [{**arr, "smart_name": "Lead"}]}

    with mock.patch("scan_worker._extract_meta_for_file", new=old_extract):
        scan.background_scan()          # first full pass, records the signature
    assert "a.feedpak" in seen

    seen.clear()
    with mock.patch("scan_worker._extract_meta_for_file", new=new_extract):
        scan.background_scan()          # tree unchanged, but old rows remain
    assert "a.feedpak" in seen

    seen.clear()
    with mock.patch("scan_worker._extract_meta_for_file", new=new_extract):
        scan.background_scan()          # all rows have smart_name: fast path
    assert seen == []
    assert scan.status()["stage"] == "complete"
