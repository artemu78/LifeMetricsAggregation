import type { MouseEvent } from "react";
import {
  ACTIVITY_BAR,
  ACTIVITY_LANE_HEIGHT,
  ACTIVITY_LANE_TOP,
} from "./timelineConfig";
import { type ActivitySegment } from "./timelineModel";
import type { RecordItem } from "./timelineTypes";

type Props = {
  activitySegments: ActivitySegment[];
  start: number;
  end: number;
  x: (time: number) => number;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function ActivityTrack({
  activitySegments,
  start,
  end,
  x,
  selectAtCursor,
}: Readonly<Props>) {
  return (
    <>
      {activitySegments
        .filter((item) => item.end > start && item.start < end)
        .map((item) => {
          const lane = ACTIVITY_BAR.neutralLane - (item.level ?? 0);
          const from = Math.max(start, item.start);
          const to = Math.min(end, item.end);
          const width = Math.max(ACTIVITY_BAR.minWidth, x(to) - x(from));
          return (
            <g
              key={`activity-${item.start}:${item.end}:${item.label}:${item.level}`}
            >
              <rect
                x={x(from)}
                y={ACTIVITY_LANE_TOP + lane * ACTIVITY_LANE_HEIGHT}
                width={width}
                height={ACTIVITY_BAR.height}
                rx={ACTIVITY_BAR.radius}
                fill={item.color}
                className="chart-duration-segment chart-activity-segment"
                aria-label={item.detail}
                onClick={(event) => selectAtCursor(item, event)}
                onMouseEnter={(event) => selectAtCursor(item, event)}
                onMouseMove={(event) => selectAtCursor(item, event)}
              />
              {width >
                item.label.length * ACTIVITY_BAR.characterWidth +
                  2 * ACTIVITY_BAR.labelPadding && (
                <text
                  x={x(from) + ACTIVITY_BAR.labelPadding}
                  y={
                    ACTIVITY_LANE_TOP +
                    lane * ACTIVITY_LANE_HEIGHT +
                    ACTIVITY_BAR.labelBaseline
                  }
                  className="chart-activity-name"
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
    </>
  );
}
