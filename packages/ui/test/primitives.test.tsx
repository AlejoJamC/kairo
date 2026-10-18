import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Avatar, Badge, CategoryChip, Chip, PriorityGlyph, UiProvider, avatarColor, getInitials } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

describe('PriorityGlyph', () => {
  it.each(['P1', 'P2', 'P3'])('shows the %s label and is named for assistive technology', (level) => {
    renderUi(<PriorityGlyph priority={level} />)
    expect(screen.getByRole('img', { name: level })).toBeTruthy()
    expect(screen.getByText(level)).toBeTruthy()
  })

  it('can hide the label and still names the glyph', () => {
    renderUi(<PriorityGlyph priority="P2" label={false} />)
    expect(screen.queryByText('P2')).toBeNull()
    expect(screen.getByRole('img', { name: 'P2' })).toBeTruthy()
  })

  it.each([null, undefined, 'P4', ''])('renders nothing for %s', (value) => {
    const { container } = renderUi(<PriorityGlyph priority={value} />)
    expect(container.textContent).toBe('')
  })
})

describe('Chip', () => {
  it('is static text without a handler', () => {
    renderUi(<Chip>pro</Chip>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('pro')).toBeTruthy()
  })

  it('becomes a button that reports its selected state and handles press', () => {
    const onPress = vi.fn()
    renderUi(<Chip onPress={onPress} selected>all</Chip>)
    const chip = screen.getByRole('button', { name: 'all' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(chip)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})

describe('CategoryChip', () => {
  it('always shows the translated name', () => {
    renderUi(<CategoryChip scale="ticketType" value="prospect" label="lead" />)
    expect(screen.getByText('lead')).toBeTruthy()
  })

  it('falls back to a neutral dot for an unknown value', () => {
    expect(() => renderUi(<CategoryChip scale="category" value="unknown" label="other" />)).not.toThrow()
  })
})

describe('Badge', () => {
  it.each(['count', 'mention', 'team', 'ai', 'draft', 'outline', 'sent', 'beta', 'escalated'] as const)(
    'renders the %s variant',
    (variant) => {
      renderUi(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant)).toBeTruthy()
    },
  )
})

describe('Avatar', () => {
  it.each([
    [{ name: 'Diana Ruiz' }, 'DR'],
    [{ name: 'diana' }, 'DI'],
    [{ name: '  ', email: 'zoe@acme.com' }, 'Z'],
    [{}, '?'],
  ])('derives initials from %j', (input, expected) => {
    expect(getInitials(input.name, (input as { email?: string }).email)).toBe(expected)
  })

  it('keeps the same color for the same identity', () => {
    expect(avatarColor('support@acme.com')).toBe(avatarColor('support@acme.com'))
  })

  it('renders the initials', () => {
    renderUi(<Avatar name="Diana Ruiz" />)
    expect(screen.getByText('DR')).toBeTruthy()
  })
})
