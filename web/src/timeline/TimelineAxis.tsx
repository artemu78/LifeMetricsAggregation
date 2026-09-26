import {
  AXIS_TICK_LABEL_OFFSET,
  AXIS_Y,
  CURSOR_LABEL,
  LEFT,
  RIGHT,
  WIDTH,
} from "./timelineConfig";
import { localLabel } from "./timelineModel";

type Props = {
  ticks: number[];
  x: (time: number) => number;
  timezone: string;
  cursorX: number | null;
  cursorLabelX: number | null;
  cursorTime: number | null;
};
export function TimelineAxis({
  ticks,
  x,
  timezone,
  cursorX,
  cursorLabelX,
  cursorTime,
}: Readonly<Props>) {
  return (
    <>
      <line
        x1={LEFT}
        x2={WIDTH - RIGHT}
        y1={AXIS_Y}
        y2={AXIS_Y}
        className="chart-axis"
      />
      {ticks.map((tick) => (
        <text
          key={tick}
          x={x(tick)}
          y={AXIS_Y + AXIS_TICK_LABEL_OFFSET}
          textAnchor="middle"
          className="chart-tick"
        >
          {localLabel(tick, timezone)}
        </text>
      ))}
      {cursorX !== null && cursorLabelX !== null && (
        <g className="chart-cursor-time">
          <rect
            x={cursorLabelX}
            y={AXIS_Y + CURSOR_LABEL.top}
            width={CURSOR_LABEL.width}
            height={CURSOR_LABEL.height}
            rx={CURSOR_LABEL.radius}
          />
          <text
            x={cursorLabelX + CURSOR_LABEL.width / 2}
            y={AXIS_Y + CURSOR_LABEL.baseline}
            textAnchor="middle"
          >
            {localLabel(cursorTime!, timezone)}
          </text>
        </g>
      )}
    </>
  );
}
