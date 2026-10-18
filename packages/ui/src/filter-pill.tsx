import { tokens } from '@kairo/tokens'
import { Pressable, Text } from './layout'

// Filters a data page. The active pill is inverted.

type FilterPillProps = {
  children: string
  active?: boolean
  onPress: () => void
  /** Count inside the pill, at 65% opacity. */
  count?: number
  disabled?: boolean
}

function FilterPill({ children, active, onPress, count, disabled }: FilterPillProps) {
  return (
    <Pressable
      aria-pressed={!!active}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => !disabled && onPress()}
      display="inline-flex"
      alignItems="center"
      gap={6}
      height={30}
      paddingHorizontal={12}
      borderRadius={999}
      fontSize={12.5}
      borderWidth={1}
      borderStyle="solid"
      borderColor={active ? tokens['text.primary'] : tokens['border.default']}
      backgroundColor={active ? tokens['text.primary'] : tokens['surface.panel']}
      color={active ? tokens['surface.page'] : tokens['text.secondary']}
      hoverStyle={disabled || active ? undefined : { color: tokens['text.primary'], borderColor: tokens['border.strong'] }}
      opacity={disabled ? 0.6 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      whiteSpace="nowrap"
    >
      {children}
      {count !== undefined && (
        <Text font="mono" fontSize={11} opacity={0.65}>
          {count}
        </Text>
      )}
    </Pressable>
  )
}

export { FilterPill }
export type { FilterPillProps }
