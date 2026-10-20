import type { ChangeEvent, FocusEvent, KeyboardEvent, MouseEvent, Ref, SyntheticEvent } from 'react'
import { styled, Text as TamaguiText, type GetProps } from '@tamagui/core'
import { domProps } from './lib/dom-props'

// Form controls without the design chrome of Field: real <input>, <textarea> and
// <select> elements that take the same style props as Text. They keep the DOM's
// value / onChange contract, so a custom-looking control (a borderless composer,
// a compact filter) does not need an inline style.

const reset = {
  color: 'inherit' as never,
  fontFamily: 'inherit' as never,
  fontSize: 'inherit' as never,
  fontWeight: 'inherit' as never,
  lineHeight: 'inherit' as never,
  letterSpacing: 'inherit' as never,
  margin: 0,
  display: 'inline-block' as never,
} as const

const InputFrame = styled(TamaguiText, { name: 'KairoPlainInput', tag: 'input', ...reset })
const TextareaFrame = styled(TamaguiText, { name: 'KairoPlainTextarea', tag: 'textarea', ...reset })
const SelectFrame = styled(TamaguiText, { name: 'KairoPlainSelect', tag: 'select', ...reset })

type DomControl<E extends HTMLElement> = {
  value?: string | number
  defaultValue?: string | number
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  minLength?: number
  autoFocus?: boolean
  name?: string
  id?: string
  title?: string
  ref?: Ref<E>
  onChange?: (event: ChangeEvent<E>) => void
  onFocus?: (event: FocusEvent<E>) => void
  onBlur?: (event: FocusEvent<E>) => void
  onKeyDown?: (event: KeyboardEvent<E>) => void
  onKeyUp?: (event: KeyboardEvent<E>) => void
  onClick?: (event: MouseEvent<E>) => void
  onSelect?: (event: SyntheticEvent<E>) => void
  checked?: boolean
  resize?: 'none' | 'vertical' | 'horizontal' | 'both'
  accentColor?: string
}


type PlainInputProps = DomControl<HTMLInputElement> &
  Omit<GetProps<typeof InputFrame>, keyof DomControl<HTMLInputElement> | 'children'> & {
    type?: string
    min?: number
    max?: number
    step?: number
    autoComplete?: string
  }
type PlainTextareaProps = DomControl<HTMLTextAreaElement> &
  Omit<GetProps<typeof TextareaFrame>, keyof DomControl<HTMLTextAreaElement> | 'children'> & {
    rows?: number
    maxLength?: number
  }
type PlainSelectProps = DomControl<HTMLSelectElement> &
  Omit<GetProps<typeof SelectFrame>, keyof DomControl<HTMLSelectElement>>

const DOM_KEYS = [
  'value', 'defaultValue', 'placeholder', 'disabled', 'readOnly', 'autoFocus', 'name', 'id', 'title', 'ref', 'onChange',
  'onFocus', 'onBlur', 'onKeyDown', 'onKeyUp', 'onClick', 'onSelect', 'checked', 'type', 'min', 'max', 'step', 'autoComplete', 'rows', 'maxLength',
] as const

function forward(props: Record<string, unknown>) {
  const dom: Record<string, unknown> = {}
  const style: Record<string, unknown> = {}
  const rest: Record<string, unknown> = { ...props }
  for (const key of DOM_KEYS) {
    if (key in rest) {
      dom[key] = rest[key]
      delete rest[key]
    }
  }
  for (const key of ['resize', 'accentColor'] as const) {
    if (key in rest) {
      style[key] = rest[key]
      delete rest[key]
    }
  }
  return { rest, extra: domProps({ ...dom, ...(Object.keys(style).length ? { style } : null) }) }
}

function PlainInput(props: PlainInputProps) {
  const { rest, extra } = forward(props as Record<string, unknown>)
  return <InputFrame {...(rest as object)} {...extra} />
}

function PlainTextarea(props: PlainTextareaProps) {
  const { rest, extra } = forward(props as Record<string, unknown>)
  return <TextareaFrame {...(rest as object)} {...extra} />
}

function PlainSelect({ children, ...props }: PlainSelectProps & { children?: React.ReactNode }) {
  const { rest, extra } = forward(props as Record<string, unknown>)
  return (
    <SelectFrame {...(rest as object)} {...extra}>
      {children}
    </SelectFrame>
  )
}

export { PlainInput, PlainTextarea, PlainSelect }
export type { PlainInputProps, PlainTextareaProps, PlainSelectProps }
