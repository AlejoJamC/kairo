import type { ReactNode } from 'react'
import { Text } from '../layout'

/** Text for screen readers only; keeps its place in the reading order. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <Text position="absolute" width={1} height={1} overflowX="hidden" overflowY="hidden" opacity={0} whiteSpace="nowrap">
      {children}
    </Text>
  )
}
