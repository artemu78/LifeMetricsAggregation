#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
command -v uv >/dev/null 2>&1 || { echo 'uv is required; see forecasting/README.md.' >&2; exit 1; }
uv --cache-dir forecasting/.cache/uv venv --python python3.12 forecasting/.venv
uv --cache-dir forecasting/.cache/uv pip sync --python forecasting/.venv/bin/python forecasting/requirements.lock
exec forecasting/.venv/bin/python -m forecasting download
