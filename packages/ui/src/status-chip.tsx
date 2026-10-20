import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Spinner } from './loading'
import { Menu, MenuItem } from './menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

// Shows the ticket status and, unless the ticket is in a final status, opens a
// menu to change it. Read-only tickets show a lock instead.

type StatusKey =
  | 'open'
  | 'awaiting_customer'
  | 'in_progress'
  | 'resolved'
  | 'ai_resolved'
  | 'escalated'
  | 'reopened'
  | 'closed'

const COLOR: Record<StatusKey, string> = {
  open: tokens['status.open'],
  awaiting_customer: tokens['status.awaiting_customer'],
  in_progress: tokens['status.in_progress'],
  resolved: tokens['status.resolved'],
  ai_resolved: tokens['status.ai_resolved'],
  escalated: tokens['status.escalated'],
  reopened: tokens['status.reopened'],
  closed: tokens['status.closed'],
}

type StatusOption = { status: StatusKey; label: string }

type StatusChipProps = {
  status: StatusKey
  options: readonly StatusOption[]
  onChange: (status: StatusKey) => void
  /** Final status: a lock and this text replace the menu. */
  readOnlyLabel?: string
  readOnly?: boolean
  /** Updating: the glyph becomes a spinner and the chip is disabled. */
  updating?: boolean
  /** Accessible name of the menu. */
  menuLabel: string
}

function Glyph({ status }: { status: StatusKey }) {
  return (
    <Box width={12} height={12} borderRadius={999} borderWidth={2} borderStyle="solid" borderColor={COLOR[status]} backgroundColor="transparent" aria-hidden />
  )
}

function StatusChip({ status, options, onChange, readOnly, readOnlyLabel, updating, menuLabel }: StatusChipProps) {
  const current = options.find((option) => option.status === status)?.label ?? status

  if (readOnly) {
    return (
      <Box display="inline-flex" alignItems="center" gap={6} height={26} paddingHorizontal={10} borderRadius={999} borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} backgroundColor={tokens['surface.sunken']}>
        <Icon name="lock" size={11} color={tokens['text.tertiary']} />
        <Text fontSize={12} color={tokens['text.tertiary']}>
          {readOnlyLabel ?? current}
        </Text>
      </Box>
    )
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Pressable
          disabled={updating}
          display="inline-flex"
          alignItems="center"
          gap={6}
          height={26}
          paddingHorizontal={10}
          borderRadius={999}
          borderWidth={1}
          borderStyle="solid"
          borderColor={tokens['border.default']}
          backgroundColor={tokens['surface.panel']}
          fontSize={12}
          fontWeight={500}
          color={tokens['text.primary']}
          hoverStyle={{ borderColor: tokens['border.strong'] }}
          opacity={updating ? 0.6 : 1}
        >
          {updating ? <Spinner /> : <Glyph status={status} />}
          {current}
          <Icon name="down" size={11} color={tokens['text.tertiary']} />
        </Pressable>
      </PopoverTrigger>
      <PopoverContent role="menu" label={menuLabel} width={210}>
        <Menu label={menuLabel}>
          {options.map((option) => (
            <MenuItem
              key={option.status}
              label={option.label}
              current={option.status === status}
              icon={<Glyph status={option.status} />}
              onSelect={() => onChange(option.status)}
            />
          ))}
        </Menu>
      </PopoverContent>
    </Popover>
  )
}

export { StatusChip }
export type { StatusChipProps, StatusKey, StatusOption }
