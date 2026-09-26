import { StrictMode, useRef } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useModalDismissAndTrapFocus } from '../src/shared/useModalDismissAndTrapFocus'

function Modal() {
  const ref = useRef<HTMLDialogElement>(null)
  useModalDismissAndTrapFocus(ref, () => {})
  return <dialog ref={ref} open tabIndex={-1}>Modal</dialog>
}

afterEach(() => {
  cleanup()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  document.body.style.overflow = ''
})

describe('modal focus restoration', () => {
  it.each([false, true])('restores focus after removal (Strict Mode: %s)', (strict) => {
    vi.useFakeTimers()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    document.body.style.overflow = 'auto'
    const { unmount } = render(strict ? <StrictMode><Modal /></StrictMode> : <Modal />)
    expect(screen.getByRole('dialog')).toHaveFocus()
    act(() => vi.advanceTimersToNextFrame())
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(opener).not.toHaveFocus()
    expect(document.body.style.overflow).toBe('auto')
    act(() => vi.advanceTimersToNextFrame())
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('does not focus an opener removed before the restoration frame', () => {
    vi.useFakeTimers()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<Modal />)
    const focus = vi.spyOn(opener, 'focus')
    unmount()
    opener.remove()
    act(() => vi.advanceTimersToNextFrame())
    expect(focus).not.toHaveBeenCalled()
  })
})
