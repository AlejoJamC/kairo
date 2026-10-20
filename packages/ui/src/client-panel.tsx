import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Badge } from './badge'
import { Callout } from './callout'
import { Chip } from './chip'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'
import { PropRow } from './prop-row'
import { SourceList, type SourceItem } from './source-list'

// Client tab of the context panel: who wrote, their account and their other
// tickets. Sections without rows are not shown.

type ClientAccount = {
  plan?: string | null
  mrr?: string | null
  since?: string | null
  /** Ticket count of the client; opens Clients filtered by this client. */
  tickets?: { value: number; onOpen?: () => void } | null
  csat?: string | null
  nps?: string | null
}

type ClientPanelProps = {
  name: string
  email?: string | null
  /** Draft client: the badge and the notice. */
  draft?: boolean
  account?: ClientAccount | null
  otherTickets?: readonly SourceItem[]
  similarTickets?: readonly SourceItem[]
  loading?: boolean
  /** The account did not load: this text replaces the account data. */
  error?: string
  labels: {
    draftBadge: string
    draftNotice: string
    account: string
    plan: string
    mrr: string
    since: string
    tickets: string
    csat: string
    nps: string
    otherTickets: string
    similarTickets: string
    /** "Client data unavailable." (no account data). */
    unavailable: string
  }
}

function ClientPanel({ name, email, draft, account, otherTickets = [], similarTickets = [], loading, error, labels }: ClientPanelProps) {
  return (
    <Box role="tabpanel" display="flex" flexDirection="column" gap={18} padding={18}>
      <Box display="flex" alignItems="center" gap={12}>
        {loading ? (
          <>
            <Skeleton width={38} height={38} borderRadius={999} />
            <Box flexGrow={1} display="flex" flexDirection="column" gap={6}>
              <Skeleton height={12} width="60%" />
              <Skeleton height={10} width="40%" />
            </Box>
          </>
        ) : (
          <>
            <Avatar soft size={38} name={name} email={email} aria-hidden />
            <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" gap={2}>
              <Box display="flex" alignItems="center" gap={8} minWidth={0}>
                <Text fontSize={14} fontWeight={600} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {name}
                </Text>
                {draft && <Badge variant="draft">{labels.draftBadge}</Badge>}
              </Box>
              {email && (
                <Text font="mono" fontSize={11.5} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {email}
                </Text>
              )}
            </Box>
          </>
        )}
      </Box>

      {draft && !loading && (
        <Callout tone="note" icon={<Icon name="info" size={14} color={tokens['notes.label']} />}>
          {labels.draftNotice}
        </Callout>
      )}

      {error ? (
        <Text tag="p" display="block" margin={0} fontSize={13} color={tokens['text.tertiary']}>
          {error}
        </Text>
      ) : !loading && !account ? (
        <Text tag="p" display="block" margin={0} fontSize={13} color={tokens['text.tertiary']}>
          {labels.unavailable}
        </Text>
      ) : (
        <Box>
          <Text tag="div" role="heading" aria-level={3} display="block" paddingBottom={4} font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
            {labels.account}
          </Text>
          {loading ? (
            [labels.plan, labels.mrr, labels.since, labels.tickets, labels.csat, labels.nps].map((label, index) => (
              <PropRow key={label} label={label} last={index === 5}>
                <Skeleton height={10} width="40%" />
              </PropRow>
            ))
          ) : (
            <>
              <PropRow label={labels.plan}>{account?.plan ? <Chip size="sm">{account.plan}</Chip> : null}</PropRow>
              <PropRow label={labels.mrr} mono>
                {account?.mrr}
              </PropRow>
              <PropRow label={labels.since}>{account?.since}</PropRow>
              <PropRow label={labels.tickets} mono>
                {account?.tickets &&
                  (account.tickets.onOpen ? (
                    <Pressable onClick={account.tickets.onOpen} font="mono" color={tokens['accent.ink']} textAlign="left" textDecoration="underline" textUnderlineOffset={2}>
                      {account.tickets.value}
                    </Pressable>
                  ) : (
                    account.tickets.value
                  ))}
              </PropRow>
              <PropRow label={labels.csat} mono>
                {account?.csat}
              </PropRow>
              <PropRow label={labels.nps} mono last>
                {account?.nps}
              </PropRow>
            </>
          )}
        </Box>
      )}

      <SourceList title={labels.otherTickets} items={otherTickets} />
      <SourceList title={labels.similarTickets} items={similarTickets} />
    </Box>
  )
}

export { ClientPanel }
export type { ClientAccount, ClientPanelProps }
