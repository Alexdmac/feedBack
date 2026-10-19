"""Import Rocksmith 2014 .psarc packs from inside the app.

The conversion itself is done by the PowerShell scripts in tools/psarc_import/
(they drive the DLC Builder libraries, so this only works on Windows with
Rocksmith 2014 DLC Builder installed). This plugin runs them for the user:

  POST /api/plugins/pack_import/upload   multipart .psarc files, then convert
  POST /api/plugins/pack_import/path     {"path": "..."}: a .psarc file or a
                                         folder of them already on this PC
  GET  /api/plugins/pack_import/status   can this host convert? + current job
  GET  /api/plugins/pack_import/jobs/{id}

Each source goes through Convert-Psarc.ps1 first. A pack that holds several
songs (songs.psarc, rs1compatibilitydlc_p.psarc) fails there, and is then
converted with Convert-SongPack.ps1. Songs land in <DLC_DIR>/Rocksmith as
loose folders, and the library is rescanned when the job ends.
"""

import csv
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from fastapi import HTTPException, Request

REPO = Path(__file__).resolve().parent.parent.parent
SCRIPTS = REPO / "tools" / "psarc_import"
DEFAULT_DLC_BUILDER = Path(r"C:\Program Files\Rocksmith 2014 DLC Builder")
MAX_LOG_LINES = 400
MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024  # songs.psarc is ~1.5 GB


def find_powershell():
    for name in ("pwsh", "powershell"):
        exe = shutil.which(name)
        if exe:
            return exe
    return None


def check_available(platform=None, powershell=None, dlc_builder=None, venv_python=None):
    """Return (ok, reason). Arguments override the real checks for tests."""
    platform = platform or sys.platform
    if not platform.startswith("win"):
        return False, "Importing .psarc packs needs Windows (it uses Rocksmith 2014 DLC Builder)."
    if not (powershell if powershell is not None else find_powershell()):
        return False, "PowerShell was not found on this PC."
    builder = Path(dlc_builder or os.environ.get("DLC_BUILDER_DIR") or DEFAULT_DLC_BUILDER)
    if not (builder / "DLCBuilder.exe").exists():
        return False, f"Rocksmith 2014 DLC Builder was not found at {builder}."
    py = Path(venv_python or REPO / ".venv" / "Scripts" / "python.exe")
    if not py.exists():
        return False, f"The converter needs the app's Python environment at {py} (see scripts/run-local.ps1)."
    return True, ""


def read_log_rows(log_file: Path, start_offset: int):
    """Rows the converter scripts appended to _import-log.csv after ``start_offset``."""
    if not log_file.exists():
        return []
    with open(log_file, "rb") as fh:
        fh.seek(start_offset)
        text = fh.read().decode("utf-8", errors="replace")
    rows = []
    for row in csv.reader(text.splitlines()):
        if len(row) >= 4 and row[0] != "source":
            rows.append({"source": row[0], "status": row[1], "folder": row[2], "message": row[3]})
    return rows


def count_results(rows, retried):
    """(converted, failed) from the log rows of one job.

    A pack retried as a song pack has a "failed" row from the one-song
    importer; its songs' own rows (source "pack:key") replace that row.
    """
    converted = sum(1 for r in rows if r["status"] == "ok")
    failed = sum(1 for r in rows if r["status"] == "failed" and r["source"] not in retried)
    return converted, failed


def plan_sources(path: Path):
    """(source_dir, [file names], only_named) for a .psarc file or a folder of them."""
    if path.is_file():
        if path.suffix.lower() != ".psarc":
            raise ValueError("Only .psarc files can be imported.")
        return path.parent, [path.name], True
    if path.is_dir():
        names = sorted(p.name for p in path.iterdir() if p.is_file() and p.suffix.lower() == ".psarc")
        if not names:
            raise ValueError("That folder has no .psarc files.")
        return path, names, False
    raise ValueError("That path does not exist on this PC.")


class Job:
    def __init__(self, label):
        self.id = uuid.uuid4().hex[:12]
        self.label = label
        self.state = "queued"  # queued | running | done | failed
        self.lines = []
        self.converted = 0
        self.failed = 0
        self.started = time.time()
        self.finished = None
        self.cleanup_dir = None

    def say(self, line):
        self.lines.append(line)
        del self.lines[:-MAX_LOG_LINES]

    def to_dict(self):
        return {
            "id": self.id, "label": self.label, "state": self.state,
            "converted": self.converted, "failed": self.failed,
            "lines": self.lines[-MAX_LOG_LINES:],
            "started": self.started, "finished": self.finished,
        }


class Importer:
    def __init__(self, get_library_dir, log, run=None, rescan=None):
        self.get_library_dir = get_library_dir
        self.log = log
        self.run = run or self._run_script
        self.rescan = rescan
        self.jobs = {}
        self.order = []
        self.lock = threading.Lock()
        self.queue_lock = threading.Lock()  # one conversion at a time

    def latest(self):
        with self.lock:
            return self.jobs[self.order[-1]].to_dict() if self.order else None

    def get(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            return job.to_dict() if job else None

    def start(self, source_dir: Path, names, label, cleanup_dir=None, only_named=False, wait=False):
        job = Job(label)
        job.cleanup_dir = cleanup_dir
        with self.lock:
            self.jobs[job.id] = job
            self.order.append(job.id)
            for old in self.order[:-20]:
                self.jobs.pop(old, None)
            del self.order[:-20]
        t = threading.Thread(target=self._work, args=(job, Path(source_dir), list(names), only_named), daemon=True)
        t.start()
        if wait:
            t.join()
        return job

    def _work(self, job, source_dir, names, only_named):
        with self.queue_lock:
            job.state = "running"
            try:
                library = Path(self.get_library_dir()) / "Rocksmith"
                library.mkdir(parents=True, exist_ok=True)
                log_file = library / "_import-log.csv"
                offset = log_file.stat().st_size if log_file.exists() else 0
                job.say(f"Converting {len(names)} file(s) into {library}")
                args = ["-Source", str(source_dir), "-Library", str(library)]
                if only_named:
                    # One name only: pwsh -File cannot pass an array, and a
                    # file name may itself hold a comma.
                    args += ["-Only", names[0]]
                self.run(job, "Convert-Psarc.ps1", args)
                rows = read_log_rows(log_file, offset)
                # A song pack (several songs in one .psarc) fails the one-song
                # importer: convert those with Convert-SongPack.ps1 instead.
                retry = [r["source"] for r in rows if r["status"] == "failed" and r["source"] in names]
                for name in retry:
                    job.say(f"{name} may hold several songs: converting it as a song pack")
                    self.run(job, "Convert-SongPack.ps1",
                             ["-Pack", str(source_dir / name), "-Library", str(library)])
                job.converted, job.failed = count_results(read_log_rows(log_file, offset), retry)
                job.say(f"Done: {job.converted} song(s) converted, {job.failed} failed.")
                job.state = "done"
            except Exception as exc:  # noqa: BLE001 — report any failure to the user
                self.log.exception("pack import failed")
                job.say(f"Import stopped: {exc}")
                job.state = "failed"
            finally:
                job.finished = time.time()
                if job.cleanup_dir:
                    shutil.rmtree(job.cleanup_dir, ignore_errors=True)
                if self.rescan and job.converted:
                    try:
                        self.rescan()
                    except Exception:  # noqa: BLE001
                        self.log.exception("rescan after pack import failed")

    def _run_script(self, job, script, args):
        exe = find_powershell()
        if not exe:
            raise RuntimeError("PowerShell was not found on this PC.")
        cmd = [exe, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPTS / script), *args]
        builder = os.environ.get("DLC_BUILDER_DIR")
        if builder:
            cmd += ["-DlcBuilder", builder]
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        proc = subprocess.Popen(cmd, cwd=str(REPO), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", creationflags=flags)
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                job.say(line)
        if proc.wait() != 0:
            raise RuntimeError(f"{script} stopped with exit code {proc.returncode}.")


def setup(app, context):
    log = context["log"]
    upload_root = Path(context["config_dir"]) / "pack_import" / "uploads"

    def rescan():
        import scan
        scan.kick_scan(force=True)

    importer = Importer(context["get_dlc_dir"], log, rescan=rescan)

    def require_available():
        ok, reason = check_available()
        if not ok:
            raise HTTPException(status_code=409, detail=reason)

    @app.get("/api/plugins/pack_import/status")
    def status():
        ok, reason = check_available()
        return {"available": ok, "reason": reason, "job": importer.latest()}

    @app.get("/api/plugins/pack_import/jobs/{job_id}")
    def job(job_id: str):
        data = importer.get(job_id)
        if not data:
            raise HTTPException(status_code=404, detail="No such import job.")
        return data

    @app.post("/api/plugins/pack_import/path")
    def import_path(body: dict):
        require_available()
        raw = str((body or {}).get("path") or "").strip().strip('"')
        if not raw:
            raise HTTPException(status_code=400, detail="Enter the path of a .psarc file or a folder.")
        try:
            source_dir, names, only_named = plan_sources(Path(raw).expanduser())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return importer.start(source_dir, names, raw, only_named=only_named).to_dict()

    @app.post("/api/plugins/pack_import/upload")
    async def import_upload(request: Request):
        require_available()
        form = await request.form(max_files=200, max_fields=0, max_part_size=MAX_UPLOAD_BYTES)
        try:
            from starlette.datastructures import UploadFile
            uploads = [u for u in form.getlist("file") if isinstance(u, UploadFile)]
            if not uploads:
                raise HTTPException(status_code=400, detail="Choose one or more .psarc files.")
            dest = upload_root / uuid.uuid4().hex[:12]
            dest.mkdir(parents=True, exist_ok=True)
            names = []
            for u in uploads:
                name = Path(u.filename or "").name
                if not name.lower().endswith(".psarc") or name == ".psarc":
                    continue
                with open(dest / name, "wb") as out:
                    while chunk := await u.read(1024 * 1024):
                        out.write(chunk)
                names.append(name)
            if not names:
                shutil.rmtree(dest, ignore_errors=True)
                raise HTTPException(status_code=400, detail="Only .psarc files can be imported.")
            label = names[0] if len(names) == 1 else f"{len(names)} files"
            return importer.start(dest, names, label, cleanup_dir=dest).to_dict()
        finally:
            await form.close()

    ok, reason = check_available()
    log.info("pack import ready (%s)", "available" if ok else reason)
