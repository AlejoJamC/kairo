import { tokens } from '@kairo/tokens'
import { Kbd } from './kbd'
import { Box, Text } from './layout'

// The fixed bar at the bottom of the app: the shortcuts of the current view on
// the left, the engine status on the right.

type StatusBarShortcut = { keys: string; label: string }

type StatusBarProps = {
  /** Shortcuts of the current view. They are the first to be cut when space is short. */
  shortcuts: readonly StatusBarShortcut[]
  /** Shortcuts that are never cut (⌘K commands, ? shortcuts). */
  pinned?: readonly StatusBarShortcut[]
  /** Engine status text, for example "engine · 12 open". */
  status: string
  /** Engine offline: red dot without pulse and red text. */
  offline?: boolean
}

function Shortcut({ shortcut }: { shortcut: StatusBarShortcut }) {
  return (
    <Box display="flex" alignItems="center" gap={5} flexShrink={0}>
      <Box display="flex" alignItems="center" gap={3}>
        {shortcut.keys.split(' ').map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </Box>
      <Text fontSize={11.5} color={tokens['text.tertiary']} whiteSpace="nowrap">{shortcut.label}</Text>
    </Box>
  )
}

function StatusBar({ shortcuts, pinned = [], status, offline }: StatusBarProps) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={16}
      height={28}
      paddingHorizontal={14}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      backgroundColor={tokens['surface.sidebar']}
    >
      <Box display="flex" alignItems="center" gap={14} minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
        <Box display="flex" alignItems="center" gap={14} minWidth={0} flexShrink={1} overflowX="hidden" overflowY="hidden">
          {shortcuts.map((shortcut) => (
            <Shortcut key={shortcut.keys} shortcut={shortcut} />
          ))}
        </Box>
        {pinned.map((shortcut) => (
          <Shortcut key={shortcut.keys} shortcut={shortcut} />
        ))}
      </Box>
      <Box display="flex" alignItems="center" gap={6} flexShrink={0}>
        <Box width={6} height={6} circle backgroundColor={offline ? tokens['color.bad'] : tokens['color.ok']} pulse={!offline} />
        <Text font="mono" fontSize={11} color={offline ? tokens['color.bad-ink'] : tokens['text.tertiary']}>
          {status}
        </Text>
      </Box>
    </Box>
  )
}

export { StatusBar }
export type { StatusBarProps, StatusBarShortcut }
