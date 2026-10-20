import { createPortal } from 'react-dom'
import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Kbd } from './kbd'
import { Box, Text } from './layout'
import { useEscape, useFocusScope } from './lib/overlay'
import { px } from './lib/units'

// Keyboard shortcuts: the complete list of app shortcuts, in groups. Same
// frame as the command palette. This list is the official set: the status bar,
// the palette and the buttons with a key use the same ones.

type ShortcutRow = { label: string; keys: readonly string[] }
type ShortcutGroup = {
  id: string
  title: string
  rows: readonly ShortcutRow[]
  /** The group only applies inside a ticket. */
  ticketOnly?: boolean
}

type ShortcutsDialogProps = {
  open: boolean
  onClose: () => void
  groups: readonly ShortcutGroup[]
  /** True while a ticket is open: ticket-only groups are active. */
  inTicket?: boolean
  labels: {
    title: string
    /** "On Windows and Linux, ⌘ is Ctrl." */
    footer: string
    /** "ticket only". */
    ticketOnly: string
    /** "esc". */
    escape: string
  }
  container?: HTMLElement | null
}

function Layer({ onClose, groups, inTicket, labels }: Omit<ShortcutsDialogProps, 'open' | 'container'>) {
  const ref = useRef<HTMLElement | null>(null)
  const titleId = useId()
  useEscape(onClose)
  useFocusScope(ref, true)
  return (
    <Box
      fixed
      top={0}
      right={0}
      bottom={0}
      left={0}
      zIndex={60}
      backgroundColor={tokens['surface.scrim']}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <Box
        ref={ref}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        position="absolute"
        top={110}
        left="50%"
        width="min(560px, 92%)"
        transform="translateX(-50%)"
        overflowX="hidden"
        overflowY="hidden"
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        borderRadius={px(tokens['radius.dialog'])}
        backgroundColor={tokens['surface.panel']}
        boxShadow={tokens['shadow.pop']}
      >
        <Box display="flex" alignItems="center" height={50} paddingHorizontal={16} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
          <Text id={titleId} flexGrow={1} fontSize={15} fontWeight={600} color={tokens['text.primary']}>
            {labels.title}
          </Text>
          <Kbd>{labels.escape}</Kbd>
        </Box>
        <Box padding={6} maxHeight={420} scroll>
          {groups.map((group) => {
            const inactive = group.ticketOnly && !inTicket
            return (
              <Box key={group.id} role="group" aria-label={group.title}>
                <Text tag="div" display="block" paddingTop={10} paddingHorizontal={10} paddingBottom={4} font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
                  {group.title}
                </Text>
                <Box tag="dl" margin={0}>
                  {group.rows.map((row) => (
                    <Box key={row.label} display="flex" alignItems="center" gap={10} height={32} paddingHorizontal={10}>
                      <Text tag="dt" flexGrow={1} fontSize={13} color={inactive ? tokens['text.tertiary'] : tokens['text.secondary']}>
                        {row.label}
                      </Text>
                      {inactive && (
                        <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
                          {labels.ticketOnly}
                        </Text>
                      )}
                      <Box tag="dd" display="flex" alignItems="center" gap={4} margin={0}>
                        {row.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )
          })}
        </Box>
        <Box paddingVertical={8} paddingHorizontal={14} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
          <Text fontSize={11} color={tokens['text.tertiary']}>
            {labels.footer}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

function ShortcutsDialog({ open, container, ...layer }: ShortcutsDialogProps): ReactNode {
  if (!open) return null
  return createPortal(<Layer {...layer} />, container ?? document.body)
}

export { ShortcutsDialog }
export type { ShortcutGroup, ShortcutRow, ShortcutsDialogProps }
