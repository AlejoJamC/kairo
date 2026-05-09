// Web implementation — used by Vite (apps/dashboard) and Next.js (apps/landing).
// Metro automatically resolves scroll-area.native.tsx for React Native.

import { styled, Stack, type GetProps } from '@tamagui/core'
import type { ReactNode } from 'react'

// ─── Outer container ──────────────────────────────────────────────────────────

const ScrollAreaOuter = styled(Stack, {
  name: 'ScrollArea',
  position: 'relative',
  overflow: 'hidden',
  flex: 1,
})

// ─── Scrollable viewport ─────────────────────────────────────────────────────
// overflow: 'auto' on web → browser's native scrollbar, styled via ScrollBar.

const ScrollAreaViewport = styled(Stack, {
  name: 'ScrollAreaViewport',
  width: '100%',
  height: '100%',
  // @ts-expect-error — overflowY is a valid CSS property, Tamagui passes it through on web
  overflowY: 'auto',
  borderRadius: 'inherit',
})

// ─── Public ScrollArea ────────────────────────────────────────────────────────

type ScrollAreaProps = GetProps<typeof ScrollAreaOuter> & {
  children?: ReactNode
  /** orientation is accepted for API compat but scroll direction
   *  is controlled via CSS on web (overflowY / overflowX). */
  orientation?: 'vertical' | 'horizontal'
}

function ScrollArea({ children, orientation: _orientation, ...props }: ScrollAreaProps) {
  return (
    <ScrollAreaOuter {...props}>
      <ScrollAreaViewport>{children}</ScrollAreaViewport>
    </ScrollAreaOuter>
  )
}

// ─── ScrollBar ────────────────────────────────────────────────────────────────
// Custom scrollbar styling. On web, the browser renders the scrollbar —
// this component applies a thin overlay scrollbar via CSS custom properties.
// On RN, scroll-area.native.tsx exports a no-op ScrollBar instead.

const ScrollBarFrame = styled(Stack, {
  name: 'ScrollBar',
  position: 'absolute',
  userSelect: 'none',
  // @ts-ignore — touchAction is valid CSS, not in Tamagui's type surface
  touchAction: 'none',

  variants: {
    orientation: {
      vertical: {
        top: 0,
        right: 0,
        bottom: 0,
        width: 10,
        borderLeftWidth: 1,
        borderLeftColor: 'transparent',
      },
      horizontal: {
        bottom: 0,
        left: 0,
        right: 0,
        height: 10,
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'transparent',
      },
    },
  } as const,

  defaultVariants: {
    orientation: 'vertical',
  },
})

type ScrollBarProps = GetProps<typeof ScrollBarFrame> & {
  orientation?: 'vertical' | 'horizontal'
}

function ScrollBar({ orientation = 'vertical', ...props }: ScrollBarProps) {
  return <ScrollBarFrame orientation={orientation} {...props} />
}

export { ScrollArea, ScrollBar }
export type { ScrollAreaProps, ScrollBarProps }
