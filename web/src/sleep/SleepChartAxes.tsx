import {
  BOTTOM,
  LEFT,
  PHASE_AXIS,
  PLOT_WIDTH,
  SLEEP_GRADIENT_STOPS,
  SLEEP_TIME_AXIS,
  TOP,
  Y_LEVELS,
} from "./sleepChartConfig";
import type { SleepGeometry } from "./sleepGeometry";
import { SLEEP_PHASES } from "./sleepModel";

export function SleepGradients({
  lineGradientId,
  areaGradientId,
}: {
  lineGradientId: string;
  areaGradientId: string;
}) {
  return (
    <>
      <defs>
        <linearGradient
          id={lineGradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={BOTTOM}
          x2="0"
          y2={TOP}
        >
          {SLEEP_GRADIENT_STOPS.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
            />
          ))}
        </linearGradient>
        <linearGradient
          id={areaGradientId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={BOTTOM}
          x2="0"
          y2={TOP}
        >
          {SLEEP_GRADIENT_STOPS.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </linearGradient>
      </defs>
    </>
  );
}

export function SleepPhaseAxis() {
  return (
    <>
      {SLEEP_PHASES.map((phase) => {
        const y = Y_LEVELS[phase.key];
        return (
          <g key={phase.key} className="sleep-axis-group">
            <line
              x1={LEFT}
              y1={y}
              x2={LEFT + PLOT_WIDTH}
              y2={y}
              stroke={PHASE_AXIS.gridColor}
              strokeDasharray={PHASE_AXIS.dash}
              strokeWidth="1"
            />
            <circle
              cx={LEFT - PHASE_AXIS.dotOffset}
              cy={y}
              r={PHASE_AXIS.dotRadius}
              fill={phase.color}
            />
            <text
              x={LEFT - PHASE_AXIS.labelOffset}
              y={y + PHASE_AXIS.baseline}
              textAnchor="end"
              className="sleep-axis-label"
              fill={phase.color}
              fontSize={PHASE_AXIS.fontSize}
              fontWeight={PHASE_AXIS.fontWeight}
            >
              {phase.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export function SleepTimeAxis({ ticks }: { ticks: SleepGeometry["ticks"] }) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick.time}>
          <line
            x1={tick.x}
            y1={BOTTOM}
            x2={tick.x}
            y2={BOTTOM + SLEEP_TIME_AXIS.tickLength}
            stroke={SLEEP_TIME_AXIS.color}
            strokeWidth="1"
          />
          <text
            x={tick.x}
            y={BOTTOM + SLEEP_TIME_AXIS.baseline}
            textAnchor="middle"
            className="sleep-time-tick"
          >
            {tick.label}
          </text>
        </g>
      ))}
    </>
  );
}
