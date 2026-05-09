import { styled, type GetProps } from '@tamagui/core'
import { Input as TamaguiInput } from '@tamagui/input'

// ─── Styled primitive ────────────────────────────────────────────────────────
// Built on @tamagui/input which normalises:
//   web  → value + onChange
//   RN   → value + onChangeText
// `unstyled` opts out of the package's default tokens so we can apply
// the Kairo design system values directly.

const InputFrame = styled(TamaguiInput, {
  name: 'Input',
  unstyled: true,

  // Layout
  width: '100%',
  minWidth: 0,
  height: 36,            // h-9 → 36px
  paddingHorizontal: 12, // px-3
  paddingVertical: 4,    // py-1

  // Shape
  borderRadius: '$input', // 6px from our tokens
  borderWidth: 1,

  // Colors
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  placeholderTextColor: '$colorTertiary',

  outlineWidth: 0,       // remove browser default outline (replaced by focusStyle)

  // States
  hoverStyle: {
    borderColor: '$primary',
  },

  focusStyle: {
    borderColor: '$primary',
    outlineColor: '$primary',
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineOffset: 0,
  },

  variants: {
    /** Visual error state — set when the field is invalid */
    invalid: {
      true: {
        borderColor: '$danger',
        focusStyle: {
          borderColor: '$danger',
          outlineColor: '$danger',
          outlineWidth: 2,
          outlineStyle: 'solid',
        },
      },
    },

    disabled: {
      true: {
        opacity: 0.5,
        pointerEvents: 'none',
      },
    },
  } as const,

  defaultVariants: {
    invalid: false,
    disabled: false,
  },
})

// ─── Public component ────────────────────────────────────────────────────────

type InputProps = GetProps<typeof InputFrame>

function Input({ disabled, ...props }: InputProps) {
  return (
    <InputFrame
      disabled={disabled}
      editable={disabled ? false : undefined} // RN equivalent of disabled
      {...props}
    />
  )
}

export { Input }
export type { InputProps }
