from __future__ import annotations

from datetime import date
import argparse
import json
import sys

from .config import load_config
from .dashboard_data import build_dashboard


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="from_date", required=True)
    parser.add_argument("--to", dest="to_date", required=True)
    args = parser.parse_args(argv)
    try:
        result = build_dashboard(
            load_config(),
            date.fromisoformat(args.from_date),
            date.fromisoformat(args.to_date),
        )
    except Exception as exc:
        print(f"{type(exc).__name__}: dashboard generation failed", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
