import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'
import { PriorityGlyph, type PriorityLevel } from './priority-glyph'
import { Segmented } from './segmented'
import { VisuallyHidden } from './lib/visually-hidden'
import { px } from './lib/units'
import { useWindowChrome } from './window-chrome'

// Header of the queue pane: view title, count, optional action, filter bar and
// the suggestion under it. The list of ticket rows follows the header.

type QueueBarVariant = 'filters' | 'plain' | 'pills'

type QueueHeaderProps = {
  title: string
  /** "6/8" in Triage, a total elsewhere; undefined hides it, null shows a dash. */
  count?: string | number | null
  /** Screen reader text of the count ("6 of 8 open tickets"). */
  countLabel?: string
  description?: string
  /** Secondary button of the title line ("Classify"). */
  action?: ReactNode
  /** Content of the bottom bar: priority filters or filter-pill tabs. */
  bar?: ReactNode
  /** plain: an empty 14px bar; filters / pills: the bar holds `bar`. */
  barVariant?: QueueBarVariant
  /** Suggestion callout under the bar (Triage only). */
  suggestion?: ReactNode
}

function QueueHeader({ title, count, countLabel, description, action, bar, barVariant = 'filters', suggestion }: QueueHeaderProps) {
  const macosWindow = useWindowChrome()
  return (
    <Box display="flex" flexDirection="column" flexShrink={0}>
      <Box dragRegion={macosWindow} display="flex" alignItems="center" gap={8} minHeight={px(tokens['size.header'])} paddingTop={14} paddingRight={12} paddingLeft={20}>
        <Text tag="h1" margin={0} fontSize={16} fontWeight={600} letterSpacing={-0.16} color={tokens['text.primary']}>
          {title}
        </Text>
        {count !== undefined && (
          <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>
            {count === null ? '—' : count}
            {countLabel && <VisuallyHidden>{countLabel}</VisuallyHidden>}
          </Text>
        )}
        <Box dragRegion={macosWindow} flexGrow={1} alignSelf="stretch" />
        {action}
      </Box>
      {description && (
        <Text tag="p" display="block" margin={0} marginTop={4} marginHorizontal={20} fontSize={12.5} lineHeightRatio={1.5} color={tokens['text.tertiary']}>
          {description}
        </Text>
      )}
      <Box
        display="flex"
        alignItems="center"
        gap={4}
        height={barVariant === 'plain' ? 14 : undefined}
        paddingVertical={barVariant === 'plain' ? 0 : 10}
        paddingHorizontal={barVariant === 'pills' ? 20 : 14}
        borderBottomWidth={1}
        borderStyle="solid"
        borderBottomColor={tokens['border.default']}
        overflowX="auto"
      >
        {barVariant === 'plain' ? null : bar}
      </Box>
      {suggestion && (
        <Box marginTop={10} marginHorizontal={12}>
          {suggestion}
        </Box>
      )}
    </Box>
  )
}

type PriorityFilterTabsProps = {
  value: 'all' | PriorityLevel
  onChange: (value: 'all' | PriorityLevel) => void
  /** Open tickets with each priority; null while there is no data. */
  counts: { all: number | null; P1: number | null; P2: number | null; P3: number | null }
  labels: { priority: string; all: string }
}

/** All · P1 · P2 · P3: the view tabs of the Triage queue, each with its glyph and count. */
function PriorityFilterTabs({ value, onChange, counts, labels }: PriorityFilterTabsProps) {
  return (
    <Segmented
      variant="tabs"
      label={labels.priority}
      value={value}
      onChange={onChange}
      items={[
        { value: 'all', label: labels.all, count: counts.all },
        ...(['P1', 'P2', 'P3'] as const).map((level) => ({
          value: level,
          label: level,
          icon: <PriorityGlyph priority={level} size={12} label={false} />,
          count: counts[level],
        })),
      ]}
    />
  )
}

export { PriorityFilterTabs, QueueHeader }
export type { PriorityFilterTabsProps, QueueBarVariant, QueueHeaderProps }
