import type { MouseEvent } from "react";
import { AXIS_Y, EVENT_COLORS, HEART_TOP } from "./timelineConfig";
import { localLabel } from "./timelineModel";
import type { RecordItem } from "./timelineTypes";

const LABEL_OFFSET = { x: 5, y: 12 };
type Props = {
  bedtime: number | null;
  wake: number | null;
  timezone: string;
  x: (time: number) => number;
  onSelect: (item: RecordItem, event: MouseEvent<Element>) => void;
};
export function SleepBoundaryMarkers({
  bedtime,
  wake,
  timezone,
  x,
  onSelect,
}: Readonly<Props>) {
  const boundaries = [
    {
      time: bedtime,
      label: "Сон",
      caption: "СОН",
      detail: "Начало основной сессии сна",
    },
    {
      time: wake,
      label: "Подъём",
      caption: "ПОДЪЁМ",
      detail: "Окончание основной сессии сна",
    },
  ];
  return (
    <>
      {boundaries.map(({ time, label, caption, detail }) =>
        time === null ? null : (
          <g
            key={caption}
            className="chart-sleep-boundary"
            onMouseMove={(event) =>
              onSelect(
                {
                  start: time,
                  end: 0,
                  label,
                  detail,
                  color: EVENT_COLORS.sleep,
                  kind: "sleep",
                },
                event,
              )
            }
          >
            <line x1={x(time)} x2={x(time)} y1={HEART_TOP} y2={AXIS_Y} />
            <text x={x(time) + LABEL_OFFSET.x} y={HEART_TOP + LABEL_OFFSET.y}>
              {caption} · {localLabel(time, timezone)}
            </text>
          </g>
        ),
      )}
    </>
  );
}
