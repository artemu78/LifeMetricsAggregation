#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"
PYTHON="$ROOT/forecasting/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
    echo 'Run forecasting/scripts/setup.sh first.' >&2
    exit 1
fi
if command -v sandbox-exec >/dev/null 2>&1; then
    exec sandbox-exec -p '(version 1)(allow default)(deny network*)' "$PYTHON" -m forecasting tomorrow "$@"
fi
exec "$PYTHON" -m forecasting tomorrow "$@"
