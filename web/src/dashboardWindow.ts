const MIN_DASHBOARD_DAYS = 28

function isoDateInMoscow(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function shiftIsoDate(date: string, offsetDays: number): string {
  const shifted = new Date(`${date}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  return shifted.toISOString().slice(0, 10)
}

export function defaultDashboardWindow(now = new Date()): { from: string; to: string } {
  const to = isoDateInMoscow(now)
  const earliestAllowedStart = shiftIsoDate(to, -(MIN_DASHBOARD_DAYS - 1))
  const weekday = new Date(`${earliestAllowedStart}T12:00:00Z`).getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7

  return {
    from: shiftIsoDate(earliestAllowedStart, -daysSinceMonday),
    to,
  }
}

export function inclusiveDateCount(from: string, to: string): number {
  const milliseconds = Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)
  return Math.round(milliseconds / 86_400_000) + 1
}
