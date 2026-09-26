import type { MouseEvent } from "react";
import { EMA_GAUGE, EMA_GAUGE_TRACKS, EMA_MAX_RATING } from "./timelineConfig";
import type { EmaRecordItem, RecordItem } from "./timelineTypes";

type EmaSpeedometerProps = Readonly<{
  item: EmaRecordItem;
  cx: number;
  cy: number;
  onSelect: (item: RecordItem, event: MouseEvent<Element>) => void;
}>;

export function EmaSpeedometer({
  item,
  cx,
  cy,
  onSelect,
}: EmaSpeedometerProps) {
  return (
    <g
      className="ema-speedometer"
      data-testid="ema-speedometer"
      onClick={(event) => onSelect(item, event)}
      onMouseEnter={(event) => onSelect(item, event)}
      onMouseMove={(event) => onSelect(item, event)}
    >
      <rect
        x={cx - EMA_GAUGE.hitWidth / 2}
        y={cy - EMA_GAUGE.topOffset}
        width={EMA_GAUGE.hitWidth}
        height={EMA_GAUGE.hitHeight}
        className="ema-gauge-hit-area"
      />
      {EMA_GAUGE_TRACKS.map(({ name, radius, color }) => {
        const value = item[name];
        const arcLength = Math.PI * radius;
        const d = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;
        const ratio =
          value != null ? Math.max(0, Math.min(1, value / EMA_MAX_RATING)) : 0;
        const filledLength = ratio * arcLength;
        return (
          <g key={name} className={`ema-track-${name}`}>
            <path
              d={d}
              fill="none"
              stroke={EMA_GAUGE.background}
              strokeWidth={EMA_GAUGE.strokeWidth}
              strokeLinecap="round"
              className="ema-track-bg"
            />
            {ratio > 0 && (
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={EMA_GAUGE.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${filledLength} ${arcLength}`}
                className="ema-track-value"
              />
            )}
          </g>
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r={EMA_GAUGE.pivotRadius}
        fill={EMA_GAUGE.pivotColor}
        className="ema-pivot-dot"
      />
    </g>
  );
}
