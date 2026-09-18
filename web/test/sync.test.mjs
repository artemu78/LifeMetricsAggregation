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

function mockSseFetch(chunks) {
  const items = Array.isArray(chunks) ? chunks : [chunks]
  return async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const item of items) {
            controller.enqueue(new TextEncoder().encode(item))
          }
          controller.close()
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )
}

test('syncDashboardDataStream parses SSE stream events', async () => {
  const events = []
  const streamData = [
    'data: {"type":"progress","source":"bracelet","status":"success","records":1,"latest":"2026-09-15T10:00:00+03:00","display":"15/09/2026 10:00:00"}\n\n',
    'data: {"type":"progress","source":"welltory","status":"not_run","records":0,"latest":null,"display":"недоступен"}\n\n',
    'data: {"type":"complete","from":"2026-09-13","to":"2026-09-15","sources":[{"source":"bracelet","status":"success","records":1},{"source":"welltory","status":"not_run","records":0},{"source":"rescuetime","status":"success","records":0},{"source":"todoist","status":"success","records":0}]}\n\n',
  ]
  const fetchMock = mockSseFetch(streamData)

  const result = await import('../src/sync.ts').then((m) =>
    m.syncDashboardDataStream(
      { from: '2026-09-13', to: '2026-09-15' },
      (ev) => events.push(ev),
      fetchMock,
    ),
  )

  assert.equal(events.length, 2)
  assert.equal(events[0].source, 'bracelet')
  assert.equal(events[0].display, '15/09/2026 10:00:00')
  assert.equal(events[1].source, 'welltory')
  assert.equal(events[1].display, 'недоступен')
  assert.equal(result.from, '2026-09-13')
})

test('syncDashboardDataStream handles error event in stream', async () => {
  const fetchMock = mockSseFetch(
    'data: {"type":"error","code":"SYNC_FAILED","message":"Stream failed"}\n\n',
  )

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  await assert.rejects(
    () =>
      syncDashboardDataStream(
        { from: '2026-09-13', to: '2026-09-15' },
        () => {},
        fetchMock,
      ),
    { message: 'Stream failed' },
  )
})

test('syncDashboardDataStream parses complete event from trailing buffer without newline', async () => {
  const events = []
  const trailingChunk = 'data: {"type":"complete","from":"2026-09-13","to":"2026-09-15","sources":[]}'
  const fetchMock = mockSseFetch([': comment\ndata:\n\n', trailingChunk])

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    (ev) => events.push(ev),
    fetchMock,
  )

  assert.equal(result.from, '2026-09-13')
})

test('syncDashboardDataStream throws error when stream terminates without complete event', async () => {
  const fetchMock = mockSseFetch(
    'data: {"type":"progress","source":"bracelet","status":"success","records":1}\n\n',
  )

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  await assert.rejects(
    () =>
      syncDashboardDataStream(
        { from: '2026-09-13', to: '2026-09-15' },
        () => {},
        fetchMock,
      ),
    { message: 'Синхронизация не завершилась корректно' },
  )
})

test('syncDashboardDataStream throws error on non-ok HTTP response', async () => {
  const fetchMock = async () =>
    new Response(JSON.stringify({ message: 'Ошибка сети' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  const { syncDashboardDataStream } = await import('../src/sync.ts')
  await assert.rejects(
    () =>
      syncDashboardDataStream(
        { from: '2026-09-13', to: '2026-09-15' },
        () => {},
        fetchMock,
      ),
    { message: 'Ошибка сети' },
  )
})

test('syncDashboardDataStream falls back to json response when not SSE', async () => {
  const events = []
  const jsonBody = {
    from: '2026-09-13',
    to: '2026-09-15',
    sources: [
      { source: 'bracelet', status: 'success', records: 5 },
      { source: 'welltory', status: 'not_run', records: 0 },
    ],
  }
  const fetchMock = async () =>
    new Response(JSON.stringify(jsonBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    (ev) => events.push(ev),
    fetchMock,
  )
  assert.deepEqual(result, jsonBody)
  assert.equal(events.length, 2)
  assert.equal(events[0].display, 'обновлено')
  assert.equal(events[1].display, 'not_run')
})

test('syncDashboardDataStream falls back when response body getReader is missing', async () => {
  const jsonBody = {
    from: '2026-09-13',
    to: '2026-09-15',
    sources: [{ source: 'todoist', status: 'failed', records: 0 }],
  }
  const fetchMock = async () => ({
    ok: true,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: null,
    json: async () => jsonBody,
  })
  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const events = []
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    (ev) => events.push(ev),
    fetchMock,
  )
  assert.deepEqual(result, jsonBody)
  assert.equal(events[0].display, 'failed')
})

test('syncDashboardDataStream handles error event with default message', async () => {
  const fetchMock = mockSseFetch('data: {"type":"error"}\n\n')

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  await assert.rejects(
    () =>
      syncDashboardDataStream(
        { from: '2026-09-13', to: '2026-09-15' },
        () => {},
        fetchMock,
      ),
    { message: 'Ошибка синхронизации' },
  )
})

test('syncDashboardDataStream ignores comments and empty data lines', async () => {
  const events = []
  const fetchMock = mockSseFetch(
    ': ping\nevent: message\ndata:\ndata:   \ndata: {"type":"progress","source":"bracelet","status":"success","records":2,"display":"обновлено"}\ndata: {"type":"complete","from":"2026-09-13","to":"2026-09-15","sources":[]}\n\n',
  )

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    (ev) => events.push(ev),
    fetchMock,
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].source, 'bracelet')
  assert.equal(result.from, '2026-09-13')
})

test('syncDashboardDataStream ignores unknown event types', async () => {
  const fetchMock = mockSseFetch(
    'data: {"type":"unknown"}\n\ndata: {"type":"complete","from":"2026-09-13","to":"2026-09-15","sources":[]}\n\n',
  )

  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    () => {},
    fetchMock,
  )
  assert.equal(result.from, '2026-09-13')
})

test('syncDashboardDataStream handles missing Content-Type header', async () => {
  const jsonBody = {
    from: '2026-09-13',
    to: '2026-09-15',
    sources: [],
  }
  const fetchMock = async () => ({
    ok: true,
    headers: null,
    body: null,
    json: async () => jsonBody,
  })
  const { syncDashboardDataStream } = await import('../src/sync.ts')
  const result = await syncDashboardDataStream(
    { from: '2026-09-13', to: '2026-09-15' },
    () => {},
    fetchMock,
  )
  assert.deepEqual(result, jsonBody)
})






