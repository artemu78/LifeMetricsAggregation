import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRescueTimeOverview,
  formatRecordTime,
  formatSleepDuration,
  formatTrackedDuration,
  isSourceAvailable,
  productivityIndexColor,
} from '../src/dayDetail.ts'

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

test('sleep duration is formatted as zero-padded hours and minutes', () => {
  assert.equal(formatSleepDuration(8 * 3600 + 30 * 60), '08:30')
  assert.equal(formatSleepDuration(45 * 60), '00:45')
  assert.equal(formatSleepDuration(150), '00:03')
  assert.equal(formatSleepDuration(null), '—')
})

test('tracked duration keeps hours compact and minutes zero-padded', () => {
  assert.equal(formatTrackedDuration(9 * 3600 + 32 * 60), '9:32')
  assert.equal(formatTrackedDuration(17 * 60), '0:17')
})

test('productivity color follows and clamps to the continuous scale', () => {
  assert.equal(productivityIndexColor(-10), 'rgb(207, 92, 79)')
  assert.equal(productivityIndexColor(45), 'rgb(171, 170, 165)')
  assert.equal(productivityIndexColor(50), 'rgb(167, 179, 174)')
  assert.equal(productivityIndexColor(100), 'rgb(77, 130, 216)')
  assert.equal(productivityIndexColor(120), 'rgb(77, 130, 216)')
})

test('isSourceAvailable evaluates availability from response and payload rather than run status', () => {
  const day = {
    bracelet: { sleepSeconds: null, steps: 5000 },
    welltory: { available: true, count: 1 },
    todoist: { created: 0, completed: 0 },
    rescuetime: { available: false, count: 0 },
    detail: {
      braceletMetrics: [],
      welltoryMetrics: [{ timestamp: '2026-09-12T08:00:00Z', metric: 'welltory.Focus', value: 80 }],
      createdTasks: [],
      completedTasks: [],
      rescueTime: [],
    },
  }

  assert.equal(isSourceAvailable(day, 'bracelet'), true)
  assert.equal(isSourceAvailable(day, 'welltory'), true)
  assert.equal(isSourceAvailable(day, 'todoist'), false)
  assert.equal(isSourceAvailable(day, 'rescuetime'), false)
})

test('isSourceAvailable detects Todoist availability from completed tasks or detail payload', () => {
  const dayWithCompleted = {
    bracelet: { sleepSeconds: null, steps: null },
    welltory: { available: false, count: 0 },
    todoist: { created: 0, completed: 2 },
    rescuetime: { available: false, count: 0 },
  }
  assert.equal(isSourceAvailable(dayWithCompleted, 'todoist'), true)

  const dayWithDetail = {
    bracelet: { sleepSeconds: null, steps: null },
    welltory: { available: false, count: 0 },
    todoist: { created: 0, completed: 0 },
    rescuetime: { available: false, count: 0 },
    detail: {
      createdTasks: [{ timestamp: '2026-09-12T10:00:00Z', content: 'Task 1' }],
    },
  }
  assert.equal(isSourceAvailable(dayWithDetail, 'todoist'), true)
})
