"""Serializable experimental forecast contract for future system integration."""
from __future__ import annotations

from datetime import date as calendar_date, datetime, time
import math
from typing import Mapping
from zoneinfo import ZoneInfo

_TARGETS = {
    "welltory.energy": ("welltory", None),
    "ema.energy": ("ema", "rating_1_5"),
    "ema.mood": ("ema", "rating_1_5"),
}


def _finite(value, name):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{name} must be a finite number") from error
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number")
    return number


def make_forecast_result(*, run_id, date, target, model_revision,
                         point=None, quantiles=None, quality=None) -> dict:
    """Describe a 09:00 Moscow forecast of the same day's 10:00 assessment.

    Quantiles are a level-to-value mapping. Missing point means insufficient data,
    never a zero forecast. EMA predictions are bounded to the recorded 1–5 scale;
    Welltory values keep their source scale, with no assumed unit or range.
    """
    if target not in _TARGETS:
        raise ValueError(f"Unknown forecast target: {target}")
    if not isinstance(date, str):
        raise ValueError("date must be YYYY-MM-DD")
    day = calendar_date.fromisoformat(date)
    if day.isoformat() != date:
        raise ValueError("date must be YYYY-MM-DD")
    if not isinstance(run_id, str) or not run_id.strip():
        raise ValueError("run_id must be a nonempty string")
    if not isinstance(model_revision, str) or not model_revision.strip():
        raise ValueError("model_revision must be a nonempty string")
    if quality is not None and not isinstance(quality, Mapping):
        raise ValueError("quality must be a mapping")
    quality = dict(quality or {})
    source, unit = _TARGETS[target]
    if target == "welltory.energy":
        unit = quality.get("unit")
    if quantiles is not None and not isinstance(quantiles, Mapping):
        raise ValueError("quantiles must map probability levels to values")
    if point is None and quantiles:
        raise ValueError("insufficient_data cannot contain quantile predictions")
    pairs = sorted((_finite(level, "quantile level"), _finite(value, "quantile value"))
                   for level, value in (quantiles or {}).items())
    previous_level, previous_value = -math.inf, -math.inf
    for level, value in pairs:
        if not 0 < level < 1 or level <= previous_level:
            raise ValueError("quantile levels must be unique probabilities between 0 and 1")
        if value < previous_value:
            raise ValueError("quantile values must be nondecreasing")
        previous_level, previous_value = level, value
    def bound(value):
        return min(5.0, max(1.0, value)) if target.startswith("ema.") else value
    point = None if point is None else bound(_finite(point, "point"))
    tz = ZoneInfo("Europe/Moscow")
    return {
        "run_id": run_id,
        "date": date,
        "cutoff": datetime.combine(day, time(9), tz).isoformat(),
        "assessment": datetime.combine(day, time(10), tz).isoformat(),
        "timezone": "Europe/Moscow",
        "target": target,
        "source": source,
        "unit": unit,
        "model_revision": model_revision,
        "status": "insufficient_data" if point is None else "experimental",
        "point": point,
        "quantiles": {str(level): bound(value) for level, value in pairs},
        "quality": quality,
    }
