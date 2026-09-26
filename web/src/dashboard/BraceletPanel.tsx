import { formatSleepDuration } from "../dayDetail";
import { SleepStagesChart } from "../sleep/SleepStagesChart";
import type { DashboardDay } from "../store";

export function BraceletPanel({
  day,
  timezone,
}: Readonly<{
  day: DashboardDay;
  timezone: string;
}>) {
  const sleep = day.detail.braceletMetrics.filter((point) =>
    point.metric.startsWith("fitness_drive.sleep."),
  );
  return (
    <section className="panel bracelet-panel">
      <h3>Браслет</h3>
      <div className="metric-list">
        <p>
          <span>Сон</span>
          <b>{formatSleepDuration(day.bracelet.sleepSeconds)}</b>
        </p>
        <p>
          <span>Шаги</span>
          <b>{day.bracelet.steps?.toLocaleString("ru-RU") ?? "—"}</b>
        </p>
      </div>
      <SleepStagesChart sleepMetrics={sleep} timezone={timezone} />
    </section>
  );
}
