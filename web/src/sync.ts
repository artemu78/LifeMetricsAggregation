import type { components } from './generated/api-types'

type DateRange = components['schemas']['DateRange']
export type DashboardSyncResponse = components['schemas']['DashboardSyncResponse']
export type SyncProgressEvent = components['schemas']['SyncProgressEvent']
export type SyncCompleteEvent = components['schemas']['SyncCompleteEvent']
export type SyncErrorEvent = components['schemas']['SyncErrorEvent']
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string }
    return body.message ?? `Ошибка ${response.status}`
  } catch {
    return `Ошибка ${response.status}`
  }
}

export async function syncDashboardData(
  range: DateRange,
  fetchRequest: Fetch = fetch,
): Promise<DashboardSyncResponse> {
  const response = await fetchRequest('/api/data-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(range),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return (await response.json()) as DashboardSyncResponse
}

export async function syncDashboardDataStream(
  range: DateRange,
  onProgress: (event: SyncProgressEvent) => void,
  fetchRequest: Fetch = fetch,
): Promise<DashboardSyncResponse> {
  const response = await fetchRequest('/api/data-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify(range),
  })
  if (!response.ok) throw new Error(await errorMessage(response))

  const contentType = response.headers?.get('Content-Type') ?? ''
  if (!contentType.includes('text/event-stream') || !response.body || typeof response.body.getReader !== 'function') {
    const data = (await response.json()) as DashboardSyncResponse
    for (const item of data.sources) {
      onProgress({
        type: 'progress',
        source: item.source,
        status: item.status,
        records: item.records,
        issue: item.issue,
        latest: null,
        display: { success: 'обновлено', failed: 'ошибка', not_run: 'недоступен', partial: 'обновлено частично' }[item.status],
      })
    }
    return data
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalResponse: DashboardSyncResponse | null = null

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const raw = trimmed.slice(5).trim()
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed.type === 'progress') {
      onProgress(parsed as SyncProgressEvent)
    } else if (parsed.type === 'complete') {
      finalResponse = {
        from: parsed.from,
        to: parsed.to,
        sources: parsed.sources,
      }
    } else if (parsed.type === 'error') {
      throw new Error(parsed.message || 'Ошибка синхронизации')
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      handleLine(line)
    }
  }

  if (buffer.trim()) {
    handleLine(buffer)
  }

  if (!finalResponse) {
    throw new Error('Синхронизация не завершилась корректно')
  }

  return finalResponse
}

