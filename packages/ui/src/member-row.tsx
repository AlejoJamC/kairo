import { useState } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { IconButton } from './button'
import { Chip } from './chip'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { VisuallyHidden } from './lib/visually-hidden'
import { Menu, MenuItem } from './menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { ProgressBar } from './progress-bar'
import { Skeleton } from './loading'
import { px } from './lib/units'

// One person of the team in Settings › Team, and the table and seats bar that
// hold the rows.

type MemberState = 'active' | 'away' | 'invited'

type MemberRowProps = {
  name: string
  email: string
  /** Role label ("Admin"). */
  role: string
  state: MemberState
  /** Presence dot on the avatar; none when the workspace has no presence data. */
  presence?: 'online' | 'away'
  /** The row of the signed-in person: "(you)" and no removal. */
  isYou?: boolean
  /** Without it the options button is not shown (not Owner or Admin). */
  options?: {
    roles: readonly { value: string; label: string }[]
    currentRole: string
    onChangeRole: (role: string) => void
    /** Absent on the row of the signed-in person. */
    onRemove?: () => void
    /** Invitations: resend and cancel replace role and removal. */
    onResend?: () => void
    onCancel?: () => void
  }
  /** Optimistic role failure is the caller's; the row only renders. */
  labels: {
    you: string
    states: Record<MemberState, string>
    /** "Options for [Name]". */
    options: string
    changeRole: string
    remove: string
    /** "Remove [Name]?". */
    confirmRemove: string
    confirm: string
    resend: string
    cancelInvitation: string
  }
}

const STATE_DOT: Record<MemberState, string> = {
  active: tokens['color.ok'],
  away: tokens['color.warn'],
  invited: tokens['border.strong'],
}

const GRID = 'minmax(0, 2fr) 1fr 1fr 28px'

function OptionsMenu({ options, labels }: { options: NonNullable<MemberRowProps['options']>; labels: MemberRowProps['labels'] }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'roles' | 'confirm'>('menu')
  const close = () => {
    setOpen(false)
    setView('menu')
  }
  const invited = !!options.onResend
  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger>
        <IconButton label={labels.options} aria-haspopup="menu" backgroundColor={open ? tokens['surface.hover'] : undefined}>
          <Icon name="more" size={15} color={tokens['text.tertiary']} />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent role="menu" label={labels.options} align="end" width={200}>
        {view === 'confirm' ? (
          <Box padding={10} display="flex" flexDirection="column" gap={8}>
            <Text fontSize={12.5} color={tokens['text.primary']}>
              {labels.confirmRemove}
            </Text>
            <Menu label={labels.remove}>
              <MenuItem destructive label={labels.confirm} onSelect={() => { options.onRemove?.(); close() }} />
            </Menu>
          </Box>
        ) : view === 'roles' ? (
          <Menu label={labels.changeRole}>
            {options.roles.map((role) => (
              <MenuItem key={role.value} label={role.label} current={role.value === options.currentRole} onSelect={() => { options.onChangeRole(role.value); close() }} />
            ))}
          </Menu>
        ) : invited ? (
          <Menu label={labels.options}>
            <MenuItem label={labels.resend} onSelect={() => { options.onResend?.(); close() }} />
            <Box height={1} marginVertical={4} backgroundColor={tokens['border.default']} />
            <MenuItem destructive label={labels.cancelInvitation} onSelect={() => { options.onCancel?.(); close() }} />
          </Menu>
        ) : (
          <Menu label={labels.options}>
            <MenuItem label={labels.changeRole} shortcut={<Icon name="right" size={12} color={tokens['text.tertiary']} />} onSelect={() => setView('roles')} />
            {options.onRemove && (
              <>
                <Box height={1} marginVertical={4} backgroundColor={tokens['border.default']} />
                <MenuItem destructive label={labels.remove} onSelect={() => setView('confirm')} />
              </>
            )}
          </Menu>
        )}
      </PopoverContent>
    </Popover>
  )
}

function MemberRow({ name, email, role, state, presence, isYou, options, labels }: MemberRowProps) {
  const menuOptions = options && isYou ? { ...options, onRemove: undefined } : options
  return (
    <Box
      role="row"
      grid
      gridTemplateColumns={GRID}
      alignItems="center"
      gap={12}
      paddingVertical={14}
      paddingHorizontal={18}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
    >
      <Box role="cell" display="flex" alignItems="center" gap={10} minWidth={0}>
        <Avatar name={name} email={email} size={34} presence={presence} aria-hidden />
        <Box minWidth={0}>
          <Text tag="div" display="block" fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {name}
            {isYou && (
              <Text color={tokens['text.tertiary']} fontWeight={400}>
                {' '}
                {labels.you}
              </Text>
            )}
          </Text>
          <Text tag="div" display="block" font="mono" fontSize={11.5} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {email}
          </Text>
        </Box>
      </Box>
      <Box role="cell">
        <Chip>{role}</Chip>
      </Box>
      <Box role="cell" display="flex" alignItems="center" gap={6}>
        <Box width={6} height={6} circle backgroundColor={STATE_DOT[state]} aria-hidden />
        <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>
          {labels.states[state]}
        </Text>
      </Box>
      <Box role="cell">{menuOptions && <OptionsMenu options={menuOptions} labels={labels} />}</Box>
    </Box>
  )
}

type MemberTableProps = {
  /** Visually hidden column headers: person, role, state, options. */
  headers: readonly [string, string, string, string]
  loading?: boolean
  children: ReactNode
}

function MemberTable({ headers, loading, children }: MemberTableProps) {
  return (
    <Box role="table" overflowX="hidden" overflowY="hidden" borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} borderRadius={px(tokens['radius.card'])} backgroundColor={tokens['surface.panel']}>
      <Box role="row" position="absolute" width={1} height={1} overflowX="hidden" overflowY="hidden" opacity={0}>
        {headers.map((header) => (
          <Box key={header} role="columnheader">
            <VisuallyHidden>{header}</VisuallyHidden>
          </Box>
        ))}
      </Box>
      {loading
        ? [0, 1, 2, 3].map((index) => (
            <Box key={index} display="flex" alignItems="center" gap={10} paddingVertical={14} paddingHorizontal={18} borderTopWidth={index === 0 ? 0 : 1} borderStyle="solid" borderTopColor={tokens['border.default']}>
              <Skeleton width={34} height={34} borderRadius={999} />
              <Box flexGrow={1} display="flex" flexDirection="column" gap={6}>
                <Skeleton height={12} width="40%" />
                <Skeleton height={10} width="30%" />
              </Box>
            </Box>
          ))
        : children}
    </Box>
  )
}

type SeatsBarProps = { used: number; total: number; /** "3 of 5 seats". */ label: string }

/** The seats bar above the team list: the progress bar without its legend. */
function SeatsBar({ used, total, label }: SeatsBarProps) {
  return <ProgressBar value={total > 0 ? used / total : 0} label={label} valueText={label} hideLegend />
}

export { MemberRow, MemberTable, SeatsBar }
export type { MemberRowProps, MemberState, MemberTableProps, SeatsBarProps }
