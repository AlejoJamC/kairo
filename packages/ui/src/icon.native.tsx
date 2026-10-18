import type { ComponentType } from 'react'
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg'
import { tokens } from '@kairo/tokens'
import { iconNodes, SPARK_PATH, type IconName } from './icon-data'

const SHAPES = { path: Path, circle: Circle, ellipse: Ellipse, line: Line, polyline: Polyline, polygon: Polygon, rect: Rect } as const

type IconProps = {
  name: IconName
  size?: number
  color?: string
  strokeWidth?: number
  fill?: string
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  /** Makes the icon meaningful: announced with this accessible name. */
  label?: string
}

function Icon({ name, size = 14, color = tokens['text.secondary'], strokeWidth, fill, label, marginTop, marginBottom, marginLeft, marginRight }: IconProps) {
  const accessibility = label
    ? ({ accessible: true, accessibilityLabel: label, accessibilityRole: 'image' } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const)

  if (name === 'spark') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color === tokens['text.secondary'] ? tokens['accent.default'] : color} {...accessibility}>
        <Path d={SPARK_PATH} />
      </Svg>
    )
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke={color}
      strokeWidth={strokeWidth ?? (size <= 13 ? 2.2 : 1.7)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ marginTop, marginBottom, marginLeft, marginRight }}
      {...accessibility}
    >
      {iconNodes[name].map(([tag, attributes], index) => {
        const Shape = SHAPES[tag] as unknown as ComponentType<Record<string, string | number>>
        return <Shape key={index} {...attributes} />
      })}
    </Svg>
  )
}

export { Icon }
export type { IconProps, IconName }
