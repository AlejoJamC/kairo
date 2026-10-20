import { createElement, type ReactNode } from 'react'

// Minimal SVG elements for the pieces that draw their own shapes. On web they
// are the DOM elements; lib/svg.native.tsx maps them to react-native-svg.

type Common = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'round' | 'butt' | 'square'
  strokeLinejoin?: 'round' | 'miter' | 'bevel'
  strokeDasharray?: string
  strokeDashoffset?: number
  opacity?: number
  transform?: string
}

type SvgProps = Common & {
  width: number
  height: number
  viewBox: string
  children?: ReactNode
  role?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
  title?: string
}

const tag =
  <P extends object>(name: string) =>
  (props: P) =>
    createElement(name, props)

function Svg({ title, children, ...props }: SvgProps) {
  return createElement('svg', { focusable: false, ...props }, title ? createElement('title', null, title) : null, children)
}

const Circle = tag<Common & { cx: number; cy: number; r: number }>('circle')
const Path = tag<Common & { d: string }>('path')
const Line = tag<Common & { x1: number; y1: number; x2: number; y2: number }>('line')

export { Svg, Circle, Path, Line }
