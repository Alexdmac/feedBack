"""Tests for the pure parts of the Windows tray launcher (scripts/rockstar_tray.py)."""

import importlib.util
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("rockstar_tray", REPO / "scripts" / "rockstar_tray.py")
tray = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tray)


def test_env_defaults_match_run_local(tmp_path):
    env = tray.apply_env_defaults({}, home=tmp_path)
    data = tmp_path / "FeedBackData"
    assert env["DLC_DIR"] == str(data / "library")
    assert env["CONFIG_DIR"] == str(data / "config")
    assert env["HOST"] == "127.0.0.1"
    assert env["PORT"] == "8000"
    assert env["LOG_FILE"] == str(data / "rockstar.log")
    assert env["FEEDBACK_OFFLINE"] == "1"
    assert env["HF_HUB_OFFLINE"] == "1"


def test_env_defaults_keep_values_already_set(tmp_path):
    env = tray.apply_env_defaults({"PORT": "8080", "DLC_DIR": "D:/Songs", "FEEDBACK_OFFLINE": "0"}, home=tmp_path)
    assert env["PORT"] == "8080"
    assert env["DLC_DIR"] == "D:/Songs"
    assert "HF_HUB_OFFLINE" not in env


def test_app_url_uses_localhost_for_wildcard_host():
    assert tray.app_url({"HOST": "0.0.0.0", "PORT": "8080"}) == "http://localhost:8080/"
    assert tray.app_url({"HOST": "127.0.0.1", "PORT": "8000"}) == "http://127.0.0.1:8000/"


def test_is_running_checks_the_version_endpoint():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200 if self.path == "/api/version" else 404)
            self.end_headers()

        def log_message(self, *args):
            pass

    httpd = HTTPServer(("127.0.0.1", 0), Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        assert tray.is_running(f"http://127.0.0.1:{port}/")
    finally:
        httpd.shutdown()
        httpd.server_close()
    assert not tray.is_running(f"http://127.0.0.1:{port}/", timeout=0.2)
