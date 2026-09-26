import type { MouseEvent } from "react";
import { PERCENT_MAX } from "../shared/chartConfig";
import {
  EVENT_COLORS,
  LEFT,
  RIGHT,
  WELLTORY_GLYPH,
  WIDTH,
} from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";

type WelltoryMeasurement = Readonly<{
  timestamp: number;
  energy?: number;
  stress?: number;
  details: string[];
}>;

type WelltoryTrackProps = Readonly<{
  measurements: WelltoryMeasurement[];
  xScale: (time: number) => number;
  centerY: number;
  onSelect: (item: RecordItem, event: MouseEvent<Element>) => void;
}>;

export function WelltoryTrack({
  measurements,
  xScale,
  centerY,
  onSelect,
}: WelltoryTrackProps) {
  const maxHeight = WELLTORY_GLYPH.maxHeight;
  const barWidth = WELLTORY_GLYPH.barWidth;
  return (
    <g className="welltory-track">
      <line
        x1={LEFT}
        x2={WIDTH - RIGHT}
        y1={centerY}
        y2={centerY}
        className="welltory-centerline"
      />
      {measurements.map((measurement, index) => {
        const x = xScale(measurement.timestamp);
        const energy = Math.max(
          0,
          Math.min(PERCENT_MAX, measurement.energy ?? 0),
        );
        const stress = Math.max(
          0,
          Math.min(PERCENT_MAX, measurement.stress ?? 0),
        );
        const energyHeight = (maxHeight * energy) / PERCENT_MAX;
        const stressHeight = (maxHeight * stress) / PERCENT_MAX;
        const crowded = measurements.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            Math.abs(xScale(other.timestamp) - x) <
              WELLTORY_GLYPH.crowdingDistance,
        );
        const detail = `Welltory · ${measurement.details.join(" · ")}`;
        const selectedItem: RecordItem = {
          start: measurement.timestamp,
          end: 0,
          label: "Welltory",
          detail,
          color: EVENT_COLORS.welltory,
          kind: "welltory",
        };
        return (
          <g
            key={`welltory-${measurement.timestamp}`}
            className="welltory-measurement"
            onClick={(event) => onSelect(selectedItem, event)}
            onMouseEnter={(event) => onSelect(selectedItem, event)}
            onMouseMove={(event) => onSelect(selectedItem, event)}
          >
            <rect
              x={x - WELLTORY_GLYPH.hitWidth / 2}
              y={centerY - maxHeight - WELLTORY_GLYPH.hitPadding}
              width={WELLTORY_GLYPH.hitWidth}
              height={2 * (maxHeight + WELLTORY_GLYPH.hitPadding)}
              className="welltory-hit-area"
            />
            <text
              x={x}
              y={centerY - maxHeight - WELLTORY_GLYPH.energyLabelGap}
              textAnchor="middle"
              className={`welltory-value welltory-energy-value${crowded ? " is-crowded" : ""}`}
            >
              {measurement.energy == null ? "" : Math.round(measurement.energy)}
            </text>
            <rect
              x={x - barWidth / 2}
              y={centerY - maxHeight}
              width={barWidth}
              height={maxHeight}
              rx={WELLTORY_GLYPH.radius}
              className="welltory-energy-outline"
            />
            {energyHeight > 0 && (
              <rect
                x={x - barWidth / 2 + WELLTORY_GLYPH.border}
                y={centerY - energyHeight}
                width={barWidth - 2 * WELLTORY_GLYPH.border}
                height={Math.max(0, energyHeight - WELLTORY_GLYPH.border)}
                rx="1"
                className="welltory-energy-fill"
              />
            )}
            <rect
              x={x - WELLTORY_GLYPH.terminalWidth / 2}
              y={centerY - maxHeight - WELLTORY_GLYPH.terminalHeight}
              width={WELLTORY_GLYPH.terminalWidth}
              height={WELLTORY_GLYPH.terminalHeight}
              className="welltory-energy-terminal"
            />
            <rect
              x={x - barWidth / 2}
              y={centerY}
              width={barWidth}
              height={maxHeight}
              rx={WELLTORY_GLYPH.radius}
              className="welltory-stress-outline"
            />
            {stressHeight > 0 && (
              <rect
                x={x - barWidth / 2 + WELLTORY_GLYPH.border}
                y={centerY + 1}
                width={barWidth - 2 * WELLTORY_GLYPH.border}
                height={Math.max(0, stressHeight - WELLTORY_GLYPH.border)}
                rx="1"
                className="welltory-stress-fill"
              />
            )}
            <text
              x={x}
              y={centerY + maxHeight + WELLTORY_GLYPH.stressLabelGap}
              textAnchor="middle"
              className={`welltory-value welltory-stress-value${crowded ? " is-crowded" : ""}`}
            >
              {measurement.stress == null ? "" : Math.round(measurement.stress)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
