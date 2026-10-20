import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'

// One message in the ticket thread. The initial customer message, an agent
// reply and an internal note differ in the bubble surface and the tag.

type ThreadMessageProps = {
  variant: 'initial' | 'reply' | 'note'
  /** Avatar element (the soft customer avatar, a color avatar). */
  avatar: ReactNode
  name: string
  /** "initial message", "reply · sent" or a team-only badge. */
  tag?: ReactNode
  /** Mono meta: address and time. */
  meta?: string
  /** The body. */
  children?: ReactNode
  /** Shown instead of the body when there is none. */
  missingBody?: string
}

function ThreadMessage({ variant, avatar, name, tag, meta, children, missingBody }: ThreadMessageProps) {
  const bubble =
    variant === 'reply'
      ? { background: tokens['accent.soft'], border: tokens['accent.line'], text: tokens['text.primary'] }
      : variant === 'note'
        ? { background: tokens['notes.background'], border: tokens['notes.border'], text: tokens['notes.text'] }
        : { background: tokens['surface.panel'], border: tokens['border.default'], text: tokens['text.primary'] }
  const empty = children === undefined || children === null || children === ''

  return (
    <Box tag="article" fadeIn display="flex" gap={10}>
      <Box flexShrink={0}>{avatar}</Box>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
        <Box display="flex" alignItems="center" flexWrap="wrap" gap={8} marginBottom={6}>
          <Text fontSize={13} fontWeight={600} color={tokens['text.primary']}>
            {name}
          </Text>
          {tag}
          {meta && (
            <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
              {meta}
            </Text>
          )}
        </Box>
        {empty ? (
          <Box paddingVertical={12} paddingHorizontal={14} borderRadius={10} borderWidth={1} borderStyle="dashed" borderColor={tokens['border.strong']}>
            <Text fontSize={13} color={tokens['text.tertiary']}>
              {missingBody}
            </Text>
          </Box>
        ) : (
          <Box paddingVertical={12} paddingHorizontal={14} borderRadius={10} borderWidth={1} borderStyle="solid" borderColor={bubble.border} backgroundColor={bubble.background}>
            <Text tag="div" display="block" fontSize={14} lineHeightRatio={1.65} color={bubble.text}>
              {children}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

export { ThreadMessage }
export type { ThreadMessageProps }
