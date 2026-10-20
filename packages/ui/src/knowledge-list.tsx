import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { FilterPill, FilterPillGroup } from './filter-pill'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'
import { PageHeader, PageSearch, PageToolbar } from './page-header'
import { px } from './lib/units'

// List of the knowledge base articles the assistant can cite in its answers and
// drafts: header, filters with search and the article table.

type ArticleState = 'published' | 'draft' | 'review'

type KnowledgeArticleRow = {
  id: string
  title: string
  /** First line of the content. */
  preview: string
  tags: readonly string[]
  state: ArticleState
  /** Formatted date. */
  updated: string
}

type KnowledgeListProps = {
  title: string
  total?: number | null
  countLabel?: string
  description: string
  /** Owners and admins add and edit; others read only. */
  canEdit: boolean
  onAdd: () => void
  filters: readonly { id: string; label: string; count: number | null }[]
  filter: string
  onFilter: (id: string) => void
  query: string
  onQuery: (query: string) => void
  articles: readonly KnowledgeArticleRow[]
  /** Articles exist in the workspace but the filters hide them all. */
  onOpen: (id: string) => void
  loading?: boolean
  error?: { message: string; retryLabel: string; onRetry: () => void }
  /** The workspace has no articles at all. */
  empty?: boolean
  labels: {
    add: string
    filters: string
    search: string
    article: string
    tags: string
    state: string
    updated: string
    states: Record<ArticleState, string>
    emptyTitle: string
    emptyDescription: string
    noResults: string
  }
}

const GRID = 'minmax(260px, 2.6fr) minmax(0, 1.4fr) 0.9fr 0.8fr'
const STATE_DOT: Record<ArticleState, string> = {
  published: tokens['color.ok'],
  draft: tokens['border.strong'],
  review: tokens['color.warn'],
}

function Row({ article, labels, onOpen }: { article: KnowledgeArticleRow; labels: KnowledgeListProps['labels']; onOpen: (id: string) => void }) {
  return (
    <Pressable
      role="row"
      aria-label={`${article.title}, ${labels.states[article.state]}, ${labels.updated} ${article.updated}`}
      onClick={() => onOpen(article.id)}
      grid
      gridTemplateColumns={GRID}
      alignItems="center"
      gap={12}
      width="100%"
      minWidth={760}
      paddingVertical={12}
      paddingHorizontal={18}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      textAlign="left"
      hoverStyle={{ backgroundColor: tokens['surface.hover'] }}
    >
      <Box minWidth={0}>
        <Text tag="div" display="block" fontSize={13} fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {article.title}
        </Text>
        <Text tag="div" display="block" fontSize={12.5} color={tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {article.preview}
        </Text>
      </Box>
      <Box display="flex" alignItems="center" gap={4} minWidth={0}>
        {article.tags.slice(0, 2).map((tag) => (
          <Text key={tag} height={20} display="inline-flex" alignItems="center" paddingHorizontal={7} borderRadius={999} borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} fontSize={11} color={tokens['text.secondary']}>
            {tag}
          </Text>
        ))}
        {article.tags.length > 2 && (
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            +{article.tags.length - 2}
          </Text>
        )}
      </Box>
      <Box display="flex" alignItems="center" gap={6}>
        <Box width={6} height={6} circle backgroundColor={STATE_DOT[article.state]} aria-hidden />
        <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>
          {labels.states[article.state]}
        </Text>
      </Box>
      <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>
        {article.updated}
      </Text>
    </Pressable>
  )
}

function KnowledgeList({ title, total, countLabel, description, canEdit, onAdd, filters, filter, onFilter, query, onQuery, articles, onOpen, loading, error, empty, labels }: KnowledgeListProps) {
  const addButton = canEdit ? (
    <Button variant="primary" size="lg" icon={<Icon name="plus" size={13} color={tokens['text.onAccent']} />} onPress={onAdd}>
      {labels.add}
    </Button>
  ) : undefined
  return (
    <>
      <PageHeader title={title} count={total} countLabel={countLabel} description={description} action={addButton} />
      {!empty && (
        <PageToolbar>
          <FilterPillGroup label={labels.filters}>
            {filters.map((entry) => (
              <FilterPill key={entry.id} kind="tab" active={entry.id === filter} count={entry.count} onPress={() => onFilter(entry.id)}>
                {entry.label}
              </FilterPill>
            ))}
          </FilterPillGroup>
          <PageSearch label={labels.search} value={query} placeholder={labels.search} onChange={onQuery} />
        </PageToolbar>
      )}
      {error ? (
        <Box display="flex" flexDirection="column" alignItems="center" gap={10} paddingVertical={40}>
          <Text fontSize={13} color={tokens['text.tertiary']}>
            {error.message}
          </Text>
          <Button onPress={error.onRetry}>{error.retryLabel}</Button>
        </Box>
      ) : empty ? (
        <Box borderWidth={1} borderStyle="dashed" borderColor={tokens['border.strong']} borderRadius={px(tokens['radius.card'])} paddingVertical={56} paddingHorizontal={24}>
          <EmptyState
            title={labels.emptyTitle}
            description={labels.emptyDescription}
            padding={0}
            action={
              canEdit ? (
                <Button variant="primary" size="lg" onPress={onAdd}>
                  {labels.add}
                </Button>
              ) : undefined
            }
          />
        </Box>
      ) : (
        <Box role="table" overflowX="auto" borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} borderRadius={px(tokens['radius.card'])} backgroundColor={tokens['surface.panel']}>
          <Box role="row" grid gridTemplateColumns={GRID} gap={12} minWidth={760} paddingVertical={12} paddingHorizontal={18}>
            {[labels.article, labels.tags, labels.state, labels.updated].map((header) => (
              <Text key={header} role="columnheader" font="mono" fontSize={10.5} letterSpacing={0.63} textTransform="uppercase" color={tokens['text.tertiary']}>
                {header}
              </Text>
            ))}
          </Box>
          {loading ? (
            [0, 1, 2, 3, 4].map((index) => (
              <Box key={index} display="flex" flexDirection="column" gap={6} paddingVertical={12} paddingHorizontal={18} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
                <Skeleton height={12} width="50%" />
                <Skeleton height={10} width="70%" />
              </Box>
            ))
          ) : articles.length === 0 ? (
            <Text tag="div" display="block" paddingVertical={40} paddingHorizontal={18} textAlign="center" fontSize={13} color={tokens['text.tertiary']} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
              {labels.noResults}
            </Text>
          ) : (
            articles.map((article) => <Row key={article.id} article={article} labels={labels} onOpen={onOpen} />)
          )}
        </Box>
      )}
    </>
  )
}

export { KnowledgeList }
export type { ArticleState, KnowledgeArticleRow, KnowledgeListProps }
