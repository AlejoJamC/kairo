import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'

// Key-value row for entity properties. Unknown values show a dash; numeric
// values use the mono face. The last row of a list has no divider.

type PropRowProps = {
  label: string
  children?: ReactNode
  mono?: boolean
  size?: 'md' | 'sm'
  last?: boolean
}

function PropRow({ label, children, mono, size = 'md', last }: PropRowProps) {
  const small = size === 'sm'
  const empty = children === null || children === undefined || children === ''
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={12}
      minHeight={small ? 32 : 34}
      borderBottomWidth={last ? 0 : 1}
      borderStyle="solid"
      borderBottomColor={tokens['border.default']}
    >
      <Text width={84} flexShrink={0} fontSize={small ? 12.5 : 13} color={tokens['text.tertiary']}>
        {label}
      </Text>
      <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} font={mono ? 'mono' : undefined} fontSize={small ? 12.5 : 13} color={tokens['text.primary']}>
        {empty ? '—' : children}
      </Text>
    </Box>
  )
}

export { PropRow }
export type { PropRowProps }
