import { makeAutoObservable, runInAction } from 'mobx'
import type { components } from './generated/api-types'

export type DashboardResponse = components['schemas']['DashboardResponse']
export type DashboardDay = components['schemas']['DashboardDay']
export type DateRange = components['schemas']['DateRange']

function moscowDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const shifted = new Date(`${today}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  return shifted.toISOString().slice(0, 10)
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message ?? `Ошибка ${response.status}`
  } catch {
    return `Ошибка ${response.status}`
  }
}

export class DashboardStore {
  from = moscowDate(-29)
  to = moscowDate()
  dashboard: DashboardResponse | null = null
  selectedDate: string | null = null
  loading = false
  syncing = false
  helpOpen = false
  error: string | null = null
  syncMessage: string | null = null

  constructor() {
    makeAutoObservable(this)
  }

  get selectedDay(): DashboardDay | null {
    return this.dashboard?.days.find((day) => day.date === this.selectedDate) ?? null
  }

  async load() {
    this.loading = true
    this.error = null
    try {
      const params = new URLSearchParams({ from: this.from, to: this.to })
      const response = await fetch(`/api/dashboard?${params}`)
      if (!response.ok) throw new Error(await errorMessage(response))
      const dashboard = (await response.json()) as DashboardResponse
      runInAction(() => {
        this.dashboard = dashboard
      })
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Не удалось загрузить данные'
      })
    } finally {
      runInAction(() => {
        this.loading = false
      })
    }
  }

  async syncBracelet() {
    this.syncing = true
    this.error = null
    this.syncMessage = null
    try {
      const body: DateRange = { from: this.from, to: this.to }
      const response = await fetch('/api/fitness-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(await errorMessage(response))
      const result = (await response.json()) as components['schemas']['FitnessSyncResponse']
      runInAction(() => {
        this.syncMessage = `Обновлено файлов: ${result.changedFiles}; измерений: ${result.metrics}`
      })
      await this.load()
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Синхронизация не выполнена'
      })
    } finally {
      runInAction(() => {
        this.syncing = false
      })
    }
  }

  selectDay(date: string | null) {
    this.selectedDate = date
  }

  toggleHelp() {
    this.helpOpen = !this.helpOpen
  }
}

export const dashboardStore = new DashboardStore()
