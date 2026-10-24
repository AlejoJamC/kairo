import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Badge } from './badge'
import { IconButton } from './button'
import { Icon } from './icon'
import { Kbd } from './kbd'
import { Box, Pressable, Text } from './layout'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { PriorityGlyph } from './priority-glyph'
import { Tooltip } from './tooltip'
import { VisuallyHidden } from './lib/visually-hidden'
import { px } from './lib/units'
import { useWindowChrome } from './window-chrome'

// Top bar of the ticket: where the agent is, the position in the queue and the
// ticket status. Single line; the breadcrumb truncates before the status.

type QueueSwitcherItem = {
  id: string
  priority?: string | null
  /** Ticket id ("KAI-106"). */
  code: string
  subject: string
  /** Age ("12m"). */
  age: string
  current?: boolean
}

/** The ticket list is hidden: the bar shows it again and switches tickets from the queue name. */
type ListHidden = {
  showLabel: string
  shortcut: string
  keyshortcuts: string
  controls?: string
  onShow: () => void
  switcher: {
    /** Accessible name of the popover ("Triage queue"). */
    label: string
    /** "6" next to the queue name in the popover header. */
    count: string
    items: readonly QueueSwitcherItem[]
    onSelect: (id: string) => void
    pinLabel: string
    /** "J K navigate · esc close". */
    footer: string
  }
}

type TicketBarProps = {
  /** Name of the current queue ("Triage"). */
  queueName: string
  /** Ticket id ("KAI-106"). */
  ticketId: string
  /** Position in the visible queue; hidden when there is none. */
  position?: { index: number; total: number }
  /** The ticket has internal notes: team badge that opens the Notes tab. */
  notes?: { count: number; label: string; ariaLabel: string; onOpen: () => void }
  /** The ticket is escalated: the escalated pill ("ESCALATED"). */
  escalatedLabel?: string
  /** status-chip with its menu, or the static read-only chip. */
  status?: ReactNode
  listHidden?: ListHidden
  onPrevious?: () => void
  onNext?: () => void
  /** Previous on the first row and Next on the last row are disabled. */
  hasPrevious?: boolean
  hasNext?: boolean
  labels: {
    /** Accessible name of the breadcrumb ("Path"). */
    path: string
    /** "Ticket 1 of 6". */
    position: string
    previous: string
    next: string
  }
}

function QueueSwitcher({ name, switcher, pin }: { name: string; switcher: ListHidden['switcher']; pin: { label: string; shortcut: string; onPin: () => void } }) {
  return (
    <Popover>
      <PopoverTrigger>
        <Pressable display="flex" alignItems="center" gap={4} height={26} paddingHorizontal={8} borderRadius={6} fontSize={12.5} color={tokens['text.tertiary']} hoverStyle={{ backgroundColor: tokens['surface.hover'], color: tokens['text.primary'] }} flexShrink={1} minWidth={0}>
          <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" minWidth={0}>
            {name}
          </Text>
          <Icon name="down" size={11} color={tokens['text.tertiary']} />
        </Pressable>
      </PopoverTrigger>
      <PopoverContent label={switcher.label} width={px(tokens['layout.queue'])} padding={0} overflow="hidden">
        <Box display="flex" alignItems="center" gap={8} paddingTop={10} paddingRight={12} paddingBottom={8} paddingLeft={14} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
          <Text fontSize={13} fontWeight={600} color={tokens['text.primary']}>{name}</Text>
          <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>{switcher.count}</Text>
          <Box flexGrow={1} />
          <Pressable onClick={pin.onPin} display="flex" alignItems="center" gap={6} height={24} paddingHorizontal={8} borderRadius={6} fontSize={12} fontWeight={500} color={tokens['text.secondary']} hoverStyle={{ backgroundColor: tokens['surface.hover'] }}>
            {pin.label}
            <Kbd alignSelf="center">{pin.shortcut}</Kbd>
          </Pressable>
        </Box>
        <Box maxHeight={360} scroll display="flex" flexDirection="column">
          {switcher.items.map((item) => (
            <Pressable
              key={item.id}
              onClick={() => switcher.onSelect(item.id)}
              aria-current={item.current ? 'true' : undefined}
              display="flex"
              alignItems="center"
              gap={8}
              height={38}
              flexShrink={0}
              paddingHorizontal={14}
              textAlign="left"
              backgroundColor={item.current ? tokens['surface.hover'] : 'transparent'}
              hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
            >
              <PriorityGlyph priority={item.priority} size={12} label={false} />
              <Text font="mono" fontSize={11.5} color={tokens['text.tertiary']} flexShrink={0}>{item.code}</Text>
              <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={13} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{item.subject}</Text>
              <Text font="mono" fontSize={11} color={tokens['text.tertiary']} flexShrink={0}>{item.age}</Text>
            </Pressable>
          ))}
        </Box>
        <Box paddingVertical={8} paddingHorizontal={14} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
          <Text fontSize={11} color={tokens['text.tertiary']}>{switcher.footer}</Text>
        </Box>
      </PopoverContent>
    </Popover>
  )
}

function TicketBar({ queueName, ticketId, position, notes, escalatedLabel, status, listHidden, onPrevious, onNext, hasPrevious = true, hasNext = true, labels }: TicketBarProps) {
  const macosWindow = useWindowChrome()
  return (
    <Box
      tag="header"
      dragRegion={macosWindow}
      display="flex"
      alignItems="center"
      gap={8}
      height={px(tokens['size.header'])}
      flexShrink={0}
      paddingLeft={24}
      paddingRight={12}
      borderBottomWidth={1}
      borderStyle="solid"
      borderBottomColor={tokens['border.default']}
      backgroundColor={tokens['surface.page']}
      position="relative"
      zIndex={10}
    >
      {listHidden && (
        <Tooltip label={listHidden.showLabel} shortcut={listHidden.shortcut}>
          <IconButton label={listHidden.showLabel} aria-keyshortcuts={listHidden.keyshortcuts} aria-controls={listHidden.controls} aria-expanded={false} onPress={listHidden.onShow}>
            <Icon name="panel" size={15} color={tokens['text.tertiary']} />
          </IconButton>
        </Tooltip>
      )}
      <Box tag="nav" aria-label={labels.path} display="flex" alignItems="center" gap={8} minWidth={0}>
        {listHidden ? (
          <QueueSwitcher name={queueName} switcher={listHidden.switcher} pin={{ label: listHidden.switcher.pinLabel, shortcut: listHidden.shortcut, onPin: listHidden.onShow }} />
        ) : (
          <Text fontSize={12.5} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" minWidth={0}>
            {queueName}
          </Text>
        )}
        <Icon name="right" size={12} color={tokens['text.tertiary']} />
        <Text aria-current="page" font="mono" fontSize={12} fontWeight={500} color={tokens['text.primary']} flexShrink={0}>
          {ticketId}
        </Text>
      </Box>
      {position && (
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']} marginLeft={4} flexShrink={0}>
          <span aria-hidden>
            {position.index} / {position.total}
          </span>
          <VisuallyHidden>{labels.position}</VisuallyHidden>
        </Text>
      )}
      {notes && (
        <Badge variant="team" alignSelf="center" icon={<Icon name="lock" size={9} />} onPress={notes.onOpen} aria-label={notes.ariaLabel}>
          {notes.label}
        </Badge>
      )}
      {escalatedLabel && (
        <Badge variant="escalated" alignSelf="center" icon={<Icon name="escalate" size={9} color={tokens['escalation.text']} />}>
          {escalatedLabel}
        </Badge>
      )}
      <Box dragRegion={macosWindow} flexGrow={1} alignSelf="stretch" />
      {status}
      <Box display="flex" gap={2} marginLeft={4}>
        <IconButton label={labels.previous} shortcut="K" disabled={!hasPrevious} onPress={onPrevious}>
          <Icon name="up" size={15} color={tokens['text.tertiary']} />
        </IconButton>
        <IconButton label={labels.next} shortcut="J" disabled={!hasNext} onPress={onNext}>
          <Icon name="down" size={15} color={tokens['text.tertiary']} />
        </IconButton>
      </Box>
    </Box>
  )
}

export { TicketBar }
export type { ListHidden, QueueSwitcherItem, TicketBarProps }
