import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Button, Icon, IconButton, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('Button', () => {
  it.each(['secondary', 'primary', 'ghost', 'link'] as const)('renders the %s variant as a real button', (variant) => {
    renderUi(<Button variant={variant}>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).tagName).toBe('BUTTON')
  })

  it('calls onPress', () => {
    const onPress = vi.fn()
    renderUi(<Button onPress={onPress}>Resolve</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is disabled and silent when disabled', () => {
    renderUi(<Button disabled>Resolve</Button>)
    const button = screen.getByRole('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows a spinner and the progress label while loading, and cannot be pressed', () => {
    const { container } = renderUi(
      <Button variant="primary" loading loadingLabel="Saving…">
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(container.querySelector('.kairo-ui-spin')).toBeTruthy()
  })

  it('shows the leading icon when idle', () => {
    renderUi(<Button icon={<Icon name="check" label="done" />}>Resolve</Button>)
    expect(screen.getByRole('img', { name: 'done' })).toBeTruthy()
  })

  it('carries the shortcut in its title', () => {
    renderUi(<Button shortcut="R">Resolve</Button>)
    expect(screen.getByRole('button').getAttribute('title')).toBe('Resolve (R)')
  })
})

describe('IconButton', () => {
  it('is named by its label', () => {
    const onPress = vi.fn()
    renderUi(
      <IconButton label="Copy link" shortcut="L" onPress={onPress}>
        <Icon name="link" />
      </IconButton>,
    )
    const button = screen.getByRole('button', { name: 'Copy link' })
    expect(button.getAttribute('title')).toBe('Copy link (L)')
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
