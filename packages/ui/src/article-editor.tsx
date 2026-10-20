import { useState } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Chip } from './chip'
import { Field, FieldInput } from './field'
import { Icon } from './icon'
import { Box, Text } from './layout'
import { Skeleton } from './loading'
import { PlainInput, PlainTextarea } from './plain'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { PropRow } from './prop-row'
import { Switch } from './switch'
import { px } from './lib/units'

// Writes or edits one knowledge base article: title and content on the left,
// properties on the right. A read-only editor shows the same fields locked.

type ArticleDraft = {
  title: string
  content: string
  published: boolean
  /** Existing articles only. */
  review?: 'review' | 'reviewed' | null
  tags: readonly string[]
  /** Formatted date; existing articles only. */
  updated?: string
}

type ArticleEditorProps = {
  value: ArticleDraft
  onChange: (patch: Partial<ArticleDraft>) => void
  /** Hidden heading: "Edit article" or "Add article". */
  heading: string
  readOnly?: boolean
  loading?: boolean
  /** Save is disabled while there are no changes or the title or content is missing. */
  canSave: boolean
  saving?: boolean
  /** Unsaved changes: leaving asks first. */
  dirty?: boolean
  /** The save failed: callout above the body. */
  error?: string
  onSave: () => void
  onBack: () => void
  onDiscard: () => void
  /** Without it the review state shows no "Mark as reviewed" button. */
  onMarkReviewed?: () => void
  labels: {
    back: string
    discard: string
    save: string
    title: string
    titlePlaceholder: string
    contentPlaceholder: string
    published: string
    review: string
    reviewStates: { review: string; reviewed: string }
    markReviewed: string
    tags: string
    addTag: string
    removeTag: (tag: string) => string
    updated: string
    note: string
    discardChanges: string
    confirmDiscard: string
  }
}

function ArticleEditor({ value, onChange, heading, readOnly, loading, canSave, saving, dirty, error, onSave, onBack, onDiscard, onMarkReviewed, labels }: ArticleEditorProps) {
  const [tag, setTag] = useState('')
  const [leaving, setLeaving] = useState(false)
  const addTag = () => {
    const next = tag.trim()
    if (next && !value.tags.includes(next)) onChange({ tags: [...value.tags, next] })
    setTag('')
  }
  const back = (
    <Button
      variant="ghost"
      icon={<Icon name="back" size={13} />}
      onPress={() => (dirty ? setLeaving(true) : onBack())}
    >
      {labels.back}
    </Button>
  )
  return (
    <>
      <Text tag="h1" position="absolute" width={1} height={1} overflowX="hidden" overflowY="hidden" opacity={0} margin={0}>
        {heading}
      </Text>
      <Box display="flex" alignItems="center" gap={8}>
        <Popover open={leaving} onOpenChange={setLeaving}>
          <PopoverTrigger>{back}</PopoverTrigger>
          <PopoverContent label={labels.discardChanges} align="start">
            <Box padding={12} display="flex" flexDirection="column" gap={8}>
              <Text fontSize={12.5} color={tokens['text.primary']}>
                {labels.discardChanges}
              </Text>
              <Button variant="ghost" onPress={() => { setLeaving(false); onBack() }}>
                {labels.confirmDiscard}
              </Button>
            </Box>
          </PopoverContent>
        </Popover>
        <Box flexGrow={1} />
        {!readOnly && (
          <>
            <Button size="lg" onPress={onDiscard}>
              {labels.discard}
            </Button>
            <Button variant="primary" size="lg" disabled={!canSave} loading={saving} onPress={onSave}>
              {labels.save}
            </Button>
          </>
        )}
      </Box>
      {error && <Callout tone="error">{error}</Callout>}
      <Box grid gridTemplateColumns="minmax(0, 1fr) 280px" gap={24}>
        <Box display="flex" flexDirection="column" gap={12} minWidth={0}>
          {loading ? (
            <>
              <Skeleton height={24} width="50%" />
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} height={12} />
              ))}
            </>
          ) : (
            <>
              <PlainInput
                aria-label={labels.title}
                value={value.title}
                readOnly={readOnly}
                placeholder={labels.titlePlaceholder}
                onChange={(event) => onChange({ title: event.target.value })}
                width="100%"
                paddingVertical={8}
                paddingHorizontal={12}
                fontSize={20}
                fontWeight={600}
                lineHeight={26}
                color={tokens['text.primary']}
                backgroundColor={readOnly ? tokens['surface.hover'] : tokens['surface.sunken']}
                borderWidth={1}
                borderStyle="solid"
                borderColor={tokens['border.default']}
                borderRadius={px(tokens['radius.field'])}
                outlineWidth={0}
                focusStyle={{ borderColor: tokens['accent.line'], boxShadow: `0 0 0 3px ${tokens['accent.soft']}` }}
              />
              <PlainTextarea
                aria-label={labels.title}
                value={value.content}
                readOnly={readOnly}
                placeholder={labels.contentPlaceholder}
                rows={16}
                onChange={(event) => onChange({ content: event.target.value })}
                width="100%"
                paddingVertical={10}
                paddingHorizontal={12}
                fontSize={14}
                lineHeight={23}
                color={tokens['text.primary']}
                backgroundColor={readOnly ? tokens['surface.hover'] : tokens['surface.sunken']}
                borderWidth={1}
                borderStyle="solid"
                borderColor={tokens['border.default']}
                borderRadius={px(tokens['radius.field'])}
                outlineWidth={0}
                resize="vertical"
                focusStyle={{ borderColor: tokens['accent.line'], boxShadow: `0 0 0 3px ${tokens['accent.soft']}` }}
              />
            </>
          )}
        </Box>
        <Box display="flex" flexDirection="column" gap={12}>
          <Box paddingVertical={4} paddingHorizontal={16} borderWidth={1} borderStyle="solid" borderColor={tokens['border.default']} borderRadius={px(tokens['radius.card'])} backgroundColor={tokens['surface.panel']}>
            <PropRow label={labels.published}>
              <Switch checked={value.published} disabled={readOnly} label={labels.published} onCheckedChange={(published) => onChange({ published })} />
            </PropRow>
            {value.review && (
              <Box paddingVertical={8} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']}>
                <PropRow label={labels.review} last>
                  <Box display="flex" alignItems="center" gap={6}>
                    <Box width={6} height={6} circle backgroundColor={value.review === 'review' ? tokens['color.warn'] : tokens['color.ok']} aria-hidden />
                    <Text font="mono" fontSize={12} color={tokens['text.tertiary']}>
                      {labels.reviewStates[value.review]}
                    </Text>
                  </Box>
                </PropRow>
                {value.review === 'review' && !readOnly && onMarkReviewed && (
                  <Button size="sm" onPress={onMarkReviewed}>
                    {labels.markReviewed}
                  </Button>
                )}
              </Box>
            )}
            <Box paddingVertical={10} display="flex" flexDirection="column" gap={8}>
              <Text fontSize={13} color={tokens['text.tertiary']}>
                {labels.tags}
              </Text>
              <Box display="flex" flexWrap="wrap" gap={4}>
                {value.tags.map((entry) => (
                  <Chip key={entry} size="sm" onPress={readOnly ? undefined : () => onChange({ tags: value.tags.filter((t) => t !== entry) })} aria-label={labels.removeTag(entry)}>
                    {entry}
                  </Chip>
                ))}
              </Box>
              {!readOnly && (
                <Field label={labels.addTag} hideLabel>
                  <FieldInput
                    placeholder={labels.addTag}
                    value={tag}
                    height={px(tokens['size.control-sm'])}
                    onChangeText={setTag}
                    onKeyPress={(event: { nativeEvent: { key: string } }) => event.nativeEvent.key === 'Enter' && addTag()}
                  />
                </Field>
              )}
            </Box>
            {value.updated && (
              <PropRow label={labels.updated} mono last>
                <Text color={tokens['text.tertiary']}>{value.updated}</Text>
              </PropRow>
            )}
          </Box>
          <Callout>{labels.note}</Callout>
        </Box>
      </Box>
    </>
  )
}

export { ArticleEditor }
export type { ArticleDraft, ArticleEditorProps }
