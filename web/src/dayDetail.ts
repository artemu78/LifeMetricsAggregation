export type RescueTimeRecord = {
  timestamp: string
  perspective: 'activity' | 'productivity'
  label: string
  seconds: number
}

const PRODUCTIVITY_WEIGHTS: Record<string, number> = {
  '-2': -2,
  '-1': -1,
  '0': 0,
  '1': 1,
  '2': 2,
}

export const PRODUCTIVITY_LABELS: Record<string, string> = {
  '-2': 'Отвлекающее',
  '-1': 'Личное',
  '0': 'Нейтральное',
  '1': 'Другая работа',
  '2': 'Сосредоточенная работа',
}

export function formatRecordTime(timestamp: string, timezone: string): string {
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })
}

export function formatSleepDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function groupedSeconds(records: RescueTimeRecord[]) {
  const grouped = new Map<string, number>()
  for (const record of records) {
    grouped.set(record.label, (grouped.get(record.label) ?? 0) + record.seconds)
  }
  return [...grouped].map(([label, seconds]) => ({ label, seconds }))
}

export function buildRescueTimeOverview(records: RescueTimeRecord[]) {
  const activityRecords = records.filter((record) => record.perspective === 'activity')
  const productivityRecords = records.filter((record) => record.perspective === 'productivity')
  const totalTrackedSeconds = activityRecords.reduce((total, record) => total + record.seconds, 0)
  const productivitySeconds = productivityRecords.reduce((total, record) => total + record.seconds, 0)
  const weightedProductivity = productivityRecords.reduce(
    (total, record) => total + (PRODUCTIVITY_WEIGHTS[record.label] ?? 0) * record.seconds,
    0,
  )
  const productivityIndex = productivitySeconds
    ? Math.round(((weightedProductivity / productivitySeconds) + 2) / 4 * 100)
    : null

  return {
    activityRecords,
    totalTrackedSeconds,
    productivityIndex,
    categories: groupedSeconds(activityRecords)
      .map((category) => ({
        ...category,
        percentage: totalTrackedSeconds ? category.seconds / totalTrackedSeconds * 100 : 0,
      }))
      .sort((left, right) => right.seconds - left.seconds),
    productivity: groupedSeconds(productivityRecords)
      .map((level) => ({
        ...level,
        weight: PRODUCTIVITY_WEIGHTS[level.label] ?? 0,
        name: PRODUCTIVITY_LABELS[level.label] ?? level.label,
      }))
      .sort((left, right) => right.weight - left.weight),
  }
}

export type SourceIndicatorDay = {
  bracelet: { sleepSeconds: number | null; steps: number | null }
  welltory: { available: boolean }
  todoist: { created: number; completed: number }
  rescuetime: { available: boolean }
  detail?: {
    braceletMetrics?: unknown[]
    welltoryMetrics?: unknown[]
    createdTasks?: unknown[]
    completedTasks?: unknown[]
    rescueTime?: unknown[]
  }
}

export function isSourceAvailable(
  day: SourceIndicatorDay,
  source: 'bracelet' | 'welltory' | 'todoist' | 'rescuetime',
): boolean {
  switch (source) {
    case 'bracelet':
      return (
        day.bracelet.sleepSeconds != null ||
        day.bracelet.steps != null ||
        Boolean(day.detail?.braceletMetrics?.length)
      )
    case 'welltory':
      return Boolean(day.welltory.available || day.detail?.welltoryMetrics?.length)
    case 'todoist':
      return (
        day.todoist.created > 0 ||
        day.todoist.completed > 0 ||
        Boolean(day.detail?.createdTasks?.length || day.detail?.completedTasks?.length)
      )
    case 'rescuetime':
      return Boolean(day.rescuetime.available || day.detail?.rescueTime?.length)
  }
}
