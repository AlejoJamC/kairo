import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { domProps } from './lib/overlay'
import { px } from './lib/units'

// List of options inside a popover. Arrow keys, Home and End move between
// items; enter or space selects. The destructive item goes last.

const List = styled(Stack, {
  name: 'Menu',
  padding: 4,
  minWidth: 180,
})

const Item = styled(Stack, {
  name: 'MenuItem',
  tag: 'button',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  minHeight: 32,
  paddingHorizontal: 10,
  borderWidth: 0,
  borderRadius: px(tokens['radius.control']),
  backgroundColor: 'transparent',
  cursor: 'pointer',
  hoverStyle: { backgroundColor: tokens['surface.hover'] },
  focusStyle: { backgroundColor: tokens['surface.hover'] },
  variants: {
    rich: { true: { minHeight: 40 } },
    disabled: { true: { opacity: 0.6, cursor: 'default', pointerEvents: 'none' } },
  } as const,
})

const ItemText = styled(Text, {
  name: 'MenuItemText',
  flex: 1,
  textAlign: 'left',
  fontSize: 13,
  color: tokens['text.secondary'],
  variants: {
    current: { true: { color: tokens['text.primary'], fontWeight: '500' } },
    destructive: { true: { color: tokens['color.bad-ink'] } },
  } as const,
})

const Section = styled(Text, {
  name: 'MenuLabel',
  paddingHorizontal: 10,
  paddingTop: 8,
  paddingBottom: 4,
  fontFamily: '$mono',
  fontSize: 10.5,
  letterSpacing: 0.63,
  textTransform: 'uppercase',
  color: tokens['text.tertiary'],
})

const Divider = styled(Stack, {
  name: 'MenuDivider',
  height: 1,
  marginVertical: 4,
  backgroundColor: tokens['border.default'],
})

const ITEM = '[role="menuitem"]:not([aria-disabled="true"])'

type MenuProps = Omit<GetProps<typeof List>, 'role'> & { label: string }

function Menu({ label, children, ...props }: MenuProps) {
  const ref = useRef<HTMLElement | null>(null)

  const onKeyDown = (event: KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEM) ?? [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    const move = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]!.focus()
    }
    if (event.key === 'ArrowDown') move(current + 1)
    else if (event.key === 'ArrowUp') move(current < 0 ? items.length - 1 : current - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
  }

  return (
    <List ref={ref as never} role="menu" aria-label={label} {...domProps({ onKeyDown })} {...props}>
      {children}
    </List>
  )
}

type MenuItemProps = {
  label: string
  onSelect?: () => void
  /** Leading icon or avatar. */
  icon?: ReactNode
  /** Shortcut shown on the right, normally a Kbd. */
  shortcut?: ReactNode
  /** The current option of a choice menu. */
  current?: boolean
  destructive?: boolean
  disabled?: boolean
  /** Taller row for items with an avatar. */
  rich?: boolean
}

function MenuItem({ label, onSelect, icon, shortcut, current, destructive, disabled, rich }: MenuItemProps) {
  return (
    <Item
      role="menuitem"
      aria-disabled={disabled || undefined}
      aria-current={current || undefined}
      disabled={disabled}
      rich={rich}
      tabIndex={-1}
      onPress={disabled ? undefined : onSelect}
    >
      {icon}
      <ItemText current={current} destructive={destructive}>
        {label}
      </ItemText>
      {shortcut}
    </Item>
  )
}

function MenuLabel({ children }: { children: string }) {
  return <Section role="presentation">{children}</Section>
}

function MenuSeparator() {
  return <Divider role="separator" />
}

export { Menu, MenuItem, MenuLabel, MenuSeparator }
export type { MenuProps, MenuItemProps }
