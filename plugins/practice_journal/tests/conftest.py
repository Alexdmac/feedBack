import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import routes  # noqa: E402


@pytest.fixture
def config_dir(tmp_path):
    d = tmp_path / "config"
    d.mkdir()
    return d


@pytest.fixture
def client(config_dir):
    routes._conn = None
    routes._db_path = None
    app = FastAPI()
    routes.setup(app, {"config_dir": config_dir})
    with TestClient(app) as c:
        yield c


def record(client, filename, duration=60, title="", artist="", started_at=None,
           avg_speed=1.0, loops_used=None, arrangement=""):
    body = {
        "filename": filename, "title": title, "artist": artist,
        "duration": duration, "avg_speed": avg_speed,
        "loops_used": loops_used or [], "arrangement": arrangement,
    }
    if started_at is not None:
        body["started_at"] = started_at
    return client.post("/api/plugins/practice_journal/session", json=body)
