import type { ReactElement } from 'react'
import { useId } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { CategoryChip, type CategoryScale } from './category-chip'
import { Box, Text } from './layout'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

// Correction of the AI classification: the agent picks the labels that fit and
// saves. Every correction teaches Triage. It opens from "Wrong classification?"
// in the ticket heading and from the Classified row of the evidence panel.

type ReclassifyOption = {
  id: string
  scale: CategoryScale
  /** Value of the TicketType or TicketCategory union. */
  value: string
  /** Translated, lowercase display name. */
  label: string
}

type ReclassifyPopoverProps = {
  /** The button that opens it; it becomes the anchor. */
  trigger: ReactElement<Record<string, unknown>>
  open: boolean
  onOpenChange: (open: boolean) => void
  options: readonly ReclassifyOption[]
  /** Ids of the chosen options. */
  selected: readonly string[]
  onToggle: (id: string) => void
  onSave: () => void
  /** Disabled while the selection equals the current one or is empty. */
  canSave: boolean
  saving?: boolean
  /** The save failed: callout above the footer. */
  error?: string
  /** Where it sits relative to the anchor. */
  align?: 'start' | 'end'
  labels: { title: string; explanation: string; categories: string; cancel: string; save: string }
}

function ReclassifyPopover({ trigger, open, onOpenChange, options, selected, onToggle, onSave, canSave, saving, error, align = 'start', labels }: ReclassifyPopoverProps) {
  const titleId = useId()
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent label={labels.title} align={align} width={290} maxWidth="calc(100vw - 32px)" aria-labelledby={titleId}>
        <Box padding={12} display="flex" flexDirection="column" gap={10}>
          <Text id={titleId} fontWeight={600} color={tokens['text.primary']}>
            {labels.title}
          </Text>
          <Text fontSize={12} lineHeightRatio={1.45} color={tokens['text.tertiary']}>
            {labels.explanation}
          </Text>
          <Box role="group" aria-label={labels.categories} display="flex" flexWrap="wrap" gap={6}>
            {options.map((option) => (
              <CategoryChip
                key={option.id}
                scale={option.scale}
                value={option.value}
                label={option.label}
                selected={selected.includes(option.id)}
                onPress={() => onToggle(option.id)}
              />
            ))}
          </Box>
          {error && <Callout tone="error">{error}</Callout>}
          <Box display="flex" justifyContent="flex-end" gap={6}>
            <Button variant="ghost" onPress={() => onOpenChange(false)}>
              {labels.cancel}
            </Button>
            <Button variant="primary" size="sm" disabled={!canSave} loading={saving} onPress={onSave}>
              {labels.save}
            </Button>
          </Box>
        </Box>
      </PopoverContent>
    </Popover>
  )
}

export { ReclassifyPopover }
export type { ReclassifyOption, ReclassifyPopoverProps }
