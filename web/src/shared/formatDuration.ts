import { t } from "../i18n";
import { MINUTES_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants";

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (minutes < 1) return t("< 1 мин");
  const wholeHours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainingMinutes = minutes % MINUTES_PER_HOUR;
  if (!wholeHours) return t("{0} мин", remainingMinutes);
  return remainingMinutes
    ? t("{0} ч {1} мин", wholeHours, remainingMinutes)
    : t("{0} ч", wholeHours);
}
