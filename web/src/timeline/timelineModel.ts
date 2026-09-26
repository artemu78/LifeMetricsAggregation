import { PRODUCTIVITY_LABELS as PRODUCTIVITY_NAMES } from "../dayDetail";
import {
  FALLBACK_ACTIVITY_COLOR,
  PRODUCTIVITY_COLORS,
} from "../shared/chartConfig";
import {
  MILLISECONDS_PER_MINUTE,
  MILLISECONDS_PER_SECOND,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "../shared/timeConstants";
import { getEmaActivity } from "./emaActivities";
import {
  EMA_MAX_RATING,
  EMA_STATUS_LABELS,
  EVENT_COLORS,
  LEFT,
  RIGHT,
  STEP_BUCKET_DURATION,
  TODOIST_CLUSTER_WINDOW,
  TODOIST_MARKER,
  WIDTH,
  WORKOUT_COLOR,
} from "./timelineConfig";
import type {
  Day,
  EmaRecordItem,
  Metric,
  RecordItem,
  RescueItem,
  TodoistCluster,
} from "./timelineTypes";

const TIMEZONE_OFFSET_PASSES = 3;

export function sortCopy<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  const sorted = [...items];
  sorted.sort(compare);
  return sorted;
}

export function buildHeartSeries(metrics: Metric[]) {
  const heart = metrics
    .filter(
      (point) =>
        point.metric === "fitness_drive.heart_rate" && point.value != null,
    )
    .map((point) => ({
      time: Date.parse(point.timestamp),
      value: point.value as number,
    }));
  return sortCopy(heart, (a, b) => a.time - b.time);
}

export function buildStepSeries(metrics: Metric[]) {
  const buckets = new Map<number, number>();
  for (const point of metrics) {
    if (
      point.metric !== "fitness_drive.steps" ||
      point.value == null ||
      point.value <= 0
    )
      continue;
    const time = Date.parse(point.timestamp);
    const bucket =
      Math.floor(time / STEP_BUCKET_DURATION) * STEP_BUCKET_DURATION;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + point.value);
  }
  const steps = [...buckets].map(([time, value]) => ({ time, value }));
  return sortCopy(steps, (a, b) => a.time - b.time);
}

function formatWorkoutDuration(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE)
    return `${Math.max(1, Math.round(seconds))} сек`;
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${minutes} мин`;
}

export function buildWorkoutSegments(metrics: Metric[]): RecordItem[] {
  const workouts = metrics
    .filter(
      (point) =>
        point.metric === "fitness_drive.exercise" && point.value != null,
    )
    .map((point) => {
      const startMs = Date.parse(point.timestamp);
      const rawSeconds = Number(point.value);
      const seconds = Math.max(0, rawSeconds);
      const endMs = startMs + seconds * MILLISECONDS_PER_SECOND;
      const durationText = seconds > 0 ? formatWorkoutDuration(seconds) : "";
      const title = point.valueText?.trim() || "Тренировка";
      const detail = durationText ? `${title} · ${durationText}` : title;
      return {
        start: startMs,
        end: endMs,
        label: title,
        detail,
        color: WORKOUT_COLOR,
        kind: "workout",
      };
    });
  return sortCopy(workouts, (a, b) => a.start - b.start);
}

export function buildSleepBoundaries(
  metrics: Metric[],
  nextDayMetrics: Metric[],
  start: number,
  end: number,
): { bedtime: number | null; wake: number | null; events: RecordItem[] } {
  const sleepEntries = (points: Metric[]) =>
    points.filter((point) => point.metric.startsWith("fitness_drive.sleep."));
  const wakePoints = sleepEntries(metrics);
  const bedtimePoints = sleepEntries(nextDayMetrics);
  const bedtime = bedtimePoints.length
    ? Math.min(...bedtimePoints.map((point) => Date.parse(point.timestamp)))
    : null;
  const wake = wakePoints.length
    ? Math.max(
        ...wakePoints.map(
          (point) =>
            Date.parse(point.timestamp) +
            (point.value ?? 0) * MILLISECONDS_PER_SECOND,
        ),
      )
    : null;
  const events: RecordItem[] = [];
  if (bedtime !== null && bedtime >= start && bedtime < end)
    events.push({
      start: bedtime,
      end: 0,
      label: "Сон",
      detail: "Начало основной сессии сна",
      color: EVENT_COLORS.sleep,
      kind: "sleep",
    });
  if (wake !== null && wake >= start && wake < end)
    events.push({
      start: wake,
      end: 0,
      label: "Подъём",
      detail: "Окончание основной сессии сна",
      color: EVENT_COLORS.sleep,
      kind: "sleep",
    });
  return { bedtime, wake, events };
}

export type ActivitySegment = RecordItem & {
  level: number | null;
  seconds: number;
};

export function buildActivitySegments(items: RescueItem[]): ActivitySegment[] {
  const rows = sortCopy(
    items.filter((item) => item.perspective === "activity" && item.seconds > 0),
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  const segments: ActivitySegment[] = [];
  const lastByActivity = new Map<string, ActivitySegment>();
  let bucketTime = Number.NaN;
  let bucketOffset = 0;
  for (const item of rows) {
    const timestamp = Date.parse(item.timestamp);
    if (timestamp !== bucketTime) {
      bucketTime = timestamp;
      bucketOffset = 0;
    }
    const start = timestamp + bucketOffset * MILLISECONDS_PER_SECOND;
    const end = start + item.seconds * MILLISECONDS_PER_SECOND;
    bucketOffset += item.seconds;
    const level = item.productivityLevel ?? null;
    const key = `${item.label}\u0000${level}`;
    const previous = lastByActivity.get(key);
    // RescueTime reports five-minute buckets. Join a short untracked gap
    // between consecutive buckets of the same activity and classification.
    if (
      previous &&
      start >= previous.start &&
      start <= previous.end + MILLISECONDS_PER_MINUTE
    ) {
      previous.end = Math.max(previous.end, end);
      previous.seconds += item.seconds;
      previous.detail = `${item.label} · ${level === null ? "категория недоступна" : PRODUCTIVITY_NAMES[level]} · ${formatWorkoutDuration(previous.seconds)}`;
      continue;
    }
    const segment: ActivitySegment = {
      start,
      end,
      label: item.label,
      detail: `${item.label} · ${level === null ? "категория недоступна" : PRODUCTIVITY_NAMES[level]} · ${formatWorkoutDuration(item.seconds)}`,
      color: PRODUCTIVITY_COLORS[String(level)] ?? FALLBACK_ACTIVITY_COLOR,
      kind: "activity",
      level,
      seconds: item.seconds,
    };
    segments.push(segment);
    lastByActivity.set(key, segment);
  }
  return segments;
}

export function buildWelltoryMeasurements(
  metrics: Day["detail"]["welltoryMetrics"],
  start: number,
  end: number,
) {
  const byTime = new Map<
    string,
    { timestamp: number; energy?: number; stress?: number; details: string[] }
  >();
  for (const point of metrics) {
    const timestamp = Date.parse(point.timestamp);
    const measurement = byTime.get(point.timestamp) ?? {
      timestamp,
      details: [],
    };
    const normalizedMetric = point.metric.toLowerCase();
    if (normalizedMetric.endsWith(".energy(hrv)") && point.value != null) {
      measurement.energy = point.value;
    } else if (
      normalizedMetric.endsWith(".stress(hrv)") &&
      point.value != null
    ) {
      measurement.stress = point.value;
    }
    measurement.details.push(metricText(point));
    byTime.set(point.timestamp, measurement);
  }
  const measurements = [...byTime.values()].filter(
    (measurement) =>
      measurement.timestamp >= start &&
      measurement.timestamp <= end &&
      (measurement.energy != null || measurement.stress != null),
  );
  return sortCopy(measurements, (a, b) => a.timestamp - b.timestamp);
}

export function buildTodoistRecords(day: Day): RecordItem[] {
  const records: RecordItem[] = [];
  const sources = [
    {
      tasks: day.detail?.createdTasks ?? [],
      kind: "todo-created",
      action: "создана",
    },
    {
      tasks: day.detail?.completedTasks ?? [],
      kind: "todo-completed",
      action: "закрыта",
    },
    {
      tasks: day.detail?.deletedTasks ?? [],
      kind: "todo-deleted",
      action: "удалена",
    },
  ] as const;
  for (const source of sources) {
    for (const task of source.tasks) {
      records.push({
        start: Date.parse(task.timestamp),
        end: 0,
        label: task.content,
        detail: `Задача ${source.action} · ${task.content}`,
        color: EVENT_COLORS[source.kind],
        kind: source.kind,
      });
    }
  }
  return records;
}

export function buildEmaRecords(day: Day): EmaRecordItem[] {
  return (day.detail?.emaEvents ?? [])
    .filter((event) => event.status === "answered")
    .map((event) => {
      const parts = [
        `EMA · ${EMA_STATUS_LABELS[event.status] ?? event.status}`,
      ];
      const metrics: string[] = [];
      if (event.mood != null)
        metrics.push(`настроение: ${event.mood}/${EMA_MAX_RATING}`);
      if (event.energy != null)
        metrics.push(`энергия: ${event.energy}/${EMA_MAX_RATING}`);
      if (event.focus != null)
        metrics.push(`фокус: ${event.focus}/${EMA_MAX_RATING}`);
      if (event.stress != null)
        metrics.push(`стресс: ${event.stress}/${EMA_MAX_RATING}`);
      if (metrics.length > 0) parts.push(metrics.join(", "));
      if (event.activity) {
        const activityInfo = getEmaActivity(event.activity);
        parts.push(`занятие: ${activityInfo.label}`);
      }
      if (event.note) parts.push(`заметка: ${event.note}`);
      return {
        start: Date.parse(event.timestamp),
        end: 0,
        label: event.status,
        detail: parts.join(" · "),
        color:
          EVENT_COLORS[`ema-${event.status}`] ?? EVENT_COLORS["ema-answered"],
        kind: `ema-${event.status}`,
        mood: event.mood,
        energy: event.energy,
        stress: event.stress,
        focus: event.focus,
        activity: event.activity,
        note: event.note,
      };
    });
}

export function buildMetricEvents(metrics: Metric[]): RecordItem[] {
  return metrics
    .filter(
      (point) =>
        point.metric !== "fitness_drive.heart_rate" &&
        point.metric !== "fitness_drive.steps" &&
        point.metric !== "fitness_drive.exercise" &&
        !point.metric.startsWith("fitness_drive.sleep."),
    )
    .map((point) => ({
      start: Date.parse(point.timestamp),
      end: 0,
      label: point.metric,
      detail: metricText(point),
      color: EVENT_COLORS.metric,
      kind: "metric",
    }));
}

export function buildTodoistClusters(
  records: RecordItem[],
  start: number,
  end: number,
) {
  const visible = records.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const ordered = sortCopy(visible, (a, b) => a.start - b.start);
  const clusters: TodoistCluster[] = [];
  for (const event of ordered) {
    const current = clusters.at(-1);
    if (
      !current ||
      event.start - current.events[0].start > TODOIST_CLUSTER_WINDOW
    ) {
      clusters.push({
        timestamp: event.start,
        events: [event],
        color: event.color,
      });
      continue;
    }
    current.events.push(event);
    current.timestamp = (current.events[0].start + event.start) / 2;
    if (current.events.some((item) => item.color !== current.color))
      current.color = TODOIST_MARKER.mixedColor;
  }
  return clusters;
}

export function positionTodoistClusters(
  clusters: TodoistCluster[],
  x: (timestamp: number) => number,
) {
  const positions = clusters.map((cluster) => x(cluster.timestamp));
  const gap = Math.min(
    TODOIST_MARKER.minGap,
    (WIDTH - RIGHT - LEFT - TODOIST_MARKER.size) /
      Math.max(1, positions.length - 1),
  );
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = Math.max(
      LEFT + TODOIST_MARKER.size / 2,
      positions[index],
    );
    if (index > 0)
      positions[index] = Math.max(positions[index], positions[index - 1] + gap);
  }
  const overflow = Math.max(
    0,
    (positions.at(-1) ?? 0) - (WIDTH - RIGHT - TODOIST_MARKER.size / 2),
  );
  if (overflow) {
    for (let index = 0; index < positions.length; index += 1)
      positions[index] -= overflow;
  }
  return positions;
}

export function zonedTimestamp(
  date: string,
  hour: number,
  timezone: string,
): number {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < TIMEZONE_OFFSET_PASSES; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(guess))
        .map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return guess;
}

export function localLabel(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function metricText(point: Day["detail"]["welltoryMetrics"][number]): string {
  const value =
    point.value == null ? (point.valueText ?? "") : String(point.value);
  const metric = point.metric
    .replace(/^(welltory|fitness_drive)\./, "")
    .replaceAll("_", " ");
  const valueLabel = value ? ` · ${value} ${point.unit ?? ""}` : "";
  return `${metric}${valueLabel}`.trim();
}
