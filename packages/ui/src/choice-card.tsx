import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { px } from './lib/units'

// Selects the channel to connect in onboarding. Available choices toggle;
// coming-soon choices are dashed and inert.

type ChoiceCardProps = {
  /** The channel's icon, 20px. */
  icon: ReactNode
  name: string
  /** Availability line in mono ("available", "coming soon"). */
  availability: string
  selected?: boolean
  /** Not available yet. */
  soon?: boolean
  onSelect?: () => void
}

function ChoiceCard({ icon, name, availability, selected, soon, onSelect }: ChoiceCardProps) {
  const ink = selected ? tokens['accent.ink'] : soon ? tokens['text.tertiary'] : tokens['text.primary']
  return (
    <Pressable
      type="button"
      aria-pressed={soon ? undefined : Boolean(selected)}
      disabled={soon}
      onClick={soon ? undefined : onSelect}
      display="flex"
      flexDirection="column"
      alignItems="flex-start"
      justifyContent="space-between"
      gap={8}
      minHeight={88}
      padding={14}
      textAlign="left"
      borderRadius={px(tokens['radius.input'])}
      borderWidth={1}
      borderStyle={soon ? 'dashed' : 'solid'}
      borderColor={selected ? tokens['accent.line'] : tokens['border.strong']}
      backgroundColor={selected ? tokens['accent.soft'] : 'transparent'}
      cursor={soon ? 'default' : 'pointer'}
      hoverStyle={soon || selected ? undefined : { backgroundColor: tokens['surface.hover'] }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
        <Text color={ink}>{icon}</Text>
        {selected && <Icon name="check" size={14} color={tokens['accent.ink']} />}
      </Box>
      <Box>
        <Text tag="div" display="block" fontSize={13.5} fontWeight={500} color={ink}>
          {name}
        </Text>
        <Text tag="div" display="block" font="mono" fontSize={10.5} color={selected ? tokens['color.ok-ink'] : tokens['text.tertiary']}>
          {availability}
        </Text>
      </Box>
    </Pressable>
  )
}

type ChoiceGroupProps = {
  /** Visible group name (rendered as the fieldset legend). */
  legend: string
  children: ReactNode
}

function ChoiceGroup({ legend, children }: ChoiceGroupProps) {
  return (
    <Box tag="fieldset" margin={0} padding={0} borderWidth={0} minWidth={0}>
      <Text tag="legend" display="block" fontSize={13} fontWeight={500} color={tokens['text.secondary']} marginBottom={10}>
        {legend}
      </Text>
      <Box grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={10}>
        {children}
      </Box>
    </Box>
  )
}

export { ChoiceCard, ChoiceGroup }
export type { ChoiceCardProps, ChoiceGroupProps }
