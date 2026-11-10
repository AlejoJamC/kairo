import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ScrollJump, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('ScrollJump', () => {
  it('draws nothing when the area does not scroll', () => {
    renderUi(<ScrollJump visible={false} direction="down" label="Go to the end" onPress={() => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a named button that reports its press, pointing down or up', () => {
    const onPress = vi.fn()
    const { rerender } = renderUi(<ScrollJump visible direction="down" label="Go to the end" onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Go to the end' })
    expect(button.getAttribute('title')).toBe('Go to the end')
    expect(button.querySelector('path')?.getAttribute('d')).toBe('m6 9 6 6 6-6')
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
    rerender(<UiProvider><ScrollJump visible direction="up" label="Go to the start" onPress={onPress} /></UiProvider>)
    expect(screen.getByRole('button', { name: 'Go to the start' }).querySelector('path')?.getAttribute('d')).toBe('m18 15-6-6-6 6')
  })
})
