import { createPortal } from 'react-dom'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { PlainInput } from './plain'
import { Skeleton, Spinner } from './loading'
import { useEscape, useFocusScope } from './lib/overlay'
import { px } from './lib/units'

// Search tickets, run actions and navigate (⌘K). A dialog overlay: closes with
// Esc or a scrim press. Sections are given by the caller; the Tickets section
// can show a loading or error state while Actions and Go to stay available.

type PaletteItem = {
  id: string
  label: string
  icon?: IconName
  /** Shortcut keys shown at the right. */
  shortcut?: readonly string[]
  /** Secondary mono text (ticket id). */
  meta?: string
}

type PaletteSection = {
  id: string
  title: string
  items: readonly PaletteItem[]
  loading?: boolean
  error?: { message: string; retryLabel: string; onRetry: () => void }
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  query: string
  onQueryChange: (query: string) => void
  sections: readonly PaletteSection[]
  /** id of the keyboard-highlighted item. */
  activeId?: string
  onSelect: (id: string) => void
  /** The tickets search is running: spinner at the input. */
  searching?: boolean
  labels: { dialog: string; input: string; placeholder: string; runFirst: string; close: string }
  /** Overrides the portal target (tests, shells). */
  container?: HTMLElement | null
}

const SECTION_LABEL = { font: 'mono', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tokens['text.tertiary'] } as const

function Layer({ onClose, query, onQueryChange, sections, activeId, onSelect, searching, labels }: Omit<CommandPaletteProps, 'open' | 'container'>) {
  const ref = useRef<HTMLElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  useEscape(onClose)
  useFocusScope(ref, true)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
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
        aria-label={labels.dialog}
        position="absolute"
        top={110}
        left="50%"
        width="min(600px, 92%)"
        transform="translateX(-50%)"
        overflow="hidden"
        borderRadius={px(tokens['radius.dialog'])}
        backgroundColor={tokens['surface.panel']}
        boxShadow={tokens['shadow.pop']}
      >
        <Box display="flex" alignItems="center" gap={10} height={50} paddingHorizontal={16} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
          <Icon name="search" size={16} color={tokens['text.tertiary']} />
          <Text tag="label" htmlFor={inputId} position="absolute" width={1} height={1} overflow="hidden" opacity={0}>
            {labels.input}
          </Text>
          <PlainInput
            id={inputId}
            ref={inputRef}
            value={query}
            placeholder={labels.placeholder}
            onChange={(event) => onQueryChange(event.target.value)}
            flexGrow={1}
            borderWidth={0}
            backgroundColor="transparent"
            fontSize={15}
            color={tokens['text.primary']}
            outlineWidth={0}
          />
          {searching && <Spinner />}
        </Box>
        <Box maxHeight={420} scroll paddingVertical={6}>
          {sections.map((section) => (
            <Box key={section.id} role="group" aria-label={section.title}>
              <Text tag="div" display="block" paddingVertical={6} paddingHorizontal={16} {...SECTION_LABEL}>
                {section.title}
              </Text>
              {section.error ? (
                <Box display="flex" alignItems="center" gap={10} paddingVertical={8} paddingHorizontal={16}>
                  <Text fontSize={12.5} color={tokens['color.bad-ink']}>{section.error.message}</Text>
                  <Pressable type="button" onClick={section.error.onRetry} fontSize={12.5} color={tokens['color.bad-ink']} textDecoration="underline">
                    {section.error.retryLabel}
                  </Pressable>
                </Box>
              ) : section.loading ? (
                <Box paddingHorizontal={16} display="flex" flexDirection="column" gap={10} paddingVertical={6}>
                  {[0, 1, 2].map((index) => (
                    <Skeleton key={index} height={12} width={`${70 - index * 10}%`} />
                  ))}
                </Box>
              ) : (
                section.items.map((item) => {
                  const active = item.id === activeId
                  return (
                    <Pressable
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      display="flex"
                      alignItems="center"
                      gap={10}
                      width="100%"
                      height={36}
                      paddingHorizontal={16}
                      textAlign="left"
                      fontSize={13.5}
                      color={tokens['text.primary']}
                      backgroundColor={active ? tokens['surface.hover'] : 'transparent'}
                      hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
                    >
                      {item.icon && <Icon name={item.icon} size={14} color={tokens['text.tertiary']} />}
                      <Text flexGrow={1} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {item.label}
                      </Text>
                      {item.meta && (
                        <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
                          {item.meta}
                        </Text>
                      )}
                      {item.shortcut?.map((key) => <Kbd key={key}>{key}</Kbd>)}
                    </Pressable>
                  )
                })
              )}
            </Box>
          ))}
        </Box>
        <Box display="flex" alignItems="center" gap={14} height={36} paddingHorizontal={16} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
          <Box display="flex" alignItems="center" gap={6}>
            <Kbd>↵</Kbd>
            <Text fontSize={11.5} color={tokens['text.tertiary']}>{labels.runFirst}</Text>
          </Box>
          <Box display="flex" alignItems="center" gap={6}>
            <Kbd>esc</Kbd>
            <Text fontSize={11.5} color={tokens['text.tertiary']}>{labels.close}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function CommandPalette({ open, container, ...layer }: CommandPaletteProps): ReactNode {
  if (!open) return null
  return createPortal(<Layer {...layer} />, container ?? document.body)
}

export { CommandPalette }
export type { CommandPaletteProps, PaletteItem, PaletteSection }
