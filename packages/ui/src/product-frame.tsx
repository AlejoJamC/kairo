import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { px } from './lib/units'

// Shows the real app inside a frame on the public web: a title bar with three
// dots and a mono route pill, then real app components at 1:1. Never an
// illustration. The bare variant (the wizard asides) has no bar: only a short
// list of compact queue rows, named by the list's own label.

type ProductFrameBarProps = {
  /** Describes the view for assistive technology. */
  label: string
  /** Route shown in the pill, for example "app.acme.com/inbox". */
  route: string
  bare?: false
  children: ReactNode
}

type ProductFrameBareProps = {
  bare: true
  children: ReactNode
}

type ProductFrameProps = ProductFrameBarProps | ProductFrameBareProps

const frame = {
  overflow: 'hidden',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: tokens['border.default'],
  borderRadius: px(tokens['radius.frame']),
  backgroundColor: tokens['surface.panel'],
  boxShadow: tokens['shadow.frame'],
} as const

function ProductFrame(props: ProductFrameProps) {
  if (props.bare) {
    return (
      <Box {...frame} padding={8}>
        {props.children}
      </Box>
    )
  }
  return (
    <Box tag="figure" role="img" aria-label={props.label} margin={0} {...frame}>
      <Box display="flex" alignItems="center" gap={12} height={40} paddingHorizontal={14} backgroundColor={tokens['surface.sidebar']} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
        <Box display="flex" gap={6} aria-hidden>
          {[0, 1, 2].map((index) => (
            <Box key={index} width={9} height={9} circle backgroundColor={tokens['border.strong']} />
          ))}
        </Box>
        <Text font="mono" fontSize={11} paddingVertical={3} paddingHorizontal={10} borderRadius={999} backgroundColor={tokens['surface.panel']} color={tokens['text.tertiary']}>
          {props.route}
        </Text>
      </Box>
      <Box aria-hidden>{props.children}</Box>
    </Box>
  )
}

export { ProductFrame }
export type { ProductFrameProps }
