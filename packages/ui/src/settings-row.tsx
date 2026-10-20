import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Text } from './layout'
import { Skeleton } from './loading'

// One setting inside a Settings card: what it is, what it does and its control.
// Rows sit in a card; a divider separates consecutive rows.

type SettingsRowProps = {
  title: string
  description?: string
  /** 18px icon before the text. */
  icon?: IconName
  /** The control on the right: select, button, link, switch or "coming soon". */
  children?: ReactNode
  /** The control is still loading: a shim bar in its place. */
  loading?: boolean
  /** The value could not be loaded. */
  error?: string
  /** Divider above (every row but the first of its card). */
  divider?: boolean
  /** id of the labelled control, when the title labels a form control. */
  controlId?: string
}

function SettingsRow({ title, description, icon, children, loading, error, divider, controlId }: SettingsRowProps) {
  const labelId = controlId ? `${controlId}-title` : undefined
  const descriptionId = controlId ? `${controlId}-description` : undefined
  return (
    <Box
      display="flex"
      flexWrap="wrap"
      alignItems="center"
      gap={14}
      paddingVertical={18}
      paddingHorizontal={20}
      borderTopWidth={divider ? 1 : 0}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
    >
      {icon && <Icon name={icon} size={18} color={tokens['text.tertiary']} strokeWidth={1.6} />}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={200} display="flex" flexDirection="column" gap={3}>
        <Text tag={controlId ? 'label' : 'span'} id={labelId} htmlFor={controlId} fontWeight={500} color={tokens['text.primary']}>
          {title}
        </Text>
        {description && (
          <Text id={descriptionId} fontSize={12.5} lineHeightRatio={1.45} color={tokens['text.tertiary']}>
            {description}
          </Text>
        )}
        {error && (
          <Text fontSize={12} color={tokens['color.bad-ink']}>
            {error}
          </Text>
        )}
      </Box>
      {loading ? <Skeleton height={30} width={120} /> : children}
    </Box>
  )
}

export { SettingsRow }
export type { SettingsRowProps }
