"""Tests for the pack_import plugin: planning, job flow, and HTTP routes."""

import importlib.util
import logging
import time
from pathlib import Path

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


def test_check_available_needs_windows_and_dlc_builder(tmp_path):
    ok, reason = pi.check_available(platform="linux")
    assert not ok and "Windows" in reason
    ok, reason = pi.check_available(platform="win32", powershell="pwsh", dlc_builder=tmp_path,
                                    venv_python=tmp_path / "python.exe")
    assert not ok and "DLC Builder" in reason
    (tmp_path / "DLCBuilder.exe").write_bytes(b"")
    (tmp_path / "python.exe").write_bytes(b"")
    assert pi.check_available(platform="win32", powershell="pwsh", dlc_builder=tmp_path,
                              venv_python=tmp_path / "python.exe") == (True, "")


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
        "available": False, "reason": "Needs Windows.", "job": None}
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
