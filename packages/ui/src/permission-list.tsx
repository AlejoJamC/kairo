import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { Switch } from './switch'
import { px } from './lib/units'

// Permissions requested from the email provider, and the initial rules.
// Required permissions are on and locked; optional ones start off.

type PermissionItem = {
  id: string
  name: string
  description?: string
  required?: boolean
  checked: boolean
}

type PermissionListProps = {
  /** Header label. */
  label: string
  provider?: string
  items: readonly PermissionItem[]
  onChange: (id: string, checked: boolean) => void
  /** "required" / "optional" in mono. */
  requirementLabels: { required: string; optional: string }
}

function PermissionList({ label, provider, items, onChange, requirementLabels }: PermissionListProps) {
  return (
    <Box
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
      overflow="hidden"
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" paddingVertical={10} paddingHorizontal={16} backgroundColor={tokens['surface.sunken']}>
        <Text font="mono" fontSize={10.5} letterSpacing={0.6} textTransform="uppercase" color={tokens['text.tertiary']}>
          {label}
        </Text>
        {provider && (
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {provider}
          </Text>
        )}
      </Box>
      {items.map((item) => {
        const requirement = item.required ? requirementLabels.required : requirementLabels.optional
        return (
          <Box
            key={item.id}
            display="flex"
            alignItems="center"
            gap={12}
            paddingVertical={12}
            paddingHorizontal={16}
            borderTopWidth={1}
            borderStyle="solid"
            borderTopColor={tokens['border.default']}
          >
            <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0}>
              <Text tag="div" display="block" fontSize={13.5} fontWeight={500} color={tokens['text.primary']}>
                {item.name}
              </Text>
              {item.description && (
                <Text tag="div" display="block" fontSize={12.5} color={tokens['text.secondary']}>
                  {item.description}
                </Text>
              )}
            </Box>
            <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
              {requirement}
            </Text>
            <Switch
              label={`${item.name}, ${requirement}`}
              checked={item.required ? true : item.checked}
              disabled={item.required}
              onCheckedChange={(checked) => onChange(item.id, checked)}
            />
          </Box>
        )
      })}
    </Box>
  )
}

export { PermissionList }
export type { PermissionListProps, PermissionItem }
