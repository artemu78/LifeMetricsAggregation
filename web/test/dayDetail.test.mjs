import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRescueTimeOverview, formatRecordTime } from '../src/dayDetail.ts'

test('RescueTime overview totals activity without double-counting productivity', () => {
  const overview = buildRescueTimeOverview([
    { timestamp: '2026-09-12T06:00:00Z', perspective: 'activity', label: 'Development', seconds: 600 },
    { timestamp: '2026-09-12T07:00:00Z', perspective: 'activity', label: 'Learning', seconds: 400 },
    { timestamp: '2026-09-12T06:00:00Z', perspective: 'productivity', label: '2', seconds: 800 },
    { timestamp: '2026-09-12T07:00:00Z', perspective: 'productivity', label: '-2', seconds: 200 },
  ])

  assert.equal(overview.totalTrackedSeconds, 1000)
  assert.equal(overview.productivityIndex, 80)
  assert.deepEqual(
    overview.categories.map(({ label, percentage }) => [label, percentage]),
    [['Development', 60], ['Learning', 40]],
  )
})

test('record timestamps are formatted in the dashboard timezone', () => {
  assert.equal(formatRecordTime('2026-09-12T21:30:00Z', 'Europe/Moscow'), '00:30')
})
