import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { Field, FieldInput, FieldRange, FieldSelect, FieldTextarea, Resizer, UiProvider } from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('Field', () => {
  it('ties a real label to the control', () => {
    renderUi(
      <Field label="Name">
        <FieldInput />
      </Field>,
    )
    const input = screen.getByLabelText('Name')
    expect(input.tagName).toBe('INPUT')
  })

  it('keeps a hidden label available to assistive technology', () => {
    renderUi(
      <Field label="Search" hideLabel>
        <FieldInput />
      </Field>,
    )
    expect(screen.getByLabelText('Search')).toBeTruthy()
  })

  it('links the hint and the error with aria-describedby and marks the control invalid', () => {
    renderUi(
      <Field label="Email" hint="We never share it" error="Enter a valid email">
        <FieldInput />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    const described = input.getAttribute('aria-describedby')!.split(' ')
    expect(described).toContain(screen.getByText('Enter a valid email').id)
    expect(described).toContain(screen.getByText('We never share it').id)
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('is not invalid without an error', () => {
    renderUi(
      <Field label="Email">
        <FieldInput />
      </Field>,
    )
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBeNull()
  })

  it('shows a unit, or a spinner while checking', () => {
    const { container, rerender } = renderUi(
      <Field label="Delay" unit="min">
        <FieldInput />
      </Field>,
    )
    expect(screen.getByText('min')).toBeTruthy()
    rerender(
      <UiProvider>
        <Field label="Delay" unit="min" loading>
          <FieldInput />
        </Field>
      </UiProvider>,
    )
    expect(screen.queryByText('min')).toBeNull()
    expect(container.querySelector('.kairo-ui-spin')).toBeTruthy()
  })

  it('reports typed text through onChangeText and keeps a controlled value editable', () => {
    const onChangeText = vi.fn()
    const Controlled = () => {
      const [value, setValue] = useState('')
      return (
        <Field label="Email">
          <FieldInput
            value={value}
            onChangeText={(text) => {
              onChangeText(text)
              setValue(text)
            }}
          />
        </Field>
      )
    }
    renderUi(<Controlled />)
    const input = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'user@acme.com' } })
    expect(onChangeText).toHaveBeenCalledWith('user@acme.com')
    expect(input.value).toBe('user@acme.com')
  })

  it('still calls onChange with the event', () => {
    const onChange = vi.fn()
    renderUi(
      <Field label="Email">
        <FieldInput onChange={onChange} />
      </Field>,
    )
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a' } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('reports typed text from a textarea through onChangeText', () => {
    const onChangeText = vi.fn()
    renderUi(
      <Field label="Notes">
        <FieldTextarea onChangeText={onChangeText} />
      </Field>,
    )
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'hello' } })
    expect(onChangeText).toHaveBeenCalledWith('hello')
  })

  it('works with a textarea', () => {
    renderUi(
      <Field label="Notes">
        <FieldTextarea />
      </Field>,
    )
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
  })

  it('works with a select', () => {
    const onChange = vi.fn()
    renderUi(
      <Field label="Plan">
        <FieldSelect defaultValue="pro" onValueChange={onChange}>
          <option value="pro">Pro</option>
          <option value="team">Team</option>
        </FieldSelect>
      </Field>,
    )
    const select = screen.getByLabelText('Plan') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'team' } })
    expect(select.value).toBe('team')
    expect(onChange).toHaveBeenCalledWith('team')
  })
})

describe('FieldRange', () => {
  it('shows the current value and reports changes as numbers', () => {
    const onValueChange = vi.fn()
    renderUi(
      <FieldRange
        label="Confidence"
        value={0.85}
        min={0}
        max={1}
        step={0.05}
        format={(value) => value.toFixed(2)}
        startLabel="more review"
        endLabel="more auto"
        onValueChange={onValueChange}
      />,
    )
    expect(screen.getByText('0.85')).toBeTruthy()
    expect(screen.getByText('more review')).toBeTruthy()
    const slider = screen.getByLabelText('Confidence')
    expect(slider.getAttribute('type')).toBe('range')
    fireEvent.change(slider, { target: { value: '0.9' } })
    expect(onValueChange).toHaveBeenCalledWith(0.9)
  })
})

describe('Resizer', () => {
  const setup = (props: Partial<Parameters<typeof Resizer>[0]> = {}) => {
    const onValueChange = vi.fn()
    const onCommit = vi.fn()
    const onReset = vi.fn()
    renderUi(
      <Resizer label="Resize the panel" value={400} min={340} max={600} onValueChange={onValueChange} onCommit={onCommit} onReset={onReset} {...props} />,
    )
    return { handle: screen.getByRole('separator', { name: 'Resize the panel' }), onValueChange, onCommit, onReset }
  }

  it('exposes its range as a focusable separator', () => {
    const { handle } = setup()
    expect(handle.getAttribute('aria-valuenow')).toBe('400')
    expect(handle.getAttribute('aria-valuemin')).toBe('340')
    expect(handle.getAttribute('aria-valuemax')).toBe('600')
    expect(handle.getAttribute('tabindex')).toBe('0')
  })

  it('steps with the arrow keys and respects the limits', () => {
    const { handle, onValueChange, onCommit } = setup({ value: 590 })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenLastCalledWith(600)
    expect(onCommit).toHaveBeenCalledWith(600)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onValueChange).toHaveBeenLastCalledWith(340)
  })

  it('grows to the left when it is inverted', () => {
    const { handle, onValueChange } = setup({ invert: true })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onValueChange).toHaveBeenLastCalledWith(416)
  })

  it('follows a drag and commits once when it ends', () => {
    const { handle, onValueChange, onCommit } = setup({ invert: true })
    fireEvent.pointerDown(handle, { clientX: 500 })
    fireEvent.pointerMove(handle, { clientX: 460 })
    expect(onValueChange).toHaveBeenLastCalledWith(440)
    fireEvent.pointerMove(handle, { clientX: 0 })
    expect(onValueChange).toHaveBeenLastCalledWith(600)
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.pointerUp(handle)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(document.body.style.userSelect).toBe('')
  })

  it('resets on double press', () => {
    const { handle, onReset } = setup()
    fireEvent.doubleClick(handle)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
