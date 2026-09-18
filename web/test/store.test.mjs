import assert from 'node:assert/strict'
import { test } from 'vitest'

import { DashboardStore } from '../src/store.ts'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function dashboard(generatedAt) {
  return {
    from: '2026-09-13',
    to: '2026-09-15',
    timezone: 'Europe/Moscow',
    generatedAt,
    days: [],
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error('Condition was not reached')
}

test('the initial load cannot replace the refreshed snapshot loaded by syncAll', async () => {
  const initialResponse = deferred()
  const refreshedResponse = deferred()
  let dashboardRequests = 0
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (url === '/api/data-sync') {
      return new Response(JSON.stringify({
        from: '2026-09-13',
        to: '2026-09-15',
        sources: [
          { source: 'bracelet', status: 'success', records: 1 },
          { source: 'welltory', status: 'success', records: 1 },
          { source: 'rescuetime', status: 'success', records: 1 },
          { source: 'todoist', status: 'success', records: 1 },
        ],
      }))
    }
    dashboardRequests += 1
    return dashboardRequests === 1
      ? initialResponse.promise
      : refreshedResponse.promise
  }
  try {
    const store = new DashboardStore()
    const initialLoad = store.load()
    const synchronization = store.syncAll()

    await waitFor(() => dashboardRequests === 2)
    refreshedResponse.resolve(
      new Response(JSON.stringify(dashboard('2026-09-15T10:00:00Z'))),
    )
    await synchronization
    initialResponse.resolve(
      new Response(JSON.stringify(dashboard('2026-09-15T09:00:00Z'))),
    )
    await initialLoad

    assert.equal(store.dashboard?.generatedAt, '2026-09-15T10:00:00Z')
    assert.equal(store.loading, false)
    assert.equal(store.error, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a stale failed load cannot clear loading or set an error for a newer load', async () => {
  const initialResponse = deferred()
  const refreshedResponse = deferred()
  const responses = [initialResponse.promise, refreshedResponse.promise]
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => responses.shift()
  try {
    const store = new DashboardStore()
    const initialLoad = store.load()
    const refreshedLoad = store.load()

    initialResponse.resolve(new Response('{"message":"stale failure"}', { status: 500 }))
    await initialLoad
    assert.equal(store.loading, true)
    assert.equal(store.error, null)

    refreshedResponse.resolve(
      new Response(JSON.stringify(dashboard('2026-09-15T10:00:00Z'))),
    )
    await refreshedLoad
    assert.equal(store.loading, false)
    assert.equal(store.error, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('DashboardStore toggleHelp and closeHelp update helpOpen state', () => {
  const store = new DashboardStore()
  assert.equal(store.helpOpen, false)
  store.toggleHelp()
  assert.equal(store.helpOpen, true)
  store.toggleHelp()
  assert.equal(store.helpOpen, false)
  store.toggleHelp()
  assert.equal(store.helpOpen, true)
  store.closeHelp()
  assert.equal(store.helpOpen, false)
})

test('DashboardStore load handles error response and non-Error exception', async () => {
  const originalFetch = globalThis.fetch
  try {
    const store = new DashboardStore()

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Сервер недоступен' }), { status: 503 })
    await store.load()
    assert.equal(store.error, 'Сервер недоступен')
    assert.equal(store.loading, false)

    globalThis.fetch = async () =>
      new Response('Internal Error', { status: 500 })
    await store.load()
    assert.equal(store.error, 'Ошибка 500')

    globalThis.fetch = async () =>
      new Response(JSON.stringify({}), { status: 404 })
    await store.load()
    assert.equal(store.error, 'Ошибка 404')

    globalThis.fetch = async () => {
      throw 'Plain string error'
    }
    await store.load()
    assert.equal(store.error, 'Не удалось загрузить данные')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('DashboardStore syncAll formats all source status variants and handles errors', async () => {
  const originalFetch = globalThis.fetch
  try {
    const store = new DashboardStore()

    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('/api/data-sync')) {
        return new Response(
          JSON.stringify({
            from: '2026-09-10',
            to: '2026-09-15',
            sources: [
              { source: 'bracelet', status: 'success', records: 5 },
              { source: 'welltory', status: 'not_run', records: 0 },
              { source: 'rescuetime', status: 'partial', records: 10 },
              { source: 'todoist', status: 'failed', records: 0 },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response(JSON.stringify(dashboard('2026-09-15T12:00:00Z')), { status: 200 })
    }

    await store.syncAll()
    assert.equal(store.syncing, false)
    assert.equal(
      store.syncMessage,
      'Браслет: новых записей 5 · Welltory: источник недоступен · RescueTime: обновлено частично · Todoist: ошибка',
    )
    assert.equal(store.error, null)

    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('/api/data-sync')) {
        throw new Error('Sync failed')
      }
      return new Response('{}', { status: 200 })
    }
    await store.syncAll()
    assert.equal(store.syncing, false)
    assert.equal(store.error, 'Sync failed')

    globalThis.fetch = async (url) => {
      if (typeof url === 'string' && url.includes('/api/data-sync')) {
        throw 'Raw failure'
      }
      return new Response('{}', { status: 200 })
    }
    await store.syncAll()
    assert.equal(store.syncing, false)
    assert.equal(store.error, 'Обновление данных не выполнено')
  } finally {
    globalThis.fetch = originalFetch
  }
})

