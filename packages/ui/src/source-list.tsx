import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'

// Lists where an answer comes from, or which tickets are related. Rows that
// open are buttons; the others are static. The header only shows when there
// are rows.

type SourceKind = 'ticket' | 'client' | 'similar'

type SourceItem = {
  id: string
  kind: SourceKind
  /** Overrides the icon of the kind (a knowledge article in an answer's sources). */
  icon?: IconName
  /** Mono identifier, for example KAI-101. */
  code?: string
  title: string
  /** Mono text on the right: location, similarity. */
  meta?: string
  /** Opens the referenced item; rows without it are static. */
  onOpen?: () => void
}

type SourceListProps = {
  title: string
  items: readonly SourceItem[]
}

const ICON: Record<SourceKind, IconName> = { ticket: 'triage', client: 'user', similar: 'link' }

function Row({ item }: { item: SourceItem }) {
  const opens = item.onOpen !== undefined
  const ticketLike = item.kind !== 'client'
  const content = (
    <>
      <Box
        width={22}
        height={22}
        flexShrink={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius={6}
        backgroundColor={ticketLike ? tokens['accent.soft'] : tokens['surface.hover']}
      >
        <Icon name={item.icon ?? ICON[item.kind]} size={12} color={ticketLike ? tokens['accent.ink'] : tokens['text.secondary']} />
      </Box>
      {item.code && (
        <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
          {item.code}
        </Text>
      )}
      <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12.5} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
        {item.title}
      </Text>
      {item.meta && (
        <Text font="mono" fontSize={11} color={opens ? tokens['accent.ink'] : tokens['text.tertiary']}>
          {item.meta}
        </Text>
      )}
    </>
  )

  if (opens) {
    return (
      <Pressable
        onClick={item.onOpen}
        display="flex"
        alignItems="center"
        gap={8}
        width="100%"
        padding={6}
        borderRadius={8}
        borderWidth={1}
        borderStyle="solid"
        borderColor="transparent"
        textAlign="left"
        hoverStyle={{ borderColor: tokens['accent.line'], backgroundColor: tokens['accent.soft'] }}
      >
        {content}
      </Pressable>
    )
  }
  return (
    <Box display="flex" alignItems="center" gap={8} padding={6} borderWidth={1} borderStyle="solid" borderColor="transparent">
      {content}
    </Box>
  )
}

function SourceList({ title, items }: SourceListProps) {
  if (items.length === 0) return null
  return (
    <Box>
      <Text tag="div" display="block" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']} marginBottom={6}>
        {title}
      </Text>
      <Box display="flex" flexDirection="column" gap={2}>
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </Box>
    </Box>
  )
}

export { SourceList }
export type { SourceListProps, SourceItem, SourceKind }
