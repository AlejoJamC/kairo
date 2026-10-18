import { useEffect } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { ensureMotionStyles } from './lib/motion-css'
import { Spinner } from './loading'

// Turns a setting on or off with immediate effect. Off: border.strong track;
// on: accent track with the knob moved 16px. While saving the control is
// disabled and a spinner sits beside it; on a failed save the caller returns
// `checked` to its previous value and passes `error`.

const Track = styled(Stack, {
  name: 'Switch',
  tag: 'button',
  width: 36,
  height: 20,
  borderRadius: 999,
  padding: 2,
  borderWidth: 0,
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  backgroundColor: tokens['border.strong'],
  hoverStyle: { backgroundColor: tokens['color.faint'] },
  focusVisibleStyle: { outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens['border.focus'], outlineOffset: 2 },
  variants: {
    checked: {
      true: { backgroundColor: tokens['accent.default'], hoverStyle: { backgroundColor: tokens['accent.hover'] } },
    },
    disabled: {
      true: { opacity: 0.6, cursor: 'not-allowed', pointerEvents: 'none' },
    },
  } as const,
})

const Knob = styled(Stack, {
  name: 'SwitchKnob',
  width: 16,
  height: 16,
  borderRadius: 999,
  backgroundColor: tokens['surface.panel'],
  boxShadow: tokens['shadow.knob'],
})

const Row = styled(Stack, {
  name: 'SwitchRow',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
})

const ErrorText = styled(Text, {
  name: 'SwitchError',
  fontSize: 12,
  color: tokens['color.bad-ink'],
})

type SwitchProps = Omit<GetProps<typeof Track>, 'checked' | 'onPress' | 'children'> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Name of the setting; required ones read "[permission], required". */
  label: string
  loading?: boolean
  /** Message shown beside the control after a failed save. */
  error?: string
}

function Switch({ checked, onCheckedChange, label, loading, error, disabled, ...props }: SwitchProps) {
  useEffect(ensureMotionStyles, [])
  return (
    <Row>
      <Track
        role="switch"
        aria-checked={checked}
        aria-label={label}
        checked={checked}
        disabled={disabled || loading}
        onPress={() => onCheckedChange(!checked)}
        {...props}
      >
        <Knob className="kairo-ui-knob" x={checked ? 16 : 0} />
      </Track>
      {loading && <Spinner />}
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </Row>
  )
}

export { Switch }
export type { SwitchProps }
