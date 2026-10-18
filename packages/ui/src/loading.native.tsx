import type { ReactNode } from 'react'
import { ActivityIndicator, Text, View, type DimensionValue, type ViewStyle } from 'react-native'
import { tokens } from '@kairo/tokens'

// React Native counterparts of loading.tsx. Bars are static; the spinner is the
// platform indicator.

type SkeletonProps = { width?: DimensionValue; height?: number; style?: ViewStyle }

function Skeleton({ width = '60%', height = 10, style }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      style={[{ width, height, borderRadius: 4, backgroundColor: tokens['surface.hover'] }, style]}
    />
  )
}

function PulseDot({ style }: { style?: ViewStyle }) {
  return (
    <View
      accessibilityElementsHidden
      style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: tokens['accent.default'] }, style]}
    />
  )
}

type SpinnerProps = { size?: 'sm' | 'lg'; label?: string; onAccent?: boolean }

function Spinner({ size = 'sm', label, onAccent }: SpinnerProps) {
  return (
    <ActivityIndicator
      size={size === 'lg' ? 'large' : 'small'}
      color={onAccent ? tokens['text.onAccent'] : tokens['accent.default']}
      accessibilityLabel={label}
    />
  )
}

function Caret({ style }: { style?: ViewStyle }) {
  return (
    <View
      accessibilityElementsHidden
      style={[{ width: 7, height: 14, backgroundColor: tokens['accent.default'] }, style]}
    />
  )
}

function LoadingStatus({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="progressbar" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <PulseDot />
      <Text style={{ fontFamily: 'Courier', fontSize: 11, color: tokens['text.tertiary'] }}>{children}</Text>
    </View>
  )
}

export { Skeleton, PulseDot, Spinner, Caret, LoadingStatus }
export type { SkeletonProps, SpinnerProps }
