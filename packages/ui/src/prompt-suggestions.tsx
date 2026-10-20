import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { Spinner } from './loading'

// Suggests what to ask the AI. Starters are full-width rows under a header;
// follow-ups are 28px pills under a finished answer. While a suggestion is
// sent its chevron or spark becomes a spinner.

type Starter = { id: string; icon: IconName; text: string }
type FollowUp = { id: string; text: string }

type PromptStartersProps = {
  title: string
  items: readonly Starter[]
  onPick: (id: string) => void
  /** id of the suggestion being sent. */
  pendingId?: string | null
  disabled?: boolean
}

function PromptStarters({ title, items, onPick, pendingId, disabled }: PromptStartersProps) {
  return (
    <Box>
      <Text tag="div" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']} marginBottom={8}>
        {title}
      </Text>
      <Box display="flex" flexDirection="column" gap={6}>
        {items.map((item) => {
          const pending = pendingId === item.id
          return (
            <Pressable
              key={item.id}
              disabled={disabled}
              onClick={() => onPick(item.id)}
              display="flex"
              alignItems="center"
              gap={10}
              width="100%"
              padding={10}
              borderRadius={9}
              borderWidth={1}
              borderStyle="solid"
              borderColor={pending ? tokens['accent.line'] : tokens['border.default']}
              backgroundColor={pending ? tokens['accent.soft'] : tokens['surface.panel']}
              textAlign="left"
              fontSize={13}
              color={tokens['text.primary']}
              hoverStyle={disabled ? undefined : { borderColor: tokens['accent.line'], backgroundColor: tokens['accent.soft'] }}
              opacity={disabled && !pending ? 0.6 : 1}
            >
              <Box width={26} height={26} flexShrink={0} display="flex" alignItems="center" justifyContent="center" borderRadius={7} backgroundColor={tokens['accent.soft']}>
                <Icon name={item.icon} size={13} color={tokens['accent.ink']} />
              </Box>
              <Text flexGrow={1} flexShrink={1} flexBasis="0%">
                {item.text}
              </Text>
              {pending ? <Spinner /> : <Icon name="right" size={12} color={tokens['text.tertiary']} />}
            </Pressable>
          )
        })}
      </Box>
    </Box>
  )
}

type FollowUpsProps = {
  items: readonly FollowUp[]
  onPick: (id: string) => void
  pendingId?: string | null
  /** The AI is answering: no new follow-ups. */
  disabled?: boolean
}

function FollowUps({ items, onPick, pendingId, disabled }: FollowUpsProps) {
  return (
    <Box display="flex" flexWrap="wrap" gap={6}>
      {items.map((item) => {
        const pending = pendingId === item.id
        return (
          <Pressable
            key={item.id}
            disabled={disabled}
            onClick={() => onPick(item.id)}
            display="inline-flex"
            alignItems="center"
            gap={6}
            height={28}
            paddingHorizontal={11}
            borderRadius={999}
            borderWidth={1}
            borderStyle="solid"
            borderColor={pending ? tokens['accent.line'] : tokens['border.default']}
            backgroundColor={pending ? tokens['accent.soft'] : tokens['surface.panel']}
            fontSize={12}
            color={tokens['text.primary']}
            hoverStyle={disabled ? undefined : { borderColor: tokens['accent.line'], backgroundColor: tokens['accent.soft'] }}
            opacity={disabled && !pending ? 0.6 : 1}
          >
            {pending ? <Spinner /> : <Icon name="spark" size={10} />}
            {item.text}
          </Pressable>
        )
      })}
    </Box>
  )
}

export { PromptStarters, FollowUps }
export type { PromptStartersProps, FollowUpsProps, Starter, FollowUp }
