import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Callout } from './callout'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { Skeleton } from './loading'

// An AI-generated reply draft. The AI never sends: every action is the
// agent's. The assistant variant offers Copy and Insert into reply; the web
// variant offers Regenerate, Edit and Send and resolve.

type DraftCardProps = {
  /** "DRAFT AI" badge text. */
  badge: string
  /** "Re: [subject]" or the source. */
  heading?: string
  /** Mono source and confidence (web variant). */
  meta?: string
  body: string
  /** Regenerating: the body becomes skeleton bars and actions are disabled. */
  loading?: boolean
  /** The draft failed: a callout with Retry replaces the body. */
  error?: { message: string; retryLabel: string; onRetry: () => void }
  variant?: 'assistant' | 'web'
  actions: ReactNode
}

function DraftCard({ badge, heading, meta, body, loading, error, variant = 'assistant', actions }: DraftCardProps) {
  const web = variant === 'web'
  return (
    <Box fadeIn borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} borderRadius={10} backgroundColor={tokens['surface.panel']} overflowX="hidden" overflowY="hidden">
      <Box display="flex" alignItems="center" gap={8} paddingVertical={8} paddingHorizontal={12} backgroundColor={tokens['surface.sunken']} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
        <Text display="inline-flex" alignItems="center" gap={4} font="mono" fontSize={9.5} paddingHorizontal={6} paddingVertical={1} borderRadius={4} backgroundColor={tokens['accent.soft']} color={tokens['accent.ink']}>
          <Icon name="spark" size={9} />
          {badge}
        </Text>
        {heading && (
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12} color={tokens['text.secondary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {heading}
          </Text>
        )}
        {meta && (
          <Text font="mono" fontSize={11} color={tokens['color.ok-ink']}>
            {meta}
          </Text>
        )}
      </Box>
      <Box padding={12} maxHeight={web ? undefined : 180} scroll>
        {error ? (
          <Callout tone="error" actionLabel={error.retryLabel} onAction={error.onRetry}>
            {error.message}
          </Callout>
        ) : loading ? (
          <Box display="flex" flexDirection="column" gap={8}>
            <Skeleton height={10} width="90%" />
            <Skeleton height={10} width="75%" />
            <Skeleton height={10} width="55%" />
          </Box>
        ) : (
          <Text tag="div" display="block" whiteSpace="pre-wrap" fontSize={web ? 13.5 : 12.5} lineHeightRatio={1.6} color={tokens['text.primary']}>
            {body}
          </Text>
        )}
      </Box>
      {!error && (
        <Box display="flex" alignItems="center" justifyContent="flex-end" gap={8} paddingVertical={8} paddingHorizontal={12} backgroundColor={web ? tokens['surface.sunken'] : undefined} borderTopWidth={web ? 1 : 0} borderStyle="solid" borderTopColor={tokens['border.default']}>
          {actions}
        </Box>
      )}
    </Box>
  )
}

export { DraftCard }
export type { DraftCardProps }
