import { RecordTime } from "../shared/RecordTime";
import type { DashboardDay } from "../store";

export function WelltoryPanel({
  day,
  timezone,
}: Readonly<{
  day: DashboardDay;
  timezone: string;
}>) {
  return (
    <section className="panel welltory-panel">
      <h3>Welltory</h3>
      <div className="measurement-grid">
        {day.detail.welltoryMetrics.map((point) => (
          <div key={`${point.timestamp}-${point.metric}`}>
            <span>
              <RecordTime timestamp={point.timestamp} timezone={timezone} />
              {point.metric.replace("welltory.", "")}
            </span>
            <b>
              {point.value == null
                ? (point.valueText ?? "—")
                : point.value.toFixed(1)}{" "}
              {point.unit ?? ""}
            </b>
          </div>
        ))}
        {!day.detail.welltoryMetrics.length && (
          <p className="muted">Нет измерений</p>
        )}
      </div>
    </section>
  );
}
