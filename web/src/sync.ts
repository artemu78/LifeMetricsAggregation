import type { components } from './generated/api-types'

type DateRange = components['schemas']['DateRange']
export type DashboardSyncResponse = components['schemas']['DashboardSyncResponse']
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
