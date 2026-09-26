import {
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from "../shared/timeConstants";
import {
  BOTTOM,
  GAP_TRANSITION,
  LEFT,
  PLOT_WIDTH,
  SLEEP_GAP_MINUTES,
  SLEEP_TICK_COUNT,
  STAGE_TRANSITION,
  Y_LEVELS,
} from "./sleepChartConfig";
import type { SleepInterval } from "./sleepModel";

export function buildSleepGeometry(
  intervals: SleepInterval[],
  timezone: string,
) {
  if (!intervals.length) return null;
  const minTime = intervals[0].start;
  const maxTime = Math.max(
    minTime + MILLISECONDS_PER_HOUR,
    intervals.at(-1)!.end,
  );

  const totalDuration = maxTime - minTime;
  const timeToX = (t: number) =>
    LEFT +
    ((Math.max(minTime, Math.min(maxTime, t)) - minTime) / totalDuration) *
      PLOT_WIDTH;

  const firstX = timeToX(intervals[0].start);
  const lineD = buildSleepPath(intervals, timeToX);
  const lastX = timeToX(intervals.at(-1)!.end);
  const areaD = `${lineD} L ${lastX.toFixed(1)} ${BOTTOM.toFixed(1)} L ${firstX.toFixed(1)} ${BOTTOM.toFixed(1)} Z`;

  const numTicks = SLEEP_TICK_COUNT;
  const ticks: { time: number; x: number; label: string }[] = [];
  for (let i = 0; i < numTicks; i++) {
    const t = minTime + (i / (numTicks - 1)) * totalDuration;
    const date = new Date(t);
    const label = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    });
    ticks.push({ time: t, x: timeToX(t), label });
  }

  return { minTime, totalDuration, lineD, areaD, ticks };
}
export type SleepGeometry = NonNullable<ReturnType<typeof buildSleepGeometry>>;

type TimeScale = (time: number) => number;

function buildGapTransition(
  current: SleepInterval,
  next: SleepInterval,
  timeToX: TimeScale,
): string {
  const currY = Y_LEVELS[current.phase];
  const currStartX = timeToX(current.start);
  const currEndX = timeToX(current.end);
  const nextY = Y_LEVELS[next.phase];
  const nextStartX = timeToX(next.start);
  let path = "";
  const yAwake = Y_LEVELS.awake;
  const transW = Math.min(
    GAP_TRANSITION.maxWidth,
    (currEndX - currStartX) * GAP_TRANSITION.intervalFraction,
  );
  const flatEndX = Math.max(currStartX, currEndX - transW);
  path += ` L ${flatEndX.toFixed(1)} ${currY.toFixed(1)}`;

  const mid1X = (flatEndX + currEndX) / 2;
  path += ` C ${mid1X.toFixed(1)} ${currY.toFixed(1)}, ${mid1X.toFixed(1)} ${yAwake.toFixed(1)}, ${currEndX.toFixed(1)} ${yAwake.toFixed(1)}`;

  path += ` L ${nextStartX.toFixed(1)} ${yAwake.toFixed(1)}`;

  const transNextW = Math.min(
    GAP_TRANSITION.maxWidth,
    (timeToX(next.end) - nextStartX) * GAP_TRANSITION.intervalFraction,
  );
  const mid2X = (nextStartX + nextStartX + transNextW) / 2;
  path += ` C ${mid2X.toFixed(1)} ${yAwake.toFixed(1)}, ${mid2X.toFixed(1)} ${nextY.toFixed(1)}, ${(nextStartX + transNextW).toFixed(1)} ${nextY.toFixed(1)}`;
  return path;
}

function buildStageTransition(
  current: SleepInterval,
  next: SleepInterval,
  timeToX: TimeScale,
): string {
  const currY = Y_LEVELS[current.phase];
  const currStartX = timeToX(current.start);
  const currEndX = timeToX(current.end);
  const nextY = Y_LEVELS[next.phase];
  const nextStartX = timeToX(next.start);
  let path = "";

  const maxW = Math.min(
    (currEndX - currStartX) * STAGE_TRANSITION.intervalFraction,
    (timeToX(next.end) - nextStartX) * STAGE_TRANSITION.intervalFraction,
    STAGE_TRANSITION.maxWidth,
  );
  const transW = Math.max(STAGE_TRANSITION.minWidth, maxW);
  const tStartX = Math.max(currStartX, currEndX - transW / 2);
  const tEndX = Math.min(timeToX(next.end), nextStartX + transW / 2);
  const tMidX = (tStartX + tEndX) / 2;

  path += ` L ${tStartX.toFixed(1)} ${currY.toFixed(1)}`;
  path += ` C ${tMidX.toFixed(1)} ${currY.toFixed(1)}, ${tMidX.toFixed(1)} ${nextY.toFixed(1)}, ${tEndX.toFixed(1)} ${nextY.toFixed(1)}`;
  return path;
}

function buildSleepPath(
  intervals: SleepInterval[],
  timeToX: TimeScale,
): string {
  const first = intervals[0];
  let path = `M ${timeToX(first.start).toFixed(1)} ${Y_LEVELS[first.phase].toFixed(1)}`;
  for (const [index, current] of intervals.entries()) {
    const next = intervals[index + 1];
    if (!next) {
      path += ` L ${timeToX(current.end).toFixed(1)} ${Y_LEVELS[current.phase].toFixed(1)}`;
      break;
    }
    const gapMinutes = (next.start - current.end) / MILLISECONDS_PER_MINUTE;
    path +=
      gapMinutes > SLEEP_GAP_MINUTES
        ? buildGapTransition(current, next, timeToX)
        : buildStageTransition(current, next, timeToX);
  }
  return path;
}
