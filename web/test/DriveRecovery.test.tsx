import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { DriveRecovery } from '../src/DriveRecovery'

const issue = { code: 'GOOGLE_RECONNECT_REQUIRED', message: 'Разрешение Google истекло.', action: 'reconnect' as const, steps: ['Войдите в Google.'], diagnosticId: 'safe-id' }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const connect = () => fireEvent.click(screen.getByRole('button', { name: 'Подключить Google Drive' }))
const fileInput = () => screen.getByLabelText('JSON OAuth-клиента')
const upload = (content = '{}', size = 2) => fireEvent.change(fileInput(), { target: { files: [{ size, text: async () => content }] } })

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Drive recovery', () => {
  it('shows a concrete failure, Google setup links, diagnostic ID and retry', () => {
    const retry = vi.fn()
    render(<DriveRecovery issue={issue} syncing={false} retry={retry} />)
    expect(screen.getByText(issue.message)).toBeInTheDocument()
    expect(screen.getByText('Войдите в Google.')).toBeInTheDocument()
    expect(screen.getByText(/safe-id/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', 'https://console.cloud.google.com/auth/clients')
    fireEvent.click(screen.getByRole('button', { name: 'Повторить обновление' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('keeps recovery actions disabled while a source update is running', () => {
    render(<DriveRecovery syncing retry={() => {}} />)
    expect(screen.getByRole('button', { name: 'Подключить Google Drive' })).toBeDisabled()
    expect(fileInput()).toBeDisabled()
  })

  it('starts consent, links to Google and polls until credentials are saved', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ status: 'pending', sessionId: 'session', authorizationUrl: 'https://accounts.google.com/o/oauth2/auth?state=abc' }))
      .mockResolvedValueOnce(response({ status: 'pending', sessionId: 'session' }))
      .mockResolvedValueOnce(response({ status: 'success', sessionId: 'session' }))
    vi.stubGlobal('fetch', fetcher)
    render(<DriveRecovery issue={issue} syncing={false} retry={() => {}} />)
    await act(async () => { connect() })
    expect(screen.getByRole('link', { name: 'Продолжить вход в Google' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('button', { name: 'Повторить обновление' })).toBeDisabled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByText(/Google Drive подключён/)).toBeInTheDocument()
    expect(fetcher).toHaveBeenNthCalledWith(1, '/api/google-drive/connect', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Live-Life-Action': '1' }) }))
    expect(screen.getByRole('button', { name: 'Повторить обновление' })).toBeEnabled()
  })

  it('shows missing/deleted client or denied consent returned by connection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ status: 'failed', issue: { ...issue, code: 'GOOGLE_CLIENT_INVALID', message: 'Клиент удалён.' } })))
    render(<DriveRecovery issue={issue} syncing={false} retry={() => {}} />)
    connect()
    expect(await screen.findByText('Клиент удалён.')).toBeInTheDocument()
  })

  it('shows a connection transport error and allows another attempt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'Нет связи' }, 503)))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    connect()
    expect(await screen.findByText('Нет связи')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Подключить Google Drive' })).toBeEnabled()
  })

  it('handles a non-JSON server failure safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('broken', { status: 500 })))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    connect()
    expect(await screen.findByText(/Не удалось связаться/)).toBeInTheDocument()
  })

  it('handles non-Error connection rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('offline'))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    connect()
    expect(await screen.findByText('Не удалось начать подключение.')).toBeInTheDocument()
  })

  it.each([new Error('Проверка недоступна'), 'unknown'])('shows polling errors without leaving buttons stuck', async (failure) => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ status: 'pending', sessionId: 'session' })).mockRejectedValueOnce(failure))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    await act(async () => { connect() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.getByText(failure instanceof Error ? failure.message : 'Не удалось проверить подключение.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Подключить Google Drive' })).toBeEnabled()
  })

  it('uploads replacement config and then offers reconnect', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: 'idle' }))
    vi.stubGlobal('fetch', fetcher)
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    upload('{"installed":{}}')
    expect(await screen.findByText(/Настройки сохранены/)).toBeInTheDocument()
    expect(fetcher).toHaveBeenCalledWith('/api/google-drive/client', expect.objectContaining({ method: 'POST', body: JSON.stringify({ content: '{"installed":{}}' }) }))
  })

  it('displays invalid uploaded client without reporting success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ status: 'failed', issue: { ...issue, message: 'Нужен Desktop app.' } })))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    upload()
    expect(await screen.findByText('Нужен Desktop app.')).toBeInTheDocument()
    expect(screen.queryByText(/Настройки сохранены/)).not.toBeInTheDocument()
  })

  it.each([new Error('Не удалось загрузить'), 'unknown'])('displays upload failure', async (failure) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure))
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    upload()
    expect(await screen.findByText(failure instanceof Error ? failure.message : 'Не удалось сохранить файл.')).toBeInTheDocument()
  })

  it('rejects oversized files locally and ignores file picker cancellation', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    render(<DriveRecovery syncing={false} retry={() => {}} />)
    fireEvent.change(fileInput(), { target: { files: [] } })
    upload('x', 20000)
    expect(await screen.findByText(/Файл слишком большой/)).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not update after unmount during connection start', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    connect()
    view.unmount()
    await act(async () => { resolve(response({ status: 'pending', sessionId: 's' })) })
    expect(screen.queryByText(/Ожидаем вход/)).not.toBeInTheDocument()
  })

  it('ignores a connection error after unmount', async () => {
    let reject!: (reason: Error) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_, fail) => { reject = fail })))
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    connect()
    view.unmount()
    await act(async () => { reject(new Error('Late connection error')) })
    expect(screen.queryByText('Late connection error')).not.toBeInTheDocument()
  })

  it('does not send an uploaded file after unmount while reading it', async () => {
    let finishReading!: (content: string) => void
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    fireEvent.change(fileInput(), { target: { files: [{ size: 2, text: () => new Promise<string>(done => { finishReading = done }) }] } })
    view.unmount()
    await act(async () => { finishReading('{}') })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ignores an upload response after unmount', async () => {
    let resolve!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal('fetch', fetcher)
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    upload()
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => { resolve(response({ status: 'idle' })) })
    expect(screen.queryByText(/Настройки сохранены/)).not.toBeInTheDocument()
  })

  it('ignores an upload error after unmount', async () => {
    let reject!: (reason: Error) => void
    const fetcher = vi.fn(() => new Promise<Response>((_, fail) => { reject = fail }))
    vi.stubGlobal('fetch', fetcher)
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    upload()
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    view.unmount()
    await act(async () => { reject(new Error('Late upload error')) })
    expect(screen.queryByText('Late upload error')).not.toBeInTheDocument()
  })

  it('stops polling when unmounted while a poll is in flight', async () => {
    vi.useFakeTimers()
    let resolve!: (response: Response) => void
    const fetcher = vi.fn().mockResolvedValueOnce(response({ status: 'pending', sessionId: 's' })).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done }))
    vi.stubGlobal('fetch', fetcher)
    const view = render(<DriveRecovery syncing={false} retry={() => {}} />)
    await act(async () => { connect() })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    view.unmount()
    await act(async () => { resolve(response({ status: 'success', sessionId: 's' })); await vi.advanceTimersByTimeAsync(5000) })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

it('the sync dialog exposes the returned issue and does not announce full success', async () => {
  const { SyncModal } = await import('../src/App')
  const { dashboardStore } = await import('../src/store')
  dashboardStore.error = null
  dashboardStore.syncing = false
  dashboardStore.syncProgress = {
    bracelet: { source: 'bracelet', status: 'failed', latest: null, display: 'ошибка', issue },
  }
  render(<SyncModal />)
  expect(screen.getByText('Обновление завершено не для всех источников')).toBeInTheDocument()
  expect(screen.getByText(issue.message)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Подключить Google Drive' })).toBeInTheDocument()
  cleanup()
  dashboardStore.syncProgress = {}
})
