import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { px } from './lib/units'

// Inline marks shared by the assistant, the thread, the notes and the
// notifications. They keep semantic HTML (strong, code).

function Bold({ children }: { children: ReactNode }) {
  return (
    <Text tag="strong" fontWeight={600} color={tokens['text.primary']}>
      {children}
    </Text>
  )
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <Text tag="code" font="mono" fontSize={12} paddingHorizontal={4} borderRadius={px(tokens['radius.xs'])} backgroundColor={tokens['surface.hover']}>
      {children}
    </Text>
  )
}

/** A mention; `self` marks the current user with the solid style. */
function MentionMark({ children, self }: { children: ReactNode; self?: boolean }) {
  return (
    <Text
      display="inline-flex"
      alignItems="center"
      paddingHorizontal={5}
      borderRadius={4}
      fontSize="0.94em"
      fontWeight={500}
      whiteSpace="nowrap"
      backgroundColor={self ? tokens['mentions.selfBackground'] : tokens['mentions.chipBackground']}
      color={self ? tokens['mentions.selfText'] : tokens['mentions.chipText']}
      borderWidth={1}
      borderStyle="solid"
      borderColor={self ? tokens['mentions.selfBackground'] : tokens['mentions.chipBorder']}
    >
      {children}
    </Text>
  )
}

/** A bullet: a paragraph with a 4px accent dot. */
function Bullet({ children }: { children: ReactNode }) {
  return (
    <Box display="flex" alignItems="flex-start" gap={8}>
      <Box width={4} height={4} borderRadius={999} marginTop={8} flexShrink={0} backgroundColor={tokens['accent.default']} aria-hidden />
      <Text flexGrow={1} flexShrink={1} flexBasis="0%">
        {children}
      </Text>
    </Box>
  )
}

export { Bold, InlineCode, MentionMark, Bullet }
