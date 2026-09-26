import type { MouseEvent } from "react";
import {
  STEP_BAR,
  STEP_BUCKET_DURATION,
  STEPS_BOTTOM,
  STEPS_TOP,
} from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";

type Props = {
  stepSeries: { time: number; value: number }[];
  maxStepCount: number;
  start: number;
  end: number;
  x: (time: number) => number;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function StepsTrack({
  stepSeries,
  start,
  end,
  x,
  maxStepCount,
  selectAtCursor,
}: Readonly<Props>) {
  return (
    <>
      {stepSeries
        .filter(
          (item) => item.time + STEP_BUCKET_DURATION > start && item.time < end,
        )
        .map((item) => {
          const from = Math.max(start, item.time);
          const to = Math.min(end, item.time + STEP_BUCKET_DURATION);
          const height = Math.max(
            STEP_BAR.minHeight,
            (item.value / maxStepCount) *
              (STEPS_BOTTOM - STEPS_TOP - STEP_BAR.topPadding),
          );
          const barX = x(from);
          const barWidth = Math.max(
            STEP_BAR.minWidth,
            x(to) - barX - STEP_BAR.gap,
          );
          const stepCount = Math.round(item.value).toLocaleString("ru-RU");
          const stepItem: RecordItem = {
            start: item.time,
            end: item.time + STEP_BUCKET_DURATION,
            label: "Шаги",
            detail: `${stepCount} шагов`,
            color: STEP_BAR.color,
            kind: "steps",
          };
          return (
            <g key={`steps-${item.time}`}>
              <rect
                x={barX}
                y={STEPS_TOP}
                width={barWidth}
                height={STEPS_BOTTOM - STEPS_TOP}
                className="chart-step-hit-area"
                onMouseEnter={(event) => selectAtCursor(stepItem, event)}
                onMouseMove={(event) => selectAtCursor(stepItem, event)}
              />
              <rect
                x={barX}
                y={STEPS_BOTTOM - height}
                width={barWidth}
                height={height}
                rx={STEP_BAR.radius}
                className="chart-step-bar"
                onMouseEnter={(event) => selectAtCursor(stepItem, event)}
                onMouseMove={(event) => selectAtCursor(stepItem, event)}
              />
            </g>
          );
        })}
    </>
  );
}
