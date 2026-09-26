import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { buildRescueTimeOverview, PRODUCTIVITY_LABELS } from "../dayDetail";
import {
  ACTIVITY_COLORS,
  ACTIVITY_RANK_LIMIT,
  DETAIL_CHART_HEIGHT,
  FALLBACK_ACTIVITY_COLOR,
  PRODUCTIVITY_COLORS,
  PRODUCTIVITY_INNER_RADIUS,
  PRODUCTIVITY_OUTER_RADIUS,
} from "../shared/chartConfig";
import { formatDuration } from "../shared/formatDuration";
import { RecordTime } from "../shared/RecordTime";
import type { DashboardDay } from "../store";

export function RescueTimePanel({
  day,
  timezone,
}: Readonly<{
  day: DashboardDay;
  timezone: string;
}>) {
  const rescueOverview = buildRescueTimeOverview(day.detail.rescueTime);
  const rescueIntervals = [...rescueOverview.activityRecords].sort(
    (left, right) => left.timestamp.localeCompare(right.timestamp),
  );
  return (
    <section className="panel rescuetime-panel">
      <div className="panel-heading">
        <div>
          <h3>RescueTime</h3>
          <p className="muted">Обзор отслеженного времени</p>
        </div>
        <div className="tracked-total">
          <span>Всего отслежено</span>
          <strong>{formatDuration(rescueOverview.totalTrackedSeconds)}</strong>
        </div>
      </div>

      {rescueOverview.totalTrackedSeconds > 0 ? (
        <div className="rescuetime-overview">
          <ProductivitySummary rescueOverview={rescueOverview} />

          <ActivityRanking rescueOverview={rescueOverview} />
        </div>
      ) : (
        <p className="muted">Нет отслеженного времени</p>
      )}

      {rescueIntervals.length > 0 && (
        <ActivityIntervals
          rescueIntervals={rescueIntervals}
          timezone={timezone}
        />
      )}
      <p className="note">
        Активность и продуктивность — разные классификации одного времени и не
        складываются.
      </p>
    </section>
  );
}

type RescueOverview = ReturnType<typeof buildRescueTimeOverview>;

function ProductivitySummary({
  rescueOverview,
}: Readonly<{
  rescueOverview: RescueOverview;
}>) {
  return (
    <div className="productivity-summary">
      <h4>Индекс продуктивности</h4>
      {rescueOverview.productivityIndex == null ? (
        <p className="muted">Нет данных продуктивности</p>
      ) : (
        <>
          <div
            className="productivity-chart"
            role="img"
            aria-label={`Индекс продуктивности: ${rescueOverview.productivityIndex} из 100`}
          >
            <ResponsiveContainer width="100%" height={DETAIL_CHART_HEIGHT}>
              <PieChart>
                <Pie
                  data={rescueOverview.productivity}
                  dataKey="seconds"
                  nameKey="name"
                  innerRadius={PRODUCTIVITY_INNER_RADIUS}
                  outerRadius={PRODUCTIVITY_OUTER_RADIUS}
                  stroke="none"
                >
                  {rescueOverview.productivity.map((level) => (
                    <Cell
                      key={level.label}
                      fill={
                        PRODUCTIVITY_COLORS[level.label] ??
                        FALLBACK_ACTIVITY_COLOR
                      }
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatDuration(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="productivity-chart-value">
              <strong>{rescueOverview.productivityIndex}</strong>
              <span>из 100</span>
            </div>
          </div>
          <ul className="productivity-legend">
            {rescueOverview.productivity.map((level) => (
              <li key={level.label}>
                <i
                  style={{
                    background:
                      PRODUCTIVITY_COLORS[level.label] ??
                      FALLBACK_ACTIVITY_COLOR,
                  }}
                />
                <span>{PRODUCTIVITY_LABELS[level.label] ?? level.name}</span>
                <b>{formatDuration(level.seconds)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="note">Локальный расчёт по уровням RescueTime от −2 до 2.</p>
    </div>
  );
}

function ActivityRanking({
  rescueOverview,
}: Readonly<{
  rescueOverview: RescueOverview;
}>) {
  return (
    <div className="activity-ranking">
      <h4>Основные активности</h4>
      {rescueOverview.categories
        .slice(0, ACTIVITY_RANK_LIMIT)
        .map((category, index) => (
          <div className="activity-rank" key={category.label}>
            <div>
              <span>
                <b>{Math.round(category.percentage)}%</b> {category.label}
              </span>
              <time>{formatDuration(category.seconds)}</time>
            </div>
            <i aria-hidden="true">
              <span
                style={{
                  width: `${category.percentage}%`,
                  background: ACTIVITY_COLORS[index % ACTIVITY_COLORS.length],
                }}
              />
            </i>
          </div>
        ))}
    </div>
  );
}

function ActivityIntervals({
  rescueIntervals,
  timezone,
}: Readonly<{
  rescueIntervals: RescueOverview["activityRecords"];
  timezone: string;
}>) {
  return (
    <div className="rescuetime-intervals">
      <h4>Интервалы активности</h4>
      <ul className="record-list scrollable-records">
        {rescueIntervals.map((item) => (
          <li key={`${item.timestamp}-${item.perspective}-${item.label}`}>
            <RecordTime timestamp={item.timestamp} timezone={timezone} />
            <span>{item.label}</span>
            <b>{formatDuration(item.seconds)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
