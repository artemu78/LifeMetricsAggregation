import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

// Polyfill ResizeObserver for JSDOM
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // Mock implementation for JSDOM tests
  }
  unobserve() {
    // Mock implementation for JSDOM tests
  }
  disconnect() {
    // Mock implementation for JSDOM tests
  }
}

// Mock ResponsiveContainer and Tooltip for Recharts in JSDOM environment
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>()
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        'div',
        { className: 'recharts-responsive-container', style: { width: 800, height: 400 } },
        children,
      ),
    Tooltip: (props: any) => {
      if (typeof props?.formatter === 'function') {
        try {
          props.formatter(3600)
        } catch {
          // ignore
        }
      }
      return React.createElement('div', { className: 'recharts-tooltip' })
    },
  }
})
