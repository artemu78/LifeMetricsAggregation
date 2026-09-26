import {
  ACTIVITY_LABEL_BASELINE,
  ACTIVITY_LANE_HEIGHT,
  ACTIVITY_LANE_TOP,
  AXIS_Y,
  HEART_GRID_ROWS,
  HEART_TOP,
  LANE_LABELS,
  LANE_LABEL_X,
  LEFT,
  PRODUCTIVITY_LANES,
  RIGHT,
  WELLTORY_SUBLABEL_Y,
  WIDTH,
} from "./timelineConfig";

type Props = { ticks: number[]; x: (time: number) => number };
export function TimelineGrid({ ticks, x }: Readonly<Props>) {
  return (
    <>
      {HEART_GRID_ROWS.map((y) => (
        <line
          key={y}
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={y}
          y2={y}
          className="chart-gridline"
        />
      ))}
      <line
        x1={LEFT}
        x2={LEFT}
        y1={HEART_TOP}
        y2={AXIS_Y}
        className="chart-axis"
      />
      {LANE_LABELS.map(({ label, y }) => (
        <text key={label} x={LANE_LABEL_X} y={y} className="chart-lane-label">
          {label}
        </text>
      ))}
      {PRODUCTIVITY_LANES.map(({ level, label }, index) => (
        <text
          key={level}
          x={LANE_LABEL_X}
          y={
            ACTIVITY_LANE_TOP +
            index * ACTIVITY_LANE_HEIGHT +
            ACTIVITY_LABEL_BASELINE
          }
          className="chart-activity-lane-label"
        >
          {label}
        </text>
      ))}
      <text
        x={LANE_LABEL_X}
        y={WELLTORY_SUBLABEL_Y}
        className="chart-welltory-sub-label"
      >
        ↑ энергия · ↓ стресс
      </text>

      {ticks.map((tick) => (
        <line
          key={tick}
          x1={x(tick)}
          x2={x(tick)}
          y1={HEART_TOP}
          y2={AXIS_Y}
          className="chart-time-gridline"
        />
      ))}
    </>
  );
}
