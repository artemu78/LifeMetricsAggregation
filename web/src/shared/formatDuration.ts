import { MINUTES_PER_HOUR, SECONDS_PER_MINUTE } from "./timeConstants";

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (minutes < 1) return "< 1 мин";
  const wholeHours = Math.floor(minutes / MINUTES_PER_HOUR);
  const remainingMinutes = minutes % MINUTES_PER_HOUR;
  if (!wholeHours) return `${remainingMinutes} мин`;
  return remainingMinutes
    ? `${wholeHours} ч ${remainingMinutes} мин`
    : `${wholeHours} ч`;
}
