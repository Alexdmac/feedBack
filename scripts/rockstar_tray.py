"""Run RockStar behind a Windows tray icon, with no console window.

The server is the same one ``scripts/run-local.ps1`` starts. It runs on a
thread of this process, and the tray icon shows that it is running:

    Open RockStar   opens the app in the browser (also a double-click)
    Open log        opens the log file
    Quit            stops the server cleanly, then removes the icon

If RockStar is already running on the port, the launcher only opens the
browser and exits, so a second click on the shortcut does no harm.

Start it with the venv's ``pythonw.exe`` (no console), or use the shortcut
that ``scripts/install-tray-shortcut.ps1`` creates:

    .venv\\Scripts\\pythonw.exe scripts\\rockstar_tray.py

Settings come from the same environment variables as run-local.ps1
(DLC_DIR, CONFIG_DIR, HOST, PORT, FEEDBACK_OFFLINE). The log goes to
LOG_FILE, by default ``%USERPROFILE%\\FeedBackData\\rockstar.log``.
"""

import os
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ICON_PNG = REPO / "static" / "v3" / "brand" / "icon-192.png"
DLC_BUILDER_TOOLS = Path(r"C:\Program Files\Rocksmith 2014 DLC Builder\Tools")


def apply_env_defaults(env=None, home=None):
    """Fill in the run-local.ps1 defaults for every variable not already set."""
    env = os.environ if env is None else env
    data_root = Path(home or Path.home()) / "FeedBackData"
    env.setdefault("DLC_DIR", str(data_root / "library"))
    env.setdefault("CONFIG_DIR", str(data_root / "config"))
    env.setdefault("HOST", "127.0.0.1")
    env.setdefault("PORT", "8000")
    env.setdefault("LOG_FILE", str(data_root / "rockstar.log"))
    # Offline by default: no outbound network calls (see lib/netpolicy.py).
    env.setdefault("FEEDBACK_OFFLINE", "1")
    if env["FEEDBACK_OFFLINE"].lower() in ("1", "true", "yes", "on"):
        env.setdefault("HF_HUB_OFFLINE", "1")
        env.setdefault("TRANSFORMERS_OFFLINE", "1")
    env.setdefault("PYTHONUTF8", "1")
    return env


def app_url(env=None):
    env = os.environ if env is None else env
    host = env.get("HOST", "127.0.0.1")
    if host in ("0.0.0.0", "::", ""):
        host = "localhost"
    return f"http://{host}:{env.get('PORT', '8000')}/"


def is_running(url, timeout=1.0):
    """True when a RockStar server already answers at ``url``."""
    try:
        with urllib.request.urlopen(url + "api/version", timeout=timeout) as resp:
            return resp.status == 200
    except OSError:
        return False


def _prepare_process():
    """Set up paths and output for running the server in this process."""
    for p in (REPO, REPO / "lib"):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))
    os.environ["PYTHONPATH"] = os.pathsep.join(
        [str(REPO / "lib"), str(REPO)] + ([os.environ["PYTHONPATH"]] if os.environ.get("PYTHONPATH") else [])
    )
    # Decode .wem audio with DLC Builder's ww2ogg + revorb, as run-local.ps1 does.
    if (DLC_BUILDER_TOOLS / "ww2ogg.exe").exists():
        os.environ["PATH"] = str(DLC_BUILDER_TOOLS) + os.pathsep + os.environ.get("PATH", "")
    for key in ("DLC_DIR", "CONFIG_DIR"):
        Path(os.environ[key]).mkdir(parents=True, exist_ok=True)
    Path(os.environ["LOG_FILE"]).parent.mkdir(parents=True, exist_ok=True)
    # pythonw.exe has no console, so sys.stdout / sys.stderr are None. Send
    # anything written to them to the log file instead of losing it (and
    # instead of the console logger failing on a missing stream).
    if sys.stdout is None or sys.stderr is None:
        stream = open(os.environ["LOG_FILE"], "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream
    os.chdir(REPO)


def _start_server():
    from logging_setup import configure_logging

    configure_logging()

    import uvicorn
    from main import server_options

    server = uvicorn.Server(uvicorn.Config("server:app", **server_options()))
    # The tray owns the process: Quit stops the server, not Ctrl+C.
    server.install_signal_handlers = lambda: None
    thread = threading.Thread(target=server.run, name="rockstar-server", daemon=True)
    thread.start()
    return server, thread


def _open_when_ready(server, thread, url):
    for _ in range(600):  # up to 60 s for plugins to load
        if server.started:
            webbrowser.open(url)
            return
        if not thread.is_alive():
            return
        time.sleep(0.1)


def main():
    apply_env_defaults()
    url = app_url()
    if is_running(url):
        webbrowser.open(url)
        return 0

    _prepare_process()
    import pystray
    from PIL import Image

    server, thread = _start_server()
    log_file = os.environ["LOG_FILE"]

    def open_app(icon=None, item=None):
        webbrowser.open(url)

    def open_log(icon=None, item=None):
        if hasattr(os, "startfile"):
            os.startfile(log_file)
        else:
            webbrowser.open(Path(log_file).as_uri())

    def quit_app(icon, item=None):
        icon.title = "RockStar: stopping…"
        server.should_exit = True
        thread.join(timeout=15)
        icon.stop()

    icon = pystray.Icon(
        "RockStar",
        Image.open(ICON_PNG),
        f"RockStar: running at {url}",
        menu=pystray.Menu(
            pystray.MenuItem("Open RockStar", open_app, default=True),
            pystray.MenuItem("Open log", open_log),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Quit", quit_app),
        ),
    )

    def watch(icon):
        icon.visible = True
        _open_when_ready(server, thread, url)
        thread.join()
        # The server stopped without Quit (for example the port was taken):
        # say so and take the icon away rather than show a dead app as running.
        if not server.should_exit:
            try:
                icon.notify("RockStar stopped. Open the log to see why.", "RockStar")
                time.sleep(5)
            finally:
                icon.stop()

    icon.run(setup=watch)
    return 0


if __name__ == "__main__":
    sys.exit(main())
