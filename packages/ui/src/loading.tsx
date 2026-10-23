import { useEffect, type ReactNode } from 'react'
import { styled, Stack, Text, type GetProps } from '@tamagui/core'
import { tokens } from '@kairo/tokens'
import { ensureMotionStyles } from './lib/motion-css'
import { px } from './lib/units'

// Progress indicators: skeleton bar, pulse dot, spinner, writing caret and the
// status line that announces them. Animations are CSS classes (see
// lib/motion-css) and stop with prefers-reduced-motion.

function useMotion() {
  useEffect(ensureMotionStyles, [])
}

const SkeletonBar = styled(Stack, {
  name: 'Skeleton',
  height: 10,
  borderRadius: px(tokens['radius.xs']),
  backgroundColor: tokens['surface.hover'],
})

type SkeletonProps = Omit<GetProps<typeof SkeletonBar>, 'children'>

function Skeleton(props: SkeletonProps) {
  useMotion()
  return <SkeletonBar className="kairo-ui-shim" aria-hidden {...props} />
}

const PulseFrame = styled(Stack, {
  name: 'PulseDot',
  width: 6,
  height: 6,
  borderRadius: 999,
  backgroundColor: tokens['accent.default'],
})

function PulseDot(props: Omit<GetProps<typeof PulseFrame>, 'children'>) {
  useMotion()
  return <PulseFrame className="kairo-ui-pulse" aria-hidden {...props} />
}

const SpinnerFrame = styled(Stack, {
  name: 'Spinner',
  borderRadius: 999,
  borderColor: tokens['border.strong'],
  borderTopColor: tokens['accent.default'],
  variants: {
    size: {
      sm: { width: 11, height: 11, borderWidth: 2 },
      md: { width: 18, height: 18, borderWidth: 2 },
      lg: { width: 28, height: 28, borderWidth: 3 },
    },
    // On an accent fill: white track at 35%, white top.
    onAccent: {
      true: { borderColor: 'rgba(255,255,255,0.35)', borderTopColor: tokens['text.onAccent'] },
    },
  } as const,
  defaultVariants: { size: 'sm' },
})

type SpinnerProps = Omit<GetProps<typeof SpinnerFrame>, 'children'> & {
  /** Names the spinner for assistive technology; omit when a status line already does. */
  label?: string
}

function Spinner({ label, ...props }: SpinnerProps) {
  useMotion()
  return (
    <SpinnerFrame
      className="kairo-ui-spin"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    />
  )
}

const CaretFrame = styled(Stack, {
  name: 'Caret',
  width: 7,
  height: 14,
  backgroundColor: tokens['accent.default'],
})

function Caret(props: Omit<GetProps<typeof CaretFrame>, 'children'>) {
  useMotion()
  return <CaretFrame className="kairo-ui-caret" aria-hidden {...props} />
}

const StatusFrame = styled(Stack, {
  name: 'LoadingStatus',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
})

const StatusText = styled(Text, {
  name: 'LoadingStatusText',
  fontFamily: '$mono',
  fontSize: 11,
  color: tokens['text.tertiary'],
})

/** Mono status line with a pulse dot; the live region announces the text, not the animation. */
function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <StatusFrame role="status" aria-live="polite">
      <PulseDot />
      <StatusText>{children}</StatusText>
    </StatusFrame>
  )
}

export { Skeleton, PulseDot, Spinner, Caret, LoadingStatus }
export type { SkeletonProps, SpinnerProps }
