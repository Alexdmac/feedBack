"""Tests for the pack_import plugin: planning, job flow, and HTTP routes."""

import importlib.util
import json
import logging
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location(
    "pack_import_routes_under_test", REPO / "plugins" / "pack_import" / "routes.py")
pi = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pi)

LOG = logging.getLogger("test.pack_import")


def _append_log(library, *rows):
    log = library / "_import-log.csv"
    if not log.exists():
        log.write_text("source,status,folder,message\r\n", encoding="utf-8")
    with open(log, "a", encoding="utf-8") as fh:
        for r in rows:
            fh.write(",".join(f'"{v}"' for v in r) + "\r\n")


@pytest.fixture(autouse=True)
def _no_auto_import_thread(monkeypatch):
    """setup() starts the automatic import thread where the converter can run.
    The tests drive AutoImporter directly instead."""
    monkeypatch.setenv("FEEDBACK_PSARC_AUTO_IMPORT", "0")


def test_check_available_needs_windows_and_dlc_builder(tmp_path):
    no_libs = tmp_path / "no-libs"
    ok, reason = pi.check_available(platform="linux")
    assert not ok and "Windows" in reason
    ok, reason = pi.check_available(platform="win32", powershell="pwsh", dlc_builder=tmp_path,
                                    venv_python=tmp_path / "python.exe", libs_root=no_libs)
    assert not ok and "DLC Builder" in reason
    (tmp_path / "DLCBuilder.exe").write_bytes(b"")
    (tmp_path / "python.exe").write_bytes(b"")
    assert pi.check_available(platform="win32", powershell="pwsh", dlc_builder=tmp_path,
                              venv_python=tmp_path / "python.exe", libs_root=no_libs) == (True, "")


def test_check_available_accepts_unpacked_libraries_without_dlc_builder(tmp_path):
    """The scripts use the libraries that an earlier run unpacked, so DLC
    Builder itself can be gone."""
    libs = tmp_path / "libs"
    (tmp_path / "python.exe").write_bytes(b"")
    kw = dict(platform="win32", powershell="pwsh", dlc_builder=tmp_path / "gone",
              venv_python=tmp_path / "python.exe", libs_root=libs)
    (libs / "3.5.0.0").mkdir(parents=True)
    assert not pi.check_available(**kw)[0]
    (libs / "3.5.0.0" / "Rocksmith2014.DLCProject.dll").write_bytes(b"")
    assert pi.check_available(**kw) == (True, "")


def test_plan_sources(tmp_path):
    (tmp_path / "a_p.psarc").write_bytes(b"")
    (tmp_path / "B_P.PSARC").write_bytes(b"")
    (tmp_path / "notes.txt").write_text("x")
    assert pi.plan_sources(tmp_path) == (tmp_path, ["B_P.PSARC", "a_p.psarc"], False)
    assert pi.plan_sources(tmp_path / "a_p.psarc") == (tmp_path, ["a_p.psarc"], True)
    with pytest.raises(ValueError):
        pi.plan_sources(tmp_path / "notes.txt")
    with pytest.raises(ValueError):
        pi.plan_sources(tmp_path / "missing")
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError):
        pi.plan_sources(empty)


def test_job_retries_failed_sources_as_song_packs(tmp_path):
    calls = []
    rescans = []

    def fake_run(job, script, args):
        calls.append((script, args))
        library = Path(args[args.index("-Library") + 1])
        if script == "Convert-Psarc.ps1":
            _append_log(library, ("song_p.psarc", "ok", "Artist - Song", "3 xml"),
                        ("songs.psarc", "failed", "", "more than one xblock"))
        else:
            _append_log(library, ("songs.psarc:SongA", "ok", "A - A", "4 xml"),
                        ("songs.psarc:SongB", "failed", "", "no audio"))

    imp = pi.Importer(lambda: tmp_path, LOG, run=fake_run, rescan=lambda: rescans.append(1))
    job = imp.start(tmp_path / "src", ["song_p.psarc", "songs.psarc"], "2 files", wait=True)
    assert [c[0] for c in calls] == ["Convert-Psarc.ps1", "Convert-SongPack.ps1"]
    assert "-Only" not in calls[0][1]
    assert calls[1][1][:2] == ["-Pack", str(tmp_path / "src" / "songs.psarc")]
    data = imp.get(job.id)
    assert data["state"] == "done"
    assert (data["converted"], data["failed"]) == (2, 1)
    assert rescans == [1]


def test_job_reports_script_errors_and_removes_uploads(tmp_path):
    upload = tmp_path / "upload"
    upload.mkdir()

    def boom(job, script, args):
        raise RuntimeError("Convert-Psarc.ps1 stopped with exit code 1.")

    imp = pi.Importer(lambda: tmp_path / "lib", LOG, run=boom)
    job = imp.start(upload, ["x.psarc"], "x.psarc", cleanup_dir=upload, only_named=True, wait=True)
    data = imp.get(job.id)
    assert data["state"] == "failed"
    assert "exit code 1" in data["lines"][-1]
    assert not upload.exists()


def test_routes_refuse_when_unavailable_and_report_status(tmp_path, monkeypatch):
    app = FastAPI()
    pi.setup(app, {"log": LOG, "config_dir": tmp_path, "get_dlc_dir": lambda: tmp_path})
    client = TestClient(app)
    monkeypatch.setattr(pi, "check_available", lambda: (False, "Needs Windows."))
    assert client.get("/api/plugins/pack_import/status").json() == {
        "available": False, "reason": "Needs Windows.", "job": None,
        "auto": False, "auto_interval": pi.AUTO_INTERVAL_S}
    r = client.post("/api/plugins/pack_import/path", json={"path": str(tmp_path)})
    assert r.status_code == 409 and r.json()["detail"] == "Needs Windows."


def test_upload_route_saves_psarc_files_and_starts_a_job(tmp_path, monkeypatch):
    seen = {}

    def fake_run(job, script, args):
        src = Path(args[args.index("-Source") + 1])
        seen["files"] = sorted(p.name for p in src.iterdir())
        seen["bytes"] = (src / "a_p.psarc").read_bytes()

    monkeypatch.setattr(pi, "check_available", lambda: (True, ""))
    monkeypatch.setattr(pi.Importer, "_run_script", lambda self, job, script, args: fake_run(job, script, args))
    app = FastAPI()
    pi.setup(app, {"log": LOG, "config_dir": tmp_path / "cfg", "get_dlc_dir": lambda: tmp_path / "dlc"})
    client = TestClient(app)
    r = client.post("/api/plugins/pack_import/upload", files=[
        ("file", ("a_p.psarc", b"PSAR-data", "application/octet-stream")),
        ("file", ("readme.txt", b"no", "text/plain")),
    ])
    assert r.status_code == 200, r.text
    job_id = r.json()["id"]
    for _ in range(100):
        data = client.get(f"/api/plugins/pack_import/jobs/{job_id}").json()
        if data["state"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert data["state"] == "done"
    assert seen == {"files": ["a_p.psarc"], "bytes": b"PSAR-data"}
    # The uploaded copies are removed once the job ends.
    assert not any((tmp_path / "cfg" / "pack_import" / "uploads").iterdir())


# ── Automatic import of .psarc files found in the library ────────────────────

class _FakeImporter:
    """Stands in for Importer: records each start() and makes the song folders
    that the real scripts would make."""

    def __init__(self, dlc, songs_per_file=None):
        self.dlc = dlc
        self.songs_per_file = songs_per_file or {}
        self.calls = []

    def start(self, source_dir, names, label, cleanup_dir=None, only_named=False, wait=False):
        self.calls.append((Path(source_dir), list(names), only_named, wait))
        converted = self.songs_per_file.get(names[0], 1)
        for i in range(converted):
            song = self.dlc / "Rocksmith" / f"{names[0]} {i}"
            song.mkdir(parents=True)
            (song / pi.MARKER).write_text(json.dumps({"source": names[0]}), encoding="utf-8")
        return SimpleNamespace(converted=converted, lines=["Done"], state="done")


def _auto(dlc, importer, ok=True):
    return pi.AutoImporter(importer, lambda: dlc, LOG, available=lambda: (ok, "" if ok else "no"))


def test_auto_import_waits_until_a_file_stops_changing(tmp_path):
    """A file converts at the second check that sees it unchanged: a big file
    can still be in copy at the first one."""
    dlc = tmp_path / "dlc"
    (dlc / "new").mkdir(parents=True)
    psarc = dlc / "new" / "song_p.psarc"
    psarc.write_bytes(b"part")
    fake = _FakeImporter(dlc)
    auto = _auto(dlc, fake)

    assert auto.check_once() == 0          # first seen
    psarc.write_bytes(b"part, more")       # the copy goes on
    assert auto.check_once() == 0          # changed since the last check
    assert auto.check_once() == 1          # unchanged: converted
    assert fake.calls == [(dlc / "new", ["song_p.psarc"], True, True)]
    assert auto.check_once() == 0          # it has a song folder now
    assert len(fake.calls) == 1


def test_auto_import_skips_files_that_already_have_a_song_folder(tmp_path):
    dlc = tmp_path / "dlc"
    old = dlc / "Rocksmith" / "Artist - Song"
    old.mkdir(parents=True)
    (old / pi.MARKER).write_text(json.dumps({"source": "Song_P.psarc"}), encoding="utf-8")
    (dlc / "song_p.psarc").write_bytes(b"x")
    fake = _FakeImporter(dlc)
    auto = _auto(dlc, fake)
    auto.check_once()
    auto.check_once()
    assert fake.calls == []


def test_auto_import_tries_a_failed_file_again_only_after_it_changes(tmp_path):
    dlc = tmp_path / "dlc"
    dlc.mkdir()
    bad = dlc / "bad_p.psarc"
    bad.write_bytes(b"x")
    fake = _FakeImporter(dlc, songs_per_file={"bad_p.psarc": 0})
    auto = _auto(dlc, fake)
    auto.check_once()
    auto.check_once()                      # tried, no song
    auto.check_once()
    auto.check_once()
    assert len(fake.calls) == 1
    bad.write_bytes(b"a new copy")
    auto.check_once()                      # changed: seen again
    auto.check_once()                      # unchanged: tried again
    assert len(fake.calls) == 2


def test_auto_import_does_nothing_where_the_converter_cannot_run(tmp_path):
    dlc = tmp_path / "dlc"
    dlc.mkdir()
    (dlc / "song_p.psarc").write_bytes(b"x")
    fake = _FakeImporter(dlc)
    auto = _auto(dlc, fake, ok=False)
    auto.check_once()
    auto.check_once()
    assert fake.calls == []


def test_status_reports_the_automatic_import(tmp_path, monkeypatch):
    monkeypatch.setattr(pi, "check_available", lambda: (True, ""))
    monkeypatch.setattr(pi.AutoImporter, "start", lambda self: setattr(self, "thread", "started"))
    for env, expected in (("0", False), ("1", True)):
        monkeypatch.setenv("FEEDBACK_PSARC_AUTO_IMPORT", env)
        app = FastAPI()
        pi.setup(app, {"log": LOG, "config_dir": tmp_path, "get_dlc_dir": lambda: tmp_path})
        st = TestClient(app).get("/api/plugins/pack_import/status").json()
        assert (st["auto"], st["auto_interval"]) == (expected, pi.AUTO_INTERVAL_S)
