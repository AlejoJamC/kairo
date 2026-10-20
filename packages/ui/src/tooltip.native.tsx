import type { ReactElement } from 'react'

// Touch screens have no hover, so the tooltip is not shown: the trigger renders as is.
type TooltipProps = {
  label: string
  shortcut?: string
  side?: 'top' | 'right'
  disabled?: boolean
  children: ReactElement
}

function Tooltip({ children }: TooltipProps) {
  return children
}

export { Tooltip }
export type { TooltipProps }
