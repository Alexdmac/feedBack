"""Tests for the VST3 snapshot picture routes (lib/routers/vst_pictures.py)."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import vst_pictures


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _bundle(tmp_path, name, snapshots=()):
    root = tmp_path / name
    (root / "Contents" / "x86_64-win").mkdir(parents=True)
    if snapshots:
        snap = root / "Contents" / "Resources" / "Snapshots"
        snap.mkdir(parents=True)
        for s in snapshots:
            (snap / s).write_bytes(PNG)
    return root


def _client():
    app = FastAPI()
    app.include_router(vst_pictures.router)
    return TestClient(app)


def test_snapshot_prefers_the_1x_picture(tmp_path):
    root = _bundle(tmp_path, "Synth.vst3", ["ABC_snapshot_2.0x.png", "ABC_snapshot.png"])
    assert vst_pictures.snapshot_for(str(root)).name == "ABC_snapshot.png"


def test_snapshot_from_the_binary_path_inside_the_bundle(tmp_path):
    root = _bundle(tmp_path, "Synth.vst3", ["ABC_snapshot.png"])
    inner = root / "Contents" / "x86_64-win" / "Synth.vst3"
    assert vst_pictures.snapshot_for(str(inner)).name == "ABC_snapshot.png"


def test_no_snapshot_for_other_paths(tmp_path):
    root = _bundle(tmp_path, "NoPic.vst3")
    other = tmp_path / "folder"
    (other / "Contents" / "Resources" / "Snapshots").mkdir(parents=True)
    (other / "Contents" / "Resources" / "Snapshots" / "x_snapshot.png").write_bytes(PNG)
    text = _bundle(tmp_path, "Text.vst3", ["notes_snapshot.txt"])
    assert vst_pictures.snapshot_for(str(root)) is None
    assert vst_pictures.snapshot_for(str(other)) is None
    assert vst_pictures.snapshot_for(str(text)) is None
    assert vst_pictures.snapshot_for("Relative.vst3") is None
    assert vst_pictures.snapshot_for("") is None
    assert vst_pictures.snapshot_for(None) is None
    assert vst_pictures.snapshot_for(str(tmp_path / "Missing.vst3")) is None


def test_pictures_route_lists_only_plugins_with_a_snapshot(tmp_path):
    pic = _bundle(tmp_path, "Pic.vst3", ["P_snapshot.png"])
    nopic = _bundle(tmp_path, "NoPic.vst3")
    r = _client().post("/api/vst/pictures", json={"paths": [str(pic), str(nopic), 7]})
    assert r.status_code == 200
    pictures = r.json()["pictures"]
    assert list(pictures) == [str(pic)]
    assert pictures[str(pic)].startswith("/api/vst/picture?path=")


def test_pictures_route_ignores_a_bad_body():
    c = _client()
    assert c.post("/api/vst/pictures", json={"paths": "x"}).json() == {"pictures": {}}
    assert c.post("/api/vst/pictures", json={}).json() == {"pictures": {}}


def test_picture_route_serves_the_png_or_404(tmp_path):
    pic = _bundle(tmp_path, "Pic.vst3", ["P_snapshot.png"])
    c = _client()
    url = c.post("/api/vst/pictures", json={"paths": [str(pic)]}).json()["pictures"][str(pic)]
    r = c.get(url)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == PNG
    assert c.get("/api/vst/picture", params={"path": str(tmp_path)}).status_code == 404
    assert c.get("/api/vst/picture").status_code == 404


# ── The player's own pictures (/api/vst/images, /api/vst/image/<file>) ──────

def _own_folder(tmp_path, monkeypatch, setting=None):
    import json
    import appstate
    config = tmp_path / "config"
    config.mkdir()
    monkeypatch.setattr(appstate, "config_dir", config)
    if setting is not None:
        (config / "config.json").write_text(json.dumps({"vst_images_dir": setting}), encoding="utf-8")
    return config


def test_images_default_folder_is_vst_images_in_the_config(tmp_path, monkeypatch):
    config = _own_folder(tmp_path, monkeypatch)
    assert _client().get("/api/vst/images").json() == {"images": {}}
    folder = config / "vst_images"
    folder.mkdir()
    (folder / "Abasi.png").write_bytes(PNG)
    (folder / "Cory Wong X.JPG").write_bytes(b"\xff\xd8\xff")
    (folder / "notes.txt").write_text("x")
    (folder / ".hidden.png").write_bytes(PNG)
    (folder / "sub").mkdir()
    (folder / "sub" / "Gojira.png").write_bytes(PNG)
    images = _client().get("/api/vst/images").json()["images"]
    assert sorted(images) == ["abasi", "corywongx"]
    assert images["abasi"].startswith("/api/vst/image/Abasi.png?v=")
    assert images["corywongx"].startswith("/api/vst/image/Cory%20Wong%20X.JPG?v=")


def test_images_setting_names_the_folder(tmp_path, monkeypatch):
    own = tmp_path / "Desktop pictures"
    own.mkdir()
    (own / "CoryWongX.png").write_bytes(PNG)
    _own_folder(tmp_path, monkeypatch, setting=str(own))
    client = _client()
    images = client.get("/api/vst/images").json()["images"]
    assert list(images) == ["corywongx"]
    r = client.get(images["corywongx"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content == PNG


def test_images_setting_to_a_missing_folder_gives_no_pictures(tmp_path, monkeypatch):
    _own_folder(tmp_path, monkeypatch, setting=str(tmp_path / "missing"))
    assert _client().get("/api/vst/images").json() == {"images": {}}
    assert _client().get("/api/vst/image/Abasi.png").status_code == 404


def test_image_route_serves_only_image_files_in_the_folder(tmp_path, monkeypatch):
    config = _own_folder(tmp_path, monkeypatch)
    folder = config / "vst_images"
    folder.mkdir()
    (folder / "Abasi.png").write_bytes(PNG)
    (folder / "notes.txt").write_text("x")
    (folder / ".hidden.png").write_bytes(PNG)
    (config / "secret.png").write_bytes(PNG)
    client = _client()
    assert client.get("/api/vst/image/Abasi.png").status_code == 200
    for bad in ("notes.txt", ".hidden.png", "Missing.png", "..%2Fsecret.png",
                "..%5Csecret.png", "sub%2FAbasi.png"):
        assert client.get("/api/vst/image/" + bad).status_code == 404, bad


def test_images_one_url_per_key(tmp_path, monkeypatch):
    config = _own_folder(tmp_path, monkeypatch)
    folder = config / "vst_images"
    folder.mkdir()
    (folder / "Abasi.jpg").write_bytes(b"\xff\xd8\xff")
    (folder / "abasi.png").write_bytes(PNG)
    images = _client().get("/api/vst/images").json()["images"]
    assert list(images) == ["abasi"]
    assert images["abasi"].startswith("/api/vst/image/Abasi.jpg?v=")


def test_name_key():
    assert vst_pictures.name_key("Cory Wong X") == "corywongx"
    assert vst_pictures.name_key("Archetype: Tim-Henson_X") == "archetypetimhensonx"
    assert vst_pictures.name_key("") == ""
