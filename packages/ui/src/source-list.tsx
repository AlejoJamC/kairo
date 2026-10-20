import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'
import { PriorityGlyph } from './priority-glyph'
import { px } from './lib/units'

// Lists where an answer comes from, or which tickets are related. Rows that
// open are buttons; the others are static. The header only shows when there
// are rows.

type SourceKind = 'ticket' | 'client' | 'similar' | 'compact'

type SourceItem = {
  id: string
  /**
   * ticket / client: source of an assistant answer (icon tile).
   * compact: one line of "Other tickets" with the priority glyph.
   * similar: one line of "Similar tickets" with the link icon.
   */
  kind: SourceKind
  /** Overrides the icon of the kind (a knowledge article in an answer's sources). */
  icon?: IconName
  /** Mono identifier, for example KAI-101. */
  code?: string
  title: string
  /** Mono text on the right: location, "same issue", similarity. */
  meta?: string
  /** Priority for the compact row (P1, P2, P3). */
  priority?: string
  /** The similarity of a web case is shown in ok-ink instead of accent-ink. */
  metaTone?: 'accent' | 'ok'
  /** Opens the referenced item; rows without it are static. */
  onOpen?: () => void
}

type SourceListProps = {
  title: string
  items: readonly SourceItem[]
  /** Two skeleton rows in place of the items. */
  loading?: boolean
}

const ICON: Record<'ticket' | 'client', IconName> = { ticket: 'triage', client: 'user' }

function Lead({ item }: { item: SourceItem }) {
  if (item.kind === 'compact') return <PriorityGlyph priority={item.priority} size={12} label={false} />
  if (item.kind === 'similar') return <Icon name={item.icon ?? 'link'} size={12} color={tokens['accent.ink']} />
  const ticketLike = item.kind === 'ticket'
  return (
    <Box
      width={22}
      height={22}
      flexShrink={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      borderRadius={6}
      backgroundColor={ticketLike ? tokens['accent.soft'] : tokens['surface.hover']}
      aria-hidden
    >
      <Icon name={item.icon ?? ICON[item.kind]} size={12} color={ticketLike ? tokens['accent.ink'] : tokens['text.secondary']} />
    </Box>
  )
}

function Row({ item }: { item: SourceItem }) {
  const opens = item.onOpen !== undefined
  const metaColor = item.metaTone === 'ok' ? tokens['color.ok-ink'] : opens || item.kind === 'similar' ? tokens['accent.ink'] : tokens['text.tertiary']
  const content = (
    <>
      <Lead item={item} />
      {item.code && (
        <Text font="mono" fontSize={item.kind === 'ticket' || item.kind === 'client' ? 11 : 11.5} color={tokens['text.tertiary']}>
          {item.code}
        </Text>
      )}
      <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {item.title}
      </Text>
      {item.meta && (
        <Text font="mono" fontSize={11} color={metaColor} flexShrink={0}>
          {item.meta}
        </Text>
      )}
    </>
  )
  const frame = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: px(tokens['radius.field']),
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: tokens['border.default'],
    backgroundColor: tokens['surface.panel'],
  } as const
  if (opens) {
    const name = `${[item.code, item.title].filter(Boolean).join(' ')}${item.meta ? `, ${item.meta}` : ''}`
    return (
      <Pressable
        aria-label={name}
        onClick={item.onOpen}
        {...frame}
        textAlign="left"
        hoverStyle={{ borderColor: tokens['accent.line'], backgroundColor: tokens['accent.soft'] }}
        pressStyle={{ borderColor: tokens['accent.line'], backgroundColor: tokens['accent.soft'] }}
      >
        {content}
      </Pressable>
    )
  }
  return <Box {...frame}>{content}</Box>
}

function SourceList({ title, items, loading }: SourceListProps) {
  if (!loading && items.length === 0) return null
  return (
    <Box>
      <Text tag="div" role="heading" aria-level={3} display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']} marginBottom={6}>
        {title}
      </Text>
      <Box display="flex" flexDirection="column" gap={6}>
        {loading
          ? [0, 1].map((index) => (
              <Box key={index} height={36} display="flex" flexDirection="column" justifyContent="center" gap={6} paddingHorizontal={10} borderRadius={px(tokens['radius.field'])} borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']}>
                <Skeleton height={10} width="60%" />
              </Box>
            ))
          : items.map((item) => <Row key={item.id} item={item} />)}
      </Box>
    </Box>
  )
}

export { SourceList }
export type { SourceListProps, SourceItem, SourceKind }
