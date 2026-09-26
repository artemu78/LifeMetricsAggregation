import { useId, useMemo, useState } from "react";
import { formatDuration } from "../shared/formatDuration";
import {
  SleepGradients,
  SleepPhaseAxis,
  SleepTimeAxis,
} from "./SleepChartAxes";
import {
  HEIGHT,
  LEFT,
  PLOT_WIDTH,
  SLEEP_LINE_WIDTH,
  WIDTH,
  Y_LEVELS,
} from "./sleepChartConfig";
import { buildSleepGeometry, type SleepGeometry } from "./sleepGeometry";
import {
  extractSleepIntervals,
  SLEEP_PHASE_CONFIGS,
  type SleepStagesChartProps,
} from "./sleepModel";
import { SleepTooltip, type SleepHoverInfo } from "./SleepTooltip";

export function SleepStagesChart({
  sleepMetrics,
  timezone,
}: SleepStagesChartProps) {
  const intervals = useMemo(
    () => extractSleepIntervals(sleepMetrics),
    [sleepMetrics],
  );
  const geometry = useMemo(
    () => buildSleepGeometry(intervals, timezone),
    [intervals, timezone],
  );
  if (!geometry)
    return <p className="muted sleep-empty">Нет данных о фазах сна</p>;
  return (
    <SleepChart intervals={intervals} geometry={geometry} timezone={timezone} />
  );
}

type SleepChartProps = {
  intervals: ReturnType<typeof extractSleepIntervals>;
  geometry: SleepGeometry;
  timezone: string;
};
function SleepChart({ intervals, geometry, timezone }: SleepChartProps) {
  const idPrefix = useId().replaceAll(":", "");
  const lineGradientId = `sleep-line-gradient-${idPrefix}`;
  const areaGradientId = `sleep-area-gradient-${idPrefix}`;
  const [hoverInfo, setHoverInfo] = useState<SleepHoverInfo | null>(null);
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    if (svgX < LEFT || svgX > LEFT + PLOT_WIDTH) {
      setHoverInfo(null);
      return;
    }
    const hoverTime =
      geometry.minTime + ((svgX - LEFT) / PLOT_WIDTH) * geometry.totalDuration;
    const match = intervals.find(
      (int) => hoverTime >= int.start && hoverTime <= int.end,
    );
    if (!match) {
      setHoverInfo(null);
      return;
    }

    const config = SLEEP_PHASE_CONFIGS[match.phase];
    const date = new Date(hoverTime);
    const timeStr = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
    const durationStr = formatDuration(match.durationSec);

    setHoverInfo({
      x: svgX,
      y: Y_LEVELS[match.phase],
      timeStr,
      phaseConfig: config,
      durationStr,
    });
  };
  return (
    <div className="sleep-chart-card">
      <svg
        className="sleep-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="График фаз сна на временной шкале"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverInfo(null)}
      >
        <SleepGradients
          lineGradientId={lineGradientId}
          areaGradientId={areaGradientId}
        />

        <SleepPhaseAxis />

        <path d={geometry.areaD} fill={`url(#${areaGradientId})`} />

        <path
          d={geometry.lineD}
          fill="none"
          stroke={`url(#${lineGradientId})`}
          strokeWidth={SLEEP_LINE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <SleepTimeAxis ticks={geometry.ticks} />

        {hoverInfo ? <SleepTooltip hoverInfo={hoverInfo} /> : null}
      </svg>
    </div>
  );
}
