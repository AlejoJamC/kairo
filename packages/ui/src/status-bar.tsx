import { tokens } from '@kairo/tokens'
import { Kbd } from './kbd'
import { Box, Text } from './layout'
import { px } from './lib/units'

// The fixed bar at the bottom of the app: the shortcuts of the current view,
// a separator, the fixed shortcuts and the engine status on the right.

const BAR_HEIGHT = px(tokens['size.statusbar'])

type StatusBarShortcut = { keys: string; label: string }

type StatusBarProps = {
  /** Shortcuts of the current view. Whole shortcuts drop out, last to first, when space is short. */
  shortcuts: readonly StatusBarShortcut[]
  /** Shortcuts that are never cut (⌘K commands, ? all commands). */
  pinned?: readonly StatusBarShortcut[]
  /** Engine status text, for example "kairo · 6 open". */
  status: string
  /** Accessible name of the footer ("Shortcuts and engine status"). */
  label?: string
  /** Engine offline: red dot without pulse and red text. */
  offline?: boolean
}

function Shortcut({ shortcut }: { shortcut: StatusBarShortcut }) {
  return (
    <Box display="flex" alignItems="center" gap={5} flexShrink={0} height={BAR_HEIGHT}>
      <Box display="flex" alignItems="center" gap={3}>
        {shortcut.keys.split(' ').map((key) => (
          <Kbd key={key} alignSelf="center">{key}</Kbd>
        ))}
      </Box>
      <Text fontSize={11.5} lineHeightRatio={1} color={tokens['text.tertiary']} whiteSpace="nowrap">{shortcut.label}</Text>
    </Box>
  )
}

function StatusBar({ shortcuts, pinned = [], status, label, offline }: StatusBarProps) {
  return (
    <Box
      tag="footer"
      aria-label={label}
      display="flex"
      alignItems="center"
      height={BAR_HEIGHT}
      paddingHorizontal={14}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      backgroundColor={tokens['surface.sidebar']}
    >
      {shortcuts.length > 0 && (
        <>
          {/* Wrapped shortcuts fall below the clipped row, so they leave whole and last first. */}
          <Box display="flex" flexWrap="wrap" alignItems="center" columnGap={16} height={BAR_HEIGHT} minWidth={0} overflow="hidden" flexShrink={1}>
            {shortcuts.map((shortcut) => (
              <Shortcut key={shortcut.keys} shortcut={shortcut} />
            ))}
          </Box>
          <Box width={1} height={14} marginHorizontal={12} flexShrink={0} backgroundColor={tokens['border.strong']} aria-hidden />
        </>
      )}
      <Box display="flex" alignItems="center" gap={16} flexShrink={0}>
        {pinned.map((shortcut) => (
          <Shortcut key={shortcut.keys} shortcut={shortcut} />
        ))}
      </Box>
      <Box flexGrow={1} minWidth={16} />
      <Box display="flex" alignItems="center" gap={6} flexShrink={0}>
        <Box width={6} height={6} circle backgroundColor={offline ? tokens['color.bad'] : tokens['color.ok']} pulse={!offline} aria-hidden />
        <Text font="mono" fontSize={11} color={offline ? tokens['color.bad-ink'] : tokens['text.tertiary']}>
          {status}
        </Text>
      </Box>
    </Box>
  )
}

export { StatusBar }
export type { StatusBarProps, StatusBarShortcut }
