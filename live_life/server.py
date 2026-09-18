from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Self
import fcntl
import json
import subprocess
import sys

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


ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="Live Life Local Dashboard", docs_url="/docs")


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


def _stream_sync(start: date, end: date, *, timeout: int) -> Response:
    config = load_config(ROOT)
    lock_path = Path(config.root) / "data" / ".fitness-sync.lock"
    if lock_path.exists():
        try:
            with lock_path.open("r+") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(lock, fcntl.LOCK_UN)
        except (BlockingIOError, OSError):
            return _error(409, "SYNC_ALREADY_RUNNING", "Обновление данных уже выполняется.")

    def event_generator():
        proc = subprocess.Popen(
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
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        try:
            assert proc.stdout is not None
            for line in iter(proc.stdout.readline, ""):
                line = line.strip()
                if not line:
                    continue
                yield f"data: {line}\n\n"
            proc.wait(timeout=timeout)
            if proc.returncode == 75:
                err = json.dumps(
                    {"type": "error", "code": "SYNC_ALREADY_RUNNING", "message": "Обновление данных уже выполняется."},
                    ensure_ascii=False,
                )
                yield f"data: {err}\n\n"
            elif proc.returncode != 0:
                err = json.dumps(
                    {"type": "error", "code": "SYNC_FAILED", "message": "Данные не обновлены."},
                    ensure_ascii=False,
                )
                yield f"data: {err}\n\n"
        except subprocess.TimeoutExpired:
            proc.kill()
            err = json.dumps(
                {"type": "error", "code": "SYNC_TIMEOUT", "message": "Обновление данных заняло слишком много времени."},
                ensure_ascii=False,
            )
            yield f"data: {err}\n\n"
        except Exception as exc:
            proc.kill()
            err = json.dumps(
                {"type": "error", "code": "SYNC_FAILED", "message": str(exc)},
                ensure_ascii=False,
            )
            yield f"data: {err}\n\n"
        finally:
            if proc.poll() is None:
                proc.kill()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/data-sync", response_model=DashboardSyncResponse)
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
        return _error(409, "SYNC_ALREADY_RUNNING", "Обновление данных уже выполняется.")
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
