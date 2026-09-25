import { useState, useId } from "react";
import type { components } from "./generated/api-types";

type Metric =
  components["schemas"]["DashboardDay"]["detail"]["braceletMetrics"][number];

export interface SleepStagesChartProps {
  readonly sleepMetrics: readonly Metric[];
  readonly timezone: string;
}

export type SleepPhaseKey = "deep" | "light" | "rem" | "awake";

export interface SleepPhaseConfig {
  readonly key: SleepPhaseKey;
  readonly label: string;
  readonly name: string;
  readonly level: number;
  readonly color: string;
}

export const SLEEP_PHASE_CONFIGS: Record<SleepPhaseKey, SleepPhaseConfig> = {
  awake: { key: "awake", label: "awake", name: "Пробуждение", level: 3, color: "#e07a5f" },
  rem: { key: "rem", label: "rem", name: "Быстрый сон", level: 2, color: "#8f78b5" },
  light: { key: "light", label: "light", name: "Лёгкий сон", level: 1, color: "#5c95c4" },
  deep: { key: "deep", label: "deep", name: "Глубокий сон", level: 0, color: "#2c467a" },
};

export const SLEEP_PHASES: readonly SleepPhaseConfig[] = [
  SLEEP_PHASE_CONFIGS.awake,
  SLEEP_PHASE_CONFIGS.rem,
  SLEEP_PHASE_CONFIGS.light,
  SLEEP_PHASE_CONFIGS.deep,
] as const;

export function normalizeSleepPhase(metric: string): SleepPhaseKey {
  const clean = metric
    .replaceAll("fitness_drive.sleep.", "")
    .replaceAll("_seconds", "")
    .toLowerCase();

  if (clean.includes("deep")) return "deep";
  if (clean.includes("rem")) return "rem";
  if (clean.includes("awake") || clean.includes("out_of_bed")) return "awake";
  return "light";
}

export interface SleepInterval {
  start: number;
  end: number;
  phase: SleepPhaseKey;
  durationSec: number;
}

const DEFAULT_STAGE_DURATION_SEC = 900;

function resolveOverlappingIntervals(intervals: SleepInterval[]): SleepInterval[] {
  for (let i = 0; i < intervals.length - 1; i++) {
    const curr = intervals[i];
    const next = intervals[i + 1];
    if (curr.end > next.start) {
      curr.end = next.start;
      curr.durationSec = Math.max(
        0,
        Math.round((curr.end - curr.start) / 1000),
      );
    }
  }
  return intervals;
}

export function extractSleepIntervals(metrics: readonly Metric[]): SleepInterval[] {
  const sleepPoints = metrics
    .filter((p) => p.metric.startsWith("fitness_drive.sleep."))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (!sleepPoints.length) return [];

  const intervals: SleepInterval[] = [];

  for (const p of sleepPoints) {
    const start = Date.parse(p.timestamp);
    if (Number.isNaN(start)) continue;

    const phase = normalizeSleepPhase(p.metric);
    const durationSec =
      p.value != null && p.value > 0 ? p.value : DEFAULT_STAGE_DURATION_SEC;
    const end = start + durationSec * 1000;
    intervals.push({ start, end, phase, durationSec });
  }

  return resolveOverlappingIntervals(intervals);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 мин";
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!wholeHours) return `${remainingMinutes} мин`;
  return remainingMinutes
    ? `${wholeHours} ч ${remainingMinutes} мин`
    : `${wholeHours} ч`;
}

const WIDTH = 800;
const HEIGHT = 180;
const LEFT = 72;
const RIGHT = 24;
const TOP = 22;
const BOTTOM = 148;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = BOTTOM - TOP;
const STEP_Y = PLOT_HEIGHT / 3;

const Y_LEVELS: Record<SleepPhaseKey, number> = {
  awake: TOP,
  rem: TOP + STEP_Y,
  light: TOP + 2 * STEP_Y,
  deep: BOTTOM,
};

export function SleepStagesChart({
  sleepMetrics,
  timezone,
}: Readonly<SleepStagesChartProps>) {
  const intervals = extractSleepIntervals(sleepMetrics);
  const idPrefix = useId().replaceAll(":", "");
  const lineGradientId = `sleep-line-gradient-${idPrefix}`;
  const areaGradientId = `sleep-area-gradient-${idPrefix}`;

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    timeStr: string;
    phaseConfig: SleepPhaseConfig;
    durationStr: string;
  } | null>(null);

  if (!intervals.length) {
    return <p className="muted sleep-empty">Нет данных о фазах сна</p>;
  }

  const minTime = intervals[0].start;
  const maxTime = Math.max(
    minTime + 3_600_000,
    intervals.at(-1)!.end,
  );

  const totalDuration = maxTime - minTime;
  const timeToX = (t: number) =>
    LEFT +
    ((Math.max(minTime, Math.min(maxTime, t)) - minTime) / totalDuration) *
      PLOT_WIDTH;

  let lineD = "";
  const first = intervals[0];
  const firstX = timeToX(first.start);
  const firstY = Y_LEVELS[first.phase];

  lineD += `M ${firstX.toFixed(1)} ${firstY.toFixed(1)}`;

  for (let i = 0; i < intervals.length; i++) {
    const curr = intervals[i];
    const currY = Y_LEVELS[curr.phase];
    const currStartX = timeToX(curr.start);
    const currEndX = timeToX(curr.end);

    const next = intervals[i + 1];

    if (!next) {
      lineD += ` L ${currEndX.toFixed(1)} ${currY.toFixed(1)}`;
      break;
    }

    const nextY = Y_LEVELS[next.phase];
    const nextStartX = timeToX(next.start);

    const gapMinutes = (next.start - curr.end) / 60_000;
    if (gapMinutes > 15) {
      const yAwake = Y_LEVELS.awake;
      const transW = Math.min(16, (currEndX - currStartX) * 0.3);
      const flatEndX = Math.max(currStartX, currEndX - transW);
      lineD += ` L ${flatEndX.toFixed(1)} ${currY.toFixed(1)}`;

      const mid1X = (flatEndX + currEndX) / 2;
      lineD += ` C ${mid1X.toFixed(1)} ${currY.toFixed(1)}, ${mid1X.toFixed(1)} ${yAwake.toFixed(1)}, ${currEndX.toFixed(1)} ${yAwake.toFixed(1)}`;

      lineD += ` L ${nextStartX.toFixed(1)} ${yAwake.toFixed(1)}`;

      const transNextW = Math.min(16, (timeToX(next.end) - nextStartX) * 0.3);
      const mid2X = (nextStartX + nextStartX + transNextW) / 2;
      lineD += ` C ${mid2X.toFixed(1)} ${yAwake.toFixed(1)}, ${mid2X.toFixed(1)} ${nextY.toFixed(1)}, ${(nextStartX + transNextW).toFixed(1)} ${nextY.toFixed(1)}`;
      continue;
    }

    const maxW = Math.min(
      (currEndX - currStartX) * 0.25,
      (timeToX(next.end) - nextStartX) * 0.25,
      14,
    );
    const transW = Math.max(3, maxW);
    const tStartX = Math.max(currStartX, currEndX - transW / 2);
    const tEndX = Math.min(timeToX(next.end), nextStartX + transW / 2);
    const tMidX = (tStartX + tEndX) / 2;

    lineD += ` L ${tStartX.toFixed(1)} ${currY.toFixed(1)}`;
    lineD += ` C ${tMidX.toFixed(1)} ${currY.toFixed(1)}, ${tMidX.toFixed(1)} ${nextY.toFixed(1)}, ${tEndX.toFixed(1)} ${nextY.toFixed(1)}`;
  }

  const lastX = timeToX(intervals.at(-1)!.end);
  const areaD = `${lineD} L ${lastX.toFixed(1)} ${BOTTOM.toFixed(1)} L ${firstX.toFixed(1)} ${BOTTOM.toFixed(1)} Z`;

  const numTicks = 5;
  const ticks: { time: number; x: number; label: string }[] = [];
  for (let i = 0; i < numTicks; i++) {
    const t = minTime + (i / (numTicks - 1)) * totalDuration;
    const date = new Date(t);
    const label = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
    ticks.push({ time: t, x: timeToX(t), label });
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    if (svgX < LEFT || svgX > LEFT + PLOT_WIDTH) {
      setHoverInfo(null);
      return;
    }
    const hoverTime =
      minTime + ((svgX - LEFT) / PLOT_WIDTH) * totalDuration;
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
        <defs>
          <linearGradient
            id={lineGradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={BOTTOM}
            x2="0"
            y2={TOP}
          >
            <stop offset="0%" stopColor="#2c467a" />
            <stop offset="33.3%" stopColor="#5c95c4" />
            <stop offset="66.7%" stopColor="#8f78b5" />
            <stop offset="100%" stopColor="#e07a5f" />
          </linearGradient>
          <linearGradient
            id={areaGradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={BOTTOM}
            x2="0"
            y2={TOP}
          >
            <stop offset="0%" stopColor="#2c467a" stopOpacity="0.06" />
            <stop offset="33.3%" stopColor="#5c95c4" stopOpacity="0.14" />
            <stop offset="66.7%" stopColor="#8f78b5" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#e07a5f" stopOpacity="0.26" />
          </linearGradient>
        </defs>

        {SLEEP_PHASES.map((phase) => {
          const y = Y_LEVELS[phase.key];
          return (
            <g key={phase.key} className="sleep-axis-group">
              <line
                x1={LEFT}
                y1={y}
                x2={LEFT + PLOT_WIDTH}
                y2={y}
                stroke="#e4ece8"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <circle cx={LEFT - 46} cy={y} r="3" fill={phase.color} />
              <text
                x={LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className="sleep-axis-label"
                fill={phase.color}
                fontSize="12"
                fontWeight="600"
              >
                {phase.label}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill={`url(#${areaGradientId})`} />

        <path
          d={lineD}
          fill="none"
          stroke={`url(#${lineGradientId})`}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {ticks.map((tick, idx) => (
          <g key={idx}>
            <line
              x1={tick.x}
              y1={BOTTOM}
              x2={tick.x}
              y2={BOTTOM + 5}
              stroke="#b5c7bf"
              strokeWidth="1"
            />
            <text
              x={tick.x}
              y={BOTTOM + 18}
              textAnchor="middle"
              className="sleep-time-tick"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {hoverInfo && (
          <g className="sleep-hover-indicator" pointerEvents="none">
            <line
              x1={hoverInfo.x}
              y1={TOP}
              x2={hoverInfo.x}
              y2={BOTTOM}
              stroke="#7c9288"
              strokeDasharray="3 3"
              strokeWidth="1.2"
            />
            <circle
              cx={hoverInfo.x}
              cy={hoverInfo.y}
              r="5.5"
              fill={hoverInfo.phaseConfig.color}
              stroke="#ffffff"
              strokeWidth="2"
            />
            {(() => {
              const tooltipWidth = 170;
              const tooltipHeight = 44;
              const tooltipX = Math.max(
                LEFT,
                Math.min(WIDTH - RIGHT - tooltipWidth, hoverInfo.x - tooltipWidth / 2),
              );
              const tooltipY = Math.max(4, hoverInfo.y - tooltipHeight - 10);
              return (
                <g transform={`translate(${tooltipX}, ${tooltipY})`}>
                  <rect
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx="6"
                    fill="rgba(255, 255, 255, 0.96)"
                    stroke="#c6d5cd"
                    strokeWidth="1"
                    filter="drop-shadow(0 2px 6px rgba(0,0,0,0.12))"
                  />
                  <text
                    x="10"
                    y="18"
                    fontSize="11"
                    fontWeight="700"
                    fill={hoverInfo.phaseConfig.color}
                  >
                    {hoverInfo.timeStr} · {hoverInfo.phaseConfig.label}
                  </text>
                  <text x="10" y="34" fontSize="10.5" fill="#49655b">
                    {hoverInfo.phaseConfig.name} ({hoverInfo.durationStr})
                  </text>
                </g>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}
