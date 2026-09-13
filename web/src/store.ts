import { makeAutoObservable, runInAction } from 'mobx'
import type { components } from './generated/api-types'
import { defaultDashboardWindow } from './dashboardWindow'

export type DashboardResponse = components['schemas']['DashboardResponse']
export type DashboardDay = components['schemas']['DashboardDay']
export type DateRange = components['schemas']['DateRange']

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message ?? `Ошибка ${response.status}`
  } catch {
    return `Ошибка ${response.status}`
  }
}

export class DashboardStore {
  from: string
  to: string
  dashboard: DashboardResponse | null = null
  loading = false
  syncing = false
  helpOpen = false
  error: string | null = null
  syncMessage: string | null = null

  constructor() {
    const window = defaultDashboardWindow()
    this.from = window.from
    this.to = window.to
    makeAutoObservable(this)
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

  toggleHelp() {
    this.helpOpen = !this.helpOpen
  }

  closeHelp() {
    this.helpOpen = false
  }
}

export const dashboardStore = new DashboardStore()
