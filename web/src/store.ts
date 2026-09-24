import { makeAutoObservable, runInAction } from 'mobx'
import type { components } from './generated/api-types'
import { defaultDashboardWindow } from './dashboardWindow.ts'
import { syncDashboardDataStream } from './sync.ts'

export type DashboardResponse = components['schemas']['DashboardResponse']
export type DashboardDay = components['schemas']['DashboardDay']
export type DateRange = components['schemas']['DateRange']
export type SourceSyncProgress = {
  source: string
  status: 'pending' | 'success' | 'partial' | 'failed' | 'not_run'
  latest: string | null
  display: string | null
  issue?: components['schemas']['SourceIssue'] | null
  records?: number
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
  from: string
  to: string
  dashboard: DashboardResponse | null = null
  loading = false
  syncing = false
  syncModalOpen = false
  syncProgress: Record<string, SourceSyncProgress> = {}
  helpOpen = false
  error: string | null = null
  syncMessage: string | null = null
  #loadSequence = 0

  constructor() {
    const window = defaultDashboardWindow()
    this.from = window.from
    this.to = window.to
    makeAutoObservable(this)
  }

  async load() {
    const sequence = ++this.#loadSequence
    this.loading = true
    this.error = null
    try {
      const params = new URLSearchParams({ from: this.from, to: this.to })
      const response = await fetch(`/api/dashboard?${params}`)
      if (!response.ok) throw new Error(await errorMessage(response))
      const dashboard = (await response.json()) as DashboardResponse
      if (sequence !== this.#loadSequence) return
      runInAction(() => {
        this.dashboard = dashboard
      })
    } catch (error) {
      if (sequence !== this.#loadSequence) return
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Не удалось загрузить данные'
      })
    } finally {
      if (sequence === this.#loadSequence) {
        runInAction(() => {
          this.loading = false
        })
      }
    }
  }

  async syncAll(fetchRequest = fetch) {
    if (this.syncing) return
    this.syncing = true
    this.syncModalOpen = true
    this.error = null
    this.syncMessage = null
    const sources = ['bracelet', 'welltory', 'rescuetime', 'todoist']
    this.syncProgress = Object.fromEntries(
      sources.map((source) => [
        source,
        { source, status: 'pending', latest: null, display: null },
      ]),
    )
    try {
      const body: DateRange = { from: this.from, to: this.to }
      const result = await syncDashboardDataStream(
        body,
        (event) => {
          if (event.status !== 'success') {
            const details = {
              source: event.source,
              status: event.status,
              from: body.from,
              to: body.to,
              records: event.records,
              latestStoredTimestamp: event.latest ?? null,
              issue: event.issue ?? null,
            }
            if (event.status === 'failed') {
              console.error('[dashboard-sync] source synchronization failed', details)
            } else {
              console.warn('[dashboard-sync] source synchronization incomplete', details)
            }
          }
          runInAction(() => {
            this.syncProgress[event.source] = {
              source: event.source,
              status: event.status,
              latest: event.latest ?? null,
              display: event.display ?? null,
              records: event.records,
              issue: event.issue,
            }
          })
        },
        fetchRequest,
      )
      const labels: Record<string, string> = {
        bracelet: 'Браслет',
        welltory: 'Welltory',
        rescuetime: 'RescueTime',
        todoist: 'Todoist',
      }
      runInAction(() => {
        for (const item of result.sources) {
          this.syncProgress[item.source] = {
            ...this.syncProgress[item.source], ...item,
            latest: this.syncProgress[item.source]?.latest ?? null,
            display: this.syncProgress[item.source]?.display ?? null,
          }
        }
      })
      await this.load()
      runInAction(() => {
        this.syncMessage = result.sources
          .map(({ source, status, records }) => {
            if (status === 'success') return `${labels[source]}: новых записей ${records}`
            if (status === 'not_run') return `${labels[source]}: источник недоступен`
            if (status === 'partial') return `${labels[source]}: обновлено частично`
            return `${labels[source]}: ошибка`
          })
          .join(' · ')
      })
    } catch (error) {
      console.error('[dashboard-sync] synchronization request failed', {
        from: this.from,
        to: this.to,
        error,
      })
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Обновление данных не выполнено'
        for (const progress of Object.values(this.syncProgress)) {
          if (progress.status === 'pending') {
            progress.status = 'not_run'
            progress.display = 'обновление прервано'
          }
        }
      })
    } finally {
      runInAction(() => {
        this.syncing = false
      })
    }
  }

  openSyncModal() {
    this.syncModalOpen = true
  }

  closeSyncModal() {
    this.syncModalOpen = false
  }

  toggleHelp() {
    this.helpOpen = !this.helpOpen
  }

  closeHelp() {
    this.helpOpen = false
  }
}

export const dashboardStore = new DashboardStore()
