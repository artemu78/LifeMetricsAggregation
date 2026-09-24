import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { ListTodo } from "lucide-react";
import type { components } from "./generated/api-types";

type Day = components["schemas"]["DashboardDay"];
type RecordItem = {
  start: number;
  end: number;
  label: string;
  detail: string;
  color: string;
  kind: string;
};
type TodoistCluster = {
  timestamp: number;
  events: RecordItem[];
  color: string;
};
type Metric = Day["detail"]["braceletMetrics"][number];
type RescueItem = Day["detail"]["rescueTime"][number];

function sortCopy<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  const sorted = [...items];
  sorted.sort(compare);
  return sorted;
}

const WIDTH = 1240;
const HEIGHT = 804;
const LEFT = 128;
const RIGHT = 26;
const HEART_TOP = 36;
const HEART_BOTTOM = 264;
const STEPS_TOP = 276;
const STEPS_BOTTOM = 306;
const WORKOUTS_TOP = 320;
const ACTIVITY_TOP = 366;
const PRODUCTIVITY_TOP = 428;
const WELLTORY_TOP = 488;
const WELLTORY_CENTER = 540;
const EVENT_TOP = 606;
const TODOIST_TOP = 654;
const EMA_TOP = 702;
const AXIS_Y = 754;
const PRODUCTIVITY_COLORS: Record<string, string> = {
  "-2": "#cf5c4f",
  "-1": "#db8b51",
  "0": "#a7b3ae",
  "1": "#75b7d5",
  "2": "#4d82d8",
};
const PRODUCTIVITY_NAMES: Record<string, string> = {
  "-2": "Отвлекающее",
  "-1": "Личное",
  "0": "Нейтральное",
  "1": "Другая работа",
  "2": "Сосредоточенная работа",
};
const EVENT_COLORS: Record<string, string> = {
  "todo-created": "#29915d",
  "todo-completed": "#4d82d8",
  "todo-deleted": "#c54e4e",
  welltory: "#a75c91",
  metric: "#667f78",
  sleep: "#7779b9",
  workout: "#4c7f6d",
  "ema-answered": "#35876b",
  "ema-pending": "#c39439",
  "ema-dismissed": "#b45c54",
  "ema-expired": "#87948e",
};
const WORKOUT_COLOR = "#4c7f6d";

function buildHeartSeries(metrics: Metric[]) {
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

function buildStepSeries(metrics: Metric[]) {
  const buckets = new Map<number, number>();
  for (const point of metrics) {
    if (
      point.metric !== "fitness_drive.steps" ||
      point.value == null ||
      point.value <= 0
    ) continue;
    const time = Date.parse(point.timestamp);
    const bucket = Math.floor(time / (15 * 60_000)) * 15 * 60_000;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + point.value);
  }
  const steps = [...buckets]
    .map(([time, value]) => ({ time, value }));
  return sortCopy(steps, (a, b) => a.time - b.time);
}

function formatWorkoutDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} сек`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч`;
  return `${minutes} мин`;
}

function buildWorkoutSegments(metrics: Metric[]): RecordItem[] {
  const workouts = metrics
    .filter(
      (point) =>
        point.metric === "fitness_drive.exercise" && point.value != null,
    )
    .map((point) => {
      const startMs = Date.parse(point.timestamp);
      const rawSeconds = Number(point.value);
      const seconds = Math.max(0, rawSeconds);
      const endMs = startMs + seconds * 1000;
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

function buildSleepBoundaries(
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
          (point) => Date.parse(point.timestamp) + (point.value ?? 0) * 1000,
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

function buildActivitySegments(items: RescueItem[]): RecordItem[] {
  const buckets = new Map<number, RescueItem[]>();
  for (const item of items.filter((entry) => entry.perspective === "activity")) {
    const time = Date.parse(item.timestamp);
    const bucket = buckets.get(time) ?? [];
    bucket.push(item);
    buckets.set(time, bucket);
  }
  const segments: RecordItem[] = [];
  for (const [time, bucket] of buckets) {
    let offset = 0;
    for (const item of bucket) {
      const from = time + offset * 1000;
      const to = from + item.seconds * 1000;
      segments.push({
        start: from,
        end: to,
        label: item.label,
        detail: `Активность · ${item.label}`,
        color: activityColor(item.label),
        kind: "activity",
      });
      offset += item.seconds;
    }
  }
  return segments;
}

function buildProductivitySegments(items: RescueItem[]): RecordItem[] {
  return items
    .filter((item) => item.perspective === "productivity")
    .map((item) => ({
      start: Date.parse(item.timestamp),
      end: Date.parse(item.timestamp) + item.seconds * 1000,
      label: item.label,
      detail: `Продуктивность · ${PRODUCTIVITY_NAMES[item.label] ?? item.label}`,
      color: PRODUCTIVITY_COLORS[item.label] ?? "#789087",
      kind: "productivity",
    }));
}

function buildWelltoryMeasurements(
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
    const measurement = byTime.get(point.timestamp) ?? { timestamp, details: [] };
    const normalizedMetric = point.metric.toLowerCase();
    if (normalizedMetric.endsWith(".energy(hrv)") && point.value != null) {
      measurement.energy = point.value;
    } else if (normalizedMetric.endsWith(".stress(hrv)") && point.value != null) {
      measurement.stress = point.value;
    }
    measurement.details.push(metricText(point));
    byTime.set(point.timestamp, measurement);
  }
  const measurements = [...byTime.values()]
    .filter(
      (measurement) =>
        measurement.timestamp >= start &&
        measurement.timestamp <= end &&
        (measurement.energy != null || measurement.stress != null),
    )
  return sortCopy(measurements, (a, b) => a.timestamp - b.timestamp);
}

function buildTodoistRecords(day: Day): RecordItem[] {
  const records: RecordItem[] = [];
  const sources = [
    { tasks: day.detail?.createdTasks ?? [], kind: "todo-created", action: "создана" },
    { tasks: day.detail?.completedTasks ?? [], kind: "todo-completed", action: "закрыта" },
    { tasks: day.detail?.deletedTasks ?? [], kind: "todo-deleted", action: "удалена" },
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

function buildEmaRecords(day: Day): RecordItem[] {
  const statuses: Record<string, string> = {
    pending: "ожидание ответа",
    answered: "ответ отправлен",
    dismissed: "отклонено",
    expired: "время ответа истекло",
  };
  return (day.detail?.emaEvents ?? [])
    .filter((event) => event.status === "answered")
    .map((event) => ({
      start: Date.parse(event.timestamp),
      end: 0,
      label: event.status,
      detail: `EMA · ${statuses[event.status] ?? event.status}`,
      color: EVENT_COLORS[`ema-${event.status}`] ?? EVENT_COLORS["ema-answered"],
      kind: `ema-${event.status}`,
    }));
}

function buildMetricEvents(metrics: Metric[]): RecordItem[] {
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

function buildTodoistClusters(records: RecordItem[], start: number, end: number) {
  const visible = records
    .filter((item) => item.start >= start && item.start <= end)
  const ordered = sortCopy(visible, (a, b) => a.start - b.start);
  const clusters: TodoistCluster[] = [];
  for (const event of ordered) {
    const current = clusters.at(-1);
    if (!current || event.start - current.events[0].start > 10 * 60_000) {
      clusters.push({ timestamp: event.start, events: [event], color: event.color });
      continue;
    }
    current.events.push(event);
    current.timestamp = (current.events[0].start + event.start) / 2;
    if (current.events.some((item) => item.color !== current.color))
      current.color = "#536b60";
  }
  return clusters;
}

function positionTodoistClusters(
  clusters: TodoistCluster[],
  x: (timestamp: number) => number,
) {
  const positions = clusters.map((cluster) => x(cluster.timestamp));
  const gap = Math.min(
    40,
    (WIDTH - RIGHT - LEFT - 38) / Math.max(1, positions.length - 1),
  );
  for (let index = 0; index < positions.length; index += 1) {
    positions[index] = Math.max(LEFT + 19, positions[index]);
    if (index > 0)
      positions[index] = Math.max(positions[index], positions[index - 1] + gap);
  }
  const overflow = Math.max(0, (positions.at(-1) ?? 0) - (WIDTH - RIGHT - 19));
  if (overflow) {
    for (let index = 0; index < positions.length; index += 1)
      positions[index] -= overflow;
  }
  return positions;
}

function zonedTimestamp(date: string, hour: number, timezone: string): number {
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
  for (let pass = 0; pass < 3; pass += 1) {
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

function localLabel(timestamp: number, timezone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function activityColor(label: string): string {
  let hash = 0;
  for (const character of label)
    hash = Math.trunc(hash * 31 + character.codePointAt(0)!);
  const colors = [
    "#407f70",
    "#5e87b8",
    "#b48a45",
    "#9275a8",
    "#c27156",
    "#668d98",
    "#849658",
  ];
  return colors[Math.abs(hash) % colors.length];
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

type DayTimelineChartProps = Readonly<{
  day: Day;
  timezone: string;
  nextDaySleepMetrics?: Day["detail"]["braceletMetrics"];
}>;

function positionSelection(
  element: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): void {
  if (!element) return;
  const leftHalf = clientX < window.innerWidth / 2;
  const upperHalf = clientY < window.innerHeight / 2;
  const maxWidth = Math.min(
    360,
    leftHalf ? window.innerWidth - clientX - 24 : clientX - 24,
  );
  const maxHeight = Math.min(
    240,
    upperHalf ? window.innerHeight - clientY - 24 : clientY - 24,
  );
  element.style.left = leftHalf ? `${clientX + 14}px` : "auto";
  element.style.right = leftHalf
    ? "auto"
    : `${window.innerWidth - clientX + 14}px`;
  element.style.top = upperHalf ? `${clientY + 14}px` : "auto";
  element.style.bottom = upperHalf
    ? "auto"
    : `${window.innerHeight - clientY + 14}px`;
  element.style.maxWidth = `${maxWidth}px`;
  element.style.maxHeight = `${maxHeight}px`;
}

export function DayTimelineChart({
  day,
  timezone,
  nextDaySleepMetrics = [],
}: DayTimelineChartProps) {
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [hoveredHeart, setHoveredHeart] = useState<{
    time: number;
    value: number;
  } | null>(null);
  const [axisVisible, setAxisVisible] = useState(true);
  const [chartScrollLeft, setChartScrollLeft] = useState(0);
  const timeAxisRef = useRef<SVGGElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const axis = timeAxisRef.current;
    if (!axis || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setAxisVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(axis);
    return () => observer.disconnect();
  }, []);
  const selectAtCursor = (item: RecordItem, event: MouseEvent<Element>) => {
    selectionPointerRef.current = { x: event.clientX, y: event.clientY };
    positionSelection(selectionRef.current, event.clientX, event.clientY);
    setSelected((current) =>
      current?.kind === item.kind &&
      current.start === item.start &&
      current.detail === item.detail
        ? current
        : item,
    );
  };
  useLayoutEffect(() => {
    if (selected && selectionPointerRef.current) {
      positionSelection(
        selectionRef.current,
        selectionPointerRef.current.x,
        selectionPointerRef.current.y,
      );
    }
  }, [selected]);
  const clearSelection = () => {
    selectionPointerRef.current = null;
    setSelected(null);
  };
  const metrics = day.detail?.braceletMetrics ?? [];
  const heart = buildHeartSeries(metrics);
  const stepSeries = buildStepSeries(metrics);
  const rescueTime = day.detail?.rescueTime ?? [];
  const activity = rescueTime.filter(
    (item) => item.perspective === "activity",
  );
  const productivity = rescueTime.filter(
    (item) => item.perspective === "productivity",
  );
  const maxStepCount = Math.max(1, ...stepSeries.map((item) => item.value));
  const start = zonedTimestamp(day.date, 5, timezone);
  const end = zonedTimestamp(day.date, 29, timezone);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const x = (time: number) =>
    LEFT + ((time - start) / (end - start)) * plotWidth;
  const heartValueList = heart.map((item) => item.value);
  const heartValues = sortCopy(heartValueList, (a, b) => a - b);
  const low = heartValues.length
    ? heartValues[Math.floor((heartValues.length - 1) * 0.03)]
    : 40;
  const high = heartValues.length
    ? heartValues[Math.ceil((heartValues.length - 1) * 0.97)]
    : 160;
  const heartRange = Math.max(10, high - low);
  const heartY = (value: number) =>
    HEART_BOTTOM -
    ((value - (low - heartRange * 0.08)) / (heartRange * 1.16)) *
      (HEART_BOTTOM - HEART_TOP);
  const heartPathPoints = heart
    .map((point, index) => {
      const previous = heart[index - 1];
      const command = previous && point.time - previous.time <= 20 * 60_000 ? "L" : "M";
      return `${command}${x(point.time).toFixed(1)},${heartY(point.value).toFixed(1)}`;
    });
  const heartPath = heartPathPoints.join(" ");
  const hoverHeartAt = (event: MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds || !heart.length) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const nearest = heart.reduce((best, candidate) =>
      Math.abs(x(candidate.time) - pointerX) < Math.abs(x(best.time) - pointerX)
        ? candidate
        : best,
      heart[0]!,
    );
    setHoveredHeart(nearest);
  };
  const hoverX = hoveredHeart ? x(hoveredHeart.time) : 0;
  const hoverY = hoveredHeart ? heartY(hoveredHeart.value) : 0;
  const hoverBoxX = Math.max(LEFT, Math.min(WIDTH - RIGHT - 112, hoverX - 56));
  const hoverBoxY = Math.max(HEART_TOP + 3, hoverY - 44);

  const activitySegments = buildActivitySegments(rescueTime);
  const productivitySegments = buildProductivitySegments(rescueTime);
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
  const hasBedtimeInLogicalDay = bedtime !== null;
  const hasWakeInLogicalDay = wake !== null;
  const eventRecords = [...buildMetricEvents(metrics), ...sleepBoundaries.events];
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
  const todoistClusterItem = (cluster: TodoistCluster): RecordItem => ({
    start: cluster.events[0].start,
    end: cluster.events.at(-1)!.start,
    label: "Todoist",
    detail: cluster.events
      .map((item) => `${localLabel(item.start, timezone)} · ${item.detail}`)
      .join("\n"),
    color: cluster.color,
    kind: "todoist-cluster",
  });
  const tickEvery = 4 * 60 * 60_000;
  const ticks: number[] = [];
  for (
    let tick = Math.ceil(start / tickEvery) * tickEvery;
    tick < end;
    tick += tickEvery
  ) ticks.push(tick);
  const markers = new Map<string, number>();

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
        className="day-chart-scroll"
        onScroll={(event) => setChartScrollLeft(event.currentTarget.scrollLeft)}
        onMouseLeave={clearSelection}
        onMouseMove={(event) => {
          const target = event.target as Element;
          if (
            !target.closest(
              ".chart-step-hit-area, .chart-step-bar, .chart-duration-segment, .chart-event-dot, .chart-sleep-boundary, .welltory-measurement, .todoist-marker",
            )
          )
            clearSelection();
        }}
      >
        <svg
          className="day-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Пульс, продуктивность и события на общей временной шкале"
        >
          <defs>
            <clipPath id="day-chart-clip">
              <rect
                x={LEFT}
                y={HEART_TOP}
                width={plotWidth}
                height={HEART_BOTTOM - HEART_TOP}
              />
            </clipPath>
          </defs>
          {[
            HEART_TOP,
            HEART_TOP + (HEART_BOTTOM - HEART_TOP) / 2,
            HEART_BOTTOM,
          ].map((y) => (
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
          <text
            x="18"
            y={(HEART_TOP + HEART_BOTTOM) / 2}
            className="chart-lane-label"
          >
            ПУЛЬС
          </text>
          <text x="18" y={STEPS_TOP + 19} className="chart-lane-label">
            ШАГИ
          </text>
          <text x="18" y={WORKOUTS_TOP + 16} className="chart-lane-label">
            ТРЕНИРОВКИ
          </text>
          <text x="18" y={ACTIVITY_TOP + 15} className="chart-lane-label">
            АКТИВНОСТЬ
          </text>
          <text x="18" y={PRODUCTIVITY_TOP + 15} className="chart-lane-label">
            ПРОДУКТИВНОСТЬ
          </text>
          <text x="18" y={WELLTORY_TOP + 13} className="chart-lane-label">
            WELLTORY
          </text>
          <text
            x="18"
            y={WELLTORY_TOP + 28}
            className="chart-welltory-sub-label"
          >
            ↑ энергия · ↓ стресс
          </text>
          <text x="18" y={EVENT_TOP + 17} className="chart-lane-label">
            СОБЫТИЯ
          </text>
          <text x="18" y={TODOIST_TOP + 17} className="chart-lane-label">
            TODOIST
          </text>
          <text x="18" y={EMA_TOP + 17} className="chart-lane-label">
            EMA
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
          {hasBedtimeInLogicalDay && bedtime !== null && (
            <g
              className="chart-sleep-boundary"
              onMouseMove={(event) =>
                selectAtCursor(
                  {
                    start: bedtime,
                    end: 0,
                    label: "Сон",
                    detail: "Начало основной сессии сна",
                    color: EVENT_COLORS.sleep,
                    kind: "sleep",
                  },
                  event,
                )
              }
            >
              <line
                x1={x(bedtime)}
                x2={x(bedtime)}
                y1={HEART_TOP}
                y2={AXIS_Y}
              />
              <text x={x(bedtime) + 5} y={HEART_TOP + 12}>
                СОН · {localLabel(bedtime, timezone)}
              </text>
            </g>
          )}
          {hasWakeInLogicalDay && wake !== null && (
            <g
              className="chart-sleep-boundary"
              onMouseMove={(event) =>
                selectAtCursor(
                  {
                    start: wake,
                    end: 0,
                    label: "Подъём",
                    detail: "Окончание основной сессии сна",
                    color: EVENT_COLORS.sleep,
                    kind: "sleep",
                  },
                  event,
                )
              }
            >
              <line x1={x(wake)} x2={x(wake)} y1={HEART_TOP} y2={AXIS_Y} />
              <text x={x(wake) + 5} y={HEART_TOP + 12}>
                ПОДЪЁМ · {localLabel(wake, timezone)}
              </text>
            </g>
          )}

          <g className="heart-rate-series">
            <g clipPath="url(#day-chart-clip)">
              <path d={heartPath} className="heart-rate-path" />
            </g>
            {heart.length > 0 && (
              <rect
                x={LEFT}
                y={HEART_TOP}
                width={plotWidth}
                height={HEART_BOTTOM - HEART_TOP}
                className="heart-rate-hit-area"
                onMouseMove={hoverHeartAt}
                onMouseLeave={() => setHoveredHeart(null)}
                aria-label="Наведение на дорожку показывает ближайшее время и пульс"
              />
            )}
            {hoveredHeart && (
              <g className="heart-hover-popup" pointerEvents="none">
                <line
                  x1={hoverX}
                  x2={hoverX}
                  y1={HEART_TOP}
                  y2={HEART_BOTTOM}
                />
                <circle cx={hoverX} cy={hoverY} r="5" />
                <rect
                  x={hoverBoxX}
                  y={hoverBoxY}
                  width="112"
                  height="36"
                  rx="8"
                />
                <text x={hoverBoxX + 56} y={hoverBoxY + 14} textAnchor="middle">
                  {localLabel(hoveredHeart.time, timezone)}
                </text>
                <text
                  x={hoverBoxX + 56}
                  y={hoverBoxY + 29}
                  textAnchor="middle"
                  className="heart-hover-value"
                >
                  {Math.round(hoveredHeart.value)} уд/мин
                </text>
              </g>
            )}
          </g>

          {stepSeries
            .filter(
              (item) => item.time + 15 * 60_000 > start && item.time < end,
            )
            .map((item) => {
              const from = Math.max(start, item.time);
              const to = Math.min(end, item.time + 15 * 60_000);
              const height = Math.max(
                1.5,
                (item.value / maxStepCount) * (STEPS_BOTTOM - STEPS_TOP - 2),
              );
              const barX = x(from);
              const barWidth = Math.max(1, x(to) - barX - 1);
              const stepCount = Math.round(item.value).toLocaleString("ru-RU");
              const stepItem: RecordItem = {
                start: item.time,
                end: item.time + 15 * 60_000,
                label: "Шаги",
                detail: `${stepCount} шагов`,
                color: "#33836b",
                kind: "steps",
              };
              return (
                <g key={`steps-${item.time}`}>
                  <rect
                    x={barX}
                    y={STEPS_TOP}
                    width={barWidth}
                    height={STEPS_BOTTOM - STEPS_TOP}
                    className="chart-step-hit-area"
                    onMouseEnter={(event) => selectAtCursor(stepItem, event)}
                    onMouseMove={(event) => selectAtCursor(stepItem, event)}
                  />
                  <rect
                    x={barX}
                    y={STEPS_BOTTOM - height}
                    width={barWidth}
                    height={height}
                    rx="2"
                    className="chart-step-bar"
                    onMouseEnter={(event) => selectAtCursor(stepItem, event)}
                    onMouseMove={(event) => selectAtCursor(stepItem, event)}
                  />
                </g>
              );
            })}

          {visibleWorkoutSegments.map((item) => {
            const from = Math.max(start, item.start);
            const to = Math.min(end, item.end);
            return (
              <rect
                key={`workout-${item.start}:${item.end}:${item.label}`}
                x={x(from)}
                y={WORKOUTS_TOP + 2}
                width={Math.max(4, x(to) - x(from))}
                height="18"
                rx="3"
                fill={item.color}
                className="chart-duration-segment chart-workout-segment"
                onClick={(event) => selectAtCursor(item, event)}
                onMouseEnter={(event) => selectAtCursor(item, event)}
                onMouseMove={(event) => selectAtCursor(item, event)}
              />
            );
          })}

          {activitySegments
            .filter((item) => item.end > start && item.start < end)
            .map((item, index) => (
              <rect
                key={`activity-${item.start}:${item.end}:${item.label}`}
                x={x(Math.max(start, item.start))}
                y={ACTIVITY_TOP + 2}
                width={Math.max(
                  1,
                  x(Math.min(end, item.end)) - x(Math.max(start, item.start)),
                )}
                height="22"
                rx="3"
                fill={item.color}
                className="chart-duration-segment"
                onClick={(event) => selectAtCursor(item, event)}
                onMouseEnter={(event) => selectAtCursor(item, event)}
                onMouseMove={(event) => selectAtCursor(item, event)}
              />
            ))}
          {productivitySegments
            .filter((item) => item.end > start && item.start < end)
            .map((item, index) => {
              const lane = Math.max(0, Math.min(4, 2 - Number(item.label)));
              const from = Math.max(start, item.start);
              const to = Math.min(end, item.end);
              return (
                <rect
                  key={`productivity-${item.start}:${item.end}:${item.label}`}
                  x={x(from)}
                  y={PRODUCTIVITY_TOP + lane * 8}
                  width={Math.max(1, x(to) - x(from))}
                  height="7"
                  rx="2"
                  fill={item.color}
                  className="chart-duration-segment"
                  onClick={(event) => selectAtCursor(item, event)}
                  onMouseEnter={(event) => selectAtCursor(item, event)}
                  onMouseMove={(event) => selectAtCursor(item, event)}
                />
              );
            })}
          <WelltoryTrack
            measurements={welltoryMeasurements}
            xScale={x}
            centerY={WELLTORY_CENTER}
            timezone={timezone}
            onSelect={selectAtCursor}
          />
          {visibleEvents.map((item, index) => {
            const markerKey = `${item.start}:${item.kind}`;
            const stack = markers.get(markerKey) ?? 0;
            markers.set(markerKey, stack + 1);
            const cy = EVENT_TOP + 9 + (stack % 3) * 13;
            return (
              <circle
                key={`event-${item.start}:${item.kind}:${item.label}:${item.detail}`}
                cx={x(item.start)}
                cy={cy}
                r="4.5"
                fill={item.color}
                className="chart-event-dot"
                onClick={(event) => selectAtCursor(item, event)}
                onMouseEnter={(event) => selectAtCursor(item, event)}
                onMouseMove={(event) => selectAtCursor(item, event)}
              />
            );
          })}
          {todoistClusters.map((cluster, index) => {
            const description = cluster.events
              .map(
                (item) =>
                  `${localLabel(item.start, timezone)} · ${item.detail}`,
              )
              .join("\n");
            const badge =
              cluster.events.length > 99
                ? "99+"
                : String(cluster.events.length);
            return (
              <foreignObject
                key={`todoist-cluster-${cluster.timestamp}`}
                x={todoistIconPositions[index] - 19}
                y={TODOIST_TOP - 7}
                width="38"
                height="38"
              >
                <button
                  type="button"
                  className="todoist-marker"
                  aria-label={description}
                  onClick={(event) =>
                    selectAtCursor(todoistClusterItem(cluster), event)
                  }
                  onMouseEnter={(event) =>
                    selectAtCursor(todoistClusterItem(cluster), event)
                  }
                  onMouseMove={(event) =>
                    selectAtCursor(todoistClusterItem(cluster), event)
                  }
                >
                  <ListTodo
                    size={24}
                    color={cluster.color}
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  {cluster.events.length > 1 && (
                    <span
                      className="todoist-count-badge"
                      style={{ backgroundColor: cluster.color }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              </foreignObject>
            );
          })}
          {visibleEmaEvents.map((item, index) => (
            <circle
              key={`ema-${item.start}:${item.kind}:${item.label}`}
              cx={x(item.start)}
              cy={EMA_TOP + 9 + (index % 3) * 12}
              r="5"
              fill={item.color}
              className="chart-event-dot"
              onClick={(event) => selectAtCursor(item, event)}
              onMouseEnter={(event) => selectAtCursor(item, event)}
              onMouseMove={(event) => selectAtCursor(item, event)}
            />
          ))}
          <g ref={timeAxisRef} className="chart-time-axis">
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
                y={AXIS_Y + 20}
                textAnchor="middle"
                className="chart-tick"
              >
                {localLabel(tick, timezone)}
              </text>
            ))}
          </g>
        </svg>
      </div>
      {!axisVisible && (
        <div className="chart-axis-sticky" aria-hidden="true">
          <svg
            viewBox={`0 ${AXIS_Y - 10} ${WIDTH} 50`}
            style={{ transform: `translateX(-${chartScrollLeft}px)` }}
          >
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
                y={AXIS_Y + 20}
                textAnchor="middle"
                className="chart-tick"
              >
                {localLabel(tick, timezone)}
              </text>
            ))}
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
      {!heart.length &&
        !stepSeries.length &&
        !workoutSegments.length &&
        !activity.length &&
        !productivity.length &&
        !welltoryMeasurements.length &&
        !visibleEvents.length &&
        !visibleTodoistEvents.length &&
        !visibleEmaEvents.length && (
          <p className="muted">Для этой даты нет точек графика.</p>
        )}
    </section>
  );
}

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
  timezone: string;
  onSelect: (item: RecordItem, event: MouseEvent<Element>) => void;
}>;

function WelltoryTrack({
  measurements,
  xScale,
  centerY,
  timezone,
  onSelect,
}: WelltoryTrackProps) {
  const maxHeight = 42;
  const barWidth = 12;
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
        const energy = Math.max(0, Math.min(100, measurement.energy ?? 0));
        const stress = Math.max(0, Math.min(100, measurement.stress ?? 0));
        const energyHeight = (maxHeight * energy) / 100;
        const stressHeight = (maxHeight * stress) / 100;
        const crowded = measurements.some(
          (other, otherIndex) =>
            otherIndex !== index && Math.abs(xScale(other.timestamp) - x) < 30,
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
              x={x - 10}
              y={centerY - maxHeight - 18}
              width="20"
              height={2 * maxHeight + 36}
              className="welltory-hit-area"
            />
            <text
              x={x}
              y={centerY - maxHeight - 5}
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
              rx="2"
              className="welltory-energy-outline"
            />
            {energyHeight > 0 && (
              <rect
                x={x - barWidth / 2 + 2}
                y={centerY - energyHeight}
                width={barWidth - 4}
                height={Math.max(0, energyHeight - 2)}
                rx="1"
                className="welltory-energy-fill"
              />
            )}
            <rect
              x={x - 3}
              y={centerY - maxHeight - 3}
              width="6"
              height="3"
              className="welltory-energy-terminal"
            />
            <rect
              x={x - barWidth / 2}
              y={centerY}
              width={barWidth}
              height={maxHeight}
              rx="2"
              className="welltory-stress-outline"
            />
            {stressHeight > 0 && (
              <rect
                x={x - barWidth / 2 + 2}
                y={centerY + 1}
                width={barWidth - 4}
                height={Math.max(0, stressHeight - 2)}
                rx="1"
                className="welltory-stress-fill"
              />
            )}
            <text
              x={x}
              y={centerY + maxHeight + 13}
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
