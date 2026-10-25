import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { Input as TamaguiInput, TextArea as TamaguiTextArea } from '@tamagui/input'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/overlay'
import { Icon } from './icon'
import { Spinner } from './loading'
import { px } from './lib/units'

// Text input, select, textarea or range with its label. The label is always a
// real <label>; hint and error are linked with aria-describedby.

const control = {
  backgroundColor: tokens['surface.sunken'],
  borderWidth: 1,
  borderColor: tokens['border.default'],
  borderRadius: px(tokens['radius.field']),
  color: tokens['text.primary'],
  paddingHorizontal: 11,
  width: '100%',
  outlineWidth: 0,
  hoverStyle: { borderColor: tokens['border.strong'] },
  focusStyle: { borderColor: tokens['accent.line'], boxShadow: `0 0 0 3px ${tokens['accent.soft']}` },
} as const

const variants = {
  size: {
    app: { height: px(tokens['size.field']), fontSize: 13 },
    web: { height: 40, paddingVertical: 8, fontSize: 14 },
  },
  invalid: { true: { borderColor: tokens['color.bad-line'] } },
  readOnly: { true: { backgroundColor: tokens['surface.hover'], color: tokens['text.secondary'] } },
} as const

const InputFrame = styled(TamaguiInput, {
  name: 'FieldInput',
  unstyled: true,
  ...control,
  variants,
  defaultVariants: { size: 'app' },
})

const TextareaFrame = styled(TamaguiTextArea, {
  name: 'FieldTextarea',
  unstyled: true,
  ...control,
  height: undefined,
  minHeight: 72,
  paddingVertical: 8,
  variants: {
    ...variants,
    size: {
      app: { fontSize: 13, height: undefined },
      web: { fontSize: 14, height: undefined },
    },
  },
  defaultVariants: { size: 'app' },
})

const SelectFrame = styled(Stack, {
  name: 'FieldSelect',
  tag: 'select',
  ...control,
  cursor: 'pointer',
  variants,
  defaultVariants: { size: 'app' },
})

const PLACEHOLDER = tokens['text.tertiary'] as never

type TextChange = { onChange?: unknown; onChangeText?: (text: string) => void }

/** Tamagui's web inputs drop onChangeText, so the text is read from the change event. */
function textChange({ onChange, onChangeText }: TextChange) {
  return domProps({
    onChange: (event: { target: { value: string } }) => {
      if (typeof onChange === 'function') onChange(event)
      onChangeText?.(event.target.value)
    },
  })
}

function FieldInput(props: GetProps<typeof InputFrame>) {
  return <InputFrame placeholderTextColor={PLACEHOLDER} {...props} {...textChange(props)} />
}

function FieldTextarea(props: GetProps<typeof TextareaFrame>) {
  return <TextareaFrame placeholderTextColor={PLACEHOLDER} {...props} {...textChange(props)} />
}

type FieldSelectProps = Omit<GetProps<typeof SelectFrame>, 'children' | 'onChange' | 'value'> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** <option> elements. */
  children: ReactNode
}

/**
 * Native <select>, so the platform picker and keyboard behaviour come for free,
 * drawn like the other fields: the control font, no browser arrow, and our own
 * chevron. The width props size the whole control.
 */
function FieldSelect({ value, defaultValue, onValueChange, children, width, minWidth, maxWidth, ...props }: FieldSelectProps) {
  return (
    <Stack position="relative" width={width ?? '100%'} minWidth={minWidth} maxWidth={maxWidth} flexShrink={0}>
      <SelectFrame
        {...props}
        paddingRight={32}
        {...domProps({
          value,
          defaultValue,
          style: {
            appearance: 'none',
            WebkitAppearance: 'none',
            fontFamily: tokens['font.family.sans'],
            // The text sits on the middle of the control: its height minus the borders.
            fontSize: props.size === 'web' ? 14 : 13,
            lineHeight: props.size === 'web' ? '38px' : '34px',
          },
          onChange: (event: { target: { value: string } }) => onValueChange?.(event.target.value),
        })}
      >
        {children}
      </SelectFrame>
      <Stack position="absolute" right={11} top={0} bottom={0} alignItems="center" justifyContent="center" pointerEvents="none" aria-hidden>
        <Icon name="down" size={12} color={tokens['text.tertiary']} />
      </Stack>
    </Stack>
  )
}

const Wrapper = styled(Stack, { name: 'Field', gap: 6 })

const FieldLabel = styled(Text, {
  name: 'FieldLabel',
  tag: 'label',
  variants: {
    size: {
      app: {
        fontFamily: '$mono',
        fontSize: 10.5,
        letterSpacing: 0.63,
        textTransform: 'uppercase',
        color: tokens['text.tertiary'],
      },
      web: { fontSize: 12.5, fontWeight: '500', color: tokens['text.primary'] },
    },
    hidden: {
      true: {
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
      },
    },
  } as const,
  defaultVariants: { size: 'app' },
})

const Adornment = styled(Stack, {
  name: 'FieldAdornment',
  position: 'absolute',
  right: 11,
  top: 0,
  bottom: 0,
  justifyContent: 'center',
  pointerEvents: 'none',
})

const Unit = styled(Text, {
  name: 'FieldUnit',
  fontFamily: '$mono',
  fontSize: 12,
  color: tokens['text.tertiary'],
})

const Message = styled(Text, {
  name: 'FieldMessage',
  fontSize: 12,
  lineHeight: 17,
  variants: {
    tone: {
      hint: { color: tokens['text.tertiary'] },
      error: { color: tokens['color.bad-ink'] },
    },
  } as const,
})

type FieldProps = {
  label: string
  /** Visually hidden label for controls whose purpose is clear from context. */
  hideLabel?: boolean
  hint?: string
  /** Message under the field; marks the control invalid. */
  error?: string
  /** Mono unit inside the field, on the right (for example "min"). */
  unit?: string
  /** Asynchronous check in progress: spinner inside the field. */
  loading?: boolean
  size?: 'app' | 'web'
  /** The single control: FieldInput, FieldTextarea, FieldSelect or a native element. */
  children: ReactElement<Record<string, unknown>>
}

function Field({ label, hideLabel, hint, error, unit, loading, size = 'app', children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : undefined, hint ? hintId : undefined, children.props['aria-describedby']]
    .filter(Boolean)
    .join(' ')

  const decorated = cloneElement(children, {
    id,
    size,
    invalid: error ? true : undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
    ...(unit || loading ? { paddingRight: unit ? 44 : 30 } : null),
  })

  return (
    <Wrapper>
      <FieldLabel htmlFor={id} size={size} hidden={hideLabel}>
        {label}
      </FieldLabel>
      <Stack position="relative">
        {decorated}
        {(unit || loading) && (
          <Adornment>{loading ? <Spinner /> : <Unit>{unit}</Unit>}</Adornment>
        )}
      </Stack>
      {error && (
        <Message id={errorId} tone="error">
          {error}
        </Message>
      )}
      {hint && (
        <Message id={hintId} tone="hint">
          {hint}
        </Message>
      )}
    </Wrapper>
  )
}

// ─── range ───────────────────────────────────────────────────────────────────

const RangeRow = styled(Stack, { name: 'FieldRange', gap: 6 })

const RangeValue = styled(Text, {
  name: 'FieldRangeValue',
  fontFamily: '$mono',
  fontSize: 18,
  color: tokens['accent.ink'],
})

const RangeEnds = styled(Stack, {
  name: 'FieldRangeEnds',
  flexDirection: 'row',
  justifyContent: 'space-between',
})

const RangeEnd = styled(Text, {
  name: 'FieldRangeEnd',
  fontFamily: '$mono',
  fontSize: 11,
  color: tokens['text.tertiary'],
})

const RangeInput = styled(Stack, {
  name: 'FieldRangeInput',
  tag: 'input',
  width: '100%',
  cursor: 'pointer',
})

type FieldRangeProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  /** Current value as shown, for example "0.85". */
  format?: (value: number) => string
  startLabel?: string
  endLabel?: string
  hint?: string
}

function FieldRange({ label, value, min, max, step = 1, onValueChange, format, startLabel, endLabel, hint }: FieldRangeProps) {
  const id = useId()
  const shown = format ? format(value) : String(value)
  return (
    <RangeRow>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <RangeValue>{shown}</RangeValue>
      <RangeInput
        id={id}
        {...domProps({
          type: 'range',
          min,
          max,
          step,
          value,
          style: { accentColor: tokens['accent.default'] },
          onChange: (event: { target: { value: string } }) => onValueChange(Number(event.target.value)),
        })}
        aria-valuetext={shown}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {(startLabel || endLabel) && (
        <RangeEnds>
          <RangeEnd>{startLabel}</RangeEnd>
          <RangeEnd>{endLabel}</RangeEnd>
        </RangeEnds>
      )}
      {hint && (
        <Message id={`${id}-hint`} tone="hint">
          {hint}
        </Message>
      )}
    </RangeRow>
  )
}

type FieldControlProps = GetProps<typeof FieldInput>

export { Field, FieldInput, FieldLabel, FieldTextarea, FieldSelect, FieldRange }
export type { FieldProps, FieldRangeProps, FieldControlProps, FieldSelectProps }
export type { ReactNode as FieldChildren }
