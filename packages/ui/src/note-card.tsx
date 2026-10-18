import { useState, type ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Icon } from './icon'
import { Box, Text } from './layout'

// One internal note: a card on the note surface with the author, the time and
// the body. An unread mention adds a ring, a 3px accent bar on the left and a
// "Mentioned you" badge. Pressing it jumps to the message in the thread.

type NoteCardProps = {
  authorName?: string | null
  authorEmail?: string | null
  /** Identity that picks the avatar color. */
  seed?: string | null
  /** Display name, already resolved ("You" for your own notes). */
  author: string
  /** Mono time. */
  time?: string
  /** The note body (text with mention marks). */
  children: ReactNode
  /** Unread mention of you. */
  unread?: boolean
  mentionedYouLabel?: string
  /** The "view in thread" hint, shown under the body on hover or keyboard focus. */
  hint?: string
  /** Always-visible chip next to the author, for example TEAM ONLY. */
  badge?: ReactNode
  onPress?: () => void
  /** Accessible name of the card when it is pressable. */
  title?: string
}

function NoteCard({ authorName, authorEmail, seed, author, time, children, unread, mentionedYouLabel, hint, badge, onPress, title }: NoteCardProps) {
  const pressable = onPress !== undefined
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const raised = pressable && (hovered || focused)
  return (
    <Box
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      title={title}
      onClick={onPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (pressable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onPress()
        }
      }}
      display="block"
      padding={12}
      borderRadius={8}
      backgroundColor={tokens['notes.background']}
      borderWidth={1}
      borderStyle="solid"
      borderColor={unread || raised ? tokens['notes.label'] : tokens['notes.border']}
      borderLeftWidth={unread ? 3 : 1}
      borderLeftColor={unread ? tokens['accent.default'] : raised ? tokens['notes.label'] : tokens['notes.border']}
      boxShadow={raised ? tokens['shadow.xs'] : 'none'}
      transform={raised ? 'translateY(-1px)' : 'none'}
      transition="all .12s ease"
      cursor={pressable ? 'pointer' : 'default'}
    >
      <Box display="flex" alignItems="center" gap={7} marginBottom={6}>
        <Avatar name={authorName} email={authorEmail} seed={seed} size={20} />
        <Text fontSize={12.5} fontWeight={unread ? 600 : 500} color={tokens['notes.text']}>
          {author}
        </Text>
        {badge}
        {unread && mentionedYouLabel && (
          <Text font="mono" fontSize={9.5} paddingHorizontal={6} borderRadius={999} backgroundColor={tokens['mentions.badgeBackground']} color={tokens['mentions.badgeText']}>
            {mentionedYouLabel}
          </Text>
        )}
        {time && (
          <Text marginLeft="auto" font="mono" fontSize={10.5} color={tokens['notes.label']}>
            {time}
          </Text>
        )}
      </Box>
      <Text tag="div" display="block" fontSize={12.5} lineHeightRatio={1.55} color={tokens['notes.text']}>
        {children}
      </Text>
      {raised && hint && (
        <Box display="flex" alignItems="center" gap={6} marginTop={8} paddingTop={7} borderTopWidth={1} borderStyle="dashed" borderTopColor={tokens['notes.border']}>
          <Text display="flex" alignItems="center" gap={4} font="mono" fontSize={10} color={tokens['notes.label']}>
            <Icon name="arrow" size={10} />
            {hint}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export { NoteCard }
export type { NoteCardProps }
