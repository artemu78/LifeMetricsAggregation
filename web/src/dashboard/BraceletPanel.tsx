import { t, locale } from "../i18n";
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
      <h3>{t("Браслет")}</h3>
      <div className="metric-list">
        <p>
          <span>{t("Сон")}</span>
          <b>{formatSleepDuration(day.bracelet.sleepSeconds)}</b>
        </p>
        <p>
          <span>{t("Шаги")}</span>
          <b>{day.bracelet.steps?.toLocaleString(locale) ?? "—"}</b>
        </p>
      </div>
      <SleepStagesChart sleepMetrics={sleep} timezone={timezone} />
    </section>
  );
}
