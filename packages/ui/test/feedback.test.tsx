import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { EmptyState, Kbd, KbdGroup, LoadingStatus, Skeleton, Spinner, Switch, Tooltip, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Switch', () => {
  it('exposes its state and the setting name', () => {
    renderUi(<Switch checked label="Draft replies" onCheckedChange={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Draft replies' })
    expect(control.getAttribute('aria-checked')).toBe('true')
  })

  it('reports the opposite value when pressed', () => {
    const onCheckedChange = vi.fn()
    renderUi(<Switch checked={false} label="Classify" onCheckedChange={onCheckedChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('is disabled while saving and shows a spinner', () => {
    const { container } = renderUi(<Switch checked label="Read" loading onCheckedChange={() => {}} />)
    const control = screen.getByRole('switch') as HTMLButtonElement
    expect(control.disabled).toBe(true)
    expect(container.querySelector('.kairo-ui-spin')).toBeTruthy()
  })

  it('shows the failure message as an alert', () => {
    renderUi(<Switch checked={false} label="Read" error="Could not save" onCheckedChange={() => {}} />)
    expect(screen.getByRole('alert').textContent).toBe('Could not save')
  })
})

describe('Kbd', () => {
  it('renders one element per key in a combination', () => {
    const { container } = renderUi(<KbdGroup keys={['⌘', 'K']} />)
    expect(container.querySelectorAll('kbd').length).toBe(2)
    expect(screen.getByText('⌘')).toBeTruthy()
    expect(screen.getByText('K')).toBeTruthy()
  })

  it('renders the large size', () => {
    renderUi(<Kbd size="lg">esc</Kbd>)
    expect(screen.getByText('esc')).toBeTruthy()
  })
})

describe('EmptyState', () => {
  it('shows title, explanation and the next step', () => {
    renderUi(<EmptyState title="Inbox is empty" description="New tickets appear here." action={<button>Retry</button>} />)
    expect(screen.getByText('Inbox is empty')).toBeTruthy()
    expect(screen.getByText('New tickets appear here.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('announces a load error as an alert', () => {
    renderUi(<EmptyState tone="error" title="Could not load" />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('shows a pulse dot while scanning', () => {
    const { container } = renderUi(<EmptyState scanning title="Scanning" description="Reading your inbox" />)
    expect(container.querySelector('.kairo-ui-pulse')).toBeTruthy()
  })

  it('wraps the pending text in brackets', () => {
    renderUi(<EmptyState variant="pending" title="not connected" />)
    expect(screen.getByText('[not connected]')).toBeTruthy()
  })
})

describe('Loading', () => {
  it('hides the skeleton from assistive technology', () => {
    const { container } = renderUi(<Skeleton width="50%" />)
    expect(container.querySelector('.kairo-ui-shim')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('names a spinner only when it is given a label', () => {
    renderUi(<Spinner label="Saving" />)
    expect(screen.getByRole('status', { name: 'Saving' })).toBeTruthy()
  })

  it('announces the status text, not the animation', () => {
    renderUi(<LoadingStatus>classifying</LoadingStatus>)
    expect(screen.getByRole('status').textContent).toBe('classifying')
  })

  it('injects the motion styles once, with a reduced-motion rule', () => {
    renderUi(<Skeleton />)
    renderUi(<Spinner />)
    const styles = document.querySelectorAll('#kairo-ui-motion')
    expect(styles.length).toBe(1)
    expect(styles[0]!.textContent).toContain('prefers-reduced-motion')
  })
})

describe('Tooltip', () => {
  const trigger = <button aria-label="Triage">T</button>

  it('is hidden until the pointer has rested 400ms on the trigger', () => {
    vi.useFakeTimers()
    renderUi(<Tooltip label="Triage">{trigger}</Tooltip>)
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(399))
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.getByRole('tooltip').textContent).toBe('Triage')
  })

  it('references the tooltip from the trigger while open', () => {
    vi.useFakeTimers()
    renderUi(<Tooltip label="Triage" shortcut="G T">{trigger}</Tooltip>)
    fireEvent.focus(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(0))
    const tip = screen.getByRole('tooltip')
    expect(screen.getByRole('button').getAttribute('aria-describedby')).toBe(tip.id)
    expect(tip.textContent).toContain('G T')
  })

  it('hides when the pointer leaves', () => {
    vi.useFakeTimers()
    renderUi(<Tooltip label="Triage">{trigger}</Tooltip>)
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button)
    act(() => void vi.advanceTimersByTime(400))
    fireEvent.mouseLeave(button)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('hides on esc without moving focus', () => {
    vi.useFakeTimers()
    renderUi(<Tooltip label="Triage">{trigger}</Tooltip>)
    const button = screen.getByRole('button')
    button.focus()
    fireEvent.focus(button)
    act(() => void vi.advanceTimersByTime(0))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('is not shown for a disabled trigger', () => {
    vi.useFakeTimers()
    renderUi(
      <Tooltip label="Triage">
        <button disabled>T</button>
      </Tooltip>,
    )
    fireEvent.mouseEnter(screen.getByRole('button'))
    act(() => void vi.advanceTimersByTime(1000))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('keeps the trigger own handlers', () => {
    const onFocus = vi.fn()
    renderUi(
      <Tooltip label="Triage">
        <button onFocus={onFocus}>T</button>
      </Tooltip>,
    )
    fireEvent.focus(screen.getByRole('button'))
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})
