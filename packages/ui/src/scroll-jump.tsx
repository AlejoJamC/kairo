import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable } from './layout'

// Round button pinned to the bottom-right corner of a scrollable area. It points
// down to take the reader to the end while there is more below, and up to take
// them back to the start once they are at the end. The caller measures the scroll
// position and decides whether the area scrolls at all; this piece only draws the
// button. Place it inside a container with position: relative.

type ScrollJumpProps = {
  /** False when the area does not scroll: nothing is drawn. */
  visible: boolean
  /** Down while there is content below; up when the end has been reached. */
  direction: 'down' | 'up'
  /** Accessible name and tooltip, for example "Go to the end of the conversation". */
  label: string
  onPress: () => void
}

function ScrollJump({ visible, direction, label, onPress }: ScrollJumpProps) {
  if (!visible) return null
  return (
    <Box position="absolute" right={20} bottom={16} zIndex={4}>
      <Pressable
        type="button"
        aria-label={label}
        title={label}
        onClick={onPress}
        width={34}
        height={34}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius={999}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        backgroundColor={tokens['surface.panel']}
        color={tokens['text.secondary']}
        boxShadow={tokens['shadow.xs']}
        hoverStyle={{ backgroundColor: tokens['surface.hover'], borderColor: tokens['border.strong'], color: tokens['text.primary'] }}
        pressStyle={{ backgroundColor: tokens['surface.sunken'] }}
      >
        <Icon name={direction === 'down' ? 'down' : 'up'} size={16} />
      </Pressable>
    </Box>
  )
}

export { ScrollJump }
export type { ScrollJumpProps }
