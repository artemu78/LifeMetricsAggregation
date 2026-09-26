import { PRODUCTIVITY_MARKER_GRADIENT } from "../shared/chartConfig";
import { Footprints, ListTodo, MonitorSmartphone, Moon } from "lucide-react";
import { Link } from "react-router";
import {
  buildRescueTimeOverview,
  formatSleepDuration,
  formatTrackedDuration,
  isSourceAvailable,
  productivityIndexColor,
} from "../dayDetail";
import type { DashboardDay } from "../store";
import { QUALITY, SOURCE_ICONS, WEEKDAYS } from "./dashboardConfig";

export function CalendarCell({ day }: { day: DashboardDay }) {
  const date = new Date(`${day.date}T12:00:00Z`);
  const rescueOverview = buildRescueTimeOverview(day.detail.rescueTime);
  const trackedDuration = formatTrackedDuration(
    rescueOverview.totalTrackedSeconds,
  );
  const productivityIndex = rescueOverview.productivityIndex;
  const rescueTimeLabel =
    rescueOverview.totalTrackedSeconds > 0
      ? ` Отслежено ${trackedDuration}. Индекс продуктивности: ${productivityIndex ?? "нет данных"}.`
      : "";
  return (
    <Link
      className={`day-card quality-${day.quality}`}
      to={`/day/${day.date}`}
      aria-label={`${day.date}. ${QUALITY[day.quality]}.${rescueTimeLabel}`}
    >
      <div className="date-row">
        <strong>{date.getUTCDate()}</strong>
        <span>{WEEKDAYS[day.weekday - 1]}</span>
      </div>
      <CalendarMetrics
        day={day}
        trackedDuration={trackedDuration}
        hasTrackedTime={rescueOverview.totalTrackedSeconds > 0}
      />
      {rescueOverview.totalTrackedSeconds > 0 ? (
        <ProductivityMarker index={productivityIndex} />
      ) : null}
      <SourceIndicators day={day} />
    </Link>
  );
}

function SourceIndicators({ day }: { day: DashboardDay }) {
  return (
    <div className="indicators" aria-label="Источники">
      {SOURCE_ICONS.map(({ key, name, Icon }) => {
        const available = isSourceAvailable(day, key);
        return (
          <span
            key={key}
            className={available ? "on" : ""}
            title={name}
            aria-label={`${name}: ${available ? "данные доступны" : "нет данных"}`}
          >
            <Icon aria-hidden="true" />
          </span>
        );
      })}
    </div>
  );
}

function CalendarMetrics({
  day,
  trackedDuration,
  hasTrackedTime,
}: {
  day: DashboardDay;
  trackedDuration: string;
  hasTrackedTime: boolean;
}) {
  return (
    <div className="numbers">
      <div>
        <span className="numbers-label">
          <Moon aria-hidden="true" />
          Сон
        </span>
      </div>
      <b>{formatSleepDuration(day.bracelet.sleepSeconds)}</b>
      <div>
        <span className="numbers-label">
          <Footprints aria-hidden="true" />
          Шаги
        </span>
      </div>
      <b>{day.bracelet.steps?.toLocaleString("ru-RU") ?? "—"}</b>
      <div>
        <span className="numbers-label">
          <ListTodo aria-hidden="true" width={24} height={24} />
          Задачи <br />
          (созд. / закр. / удал.)
        </span>
      </div>
      <div
        title={`Создано: ${day.todoist.created}, Закрыто: ${day.todoist.completed}, Удалено: ${day.todoist.deleted}`}
      >
        <b>
          {day.todoist.created} / {day.todoist.completed} /{" "}
          {day.todoist.deleted}
        </b>
      </div>
      {hasTrackedTime && (
        <>
          <div>
            <span className="numbers-label">
              <MonitorSmartphone aria-hidden="true" />
              Экранное время
            </span>
          </div>
          <div>
            <b>{trackedDuration}</b>
          </div>
        </>
      )}
    </div>
  );
}

function ProductivityMarker({ index }: { index: number | null }) {
  const color = index == null ? undefined : productivityIndexColor(index);
  return (
    <div className="calendar-rescuetime" aria-hidden="true">
      <div className="numbers-label">Продуктивность</div>
      <div className="calendar-productivity-scale">
        {index != null && (
          <b
            className="calendar-productivity-marker"
            style={{
              left: `${index}%`,
              background: `radial-gradient(circle, white ${PRODUCTIVITY_MARKER_GRADIENT.centerPercent}%, ${color} ${PRODUCTIVITY_MARKER_GRADIENT.edgePercent}%)`,
            }}
          >
            {index}
          </b>
        )}
      </div>
    </div>
  );
}
