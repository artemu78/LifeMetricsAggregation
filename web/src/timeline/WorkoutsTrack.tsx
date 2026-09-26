import type { MouseEvent } from "react";
import { WORKOUT_BAR, WORKOUTS_TOP } from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";

type Props = {
  visibleWorkoutSegments: RecordItem[];
  start: number;
  end: number;
  x: (time: number) => number;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function WorkoutsTrack({
  visibleWorkoutSegments,
  start,
  end,
  x,
  selectAtCursor,
}: Readonly<Props>) {
  return (
    <>
      {visibleWorkoutSegments.map((item) => {
        const from = Math.max(start, item.start);
        const to = Math.min(end, item.end);
        return (
          <rect
            key={`workout-${item.start}:${item.end}:${item.label}`}
            x={x(from)}
            y={WORKOUTS_TOP + WORKOUT_BAR.topOffset}
            width={Math.max(WORKOUT_BAR.minWidth, x(to) - x(from))}
            height={WORKOUT_BAR.height}
            rx={WORKOUT_BAR.radius}
            fill={item.color}
            className="chart-duration-segment chart-workout-segment"
            onClick={(event) => selectAtCursor(item, event)}
            onMouseEnter={(event) => selectAtCursor(item, event)}
            onMouseMove={(event) => selectAtCursor(item, event)}
          />
        );
      })}
    </>
  );
}
