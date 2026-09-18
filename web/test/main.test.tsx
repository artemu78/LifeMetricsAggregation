import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

describe('main.tsx', () => {
  it('mounts the application into the root element', async () => {
    document.body.innerHTML = '<div id="root"></div>'
    vi.stubGlobal('fetch', async () =>
      new Response(
        JSON.stringify({
          from: '2026-09-01',
          to: '2026-09-15',
          timezone: 'Europe/Moscow',
          days: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await import('../src/main.tsx')
    await waitFor(() => {
      expect(document.getElementById('root')?.innerHTML).not.toBe('')
    })
  })
})
