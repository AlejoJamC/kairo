import { useEffect, useId, useState } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { Switch } from './switch'
import { ensureMotionStyles } from './lib/motion-css'
import { px } from './lib/units'

// What the product will do with the connected email account, as rows with a
// switch. Expanded, it is a card with a header; collapsed, it is a one-line
// disclosure that always sits below the primary action. Without requirement
// labels the rows are rules: no requirement state, every switch can change.

type PermissionItem = {
  id: string
  name: string
  description?: string
  required?: boolean
  checked: boolean
}

type PermissionSummary = {
  icon: IconName
  /** What it is: "What we will ask Google for". */
  text: string
  /** Its state, in mono on the right: "2 permissions · read-only". */
  state: string
}

type PermissionListProps = {
  /** Header label (expanded). */
  label: string
  provider?: string
  items: readonly PermissionItem[]
  onChange: (id: string, checked: boolean) => void
  /** "required" / "optional" in mono. Omit it for rules, which have no requirement state. */
  requirementLabels?: { required: string; optional: string }
  /** Collapsed: a closed disclosure with this summary and no header. */
  collapsed?: PermissionSummary
}

function PermissionRows({ items, onChange, requirementLabels }: Pick<PermissionListProps, 'items' | 'onChange' | 'requirementLabels'>) {
  return (
    <>
      {items.map((item, index) => {
        const requirement = requirementLabels ? (item.required ? requirementLabels.required : requirementLabels.optional) : undefined
        return (
          <Box
            key={item.id}
            display="flex"
            alignItems="center"
            gap={12}
            paddingVertical={12}
            paddingHorizontal={16}
            borderTopWidth={index === 0 ? 0 : 1}
            borderStyle="solid"
            borderTopColor={tokens['border.default']}
          >
            <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
              <Text tag="div" display="block" fontSize={13.5} fontWeight={500} color={tokens['text.primary']}>
                {item.name}
              </Text>
              {item.description && (
                <Text tag="div" display="block" fontSize={12} color={tokens['text.secondary']}>
                  {item.description}
                </Text>
              )}
            </Box>
            {requirement && (
              <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
                {requirement}
              </Text>
            )}
            <Switch
              label={requirement ? `${item.name}, ${requirement}` : item.name}
              checked={item.required ? true : item.checked}
              disabled={item.required}
              onCheckedChange={(checked) => onChange(item.id, checked)}
            />
          </Box>
        )
      })}
    </>
  )
}

function PermissionList({ label, provider, items, onChange, requirementLabels, collapsed }: PermissionListProps) {
  const [open, setOpen] = useState(false)
  const rowsId = useId()
  useEffect(ensureMotionStyles, [])

  const card = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens['border.default'],
    borderRadius: px(tokens['radius.card']),
    backgroundColor: tokens['surface.panel'],
    overflow: 'hidden',
  } as const

  if (collapsed) {
    return (
      <Box {...card}>
        <Pressable
          type="button"
          aria-expanded={open}
          aria-controls={open ? rowsId : undefined}
          onClick={() => setOpen((value) => !value)}
          display="flex"
          alignItems="center"
          gap={8}
          width="100%"
          minHeight={44}
          paddingHorizontal={16}
          textAlign="left"
          borderBottomWidth={open ? 1 : 0}
          borderStyle="solid"
          borderBottomColor={tokens['border.default']}
          hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
          focusVisibleStyle={{ outlineWidth: 2, outlineStyle: 'solid', outlineColor: tokens['border.focus'], outlineOffset: -2 }}
        >
          <Icon name={collapsed.icon} size={13} color={tokens['text.tertiary']} />
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={13} color={tokens['text.secondary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {collapsed.text}
          </Text>
          <Text flexShrink={0} font="mono" fontSize={10.5} color={tokens['text.tertiary']} whiteSpace="nowrap">
            {collapsed.state}
          </Text>
          <Box className="kairo-ui-chev" aria-hidden flexShrink={0} display="flex" transform={open ? 'rotate(90deg)' : 'none'}>
            <Icon name="right" size={12} color={tokens['text.tertiary']} />
          </Box>
        </Pressable>
        {open && (
          <Box id={rowsId}>
            <PermissionRows items={items} onChange={onChange} requirementLabels={requirementLabels} />
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box {...card}>
      <Box display="flex" alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={16} backgroundColor={tokens['surface.sunken']} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
        <Text font="mono" fontSize={10.5} letterSpacing={0.6} textTransform="uppercase" color={tokens['text.tertiary']}>
          {label}
        </Text>
        {provider && (
          <Text font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
            {provider}
          </Text>
        )}
      </Box>
      <PermissionRows items={items} onChange={onChange} requirementLabels={requirementLabels} />
    </Box>
  )
}

export { PermissionList }
export type { PermissionListProps, PermissionItem, PermissionSummary }
