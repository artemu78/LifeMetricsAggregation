from __future__ import annotations

from datetime import date
from pathlib import Path
import json
import subprocess
import sys

import uvicorn
import yaml
from fastapi import FastAPI, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .api_models import ApiError, DashboardResponse, DateRange, FitnessSyncResponse


ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="Live Life Local Dashboard", docs_url="/docs")


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


@app.post("/api/fitness-sync", response_model=FitnessSyncResponse)
def fitness_sync(request: DateRange):
    if request.to < request.from_:
        return _error(400, "INVALID_DATE_RANGE", "Дата «to» должна быть не раньше «from».")
    try:
        process = _run("live_life.fitness_sync_json", request.from_, request.to, timeout=300)
    except subprocess.TimeoutExpired:
        return _error(500, "SYNC_TIMEOUT", "Синхронизация заняла слишком много времени.")
    if process.returncode == 75:
        return _error(409, "SYNC_ALREADY_RUNNING", "Синхронизация браслета уже выполняется.")
    if process.returncode != 0:
        return _error(500, "SYNC_FAILED", "Синхронизация браслета не выполнена.")
    try:
        return _decode(process, FitnessSyncResponse)
    except RuntimeError:
        return _error(500, "INVALID_WORKER_RESPONSE", "Скрипт вернул некорректный результат.")


def canonical_openapi() -> dict:
    """Publish the checked-in contract instead of a framework-derived variant."""
    return yaml.safe_load((ROOT / "openapi.yaml").read_text(encoding="utf-8"))


app.openapi = canonical_openapi

STATIC = ROOT / "web-dist"


def _frontend() -> FileResponse | HTMLResponse:
    index = STATIC / "index.html"
    if index.exists():
        return FileResponse(index)
    return HTMLResponse("<h1>Live Life</h1><p>Run npm run build to create the dashboard.</p>")


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
