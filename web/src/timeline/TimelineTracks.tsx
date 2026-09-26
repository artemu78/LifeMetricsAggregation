import { memo, type MouseEvent } from "react";
import { ActivityTrack } from "./ActivityTrack";
import { EmaActivityTrack } from "./EmaActivityTrack";
import { EmaSpeedometer } from "./EmaSpeedometer";
import { EventsTrack } from "./EventsTrack";
import { HeartTrack } from "./HeartTrack";
import { SleepBoundaryMarkers } from "./SleepBoundaryMarkers";
import { StepsTrack } from "./StepsTrack";
import { TimelineGrid } from "./TimelineGrid";
import { TodoistTrack } from "./TodoistTrack";
import { WelltoryTrack } from "./WelltoryTrack";
import { WorkoutsTrack } from "./WorkoutsTrack";
import { EMA_CENTER_Y, WELLTORY_CENTER } from "./timelineConfig";
import type { RecordItem } from "./timelineTypes";
import type { TimelineViewModel } from "./timelineViewModel";

type Props = {
  model: TimelineViewModel;
  timezone: string;
  selectAtCursor: (item: RecordItem, event: MouseEvent<Element>) => void;
};
export const TimelineTracks = memo(function TimelineTracks({
  model,
  timezone,
  selectAtCursor,
}: Props) {
  const {
    heart,
    stepSeries,
    maxStepCount,
    start,
    end,
    x,
    activitySegments,
    visibleWorkoutSegments,
    welltoryMeasurements,
    bedtime,
    wake,
    visibleEvents,
    visibleEmaEvents,
    todoistClusters,
    todoistIconPositions,
    ticks,
  } = model;
  return (
    <>
      <TimelineGrid ticks={ticks} x={x} />
      <SleepBoundaryMarkers
        bedtime={bedtime}
        wake={wake}
        timezone={timezone}
        x={x}
        onSelect={selectAtCursor}
      />
      <HeartTrack heart={heart} x={x} timezone={timezone} />

      <StepsTrack
        stepSeries={stepSeries}
        start={start}
        end={end}
        x={x}
        maxStepCount={maxStepCount}
        selectAtCursor={selectAtCursor}
      />

      <WorkoutsTrack
        visibleWorkoutSegments={visibleWorkoutSegments}
        start={start}
        end={end}
        x={x}
        selectAtCursor={selectAtCursor}
      />

      <ActivityTrack
        activitySegments={activitySegments}
        start={start}
        end={end}
        x={x}
        selectAtCursor={selectAtCursor}
      />
      <WelltoryTrack
        measurements={welltoryMeasurements}
        xScale={x}
        centerY={WELLTORY_CENTER}
        onSelect={selectAtCursor}
      />
      <EventsTrack
        visibleEvents={visibleEvents}
        x={x}
        selectAtCursor={selectAtCursor}
      />
      <EmaActivityTrack
        visibleEmaEvents={visibleEmaEvents}
        x={x}
        selectAtCursor={selectAtCursor}
      />
      <TodoistTrack
        todoistClusters={todoistClusters}
        todoistIconPositions={todoistIconPositions}
        timezone={timezone}
        selectAtCursor={selectAtCursor}
      />
      {visibleEmaEvents.map((item) => (
        <EmaSpeedometer
          key={`ema-${item.start}:${item.kind}:${item.label}`}
          item={item}
          cx={x(item.start)}
          cy={EMA_CENTER_Y}
          onSelect={selectAtCursor}
        />
      ))}
    </>
  );
});
