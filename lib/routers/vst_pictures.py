"""Pictures of VST3 plugins for the Home VST panel (/api/vst/pictures, /api/vst/picture).

A VST3 bundle can hold a snapshot of its own window:
``<name>.vst3/Contents/Resources/Snapshots/<class id>_snapshot.png``
(VST3 SDK "Snapshots"). The desktop app gives the page each plugin's path
(``feedBackDesktop.audio.getKnownPlugins()``), but the page cannot list a
folder, so this router finds the snapshot file.

The routes serve only PNG files named ``*_snapshot*.png`` in the
``Contents/Resources/Snapshots`` folder of a ``.vst3`` folder. Any other
path gives no picture.

The player can also put their own pictures in one folder (/api/vst/images,
/api/vst/image/<file>): the ``vst_images_dir`` setting, or
``<config_dir>/vst_images`` when the setting is empty. The file name gives
the plugin: ``Abasi.png`` and ``CoryWongX.png`` are the pictures of
"Archetype Abasi" and "Archetype Cory Wong X". The page compares the names
in lower case, with letters and digits only. These routes serve only image
files directly in that folder.
"""

from pathlib import Path

from fastapi import APIRouter, Body, Response
from fastapi.responses import FileResponse

import appstate
from appconfig import _load_config

router = APIRouter()

_IMAGE_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
_MAX_IMAGES = 512

_MAX_PATHS = 512
_MAX_PATH_LEN = 1024


def _bundle_root(raw):
    """The outermost ``.vst3`` folder in ``raw``, or None.

    The plugin catalog holds the bundle path for most plugins, and for some
    the binary inside the bundle (``X.vst3/Contents/x86_64-win/X.vst3``).
    """
    if not isinstance(raw, str) or not raw or len(raw) > _MAX_PATH_LEN or "\x00" in raw:
        return None
    p = Path(raw)
    if not p.is_absolute():
        return None
    parts = p.parts
    for i, part in enumerate(parts):
        if part.lower().endswith(".vst3"):
            root = Path(*parts[: i + 1])
            try:
                return root if root.is_dir() else None
            except OSError:
                return None
    return None


def snapshot_for(raw):
    """The snapshot PNG of the VST3 bundle at ``raw``, or None.

    The 1x picture wins over the 2x picture, because the Home tiles are small.
    """
    root = _bundle_root(raw)
    if root is None:
        return None
    folder = root / "Contents" / "Resources" / "Snapshots"
    try:
        if not folder.is_dir():
            return None
        names = sorted(
            f for f in folder.iterdir()
            if f.is_file() and f.suffix.lower() == ".png" and "_snapshot" in f.name.lower()
        )
    except OSError:
        return None
    if not names:
        return None
    plain = [f for f in names if f.name.lower().endswith("_snapshot.png")]
    return (plain or names)[0]


@router.post("/api/vst/pictures")
def vst_pictures(body: dict = Body(...)):
    """``{"paths": [...]}`` -> ``{"pictures": {path: url}}`` for the plugins that have a snapshot."""
    paths = body.get("paths") if isinstance(body, dict) else None
    if not isinstance(paths, list):
        return {"pictures": {}}
    out = {}
    for raw in paths[:_MAX_PATHS]:
        if isinstance(raw, str) and raw not in out and snapshot_for(raw) is not None:
            out[raw] = "/api/vst/picture?path=" + _quote(raw)
    return {"pictures": out}


@router.get("/api/vst/picture")
def vst_picture(path: str = ""):
    snap = snapshot_for(path)
    if snap is None:
        return Response(status_code=404)
    return FileResponse(str(snap), media_type="image/png",
                        headers={"Cache-Control": "max-age=86400"})


def _quote(s):
    from urllib.parse import quote
    return quote(s, safe="")


def images_dir():
    """The folder with the player's own plugin pictures, or None."""
    cfg = None
    if appstate.config_dir is not None:
        cfg = _load_config(Path(appstate.config_dir) / "config.json")
    raw = (cfg or {}).get("vst_images_dir")
    if isinstance(raw, str) and raw.strip():
        folder = Path(raw.strip())
    elif appstate.config_dir is not None:
        folder = Path(appstate.config_dir) / "vst_images"
    else:
        return None
    try:
        return folder if folder.is_dir() else None
    except OSError:
        return None


def name_key(name):
    """The compare key of a picture or plugin name: lower case, letters and digits only."""
    return "".join(ch for ch in str(name).lower() if ch.isalnum())


def _image_files(folder):
    try:
        files = sorted(
            f for f in folder.iterdir()
            if f.suffix.lower() in _IMAGE_TYPES and not f.name.startswith(".") and f.is_file()
        )
    except OSError:
        return []
    return files[:_MAX_IMAGES]


@router.get("/api/vst/images")
def vst_images():
    """``{"images": {key: url}}`` for the pictures in the player's folder.

    The key is ``name_key`` of the file name without its extension. When
    two files give one key, the first file in name order wins. The URL
    carries the file time, so a new picture with the same name shows.
    """
    folder = images_dir()
    out = {}
    if folder is None:
        return {"images": out}
    for f in _image_files(folder):
        key = name_key(f.stem)
        if not key or key in out:
            continue
        try:
            version = int(f.stat().st_mtime)
        except OSError:
            continue
        out[key] = "/api/vst/image/" + _quote(f.name) + "?v=" + str(version)
    return {"images": out}


@router.get("/api/vst/image/{name}")
def vst_image(name: str):
    folder = images_dir()
    if folder is None or not name or name != Path(name).name or "\\" in name or "\x00" in name:
        return Response(status_code=404)
    media = _IMAGE_TYPES.get(Path(name).suffix.lower())
    if media is None or name.startswith("."):
        return Response(status_code=404)
    target = folder / name
    try:
        if not target.is_file() or target.resolve().parent != folder.resolve():
            return Response(status_code=404)
    except OSError:
        return Response(status_code=404)
    return FileResponse(str(target), media_type=media, headers={"Cache-Control": "max-age=86400"})
