import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Callout, FilterPill, KpiStrip, NavItem, PropRow, Segmented, Tab, Tabs, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('Tabs', () => {
  it('is a tablist of tabs that report selection', () => {
    const onPress = vi.fn()
    renderUi(
      <Tabs label="Context">
        <Tab selected onPress={() => {}}>Client</Tab>
        <Tab selected={false} onPress={onPress} count={3} unread>Notes</Tab>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: 'Context' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Client' }).getAttribute('aria-selected')).toBe('true')
    const notes = screen.getByRole('tab', { name: /Notes/ })
    expect(notes.getAttribute('aria-selected')).toBe('false')
    expect(notes.textContent).toContain('3')
    fireEvent.click(notes)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('ignores presses on a disabled tab and marks it', () => {
    const onPress = vi.fn()
    renderUi(
      <Tabs label="Context">
        <Tab selected={false} onPress={onPress} disabled>Similar</Tab>
      </Tabs>,
    )
    const tab = screen.getByRole('tab', { name: 'Similar' })
    expect(tab.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(tab)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows the AI dot', () => {
    const { container } = renderUi(
      <Tabs label="Context">
        <Tab selected onPress={() => {}} ai>Assistant</Tab>
      </Tabs>,
    )
    expect(container.querySelector('.kairo-ui-pulse')).toBeTruthy()
  })
})

describe('Segmented', () => {
  const items = [
    { value: 'reply', label: 'Reply' },
    { value: 'note', label: 'Internal note', tone: 'note' as const },
  ]

  it('works as a tablist and reports the chosen mode', () => {
    const onChange = vi.fn()
    renderUi(<Segmented label="Mode" items={items} value="reply" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Reply' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Internal note' }))
    expect(onChange).toHaveBeenCalledWith('note')
  })

  it('works as a group of toggle buttons', () => {
    renderUi(<Segmented label="Language" semantics="group" items={[{ value: 'es', label: 'ES' }, { value: 'en', label: 'EN' }]} value="en" onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'EN' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'ES' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows counts and skips disabled segments', () => {
    const onChange = vi.fn()
    renderUi(
      <Segmented
        label="Priority"
        items={[{ value: 'all', label: 'All', count: 12 }, { value: 'p1', label: 'P1', disabled: true }]}
        value="all"
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('tab', { name: /All/ }).textContent).toContain('12')
    fireEvent.click(screen.getByRole('tab', { name: 'P1' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('FilterPill', () => {
  it('is a toggle button with an optional count', () => {
    const onPress = vi.fn()
    renderUi(<FilterPill active count={4} onPress={onPress}>Pro</FilterPill>)
    const pill = screen.getByRole('button', { name: /Pro/ })
    expect(pill.getAttribute('aria-pressed')).toBe('true')
    expect(pill.textContent).toContain('4')
    fireEvent.click(pill)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', () => {
    const onPress = vi.fn()
    renderUi(<FilterPill disabled onPress={onPress}>Pro</FilterPill>)
    fireEvent.click(screen.getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('NavItem', () => {
  it('marks the current page and shows the count', () => {
    renderUi(<NavItem icon="triage" label="Triage" active count={7} onPress={() => {}} />)
    const item = screen.getByRole('button', { name: /Triage/ })
    expect(item.getAttribute('aria-current')).toBe('page')
    expect(item.textContent).toContain('7')
  })

  it('collapses to the icon and keeps the label in the title', () => {
    renderUi(<NavItem icon="triage" label="Triage" collapsed count={7} onPress={() => {}} />)
    const item = screen.getByRole('button')
    expect(item.getAttribute('title')).toBe('Triage')
    expect(item.textContent).toBe('')
  })

  it('shows a dash when the count failed to load and hides it when disabled', () => {
    const { rerender } = renderUi(<NavItem icon="clients" label="Clients" countError onPress={() => {}} />)
    expect(screen.getByRole('button').textContent).toContain('—')
    rerender(
      <UiProvider>
        <NavItem icon="clients" label="Clients" count={3} disabled onPress={() => {}} />
      </UiProvider>,
    )
    expect(screen.getByRole('button').textContent).not.toContain('3')
    expect(screen.getByRole('button').getAttribute('aria-disabled')).toBe('true')
  })

  it('shows the live dot while updating and reports presses', () => {
    const onPress = vi.fn()
    const { container } = renderUi(<NavItem icon="triage" label="Triage" live count={1} onPress={onPress} />)
    expect(container.querySelector('.kairo-ui-pulse')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('KpiStrip', () => {
  const items = [
    { label: 'Active', value: '3 / 5' },
    { label: 'MRR', value: null },
    { label: 'Urgent', value: 2, urgent: true },
  ]

  it('shows each label with its value and a dash for unknown values', () => {
    renderUi(<KpiStrip items={items} />)
    expect(screen.getByText('Active')).toBeTruthy()
    expect(screen.getByText('3 / 5')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('replaces values with skeletons while loading', () => {
    const { container } = renderUi(<KpiStrip items={items} loading />)
    expect(container.querySelectorAll('.kairo-ui-shim').length).toBe(3)
    expect(screen.queryByText('3 / 5')).toBeNull()
  })

  it('shows dashes, an alert line and a retry on error', () => {
    const onRetry = vi.fn()
    renderUi(<KpiStrip items={items} error="Could not load" retryLabel="Retry" onRetry={onRetry} />)
    expect(screen.getAllByText('—').length).toBe(3)
    expect(screen.getByRole('alert').textContent).toContain('Could not load')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('PropRow', () => {
  it('shows the key and value, or a dash when unknown', () => {
    renderUi(
      <>
        <PropRow label="Plan">Pro</PropRow>
        <PropRow label="Phone">{null}</PropRow>
      </>,
    )
    expect(screen.getByText('Plan')).toBeTruthy()
    expect(screen.getByText('Pro')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
  })
})

describe('Callout', () => {
  it('announces an error as an alert', () => {
    renderUi(<Callout tone="error">Failed</Callout>)
    expect(screen.getByRole('alert').textContent).toBe('Failed')
  })

  it('is not an alert in the other tones', () => {
    renderUi(<Callout tone="ai">Hint</Callout>)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers an action and a dismiss', () => {
    const onAction = vi.fn()
    const onDismiss = vi.fn()
    renderUi(
      <Callout tone="ai" actionLabel="Apply" onAction={onAction} dismissLabel="Dismiss" onDismiss={onDismiss}>
        Related ticket
      </Callout>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
