import { useMemo } from "react";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineTracks } from "./TimelineTracks";
import {
  AXIS_Y,
  HEART_TOP,
  HEIGHT,
  INTERACTIVE_TRACK_SELECTOR,
  STICKY_AXIS_HEIGHT,
  STICKY_AXIS_TOP_PADDING,
  WIDTH,
} from "./timelineConfig";
import { localLabel } from "./timelineModel";
import type { Day } from "./timelineTypes";
import { buildTimelineViewModel } from "./timelineViewModel";
import { useTimelineCursor } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
import { useTimelineViewport } from "./useTimelineViewport";

type DayTimelineChartProps = Readonly<{
  day: Day;
  timezone: string;
  nextDaySleepMetrics?: Day["detail"]["braceletMetrics"];
}>;

const EMPTY_METRICS: Day["detail"]["braceletMetrics"] = [];

export function DayTimelineChart({
  day,
  timezone,
  nextDaySleepMetrics = EMPTY_METRICS,
}: DayTimelineChartProps) {
  const model = useMemo(
    () => buildTimelineViewModel(day, timezone, nextDaySleepMetrics),
    [day, timezone, nextDaySleepMetrics],
  );
  const { start, end, x, ticks, empty } = model;
  const {
    axisVisible,
    chartScrollLeft,
    setChartScrollLeft,
    axisFrame,
    chartScrollRef,
    chartRef,
    timeAxisRef,
  } = useTimelineViewport();
  const { selected, selectionRef, selectAtCursor, clearSelection } =
    useTimelineSelection();
  const {
    cursorTime,
    cursorX,
    cursorLabelX,
    updateCursor,
    clearCursor,
    updateAfterScroll,
  } = useTimelineCursor(chartRef, start, end, x);
  const timeAxisContent = (
    <TimelineAxis
      ticks={ticks}
      x={x}
      timezone={timezone}
      cursorTime={cursorTime}
      cursorX={cursorX}
      cursorLabelX={cursorLabelX}
    />
  );
  return (
    <section
      className="day-chart-card"
      aria-label="Общий график событий и показателей дня"
    >
      <div className="day-chart-heading">
        <div>
          <p>Общая шкала времени · {timezone} · логический день 05:00–05:00</p>
        </div>
      </div>
      <div
        ref={chartScrollRef}
        className="day-chart-scroll"
        onScroll={(event) => {
          setChartScrollLeft(event.currentTarget.scrollLeft);
          updateAfterScroll();
        }}
        onMouseEnter={(event) => updateCursor(event.clientX)}
        onMouseLeave={() => {
          clearCursor();
          clearSelection();
        }}
        onMouseMove={(event) => {
          updateCursor(event.clientX);
          const target = event.target as Element;
          if (!target.closest(INTERACTIVE_TRACK_SELECTOR)) clearSelection();
        }}
      >
        <svg
          ref={chartRef}
          className="day-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Пульс, продуктивность и события на общей временной шкале"
        >
          <TimelineTracks
            model={model}
            timezone={timezone}
            selectAtCursor={selectAtCursor}
          />
          {cursorX !== null && (
            <line
              x1={cursorX}
              x2={cursorX}
              y1={HEART_TOP}
              y2={AXIS_Y}
              className="chart-cursor-line"
            />
          )}
          <g ref={timeAxisRef} className="chart-time-axis">
            {timeAxisContent}
          </g>
        </svg>
      </div>
      {!axisVisible && (
        <div
          className="chart-axis-sticky"
          aria-hidden="true"
          style={{ left: axisFrame.left, width: axisFrame.width }}
        >
          <svg
            viewBox={`0 ${AXIS_Y - STICKY_AXIS_TOP_PADDING} ${WIDTH} ${STICKY_AXIS_HEIGHT}`}
            preserveAspectRatio="none"
            style={{
              width: axisFrame.chartWidth,
              transform: `translateX(-${chartScrollLeft}px)`,
            }}
          >
            {timeAxisContent}
          </svg>
        </div>
      )}
      {selected && (
        <div
          ref={selectionRef}
          className="day-chart-selection"
          role="tooltip"
          aria-live="polite"
        >
          <time>{localLabel(selected.start, timezone)}</time> ·{" "}
          {selected.detail}
        </div>
      )}
      {empty && <p className="muted">Для этой даты нет точек графика.</p>}
    </section>
  );
}
