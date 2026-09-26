import type { MouseEvent } from "react";
import { EVENT_MARKER, EVENT_TOP } from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";

type Props = {
  visibleEvents: RecordItem[];
  x: (time: number) => number;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};

export function EventsTrack({ visibleEvents, x, selectAtCursor }: Props) {
  const markers = new Map<string, number>();
  return (
    <>
      {visibleEvents.map((item) => {
        const markerKey = `${item.start}:${item.kind}`;
        const stack = markers.get(markerKey) ?? 0;
        markers.set(markerKey, stack + 1);
        const cy =
          EVENT_TOP +
          EVENT_MARKER.topOffset +
          (stack % EVENT_MARKER.rows) * EVENT_MARKER.rowGap;
        return (
          <circle
            key={`event-${item.start}:${item.kind}:${item.label}:${item.detail}`}
            cx={x(item.start)}
            cy={cy}
            r={EVENT_MARKER.radius}
            fill={item.color}
            className="chart-event-dot"
            onClick={(event) => selectAtCursor(item, event)}
            onMouseEnter={(event) => selectAtCursor(item, event)}
            onMouseMove={(event) => selectAtCursor(item, event)}
          />
        );
      })}
    </>
  );
}
