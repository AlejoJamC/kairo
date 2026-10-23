import { styled, Stack } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { Text } from './layout'
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
  /** Tickets in the category, in mono after the name (the wizard's detected categories). */
  count?: number
}

function dotColor(scale: CategoryScale, value: string): string {
  const key = `${scale}.${value}` as keyof typeof tokens
  return key in tokens ? (tokens[key] as string) : tokens['color.p3']
}

function CategoryChip({ scale, value, label, count, ...props }: CategoryChipProps) {
  return (
    <Chip icon={<Dot backgroundColor={dotColor(scale, value)} />} {...props}>
      {count === undefined ? (
        label
      ) : (
        <>
          <Text fontSize={12} fontWeight="500" color={tokens['text.secondary']}>
            {label}
          </Text>
          <Text fontFamily="$mono" fontSize={11} color={tokens['text.tertiary']}>
            {count}
          </Text>
        </>
      )}
    </Chip>
  )
}

export { CategoryChip }
export type { CategoryChipProps }
