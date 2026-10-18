import { createElement, type CSSProperties } from 'react'
import { tokens } from '@kairo/tokens'
import { iconNodes, SPARK_PATH, type IconName } from './icon-data'

// Inline line icon: 24 viewBox, currentColor stroke, round caps and joins.
// Decorative by default (aria-hidden); give it a label when it carries meaning.

type IconProps = {
  name: IconName
  /** Pixels. 12-16 in the interface; 44 only in empty states. */
  size?: number
  /** Defaults to the text color of the container. */
  color?: string
  /** Defaults to 2.2 at 13px and below, 1.7 above. */
  strokeWidth?: number
  /** Fills the shape (for example a rating star); the spark is always filled. */
  fill?: string
  /** Makes the icon meaningful: role="img" with this accessible name. */
  label?: string
  style?: CSSProperties
}

function Icon({ name, size = 14, color = 'currentColor', strokeWidth, fill, label, style }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    role: label ? 'img' : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : true,
    focusable: false,
    style: { flexShrink: 0, ...style },
  }

  if (name === 'spark') {
    const fill = color === 'currentColor' ? tokens['accent.default'] : color
    return (
      <svg {...common} fill={fill}>
        <path d={SPARK_PATH} />
      </svg>
    )
  }

  return (
    <svg
      {...common}
      fill={fill ?? 'none'}
      stroke={color}
      strokeWidth={strokeWidth ?? (size <= 13 ? 2.2 : 1.7)}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconNodes[name].map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
    </svg>
  )
}

export { Icon }
export type { IconProps, IconName }
