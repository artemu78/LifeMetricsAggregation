import assert from 'node:assert/strict'
import test from 'node:test'

import { defaultDashboardWindow, inclusiveDateCount } from '../src/dashboardWindow.ts'

const expectedWindows = [
  ['Monday', '2026-09-14T09:00:00Z', '2026-08-17', '2026-09-14', 29],
  ['Tuesday', '2026-09-15T09:00:00Z', '2026-08-17', '2026-09-15', 30],
  ['Wednesday', '2026-09-16T09:00:00Z', '2026-08-17', '2026-09-16', 31],
  ['Thursday', '2026-09-17T09:00:00Z', '2026-08-17', '2026-09-17', 32],
  ['Friday', '2026-09-18T09:00:00Z', '2026-08-17', '2026-09-18', 33],
  ['Saturday', '2026-09-19T09:00:00Z', '2026-08-17', '2026-09-19', 34],
  ['Sunday', '2026-09-20T09:00:00Z', '2026-08-24', '2026-09-20', 28],
]

for (const [weekday, timestamp, from, to, days] of expectedWindows) {
  test(`dashboard window ending on ${weekday} starts on Monday with at least 28 days`, () => {
    const actual = defaultDashboardWindow(new Date(timestamp))

    assert.deepEqual(actual, { from, to })
    assert.equal(new Date(`${actual.from}T12:00:00Z`).getUTCDay(), 1)
    assert.equal(inclusiveDateCount(actual.from, actual.to), days)
  })
}

test('dashboard day is derived in Europe/Moscow around UTC midnight', () => {
  assert.deepEqual(defaultDashboardWindow(new Date('2026-09-13T21:30:00Z')), {
    from: '2026-08-17',
    to: '2026-09-14',
  })
})
