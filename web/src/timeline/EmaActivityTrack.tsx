import type { MouseEvent } from "react";
import { getEmaActivity } from "./emaActivities";
import { EMA_ACTIVITY_MARKER, EVENT_TOP } from "./timelineConfig";
import type { EmaRecordItem, RecordItem } from "./timelineTypes";

type Props = {
  visibleEmaEvents: EmaRecordItem[];
  x: (time: number) => number;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function EmaActivityTrack({
  visibleEmaEvents,
  x,
  selectAtCursor,
}: Props) {
  return (
    <>
      {visibleEmaEvents
        .filter((item) => Boolean(item.activity))
        .map((item) => {
          const activityInfo = getEmaActivity(item.activity);
          const ActivityIcon = activityInfo.icon;
          const detailParts = [`EMA · ${activityInfo.label}`];
          if (item.note) detailParts.push(`заметка: ${item.note}`);
          const activityRecord: RecordItem = {
            start: item.start,
            end: 0,
            label: activityInfo.label,
            detail: detailParts.join(" · "),
            color: EMA_ACTIVITY_MARKER.color,
            kind: "ema-activity",
          };
          return (
            <foreignObject
              key={`ema-activity-${item.start}:${item.activity}`}
              x={x(item.start) - EMA_ACTIVITY_MARKER.size / 2}
              y={EVENT_TOP + EMA_ACTIVITY_MARKER.topOffset}
              width={EMA_ACTIVITY_MARKER.size}
              height={EMA_ACTIVITY_MARKER.size}
            >
              <button
                type="button"
                className="ema-activity-marker"
                aria-label={`EMA · ${activityInfo.label}`}
                onClick={(event) => selectAtCursor(activityRecord, event)}
                onMouseEnter={(event) => selectAtCursor(activityRecord, event)}
                onMouseMove={(event) => selectAtCursor(activityRecord, event)}
              >
                <ActivityIcon
                  size={EMA_ACTIVITY_MARKER.iconSize}
                  strokeWidth={EMA_ACTIVITY_MARKER.strokeWidth}
                  aria-hidden="true"
                />
              </button>
            </foreignObject>
          );
        })}
    </>
  );
}
