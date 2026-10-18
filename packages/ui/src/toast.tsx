import { tokens } from '@kairo/tokens'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'

// Short confirmation after an action: one line on the inverse surface,
// centered at the top. The caller replaces it with the next toast and
// dismisses it on a timer; this component only draws it.

type ToastProps = {
  children: string
  tone?: 'success' | 'error'
  closeLabel: string
  onClose: () => void
  /** Undo (success) or Retry (error). */
  actionLabel?: string
  onAction?: () => void
}

function Toast({ children, tone = 'success', closeLabel, onClose, actionLabel, onAction }: ToastProps) {
  return (
    <Box
      role="status"
      fixed
      top={16}
      left="50%"
      transform="translateX(-50%)"
      zIndex={95}
      display="flex"
      alignItems="center"
      gap={10}
      paddingVertical={9}
      paddingHorizontal={14}
      borderRadius={10}
      backgroundColor={tokens['surface.inverse']}
      boxShadow={tokens['shadow.pop']}
    >
      {tone === 'error' ? <Icon name="alert" size={14} color={tokens['color.bad']} /> : <Icon name="check" size={14} color={tokens['color.inverse-ok']} />}
      <Text fontSize={13} color={tokens['text.inverse']}>
        {children}
      </Text>
      {actionLabel && (
        <Pressable onClick={onAction} fontSize={13} fontWeight={500} color={tokens['color.inverse-link']}>
          {actionLabel}
        </Pressable>
      )}
      <Pressable aria-label={closeLabel} onClick={onClose} display="flex" alignItems="center">
        <Icon name="x" size={13} color={tokens['color.inverse-faint']} />
      </Pressable>
    </Box>
  )
}

export { Toast }
export type { ToastProps }
