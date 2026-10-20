import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { px } from './lib/units'

// Shows the real app inside a frame on the public web: a title bar with three
// dots and a mono route pill, then real app components at 1:1. Never an
// illustration.

type ProductFrameProps = {
  /** Describes the view for assistive technology. */
  label: string
  /** Route shown in the pill, for example "app.acme.com/inbox". */
  route: string
  /** Compact: 6–8px padding for a short list of queue rows. */
  compact?: boolean
  children: ReactNode
}

function ProductFrame({ label, route, compact, children }: ProductFrameProps) {
  return (
    <Box
      tag="figure"
      role="img"
      aria-label={label}
      margin={0}
      overflow="hidden"
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.frame'])}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.frame']}
    >
      <Box display="flex" alignItems="center" gap={12} height={40} paddingHorizontal={14} backgroundColor={tokens['surface.sidebar']} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
        <Box display="flex" gap={6} aria-hidden>
          {[0, 1, 2].map((index) => (
            <Box key={index} width={9} height={9} circle backgroundColor={tokens['border.strong']} />
          ))}
        </Box>
        <Text font="mono" fontSize={11} paddingVertical={3} paddingHorizontal={10} borderRadius={999} backgroundColor={tokens['surface.panel']} color={tokens['text.tertiary']}>
          {route}
        </Text>
      </Box>
      <Box padding={compact ? 6 : 0} aria-hidden>
        {children}
      </Box>
    </Box>
  )
}

export { ProductFrame }
export type { ProductFrameProps }
