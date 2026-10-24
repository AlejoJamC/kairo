import { createPortal } from 'react-dom'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { PlainInput } from './plain'
import { Segmented, type SegmentedItem } from './segmented'
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
  /** Color of the icon (a semantic action color); `text.tertiary` by default. */
  iconColor?: string
  /** Replaces the icon (the priority glyph of a ticket row). */
  leading?: ReactNode
  /** Shortcut keys shown at the right. */
  shortcut?: readonly string[]
  /** Secondary mono text (ticket id) at the right. */
  meta?: string
  /** Mono text before the label (ticket id). */
  code?: string
  /** Mono text after the label: where it is. */
  where?: string
  /** The command does not apply now: shown in `text.tertiary` and not runnable. */
  disabled?: boolean
  /** Small mono note of a disabled row ("only in a ticket"). */
  note?: string
  /** The row is a quiet pointer (for example "See all commands"). */
  quiet?: boolean
}

type PaletteSection = {
  id: string
  title: string
  items: readonly PaletteItem[]
  /** 34px rows instead of 38px (the Commands list). */
  dense?: boolean
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
  /** Scope row (All / Commands): tab switches it. */
  scope?: {
    label: string
    value: string
    items: readonly SegmentedItem<string>[]
    onChange: (value: string) => void
    /** Text at the right of the row ("33 commands"). */
    summary?: string
  }
  /** Shown instead of the results when nothing matches ("Nothing matches "…""). */
  emptyText?: string
  labels: { dialog: string; input: string; placeholder: string; runFirst: string; close: string; switchScope?: string; note?: string }
  /** Overrides the portal target (tests, shells). */
  container?: HTMLElement | null
}

const SECTION_LABEL = { font: 'mono', fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tokens['text.tertiary'] } as const

function Layer({ onClose, query, onQueryChange, sections, activeId, onSelect, searching, scope, emptyText, labels }: Omit<CommandPaletteProps, 'open' | 'container'>) {
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
            onKeyDown={(event) => {
              if (event.key === 'Tab' && scope) {
                event.preventDefault()
                const index = scope.items.findIndex((item) => item.value === scope.value)
                scope.onChange(scope.items[(index + 1) % scope.items.length]!.value)
                return
              }
              if (event.key !== 'Enter') return
              const first = sections.find((section) => !section.loading && !section.error)?.items.find((item) => !item.disabled && !item.quiet)
              if (first) onSelect(first.id)
            }}
            flexGrow={1}
            borderWidth={0}
            backgroundColor="transparent"
            fontSize={15}
            color={tokens['text.primary']}
            outlineWidth={0}
            focusStyle={{ outlineWidth: 0 }}
          />
          {searching && <Spinner />}
        </Box>
        {scope && (
          <Box display="flex" alignItems="center" gap={8} paddingVertical={8} paddingHorizontal={12} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
            <Segmented items={scope.items} value={scope.value} onChange={scope.onChange} label={scope.label} />
            <Box flexGrow={1} />
            {scope.summary && <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>{scope.summary}</Text>}
          </Box>
        )}
        <Box maxHeight={420} scroll paddingVertical={6}>
          {emptyText && sections.every((section) => !section.loading && !section.error && section.items.length === 0) && (
            <Text tag="div" display="block" paddingVertical={22} paddingHorizontal={16} textAlign="center" fontSize={12.5} color={tokens['text.tertiary']}>
              {emptyText}
            </Text>
          )}
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
                  const active = item.id === activeId && !item.disabled
                  return (
                    <Pressable
                      key={item.id}
                      type="button"
                      disabled={item.disabled}
                      aria-disabled={item.disabled || undefined}
                      aria-keyshortcuts={item.shortcut && !item.disabled ? item.shortcut.join('+') : undefined}
                      onClick={() => !item.disabled && onSelect(item.id)}
                      display="flex"
                      alignItems="center"
                      gap={10}
                      width="100%"
                      height={section.dense ? 34 : 38}
                      paddingHorizontal={16}
                      textAlign="left"
                      fontSize={13.5}
                      color={item.disabled || item.quiet ? tokens['text.tertiary'] : tokens['text.primary']}
                      backgroundColor={active ? tokens['surface.hover'] : 'transparent'}
                      hoverStyle={item.disabled ? undefined : { backgroundColor: tokens['surface.hover'] }}
                      cursor={item.disabled ? 'default' : 'pointer'}
                    >
                      {item.leading ?? (item.icon && <Icon name={item.icon} size={14} color={item.disabled ? tokens['text.tertiary'] : (item.iconColor ?? tokens['text.tertiary'])} />)}
                      {item.code && (
                        <Text font="mono" fontSize={11.5} color={tokens['text.tertiary']} flexShrink={0}>
                          {item.code}
                        </Text>
                      )}
                      <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                        {item.label}
                      </Text>
                      {item.where && (
                        <Text font="mono" fontSize={11} color={tokens['text.tertiary']} flexShrink={0}>
                          {item.where}
                        </Text>
                      )}
                      {item.note && (
                        <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']} flexShrink={0}>
                          {item.note}
                        </Text>
                      )}
                      {item.meta && (
                        <Text font="mono" fontSize={11} color={tokens['text.tertiary']} flexShrink={0}>
                          {item.meta}
                        </Text>
                      )}
                      {item.shortcut && (
                        <Box display="flex" alignItems="center" gap={3} aria-hidden>
                          {item.shortcut.map((key, index) => <Kbd key={`${key}-${index}`} alignSelf="center">{key}</Kbd>)}
                        </Box>
                      )}
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
          {scope && labels.switchScope && (
            <Box display="flex" alignItems="center" gap={6}>
              <Kbd>tab</Kbd>
              <Text fontSize={11.5} color={tokens['text.tertiary']}>{labels.switchScope}</Text>
            </Box>
          )}
          <Box display="flex" alignItems="center" gap={6}>
            <Kbd>esc</Kbd>
            <Text fontSize={11.5} color={tokens['text.tertiary']}>{labels.close}</Text>
          </Box>
          {labels.note && (
            <>
              <Box flexGrow={1} />
              <Text fontSize={11} color={tokens['text.tertiary']}>{labels.note}</Text>
            </>
          )}
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
