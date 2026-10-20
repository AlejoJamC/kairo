import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Text } from './layout'

// Takes the place of the composer at the foot of a ticket in a final status and
// says why nothing can be written. Not a callout: no box, no radius.

type ReadOnlyBarProps = {
  /** Why there is no composer ("This ticket is resolved. It is shown in read-only mode."). */
  children: string
}

function ReadOnlyBar({ children }: ReadOnlyBarProps) {
  return (
    <Box
      role="status"
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={10}
      flexShrink={0}
      paddingVertical={14}
      paddingHorizontal={20}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      backgroundColor={tokens['surface.sunken']}
    >
      <Icon name="lock" size={13} color={tokens['text.tertiary']} strokeWidth={2} />
      <Text fontSize={12.5} color={tokens['text.tertiary']} maxWidth={tokens['layout.reading'] as never}>
        {children}
      </Text>
    </Box>
  )
}

export { ReadOnlyBar }
export type { ReadOnlyBarProps }
