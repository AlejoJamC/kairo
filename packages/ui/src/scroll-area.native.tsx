// React Native implementation — resolved by Metro instead of scroll-area.tsx.
// TypeScript checks are done on the web file only (see tsconfig.json exclude).

import { ScrollView, type ScrollViewProps } from 'react-native'
import type { ReactNode } from 'react'

type ScrollAreaProps = ScrollViewProps & {
  children?: ReactNode
  orientation?: 'vertical' | 'horizontal'
}

function ScrollArea({
  children,
  orientation = 'vertical',
  style,
  ...props
}: ScrollAreaProps) {
  const isHorizontal = orientation === 'horizontal'
  return (
    <ScrollView
      horizontal={isHorizontal}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      style={[{ flex: 1 }, style]}
      {...props}
    >
      {children}
    </ScrollView>
  )
}

// Scrollbars on RN are system-controlled — no custom scrollbar component.
function ScrollBar(_props: unknown) {
  return null
}

export { ScrollArea, ScrollBar }
export type { ScrollAreaProps }
