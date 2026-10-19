"""Offline mode (FEEDBACK_OFFLINE) — lib/netpolicy.py and the gates that use it."""

import importlib
import importlib.util
import logging
import sys
from pathlib import Path

import pytest

import netpolicy

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture()
def offline(monkeypatch):
    monkeypatch.setenv("FEEDBACK_OFFLINE", "1")


@pytest.mark.parametrize("value, allowed", [
    (None, True), ("", True), ("0", True), ("no", True),
    ("1", False), ("true", False), ("YES", False), ("on", False),
])
def test_network_allowed(monkeypatch, value, allowed):
    monkeypatch.delenv("FEEDBACK_OFFLINE", raising=False)
    monkeypatch.delenv("SLOPSMITH_OFFLINE", raising=False)
    if value is not None:
        monkeypatch.setenv("FEEDBACK_OFFLINE", value)
    assert netpolicy.network_allowed() is allowed


def test_legacy_alias(monkeypatch):
    monkeypatch.delenv("FEEDBACK_OFFLINE", raising=False)
    monkeypatch.setenv("SLOPSMITH_OFFLINE", "1")
    assert netpolicy.network_allowed() is False


def test_enrichment_gate(monkeypatch):
    import enrichment
    monkeypatch.delenv("FEEDBACK_SKIP_STARTUP_TASKS", raising=False)
    monkeypatch.delenv("FEEDBACK_ENRICH_OFFLINE", raising=False)
    monkeypatch.delenv("FEEDBACK_OFFLINE", raising=False)
    assert enrichment._enrich_network_enabled() is True
    monkeypatch.setenv("FEEDBACK_OFFLINE", "1")
    assert enrichment._enrich_network_enabled() is False


def test_tailwind_skips_npx_offline(monkeypatch, offline):
    import tailwind_rebuild
    monkeypatch.setattr(tailwind_rebuild.shutil, "which",
                        lambda name: "C:/node/npx.cmd" if name == "npx" else None)
    assert tailwind_rebuild._tailwind_cmd() is None
    monkeypatch.setenv("FEEDBACK_OFFLINE", "0")
    assert tailwind_rebuild._tailwind_cmd()[0] == "C:/node/npx.cmd"


def _load_achievements(monkeypatch):
    spec = importlib.util.spec_from_file_location(
        "ach_routes_under_test", REPO / "plugins" / "achievements" / "routes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod._state["log"] = logging.getLogger("test.achievements")
    return mod


def test_achievements_wall_silent_offline(monkeypatch, offline):
    ach = _load_achievements(monkeypatch)
    import requests

    def _boom(*a, **k):
        raise AssertionError("network call in offline mode")

    monkeypatch.setattr(requests, "post", _boom)
    assert ach._post_to_wall("unlock", {"x": 1}) is None

    started = []
    monkeypatch.setattr(ach.threading, "Thread",
                        lambda *a, **k: started.append(k) or pytest.fail("thread started"))
    ach._maybe_start_drain()
    assert started == [] and ach._drain_started is False


@pytest.fixture()
def server_mod(tmp_path, monkeypatch):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    monkeypatch.setenv("FEEDBACK_SKIP_STARTUP_TASKS", "1")
    sys.modules.pop("server", None)
    server = importlib.import_module("server")
    try:
        yield server
    finally:
        conn = getattr(getattr(server, "meta_db", None), "conn", None)
        if conn is not None:
            getattr(server, "_join_background_db_threads", lambda: None)()
            conn.close()


def test_index_offline_strips_remote_fonts(server_mod, offline):
    resp = server_mod._index_response()
    html = resp.body.decode("utf-8")
    assert "fonts.googleapis.com" not in html
    assert "fonts.gstatic.com" not in html
    assert "window.FEEDBACK_OFFLINE = true" in html
    assert "/static/tailwind.min.css" in html


def test_index_online_serves_file(server_mod, monkeypatch):
    monkeypatch.delenv("FEEDBACK_OFFLINE", raising=False)
    from fastapi.responses import FileResponse
    assert isinstance(server_mod._index_response(), FileResponse)
