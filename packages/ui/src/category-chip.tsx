import { styled, Stack } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { Chip, type ChipProps } from './chip'

// Ticket type or category: neutral chip with a dot in the scale color and the
// name, which stays visible so color is never the only cue.

export type CategoryScale = 'ticketType' | 'category'

const Dot = styled(Stack, {
  name: 'CategoryDot',
  width: 7,
  height: 7,
  borderRadius: 999,
})

type CategoryChipProps = Omit<ChipProps, 'children' | 'icon' | 'tone'> & {
  scale: CategoryScale
  /** Value of the TicketType or TicketCategory union. */
  value: string
  /** Translated, lowercase display name. */
  label: string
}

function dotColor(scale: CategoryScale, value: string): string {
  const key = `${scale}.${value}` as keyof typeof tokens
  return key in tokens ? (tokens[key] as string) : tokens['color.p3']
}

function CategoryChip({ scale, value, label, ...props }: CategoryChipProps) {
  return (
    <Chip icon={<Dot backgroundColor={dotColor(scale, value)} />} {...props}>
      {label}
    </Chip>
  )
}

export { CategoryChip }
export type { CategoryChipProps }
