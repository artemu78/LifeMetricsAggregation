import assert from 'node:assert/strict'
import test from 'node:test'

import { syncDashboardData } from '../src/sync.ts'

test('dashboard refresh requests collection for every dashboard source', async () => {
  const requests = []
  const responseBody = {
    from: '2026-09-13',
    to: '2026-09-15',
    sources: [
      { source: 'bracelet', status: 'success', records: 3 },
      { source: 'welltory', status: 'success', records: 2 },
      { source: 'rescuetime', status: 'success', records: 194 },
      { source: 'todoist', status: 'success', records: 4 },
    ],
  }
  const fetchMock = async (url, options) => {
    requests.push({ url, options })
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await syncDashboardData(
    { from: '2026-09-13', to: '2026-09-15' },
    fetchMock,
  )

  assert.deepEqual(result, responseBody)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/data-sync')
  assert.equal(requests[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    from: '2026-09-13',
    to: '2026-09-15',
  })
})
