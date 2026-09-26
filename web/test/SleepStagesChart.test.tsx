import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SleepStagesChart } from '../src/sleep/SleepStagesChart'
import { normalizeSleepPhase, extractSleepIntervals, SLEEP_PHASES } from '../src/sleep/sleepModel'
import { formatDuration } from '../src/shared/formatDuration'

describe('SleepStagesChart', () => {
  it('normalizes various sleep metric names correctly', () => {
    expect(normalizeSleepPhase('fitness_drive.sleep.deep_seconds')).toBe('deep')
    expect(normalizeSleepPhase('fitness_drive.sleep.light_seconds')).toBe('light')
    expect(normalizeSleepPhase('fitness_drive.sleep.rem_seconds')).toBe('rem')
    expect(normalizeSleepPhase('fitness_drive.sleep.awake_seconds')).toBe('awake')
    expect(normalizeSleepPhase('fitness_drive.sleep.out_of_bed_seconds')).toBe('awake')
    expect(normalizeSleepPhase('fitness_drive.sleep.sleeping_seconds')).toBe('light')
    expect(normalizeSleepPhase('fitness_drive.sleep.unknown_stage_seconds')).toBe('light')
  })

  it('formats durations correctly for all branches', () => {
    expect(formatDuration(20)).toBe('< 1 мин')
    expect(formatDuration(3600)).toBe('1 ч')
    expect(formatDuration(1800)).toBe('30 мин')
    expect(formatDuration(5400)).toBe('1 ч 30 мин')
  })

  it('renders empty message when no sleep metrics provided', () => {
    render(<SleepStagesChart sleepMetrics={[]} timezone="Europe/Moscow" />)
    expect(screen.getByText('Нет данных о фазах сна')).toBeInTheDocument()
  })

  it('extracts intervals with proper start, end, and duration', () => {
    const metrics = [
      { timestamp: 'invalid-date', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T03:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 14400 },
      { timestamp: '2026-09-15T07:00:00Z', metric: 'fitness_drive.sleep.awake_seconds', value: -10 },
      { timestamp: '2026-09-15T07:30:00Z', metric: 'fitness_drive.sleep.rem_seconds', value: null },
    ]
    const intervals = extractSleepIntervals(metrics)
    expect(intervals).toHaveLength(4)
    expect(intervals[0].phase).toBe('deep')
    expect(intervals[0].durationSec).toBe(7200)
    expect(intervals[1].phase).toBe('light')
    expect(intervals[2].phase).toBe('awake')
    expect(intervals[2].durationSec).toBe(900) // negative defaulted to 900
    expect(intervals[3].phase).toBe('rem')
    expect(intervals[3].durationSec).toBe(900) // null defaulted to 900
  })

  it('adjusts overlapping intervals so durationSec matches clipped geometry without 60s minimum', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 30 },
      { timestamp: '2026-09-15T01:00:15Z', metric: 'fitness_drive.sleep.light_seconds', value: 100 },
    ]
    const intervals = extractSleepIntervals(metrics)
    expect(intervals).toHaveLength(2)
    expect(intervals[0].end).toBe(Date.parse('2026-09-15T01:00:15Z'))
    expect(intervals[0].durationSec).toBe(15)
  })

  it('renders all phases on Y axis and SVG elements', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T03:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 14400 },
      { timestamp: '2026-09-15T07:00:00Z', metric: 'fitness_drive.sleep.awake_seconds', value: 1800 },
      { timestamp: '2026-09-15T07:30:00Z', metric: 'fitness_drive.sleep.rem_seconds', value: 1800 },
    ]
    const { container } = render(
      <SleepStagesChart sleepMetrics={metrics} timezone="Europe/Moscow" />,
    )

    // Verify all 4 phases are on the Y axis
    for (const phase of SLEEP_PHASES) {
      expect(screen.getByText(phase.label)).toBeInTheDocument()
    }

    const svg = container.querySelector('svg.sleep-chart-svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'График фаз сна на временной шкале')

    // Verify gradients exist for smooth color transition
    expect(container.querySelector('linearGradient[id^="sleep-line-gradient"]')).toBeInTheDocument()
    expect(container.querySelector('linearGradient[id^="sleep-area-gradient"]')).toBeInTheDocument()

    // Verify paths are rendered
    const paths = container.querySelectorAll('svg path')
    expect(paths.length).toBeGreaterThanOrEqual(2) // area and line
  })

  it('renders chart with single interval', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 1800 },
    ]
    const { container } = render(
      <SleepStagesChart sleepMetrics={metrics} timezone="Europe/Moscow" />,
    )
    expect(container.querySelector('svg path')).toBeInTheDocument()
  })

  it('displays hover tooltip on pointer move and handles boundary/gap coordinates', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.awake_seconds', value: 3600 },
      { timestamp: '2026-09-15T02:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T06:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 7200 },
    ]
    const { container } = render(
      <SleepStagesChart sleepMetrics={metrics} timezone="Europe/Moscow" />,
    )

    const svg = container.querySelector('svg.sleep-chart-svg')!

    svg.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 180,
      right: 800,
      bottom: 180,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    // Pointer move outside plot on left (clientX < LEFT = 72)
    fireEvent.pointerMove(svg, { clientX: 10 })
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()

    // Pointer move outside plot on right (clientX > LEFT + PLOT_WIDTH = 780)
    fireEvent.pointerMove(svg, { clientX: 790 })
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()

    // Pointer move on first interval (awake stage, exercises top clamping for tooltip)
    fireEvent.pointerMove(svg, { clientX: 100 })
    expect(container.querySelector('.sleep-hover-indicator')).toBeInTheDocument()

    // Pointer move on deep interval (exercises bottom placement for tooltip)
    fireEvent.pointerMove(svg, { clientX: 250 })
    expect(container.querySelector('.sleep-hover-indicator')).toBeInTheDocument()

    // Pointer move in gap between 04:00 (end of second) and 06:00 (start of third)
    fireEvent.pointerMove(svg, { clientX: 450 })
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()

    // Pointer leave
    fireEvent.pointerLeave(svg)
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()
  })
})

it('refreshes sleep geometry after a new snapshot and handles a subsequent empty snapshot', () => {
  const metrics = [{ timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 1800 }]
  const view = render(<SleepStagesChart sleepMetrics={metrics} timezone="Europe/Moscow" />)
  const originalPath = view.container.querySelector('path[stroke-linecap]')!.getAttribute('d')
  view.rerender(<SleepStagesChart sleepMetrics={[{ ...metrics[0], metric: 'fitness_drive.sleep.awake_seconds' }]} timezone="UTC" />)
  expect(view.container.querySelector('path[stroke-linecap]')!.getAttribute('d')).not.toBe(originalPath)
  expect(view.container.querySelector('.sleep-time-tick')).toHaveTextContent('01:00')
  view.rerender(<SleepStagesChart sleepMetrics={[]} timezone="UTC" />)
  expect(screen.getByText('Нет данных о фазах сна')).toBeInTheDocument()
  expect(view.container.querySelector('svg')).not.toBeInTheDocument()
})
