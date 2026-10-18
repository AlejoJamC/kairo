// There is no pointer-driven pane resizing on touch screens: panes stack at
// full width. The component is kept so shared screens can render it unchanged.
type ResizerProps = {
  label: string
  value: number
  min: number
  max: number
  onValueChange: (value: number) => void
  onCommit?: (value: number) => void
  onReset?: () => void
  invert?: boolean
  step?: number
}

function Resizer(_props: ResizerProps) {
  return null
}

export { Resizer }
export type { ResizerProps }
