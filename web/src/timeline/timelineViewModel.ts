import { HOURS_PER_DAY, LOGICAL_DAY_START_HOUR } from "../shared/timeConstants";
import { LEFT, RIGHT, TIME_TICK_INTERVAL, WIDTH } from "./timelineConfig";
import {
  buildActivitySegments,
  buildEmaRecords,
  buildHeartSeries,
  buildMetricEvents,
  buildSleepBoundaries,
  buildStepSeries,
  buildTodoistClusters,
  buildTodoistRecords,
  buildWelltoryMeasurements,
  buildWorkoutSegments,
  positionTodoistClusters,
  zonedTimestamp,
} from "./timelineModel";
import type { Day } from "./timelineTypes";

export function buildTimelineViewModel(
  day: Day,
  timezone: string,
  nextDaySleepMetrics: Day["detail"]["braceletMetrics"],
) {
  const metrics = day.detail?.braceletMetrics ?? [];
  const heart = buildHeartSeries(metrics);
  const stepSeries = buildStepSeries(metrics);
  const rescueTime = day.detail?.rescueTime ?? [];
  const activity = rescueTime.filter((item) => item.perspective === "activity");
  const maxStepCount = Math.max(1, ...stepSeries.map((item) => item.value));
  const start = zonedTimestamp(day.date, LOGICAL_DAY_START_HOUR, timezone);
  const end = zonedTimestamp(
    day.date,
    LOGICAL_DAY_START_HOUR + HOURS_PER_DAY,
    timezone,
  );
  const plotWidth = WIDTH - LEFT - RIGHT;
  const x = (time: number) =>
    LEFT + ((time - start) / (end - start)) * plotWidth;
  const activitySegments = buildActivitySegments(rescueTime);
  const workoutSegments = buildWorkoutSegments(metrics);
  const welltoryMeasurements = buildWelltoryMeasurements(
    day.detail?.welltoryMetrics ?? [],
    start,
    end,
  );
  const todoistRecords = buildTodoistRecords(day);
  const emaRecords = buildEmaRecords(day);
  const sleepBoundaries = buildSleepBoundaries(
    metrics,
    nextDaySleepMetrics,
    start,
    end,
  );
  const { bedtime, wake } = sleepBoundaries;
  const eventRecords = [
    ...buildMetricEvents(metrics),
    ...sleepBoundaries.events,
  ];
  const visibleWorkoutSegments = workoutSegments.filter(
    (item) => item.end > start && item.start < end,
  );
  const visibleEvents = eventRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const visibleTodoistEvents = todoistRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const visibleEmaEvents = emaRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const todoistClusters = buildTodoistClusters(todoistRecords, start, end);
  const todoistIconPositions = positionTodoistClusters(todoistClusters, x);
  const tickEvery = TIME_TICK_INTERVAL;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(start / tickEvery) * tickEvery;
    tick < end;
    tick += tickEvery
  )
    ticks.push(tick);
  const empty =
    !heart.length &&
    !stepSeries.length &&
    !workoutSegments.length &&
    !activity.length &&
    !welltoryMeasurements.length &&
    !visibleEvents.length &&
    !visibleTodoistEvents.length &&
    !visibleEmaEvents.length;
  return {
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
    empty,
  };
}

export type TimelineViewModel = ReturnType<typeof buildTimelineViewModel>;
