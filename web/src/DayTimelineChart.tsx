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

const WIDTH = 1240;
const HEIGHT = 760;
const LEFT = 128;
const RIGHT = 26;
const HEART_TOP = 36;
const HEART_BOTTOM = 264;
const STEPS_TOP = 276;
const STEPS_BOTTOM = 306;
const ACTIVITY_TOP = 322;
const PRODUCTIVITY_TOP = 384;
const WELLTORY_TOP = 444;
const WELLTORY_CENTER = 496;
const EVENT_TOP = 562;
const TODOIST_TOP = 610;
const EMA_TOP = 658;
const AXIS_Y = 710;
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
  "ema-answered": "#35876b",
  "ema-pending": "#c39439",
  "ema-dismissed": "#b45c54",
  "ema-expired": "#87948e",
};

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
  for (let index = 0; index < label.length; index += 1)
    hash = (hash * 31 + label.charCodeAt(index)) | 0;
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
  return `${point.metric.replace(/^(welltory|fitness_drive)\./, "").replaceAll("_", " ")}${value ? ` · ${value} ${point.unit ?? ""}` : ""}`.trim();
}

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
}: {
  day: Day;
  timezone: string;
  nextDaySleepMetrics?: Day["detail"]["braceletMetrics"];
}) {
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
  const heart = day.detail.braceletMetrics
    .filter(
      (point) =>
        point.metric === "fitness_drive.heart_rate" && point.value != null,
    )
    .map((point) => ({
      time: Date.parse(point.timestamp),
      value: point.value as number,
    }))
    .sort((a, b) => a.time - b.time);
  const stepBuckets = new Map<number, number>();
  for (const point of day.detail.braceletMetrics) {
    if (
      point.metric !== "fitness_drive.steps" ||
      point.value == null ||
      point.value <= 0
    )
      continue;
    const time = Date.parse(point.timestamp);
    const bucket = Math.floor(time / (15 * 60_000)) * 15 * 60_000;
    stepBuckets.set(bucket, (stepBuckets.get(bucket) ?? 0) + point.value);
  }
  const stepSeries = [...stepBuckets]
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time - b.time);
  const maxStepCount = Math.max(1, ...stepSeries.map((item) => item.value));
  const logicalStart = zonedTimestamp(day.date, 5, timezone);
  const logicalEnd = zonedTimestamp(day.date, 29, timezone);
  const wakeSleep = day.detail.braceletMetrics.filter((point) =>
    point.metric.startsWith("fitness_drive.sleep."),
  );
  const bedtimeSleep = nextDaySleepMetrics.filter((point) =>
    point.metric.startsWith("fitness_drive.sleep."),
  );
  const bedtime = bedtimeSleep.length
    ? Math.min(...bedtimeSleep.map((point) => Date.parse(point.timestamp)))
    : null;
  const wake = wakeSleep.length
    ? Math.max(
        ...wakeSleep.map(
          (point) => Date.parse(point.timestamp) + (point.value ?? 0) * 1000,
        ),
      )
    : null;
  const hasBedtimeInLogicalDay =
    bedtime !== null && bedtime >= logicalStart && bedtime < logicalEnd;
  const hasWakeInLogicalDay =
    wake !== null && wake >= logicalStart && wake < logicalEnd;
  const start = logicalStart;
  const end = logicalEnd;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const x = (time: number) =>
    LEFT + ((time - start) / (end - start)) * plotWidth;
  const heartValues = heart.map((item) => item.value).sort((a, b) => a - b);
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
  let heartPath = "";
  let previous = 0;
  for (const point of heart) {
    const next = `${previous && point.time - previous <= 20 * 60_000 ? "L" : "M"}${x(point.time).toFixed(1)},${heartY(point.value).toFixed(1)}`;
    heartPath += `${next} `;
    previous = point.time;
  }
  const hoverHeartAt = (event: MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds || !heart.length) return;
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    let nearest = heart[0];
    let nearestDistance = Math.abs(x(nearest.time) - pointerX);
    for (let index = 1; index < heart.length; index += 1) {
      const distance = Math.abs(x(heart[index].time) - pointerX);
      if (distance < nearestDistance) {
        nearest = heart[index];
        nearestDistance = distance;
      }
    }
    setHoveredHeart(nearest);
  };
  const hoverX = hoveredHeart ? x(hoveredHeart.time) : 0;
  const hoverY = hoveredHeart ? heartY(hoveredHeart.value) : 0;
  const hoverBoxX = Math.max(LEFT, Math.min(WIDTH - RIGHT - 112, hoverX - 56));
  const hoverBoxY = Math.max(HEART_TOP + 3, hoverY - 44);

  const activity = day.detail.rescueTime.filter(
    (item) => item.perspective === "activity",
  );
  const productivity = day.detail.rescueTime.filter(
    (item) => item.perspective === "productivity",
  );
  const activitySegments: RecordItem[] = [];
  const activityBuckets = new Map<number, typeof activity>();
  for (const item of activity) {
    const time = Date.parse(item.timestamp);
    const bucket = activityBuckets.get(time) ?? [];
    bucket.push(item);
    activityBuckets.set(time, bucket);
  }
  for (const [time, bucket] of activityBuckets) {
    let offset = 0;
    for (const item of bucket) {
      const from = time + offset * 1000;
      const to = from + item.seconds * 1000;
      activitySegments.push({
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
  const productivitySegments: RecordItem[] = productivity.map((item) => ({
    start: Date.parse(item.timestamp),
    end: Date.parse(item.timestamp) + item.seconds * 1000,
    label: item.label,
    detail: `Продуктивность · ${PRODUCTIVITY_NAMES[item.label] ?? item.label}`,
    color: PRODUCTIVITY_COLORS[item.label] ?? "#789087",
    kind: "productivity",
  }));

  const welltoryByTime = new Map<
    string,
    { timestamp: number; energy?: number; stress?: number; details: string[] }
  >();
  for (const point of day.detail.welltoryMetrics) {
    const timestamp = Date.parse(point.timestamp);
    const measurement = welltoryByTime.get(point.timestamp) ?? {
      timestamp,
      details: [],
    };
    const normalizedMetric = point.metric.toLowerCase();
    if (normalizedMetric.endsWith(".energy(hrv)") && point.value != null)
      measurement.energy = point.value;
    else if (normalizedMetric.endsWith(".stress(hrv)") && point.value != null)
      measurement.stress = point.value;
    measurement.details.push(metricText(point));
    welltoryByTime.set(point.timestamp, measurement);
  }
  const welltoryMeasurements = [...welltoryByTime.values()]
    .filter(
      (measurement) =>
        measurement.timestamp >= start &&
        measurement.timestamp <= end &&
        (measurement.energy != null || measurement.stress != null),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const todoistRecords: RecordItem[] = [];
  for (const task of day.detail.createdTasks)
    todoistRecords.push({
      start: Date.parse(task.timestamp),
      end: 0,
      label: task.content,
      detail: `Задача создана · ${task.content}`,
      color: EVENT_COLORS["todo-created"],
      kind: "todo-created",
    });
  for (const task of day.detail.completedTasks)
    todoistRecords.push({
      start: Date.parse(task.timestamp),
      end: 0,
      label: task.content,
      detail: `Задача закрыта · ${task.content}`,
      color: EVENT_COLORS["todo-completed"],
      kind: "todo-completed",
    });
  for (const task of day.detail.deletedTasks)
    todoistRecords.push({
      start: Date.parse(task.timestamp),
      end: 0,
      label: task.content,
      detail: `Задача удалена · ${task.content}`,
      color: EVENT_COLORS["todo-deleted"],
      kind: "todo-deleted",
    });
  const emaRecords: RecordItem[] = day.detail.emaEvents.map((event) => ({
    start: Date.parse(event.timestamp),
    end: 0,
    label: event.status,
    detail: `EMA · ${{ pending: "ожидание ответа", answered: "ответ отправлен", dismissed: "отклонено", expired: "время ответа истекло" }[event.status]}`,
    color: EVENT_COLORS[`ema-${event.status}`],
    kind: `ema-${event.status}`,
  }));
  const eventRecords: RecordItem[] = [];
  for (const point of day.detail.braceletMetrics) {
    if (
      point.metric === "fitness_drive.heart_rate" ||
      point.metric === "fitness_drive.steps" ||
      point.metric === "fitness_drive.exercise" ||
      point.metric.startsWith("fitness_drive.sleep.")
    )
      continue;
    eventRecords.push({
      start: Date.parse(point.timestamp),
      end: 0,
      label: point.metric,
      detail: metricText(point),
      color: EVENT_COLORS.metric,
      kind: "metric",
    });
  }
  if (hasBedtimeInLogicalDay && bedtime !== null)
    eventRecords.push({
      start: bedtime,
      end: 0,
      label: "Сон",
      detail: "Начало основной сессии сна",
      color: EVENT_COLORS.sleep,
      kind: "sleep",
    });
  if (hasWakeInLogicalDay && wake !== null)
    eventRecords.push({
      start: wake,
      end: 0,
      label: "Подъём",
      detail: "Окончание основной сессии сна",
      color: EVENT_COLORS.sleep,
      kind: "sleep",
    });
  const visibleEvents = eventRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const visibleTodoistEvents = todoistRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const visibleEmaEvents = emaRecords.filter(
    (item) => item.start >= start && item.start <= end,
  );
  const todoistClusters: TodoistCluster[] = [];
  for (const event of visibleTodoistEvents.sort((a, b) => a.start - b.start)) {
    const currentCluster = todoistClusters.at(-1);
    if (
      !currentCluster ||
      event.start - currentCluster.events[0].start > 10 * 60_000
    ) {
      todoistClusters.push({
        timestamp: event.start,
        events: [event],
        color: event.color,
      });
      continue;
    }
    currentCluster.events.push(event);
    currentCluster.timestamp =
      (currentCluster.events[0].start + event.start) / 2;
    if (
      currentCluster.events.some((item) => item.color !== currentCluster.color)
    ) {
      currentCluster.color = "#536b60";
    }
  }
  const todoistIconPositions = todoistClusters.map((cluster) =>
    x(cluster.timestamp),
  );
  const todoistIconGap = Math.min(
    40,
    (WIDTH - RIGHT - LEFT - 38) / Math.max(1, todoistIconPositions.length - 1),
  );
  for (let index = 0; index < todoistIconPositions.length; index += 1) {
    todoistIconPositions[index] = Math.max(
      LEFT + 19,
      todoistIconPositions[index],
    );
    if (index > 0)
      todoistIconPositions[index] = Math.max(
        todoistIconPositions[index],
        todoistIconPositions[index - 1] + todoistIconGap,
      );
  }
  const todoistOverflow = Math.max(
    0,
    (todoistIconPositions.at(-1) ?? 0) - (WIDTH - RIGHT - 19),
  );
  if (todoistOverflow) {
    for (let index = 0; index < todoistIconPositions.length; index += 1)
      todoistIconPositions[index] -= todoistOverflow;
  }
  const todoistClusterItem = (cluster: TodoistCluster): RecordItem => ({
    start: cluster.events[0].start,
    end: cluster.events.at(-1)?.start ?? cluster.events[0].start,
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
  )
    ticks.push(tick);
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

          {activitySegments
            .filter((item) => item.end > start && item.start < end)
            .map((item, index) => (
              <rect
                key={`activity-${index}`}
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
                  key={`productivity-${index}`}
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
                key={`event-${index}`}
                cx={x(item.start)}
                cy={cy}
                r={item.kind === "welltory" ? 5 : 4.5}
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
                key={`todoist-cluster-${index}`}
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
              key={`ema-${index}`}
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

type WelltoryMeasurement = {
  timestamp: number;
  energy?: number;
  stress?: number;
  details: string[];
};

function WelltoryTrack({
  measurements,
  xScale,
  centerY,
  timezone,
  onSelect,
}: {
  measurements: WelltoryMeasurement[];
  xScale: (time: number) => number;
  centerY: number;
  timezone: string;
  onSelect: (item: RecordItem, event: MouseEvent<Element>) => void;
}) {
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
