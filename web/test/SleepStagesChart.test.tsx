import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  SleepStagesChart,
  normalizeSleepPhase,
  extractSleepIntervals,
  SLEEP_PHASES,
} from '../src/SleepStagesChart'

describe('SleepStagesChart', () => {
  it('normalizes various sleep metric names correctly', () => {
    expect(normalizeSleepPhase('fitness_drive.sleep.deep_seconds')).toBe('deep')
    expect(normalizeSleepPhase('fitness_drive.sleep.light_seconds')).toBe('light')
    expect(normalizeSleepPhase('fitness_drive.sleep.rem_seconds')).toBe('rem')
    expect(normalizeSleepPhase('fitness_drive.sleep.awake_seconds')).toBe('awake')
    expect(normalizeSleepPhase('fitness_drive.sleep.out_of_bed_seconds')).toBe('awake')
    expect(normalizeSleepPhase('fitness_drive.sleep.sleeping_seconds')).toBe('light')
  })

  it('renders empty message when no sleep metrics provided', () => {
    render(<SleepStagesChart sleepMetrics={[]} timezone="Europe/Moscow" />)
    expect(screen.getByText('Нет данных о фазах сна')).toBeInTheDocument()
  })

  it('extracts intervals with proper start, end, and duration', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T03:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 14400 },
      { timestamp: '2026-09-15T07:00:00Z', metric: 'fitness_drive.sleep.awake_seconds', value: 1800 },
      { timestamp: '2026-09-15T07:30:00Z', metric: 'fitness_drive.sleep.rem_seconds', value: null },
    ]
    const intervals = extractSleepIntervals(metrics)
    expect(intervals).toHaveLength(4)
    expect(intervals[0].phase).toBe('deep')
    expect(intervals[0].durationSec).toBe(7200)
    expect(intervals[1].phase).toBe('light')
    expect(intervals[2].phase).toBe('awake')
    expect(intervals[3].phase).toBe('rem')
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

  it('displays hover tooltip on pointer move and hides on pointer leave', () => {
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 7200 },
      { timestamp: '2026-09-15T03:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 14400 },
    ]
    const { container } = render(
      <SleepStagesChart sleepMetrics={metrics} timezone="Europe/Moscow" />,
    )

    const svg = container.querySelector('svg.sleep-chart-svg')!

    // Mock getBoundingClientRect
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

    fireEvent.pointerMove(svg, { clientX: 200 })
    expect(container.querySelector('.sleep-hover-indicator')).toBeInTheDocument()

    fireEvent.pointerLeave(svg)
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()
  })

  it('clears hover indicator when pointer is in a gap between intervals', () => {
    // 01:00 to 02:00, then gap, then 05:00 to 06:00
    const metrics = [
      { timestamp: '2026-09-15T01:00:00Z', metric: 'fitness_drive.sleep.deep_seconds', value: 3600 },
      { timestamp: '2026-09-15T05:00:00Z', metric: 'fitness_drive.sleep.light_seconds', value: 3600 },
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

    // Pointer move in the first interval
    fireEvent.pointerMove(svg, { clientX: 100 })
    expect(container.querySelector('.sleep-hover-indicator')).toBeInTheDocument()

    // Pointer move in the gap (midway around clientX = 400)
    fireEvent.pointerMove(svg, { clientX: 400 })
    expect(container.querySelector('.sleep-hover-indicator')).not.toBeInTheDocument()
  })
})
