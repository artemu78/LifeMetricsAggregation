from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Self
import fcntl
import json
import subprocess
import sys
import queue
import threading
import time

import uvicorn
import yaml
from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError, model_validator

from .api_models import (
    ApiError,
    DashboardResponse,
    DashboardSyncResponse,
    DateRange,
    SourceName,
)
from .config import load_config
from .drive_connection import connection
from .drive_recovery import report_failure
from .api_models import DriveClientUpload, DriveConnectionState


ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="Live Life Local Dashboard", docs_url="/docs")


@app.middleware("http")
async def protect_google_connection(request: Request, call_next):
    if request.url.path.startswith("/api/google-drive/"):
        origin = request.headers.get("origin")
        own_origin = f"{request.url.scheme}://{request.url.netloc}"
        if (
            request.url.hostname not in {"127.0.0.1", "localhost", "::1", "testserver"}
            or not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}
            or (origin is not None and origin != own_origin)
            or request.headers.get("sec-fetch-site") == "cross-site"
            or (request.method == "POST" and request.headers.get("x-live-life-action") != "1")
        ):
            return _error(403, "LOCAL_ACTION_REQUIRED", "Откройте Live Life на этом компьютере и повторите действие.")
    response = await call_next(request)
    if request.url.path.startswith("/api/google-drive/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/google-drive/connect", response_model=DriveConnectionState, response_model_exclude_none=True)
def connect_google_drive():
    return connection.start(load_config(ROOT))


@app.get("/api/google-drive/connection/{session_id}", response_model=DriveConnectionState, response_model_exclude_none=True)
def google_drive_connection(session_id: str):
    return connection.snapshot(session_id)


@app.post("/api/google-drive/client", response_model=DriveConnectionState, response_model_exclude_none=True)
async def save_google_drive_client(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 65536:
            return _error(400, "INVALID_CLIENT_FILE", "Выберите небольшой JSON-файл OAuth-клиента типа Desktop app.")
    try:
        upload = DriveClientUpload.model_validate_json(body)
    except ValidationError:
        return _error(400, "INVALID_CLIENT_FILE", "Не удалось прочитать JSON-файл OAuth-клиента.")
    config = load_config(ROOT)
    try:
        return connection.save_client(config, upload.content)
    except Exception as exc:
        return {"status": "failed", "issue": report_failure(config, exc, "configuration")}


class DashboardSyncWorkerResponse(DashboardSyncResponse):
    @model_validator(mode="after")
    def require_each_dashboard_source(self) -> Self:
        expected = {
            SourceName.bracelet,
            SourceName.welltory,
            SourceName.rescuetime,
            SourceName.todoist,
        }
        if {summary.source for summary in self.sources} != expected:
            raise ValueError("sources must contain each dashboard source exactly once")
        return self


def _error(status: int, code: str, message: str, details: dict | None = None) -> JSONResponse:
    body = ApiError(code=code, message=message, details=details or {})
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


def _run(module: str, start: date, end: date, *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-m",
            module,
            "--from",
            start.isoformat(),
            "--to",
            end.isoformat(),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _decode(process: subprocess.CompletedProcess[str], model_type):
    try:
        return model_type.model_validate_json(process.stdout)
    except ValidationError:
        raise RuntimeError("Worker returned JSON outside the OpenAPI contract") from None


@app.exception_handler(RequestValidationError)
def validation_error_handler(_request, _exc):
    return _error(400, "INVALID_REQUEST", "Проверьте формат и диапазон дат.")


@app.get("/api/dashboard", response_model=DashboardResponse)
def dashboard(
    from_: date = Query(alias="from"),
    to: date = Query(),
):
    if to < from_:
        return _error(400, "INVALID_DATE_RANGE", "Дата «to» должна быть не раньше «from».")
    try:
        process = _run("live_life.dashboard_json", from_, to, timeout=60)
    except subprocess.TimeoutExpired:
        return _error(500, "DASHBOARD_TIMEOUT", "Формирование календаря заняло слишком много времени.")
    if process.returncode != 0:
        return _error(500, "DASHBOARD_FAILED", "Не удалось сформировать данные календаря.")
    try:
        return _decode(process, DashboardResponse)
    except RuntimeError:
        return _error(500, "INVALID_WORKER_RESPONSE", "Скрипт вернул некорректный результат.")


SYNC_ALREADY_RUNNING_MESSAGE = "Обновление данных уже выполняется."


def _is_sync_locked(lock_path: Path) -> bool:
    if not lock_path.exists():
        return False
    try:
        with lock_path.open("r+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(lock, fcntl.LOCK_UN)
            return False
    except OSError:
        return True


def _stream_sync_error_event(code: str, message: str) -> str:
    err = json.dumps({"type": "error", "code": code, "message": message}, ensure_ascii=False)
    return f"data: {err}\n\n"


def _start_sync_process(start: date, end: date):
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "live_life.data_sync_json",
            "--from",
            start.isoformat(),
            "--to",
            end.isoformat(),
            "--progress",
        ],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        bufsize=1,
    )


def _start_sync_reader(proc):
    lines = queue.Queue()

    def read_output():
        try:
            if proc.stdout is not None:
                for line in iter(proc.stdout.readline, ""):
                    lines.put(line)
        finally:
            lines.put(None)

    threading.Thread(target=read_output, daemon=True).start()
    return lines


def _stream_sync_output(lines, proc, *, timeout: int):
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(proc.args, timeout)
        try:
            line = lines.get(timeout=min(remaining, 10))
        except queue.Empty:
            if time.monotonic() >= deadline:
                raise subprocess.TimeoutExpired(proc.args, timeout)
            yield ": keep-alive\n\n"
            continue
        if line is None:
            return deadline
        line = line.strip()
        if line:
            yield f"data: {line}\n\n"


def _sync_exit_event(proc, deadline):
    proc.wait(timeout=max(0.001, deadline - time.monotonic()))
    if proc.returncode == 75:
        return _stream_sync_error_event("SYNC_ALREADY_RUNNING", SYNC_ALREADY_RUNNING_MESSAGE)
    if proc.returncode != 0:
        return _stream_sync_error_event("SYNC_FAILED", "Данные не обновлены. Проверьте журнал data/logs/bracelet.jsonl.")
    return None


def _stop_sync_process(proc):
    if proc.poll() is None:
        proc.kill()
    proc.wait(timeout=5)
    if proc.stdout is not None:
        proc.stdout.close()


def _stream_sync_events(start: date, end: date, *, timeout: int):
    proc = _start_sync_process(start, end)
    lines = _start_sync_reader(proc)
    try:
        stream = _stream_sync_output(lines, proc, timeout=timeout)
        while True:
            try:
                yield next(stream)
            except StopIteration as completed:
                event = _sync_exit_event(proc, completed.value)
                if event:
                    yield event
                break
    except subprocess.TimeoutExpired:
        proc.kill()
        yield _stream_sync_error_event("SYNC_TIMEOUT", "Обновление данных заняло слишком много времени. Повторите обновление.")
    except Exception:
        proc.kill()
        yield _stream_sync_error_event("SYNC_FAILED", "Не удалось завершить обновление данных.")
    finally:
        _stop_sync_process(proc)


def _stream_sync(start: date, end: date, *, timeout: int) -> StreamingResponse | JSONResponse:
    if _is_sync_locked(ROOT / "data/.fitness-sync.lock"):
        return _error(409, "SYNC_ALREADY_RUNNING", SYNC_ALREADY_RUNNING_MESSAGE)

    return StreamingResponse(
        _stream_sync_events(start, end, timeout=timeout),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )



@app.post("/api/data-sync", response_model=DashboardSyncResponse, response_model_exclude_none=True)
def data_sync(request: DateRange, req: Request):
    if request.to < request.from_:
        return _error(400, "INVALID_DATE_RANGE", "Дата «to» должна быть не раньше «from».")
    if "text/event-stream" in req.headers.get("accept", ""):
        return _stream_sync(request.from_, request.to, timeout=300)
    try:
        process = _run("live_life.data_sync_json", request.from_, request.to, timeout=300)
    except subprocess.TimeoutExpired:
        return _error(500, "SYNC_TIMEOUT", "Обновление данных заняло слишком много времени.")
    if process.returncode == 75:
        return _error(409, "SYNC_ALREADY_RUNNING", SYNC_ALREADY_RUNNING_MESSAGE)
    if process.returncode != 0:
        return _error(500, "SYNC_FAILED", "Данные не обновлены.")
    try:
        return _decode(process, DashboardSyncWorkerResponse)
    except RuntimeError:
        return _error(500, "INVALID_WORKER_RESPONSE", "Скрипт вернул некорректный результат.")


def canonical_openapi() -> dict:
    """Publish the checked-in contract instead of a framework-derived variant."""
    return yaml.safe_load((ROOT / "openapi.yaml").read_text(encoding="utf-8"))


app.openapi = canonical_openapi

INDEX_HTML = "index.html"
STATIC = ROOT / "web" / "dist"
if not (STATIC / INDEX_HTML).exists() and (ROOT / "web-dist" / INDEX_HTML).exists():
    STATIC = ROOT / "web-dist"


def _frontend() -> FileResponse | HTMLResponse:
    index = STATIC / INDEX_HTML
    if index.exists():
        return FileResponse(index)
    return HTMLResponse("<h1>Live Life</h1><p>Run npm run build in web/ to create the dashboard.</p>")


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def dashboard_frontend():
    return _frontend()


@app.get("/day/{day}", response_class=HTMLResponse, include_in_schema=False)
def dashboard_day_frontend(day: str):
    return _frontend()


if STATIC.exists():
    app.mount("/", StaticFiles(directory=STATIC, html=True), name="dashboard")


def main() -> None:
    uvicorn.run("live_life.server:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
