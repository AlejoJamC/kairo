import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'

// Row of key figures. A missing value shows as a dash, never a sample number;
// while loading each value is a skeleton bar; on error the values show a dash
// and one line with a retry action appears under the strip.

type KpiItem = {
  label: string
  /** null or undefined: unknown, shown as a dash. */
  value: ReactNode | null | undefined
  /** Colors the value as urgent. */
  urgent?: boolean
}

type KpiStripProps = {
  items: readonly KpiItem[]
  loading?: boolean
  /** Message under the strip; marks every value unknown. */
  error?: string
  retryLabel?: string
  onRetry?: () => void
}

function KpiStrip({ items, loading, error, retryLabel = 'Retry', onRetry }: KpiStripProps) {
  return (
    <Box>
      <Box
        grid
        gridTemplateColumns={`repeat(${items.length}, 1fr)`}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        borderRadius={12}
        backgroundColor={tokens['surface.panel']}
        overflowX="hidden"
      >
        {items.map((item, index) => (
          <Box
            key={item.label}
            paddingVertical={16}
            paddingHorizontal={18}
            borderRightWidth={index < items.length - 1 ? 1 : 0}
            borderStyle="solid"
            borderRightColor={tokens['border.default']}
          >
            <Text tag="div" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
              {item.label}
            </Text>
            <Box marginTop={6} height={29} display="flex" alignItems="center">
              {loading ? (
                <Skeleton width={60} height={22} />
              ) : (
                <Text fontSize={24} fontWeight={600} letterSpacing={-0.48} lineHeightRatio={1.2} color={item.urgent ? tokens['color.bad-ink'] : tokens['text.primary']}>
                  {error || item.value === null || item.value === undefined ? '—' : item.value}
                </Text>
              )}
            </Box>
          </Box>
        ))}
      </Box>
      {error && (
        <Box role="alert" display="flex" alignItems="center" gap={8} marginTop={8}>
          <Text fontSize={12} color={tokens['color.bad-ink']}>
            {error}
          </Text>
          {onRetry && (
            <Pressable onClick={onRetry} fontSize={12} fontWeight={500} color={tokens['accent.ink']}>
              {retryLabel}
            </Pressable>
          )}
        </Box>
      )}
    </Box>
  )
}

export { KpiStrip }
export type { KpiStripProps, KpiItem }
