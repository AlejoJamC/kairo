import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Box, PlainInput, PlainSelect, PlainTextarea, Pressable, Text, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('Box', () => {
  it('renders a div by default and keeps a semantic tag when asked', () => {
    const { container } = renderUi(
      <Box>
        <Box tag="ul">
          <Box tag="li">item</Box>
        </Box>
      </Box>,
    )
    expect(container.querySelector('div')).toBeTruthy()
    expect(container.querySelector('ul > li')?.textContent).toBe('item')
  })

  it('forwards title, role, aria attributes and DOM events', () => {
    const onClick = vi.fn()
    const onKeyDown = vi.fn()
    renderUi(
      <Box title="Open" role="button" aria-label="Open thing" tabIndex={0} onClick={onClick} onKeyDown={onKeyDown}>
        x
      </Box>,
    )
    const el = screen.getByRole('button', { name: 'Open thing' })
    expect(el.getAttribute('title')).toBe('Open')
    fireEvent.click(el)
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onKeyDown).toHaveBeenCalledTimes(1)
  })

  it('accepts any ARIA role, including ones the typed list omits', () => {
    renderUi(<Box role="listbox">options</Box>)
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('forwards a ref to the element', () => {
    let node: HTMLElement | null = null
    renderUi(<Box ref={(el) => { node = el }}>x</Box>)
    expect(node).toBeInstanceOf(HTMLElement)
  })

  it('applies the web-only CSS properties through its own style', () => {
    renderUi(
      <Box gridTemplateColumns="1fr 2fr" transition="background 0.1s" overflowX="hidden" lineHeightRatio={1.5} boxSizing="content-box">
        grid
      </Box>,
    )
    const style = screen.getByText('grid').getAttribute('style') ?? ''
    expect(style).toContain('grid-template-columns: 1fr 2fr')
    expect(style).toContain('transition: background 0.1s')
    expect(style).toContain('overflow-x: hidden')
    expect(style).toContain('line-height: 1.5')
    expect(style).toContain('box-sizing: content-box')
  })

  it('clamps text to a number of lines', () => {
    renderUi(<Text lineClamp={2}>long</Text>)
    const style = screen.getByText('long').getAttribute('style') ?? ''
    expect(style).toContain('-webkit-line-clamp: 2')
    expect(style).toContain('overflow: hidden')
  })

  it('adds the entrance and pulse motion classes and injects their styles', () => {
    const { container } = renderUi(
      <>
        <Box fadeIn>a</Box>
        <Box pulse>b</Box>
      </>,
    )
    expect(container.querySelector('.kairo-ui-fade')).toBeTruthy()
    expect(container.querySelector('.kairo-ui-pulse')).toBeTruthy()
    expect(document.getElementById('kairo-ui-motion')?.textContent).toContain('kairo-ui-fade')
  })

  it('adds no inline style when no web-only prop is set', () => {
    renderUi(<Box>plain</Box>)
    expect(screen.getByText('plain').getAttribute('style')).toBeNull()
  })
})

describe('Text', () => {
  it('is a span and takes a custom tag', () => {
    renderUi(
      <>
        <Text>first</Text>
        <Text tag="h2">second</Text>
      </>,
    )
    expect(screen.getByText('first').tagName).toBe('SPAN')
    expect(screen.getByText('second').tagName).toBe('H2')
  })

  it('accepts a relative font size', () => {
    renderUi(<Text fontSize="0.9em">sized</Text>)
    expect(screen.getByText('sized').className).toMatch(/_fs-0\S*9em/)
  })
})

describe('Pressable', () => {
  it('is a real button that reports presses and respects disabled and type', () => {
    const onClick = vi.fn()
    renderUi(
      <>
        <Pressable type="button" onClick={onClick}>
          Go
        </Pressable>
        <Pressable type="submit" disabled>
          Stop
        </Pressable>
      </>,
    )
    const go = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement
    expect(go.tagName).toBe('BUTTON')
    expect(go.type).toBe('button')
    fireEvent.click(go)
    expect(onClick).toHaveBeenCalledTimes(1)
    const stop = screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement
    expect(stop.disabled).toBe(true)
    expect(stop.type).toBe('submit')
  })

  it('forwards hover and focus events', () => {
    const onMouseEnter = vi.fn()
    const onFocus = vi.fn()
    renderUi(
      <Pressable onMouseEnter={onMouseEnter} onFocus={onFocus}>
        Hover
      </Pressable>,
    )
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button)
    fireEvent.focus(button)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})

describe('Plain controls', () => {
  it('PlainInput keeps the DOM value / onChange contract', () => {
    const onChange = vi.fn()
    renderUi(<PlainInput aria-label="Name" value="Ada" onChange={onChange} placeholder="Name" />)
    const input = screen.getByLabelText('Name') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.value).toBe('Ada')
    fireEvent.change(input, { target: { value: 'Grace' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('PlainInput supports checkboxes and ranges', () => {
    const onChange = vi.fn()
    renderUi(
      <>
        <PlainInput type="checkbox" aria-label="Pick" checked onChange={onChange} />
        <PlainInput type="range" aria-label="Level" min={0} max={10} step={1} defaultValue={3} />
      </>,
    )
    expect((screen.getByLabelText('Pick') as HTMLInputElement).checked).toBe(true)
    const range = screen.getByLabelText('Level') as HTMLInputElement
    expect(range.min).toBe('0')
    expect(range.max).toBe('10')
  })

  it('PlainTextarea passes rows, maxLength and resize', () => {
    renderUi(<PlainTextarea aria-label="Notes" rows={3} maxLength={50} resize="none" />)
    const area = screen.getByLabelText('Notes') as HTMLTextAreaElement
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.rows).toBe(3)
    expect(area.maxLength).toBe(50)
    expect(area.style.resize).toBe('none')
  })

  it('PlainSelect renders its options and reports changes', () => {
    const onChange = vi.fn()
    renderUi(
      <PlainSelect aria-label="Plan" defaultValue="pro" onChange={onChange}>
        <option value="pro">Pro</option>
        <option value="team">Team</option>
      </PlainSelect>,
    )
    const select = screen.getByLabelText('Plan') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'team' } })
    expect(select.value).toBe('team')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
