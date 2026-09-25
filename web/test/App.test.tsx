import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { App } from '../src/App'
import { dashboardStore as store, type DashboardDay, type DashboardResponse } from '../src/store'

function createSampleDashboard(): DashboardResponse {
  const fullDay: DashboardDay = {
    date: '2026-09-15',
    weekday: 2,
    quality: 'complete',
    sources: [
      { source: 'bracelet', status: 'success', last_run_at: '2026-09-15T08:00:00Z' },
      { source: 'welltory', status: 'success', last_run_at: '2026-09-15T08:00:00Z' },
      { source: 'todoist', status: 'success', last_run_at: '2026-09-15T08:00:00Z' },
      { source: 'rescuetime', status: 'success', last_run_at: '2026-09-15T08:00:00Z' },
    ],
    bracelet: {
      sleepSeconds: 28800,
      steps: 12500,
    },
    welltory: {
      available: true,
    },
    todoist: {
      created: 3,
      completed: 2,
    },
    rescuetime: {
      available: true,
    },
    detail: {
      braceletMetrics: [
        { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
        { timestamp: '2026-09-15T03:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 14400 },
        { timestamp: '2026-09-15T07:00:00Z', metric: 'fitness_drive.sleep.awake_seconds', value: 1800 },
        { timestamp: '2026-09-15T07:30:00Z', metric: 'fitness_drive.sleep.rem_seconds', value: null },
        { timestamp: '2026-09-15T08:00:00Z', metric: 'fitness_drive.heart_rate', value: 72 },
        { timestamp: '2026-09-15T09:00:00Z', metric: 'fitness_drive.heart_rate', value: 85 },
        { timestamp: '2026-09-15T08:00:00Z', metric: 'fitness_drive.oxygen_saturation', value: 98 },
        { timestamp: '2026-09-15T09:00:00Z', metric: 'fitness_drive.oxygen_saturation', value: 97 },
      ],
      welltoryMetrics: [
        { timestamp: '2026-09-15T08:30:00Z', metric: 'welltory.Focus', value: 82.5, unit: '%' },
        { timestamp: '2026-09-15T08:30:00Z', metric: 'welltory.Energy', value: 65.0, unit: '%' },
      ],
      createdTasks: [
        { timestamp: '2026-09-15T10:00:00Z', content: 'Write tests' },
        { timestamp: '2026-09-15T11:00:00Z', content: 'Review code' },
      ],
      completedTasks: [
        { timestamp: '2026-09-15T15:00:00Z', content: 'Fix bug' },
      ],
      rescueTime: [
        { timestamp: '2026-09-15T09:00:00Z', perspective: 'activity', label: 'Coding', seconds: 7200 },
        { timestamp: '2026-09-15T11:00:00Z', perspective: 'activity', label: 'Communication', seconds: 1800 },
        { timestamp: '2026-09-15T14:00:00Z', perspective: 'activity', label: 'Reading', seconds: 3600 },
        { timestamp: '2026-09-15T16:00:00Z', perspective: 'activity', label: 'ShortTask', seconds: 120 },
        { timestamp: '2026-09-15T17:00:00Z', perspective: 'activity', label: 'ExactHour', seconds: 3600 },
        { timestamp: '2026-09-15T18:00:00Z', perspective: 'activity', label: 'HourAndMins', seconds: 5400 },
        { timestamp: '2026-09-15T09:00:00Z', perspective: 'productivity', label: '2', seconds: 7200 },
        { timestamp: '2026-09-15T11:00:00Z', perspective: 'productivity', label: '0', seconds: 1800 },
        { timestamp: '2026-09-15T14:00:00Z', perspective: 'productivity', label: '1', seconds: 3600 },
        { timestamp: '2026-09-15T16:00:00Z', perspective: 'productivity', label: 'custom-prod', seconds: 120 },
      ],
    },
  }

  const prevDay: DashboardDay = {
    date: '2026-09-14',
    weekday: 1,
    quality: 'partial',
    sources: [
      { source: 'bracelet', status: 'partial', last_run_at: '2026-09-14T08:00:00Z' },
      { source: 'welltory', status: 'failed', last_run_at: '2026-09-14T08:00:00Z' },
      { source: 'todoist', status: 'not_run', last_run_at: '2026-09-14T08:00:00Z' },
      { source: 'rescuetime', status: 'success', last_run_at: '2026-09-14T08:00:00Z' },
    ],
    bracelet: { sleepSeconds: null, steps: null },
    welltory: { available: false },
    todoist: { created: 0, completed: 0 },
    rescuetime: { available: false },
    detail: {
      braceletMetrics: [],
      welltoryMetrics: [],
      createdTasks: [],
      completedTasks: [],
      rescueTime: [],
    },
  }

  const augDay: DashboardDay = {
    date: '2026-08-31',
    weekday: 3,
    quality: 'failed',
    sources: [],
    bracelet: { sleepSeconds: 3600, steps: 100 },
    welltory: { available: false },
    todoist: { created: 1, completed: 0 },
    rescuetime: { available: true },
    detail: {
      braceletMetrics: [],
      welltoryMetrics: [],
      createdTasks: [{ timestamp: '2026-08-31T09:00:00Z', content: 'Aug task' }],
      completedTasks: [],
      rescueTime: [
        { timestamp: '2026-08-31T09:00:00Z', perspective: 'activity', label: 'Uncategorized', seconds: 20 },
      ],
    },
  }

  const nextDay: DashboardDay = {
    date: '2026-09-16',
    weekday: 3,
    quality: 'in_progress',
    sources: [
      { source: 'bracelet', status: 'success', last_run_at: '2026-09-16T08:00:00Z' },
    ],
    bracelet: { sleepSeconds: null, steps: 2000 },
    welltory: { available: false },
    todoist: { created: 0, completed: 0 },
    rescuetime: { available: false },
    detail: {
      braceletMetrics: [],
      welltoryMetrics: [],
      createdTasks: [],
      completedTasks: [],
      rescueTime: [],
    },
  }

  return {
    from: '2026-08-31',
    to: '2026-09-16',
    timezone: 'Europe/Moscow',
    days: [augDay, prevDay, fullDay, nextDay],
  }
}

describe('App Component', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify(createSampleDashboard()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    act(() => {
      store.dashboard = createSampleDashboard()
      store.from = '2026-08-31'
      store.to = '2026-09-16'
      store.loading = false
      store.syncing = false
      store.syncModalOpen = false
      store.syncProgress = {}
      store.helpOpen = false
      store.error = null
      store.syncMessage = null
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders dashboard with topbar, months, and days', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Live Life' })).toBeInTheDocument()
    expect(screen.getByText(/Дней: 4 · 2026-08-31 — 2026-09-16/)).toBeInTheDocument()

    // Month headers
    expect(screen.getByRole('heading', { name: /Август 2026/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Сентябрь 2026/i })).toBeInTheDocument()

    // Day card data
    expect(screen.getByText('12 500')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
  })

  it('toggles and closes the dashboard legend via button, close icon, Escape, and outside click', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const helpBtn = screen.getByLabelText('Легенда качества и источников')
    expect(screen.queryByRole('heading', { name: 'Легенда' })).not.toBeInTheDocument()

    // Click to open
    fireEvent.click(helpBtn)
    expect(screen.getByRole('heading', { name: 'Легенда' })).toBeInTheDocument()
    expect(screen.getByText('Все источники обновлены')).toBeInTheDocument()
    expect(screen.getByText('Браслет')).toBeInTheDocument()

    // Click close icon inside legend
    const closeBtn = screen.getByLabelText('Закрыть легенду')
    fireEvent.click(closeBtn)
    expect(screen.queryByRole('heading', { name: 'Легенда' })).not.toBeInTheDocument()

    // Open and close with Escape
    fireEvent.click(helpBtn)
    expect(screen.getByRole('heading', { name: 'Легенда' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: 'Легенда' })).not.toBeInTheDocument()

    // Open and close with outside pointerdown
    fireEvent.click(helpBtn)
    expect(screen.getByRole('heading', { name: 'Легенда' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('heading', { name: 'Легенда' })).not.toBeInTheDocument()
  })

  it('triggers syncAll when sync button is clicked and shows syncing state', async () => {
    const syncSpy = vi.spyOn(store, 'syncAll').mockImplementation(async () => {})
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const syncBtn = screen.getByRole('button', { name: 'Обновить данные' })
    fireEvent.click(syncBtn)
    expect(syncSpy).toHaveBeenCalled()

    // Simulate syncing state
    act(() => {
      store.syncing = true
    })
    expect(screen.getByRole('button', { name: 'Обновляем…' })).toBeDisabled()
  })

  it('displays loading, error, and sync messages', async () => {
    vi.spyOn(store, 'load').mockImplementation(async () => {})
    act(() => {
      store.dashboard = null
      store.loading = true
      store.error = 'Сетевая ошибка'
      store.syncMessage = 'Данные успешно обновлены'
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Загружаем календарь…')).toBeInTheDocument()
    expect(screen.getByText('Сетевая ошибка')).toBeInTheDocument()
    expect(screen.getByText('Данные успешно обновлены')).toBeInTheDocument()
  })

  it('renders SyncModal with spinners and timestamps and handles close', async () => {
    act(() => {
      store.syncModalOpen = true
      store.syncing = true
      store.syncProgress = {
        bracelet: { source: 'bracelet', status: 'pending', latest: null, display: null },
        welltory: { source: 'welltory', status: 'success', latest: '2026-09-15T08:30:00Z', display: '15/09/2026 08:30:00' },
        rescuetime: { source: 'rescuetime', status: 'pending', latest: null, display: null },
        todoist: { source: 'todoist', status: 'not_run', latest: null, display: 'недоступен' },
      }
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Обновление данных' })).toBeInTheDocument()
    expect(screen.getByText('Обновляем источники…')).toBeInTheDocument()
    expect(screen.getByText('15/09/2026 08:30:00')).toBeInTheDocument()
    expect(screen.getByText('недоступен')).toBeInTheDocument()
    expect(screen.getByLabelText('Обновление: Браслет')).toBeInTheDocument()
    expect(screen.getByLabelText('Обновление: RescueTime')).toBeInTheDocument()

    // Escape closes modal
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(store.syncModalOpen).toBe(false)
  })

  it('handles focus trapping and close button in SyncModal', async () => {
    act(() => {
      store.syncModalOpen = true
      store.syncing = false
      store.syncProgress = {
        bracelet: { source: 'bracelet', status: 'success', latest: '2026-09-15T08:00:00Z', display: '15/09/2026 08:00:00' },
        welltory: { source: 'welltory', status: 'success', latest: '2026-09-15T08:30:00Z', display: '15/09/2026 08:30:00' },
        rescuetime: { source: 'rescuetime', status: 'success', latest: '2026-09-15T09:00:00Z', display: '15/09/2026 09:00:00' },
        todoist: { source: 'todoist', status: 'success', latest: '2026-09-15T10:00:00Z', display: '15/09/2026 10:00:00' },
      }
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Обновление завершено')).toBeInTheDocument()
    const closeBtn = screen.getByRole('button', { name: 'Закрыть' })
    fireEvent.click(closeBtn)
    expect(store.syncModalOpen).toBe(false)
  })

  it('handles focus trapping, pointerdown outside, and X button in SyncModal', async () => {
    vi.spyOn(store, 'load').mockImplementation(async () => {})
    act(() => {
      store.syncModalOpen = true
      store.syncing = false
      store.error = 'Критическая ошибка синхронизации'
      store.syncProgress = {
        bracelet: { source: 'bracelet', status: 'failed', latest: null, display: '' },
      }
    })

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    // Error banner shown
    expect(screen.getByRole('alert')).toHaveTextContent('Критическая ошибка синхронизации')
    expect(screen.getByText('failed')).toBeInTheDocument()

    const modal = screen.getByRole('dialog')
    const focusable = modal.querySelectorAll<HTMLElement>('button, [href]')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Focus trap tests
    first.focus()
    expect(first).toHaveFocus()

    // Shift+Tab on first element wraps to last
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    // Shift+Tab on last element (not first) falls through to default
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })

    // Tab on last element wraps to first
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false })
    expect(first).toHaveFocus()

    // Non-tab key is ignored
    fireEvent.keyDown(window, { key: 'Shift' })

    // Active element outside focusable wraps to target
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    // Pointerdown inside modal does not close modal
    fireEvent.pointerDown(modal)
    expect(store.syncModalOpen).toBe(true)

    // Pointerdown outside modal closes modal
    fireEvent.pointerDown(document.body)
    expect(store.syncModalOpen).toBe(false)

    // Reopen and test X button
    act(() => {
      store.syncModalOpen = true
    })
    const xButton = screen.getByRole('button', { name: 'Закрыть окно обновления' })
    fireEvent.click(xButton)
    expect(store.syncModalOpen).toBe(false)
  })

  it('opens day modal when navigating to /day/:date and displays full details', async () => {
    render(
      <MemoryRouter initialEntries={['/day/2026-09-15']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '2026-09-15' })).toBeInTheDocument()
    expect(screen.getByText('Подробности дня')).toBeInTheDocument()

    // Sources statuses
    expect(screen.getByText('bracelet: success')).toBeInTheDocument()
    expect(screen.getByText('welltory: success')).toBeInTheDocument()

    // Bracelet sleep stages
    expect(screen.getByText('deep')).toBeInTheDocument()
    expect(screen.getByText('light')).toBeInTheDocument()
    expect(screen.getByText('awake')).toBeInTheDocument()

    // Welltory measurements
    expect(screen.getByText('Focus')).toBeInTheDocument()
    expect(screen.getByText('82.5 %')).toBeInTheDocument()

    // Charts
    expect(screen.queryByText('Пульс')).not.toBeInTheDocument()
    expect(screen.getByText('Кислород')).toBeInTheDocument()

    // Todoist tasks
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()

    // RescueTime details
    expect(screen.getAllByText('Coding').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Communication').length).toBeGreaterThan(0)
    expect(within(screen.getByRole('dialog')).getByLabelText(/Индекс продуктивности:/)).toBeInTheDocument()
  })

  it('handles navigation inside day modal via chevron buttons, keyboard arrows, and escape', async () => {
    render(
      <MemoryRouter initialEntries={['/day/2026-09-15']}>
        <App />
      </MemoryRouter>,
    )

    const prevBtn = screen.getByRole('button', { name: /Предыдущая дата/i })
    const nextBtn = screen.getByRole('button', { name: /Следующая дата/i })
    expect(prevBtn).not.toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    // Click previous date
    fireEvent.click(prevBtn)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '2026-09-14' })).toBeInTheDocument()
    })

    // Click next date back to 2026-09-15
    const nextBtnAfterPrev = screen.getByRole('button', { name: /Следующая дата/i })
    fireEvent.click(nextBtnAfterPrev)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '2026-09-15' })).toBeInTheDocument()
    })

    // Keyboard ArrowRight back to 2026-09-16
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '2026-09-16' })).toBeInTheDocument()
    })

    // ArrowRight on last date should do nothing
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: '2026-09-16' })).toBeInTheDocument()

    // Keyboard ArrowLeft back to 2026-09-15
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '2026-09-15' })).toBeInTheDocument()
    })

    // Irrelevant key does nothing
    fireEvent.keyDown(window, { key: 'Space' })
    expect(screen.getByRole('heading', { name: '2026-09-15' })).toBeInTheDocument()

    // Close with Escape
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText('Подробности дня')).not.toBeInTheDocument()
    })
  })

  it('traps focus in day modal using Tab and Shift+Tab', async () => {
    render(
      <MemoryRouter initialEntries={['/day/2026-09-15']}>
        <App />
      </MemoryRouter>,
    )

    const modal = screen.getByRole('dialog')
    const prevBtn = screen.getByRole('button', { name: /Предыдущая дата/i })

    // Tab key from outside / initial
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(prevBtn).toHaveFocus()

    const focusable = modal.querySelectorAll<HTMLElement>('button, [href]')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Middle element tab forward and backward
    if (focusable.length > 2) {
      focusable[1].focus()
      fireEvent.keyDown(window, { key: 'Tab' })
      fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    }

    // Tab key wrap to first when on last focusable
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()

    // Shift+Tab wrap to last when on first focusable
    first.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    // Non-tab key inside modal
    fireEvent.keyDown(window, { key: 'Shift' })

    // Pointerdown inside modal does not close modal
    fireEvent.pointerDown(modal)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Pointerdown outside modal closes modal
    fireEvent.pointerDown(document.body)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('renders modal with empty sections when data is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/day/2026-09-14']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Нет измерений')).toBeInTheDocument()
    expect(screen.getByText('Нет задач')).toBeInTheDocument()
    expect(screen.getByText('Нет отслеженного времени')).toBeInTheDocument()
  })

  it('renders day with short rescueTime without productivity index', async () => {
    render(
      <MemoryRouter initialEntries={['/day/2026-08-31']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Нет данных продуктивности')).toBeInTheDocument()
    expect(screen.getAllByText('< 1 мин').length).toBeGreaterThan(0)
  })

  it('redirects to / when day date does not exist', async () => {
    render(
      <MemoryRouter initialEntries={['/day/1999-01-01']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Live Life' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('redirects to / when route is wildcard', async () => {
    render(
      <MemoryRouter initialEntries={['/random-unknown-route']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Live Life' })).toBeInTheDocument()
  })

  it('returns null in DayRoute when store.dashboard is null', async () => {
    act(() => {
      store.dashboard = null
    })

    render(
      <MemoryRouter initialEntries={['/day/2026-09-15']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
