import {
  BOTTOM,
  LEFT,
  RIGHT,
  SLEEP_HOVER,
  SLEEP_TOOLTIP,
  TOP,
  WIDTH,
} from "./sleepChartConfig";
import type { SleepPhaseConfig } from "./sleepModel";

export type SleepHoverInfo = {
  x: number;
  y: number;
  timeStr: string;
  phaseConfig: SleepPhaseConfig;
  durationStr: string;
};
export function SleepTooltip({ hoverInfo }: { hoverInfo: SleepHoverInfo }) {
  const tooltipWidth = SLEEP_TOOLTIP.width;
  const tooltipHeight = SLEEP_TOOLTIP.height;
  const tooltipX = Math.max(
    LEFT,
    Math.min(WIDTH - RIGHT - tooltipWidth, hoverInfo.x - tooltipWidth / 2),
  );
  const tooltipY = Math.max(
    SLEEP_TOOLTIP.topInset,
    hoverInfo.y - tooltipHeight - SLEEP_TOOLTIP.offset,
  );
  return (
    <g className="sleep-hover-indicator" pointerEvents="none">
      <line
        x1={hoverInfo.x}
        y1={TOP}
        x2={hoverInfo.x}
        y2={BOTTOM}
        stroke={SLEEP_HOVER.lineColor}
        strokeDasharray={SLEEP_HOVER.dash}
        strokeWidth={SLEEP_HOVER.lineWidth}
      />
      <circle
        cx={hoverInfo.x}
        cy={hoverInfo.y}
        r={SLEEP_HOVER.pointRadius}
        fill={hoverInfo.phaseConfig.color}
        stroke="#ffffff"
        strokeWidth={SLEEP_HOVER.pointBorder}
      />
      <g transform={`translate(${tooltipX}, ${tooltipY})`}>
        <rect
          width={tooltipWidth}
          height={tooltipHeight}
          rx={SLEEP_TOOLTIP.radius}
          fill={SLEEP_HOVER.background}
          stroke={SLEEP_HOVER.border}
          strokeWidth="1"
          filter={SLEEP_HOVER.shadow}
        />
        <text
          x={SLEEP_TOOLTIP.offset}
          y={SLEEP_TOOLTIP.titleY}
          fontSize={SLEEP_HOVER.titleSize}
          fontWeight={SLEEP_HOVER.titleWeight}
          fill={hoverInfo.phaseConfig.color}
        >
          {hoverInfo.timeStr} · {hoverInfo.phaseConfig.label}
        </text>
        <text
          x={SLEEP_TOOLTIP.offset}
          y={SLEEP_TOOLTIP.detailY}
          fontSize={SLEEP_HOVER.detailSize}
          fill={SLEEP_HOVER.detailColor}
        >
          {hoverInfo.phaseConfig.name} ({hoverInfo.durationStr})
        </text>
      </g>
    </g>
  );
}
