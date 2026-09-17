import assert from 'node:assert/strict'
import { test } from 'vitest'

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

test('syncDashboardData handles error with message in json', async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ message: 'Custom sync error' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

  await assert.rejects(
    () => syncDashboardData({ from: '2026-09-13', to: '2026-09-15' }, fetchMock),
    { message: 'Custom sync error' },
  )
})

test('syncDashboardData handles error with empty json', async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({}), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })

  await assert.rejects(
    () => syncDashboardData({ from: '2026-09-13', to: '2026-09-15' }, fetchMock),
    { message: 'Ошибка 500' },
  )
})

test('syncDashboardData handles non-json error response', async () => {
  const fetchMock = async () =>
    new Response('Bad Gateway', {
      status: 502,
    })

  await assert.rejects(
    () => syncDashboardData({ from: '2026-09-13', to: '2026-09-15' }, fetchMock),
    { message: 'Ошибка 502' },
  )
})

