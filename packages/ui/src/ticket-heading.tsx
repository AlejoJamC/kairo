import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { CategoryChip, type CategoryScale } from './category-chip'
import { Chip } from './chip'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Skeleton } from './loading'
import { Menu, MenuItem } from './menu'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { px } from './lib/units'
import { PriorityGlyph, type PriorityLevel } from './priority-glyph'
import { ReclassifyPopover, type ReclassifyPopoverProps } from './reclassify-popover'

// Head of the ticket content: the subject, the editable classification and the
// SLA. It opens the reading column, before the evidence panel.

type HeadingCategory = { id: string; scale: CategoryScale; value: string; label: string }

type TicketHeadingProps = {
  subject: string
  /** No classification yet: two shim bars in place of the chips. */
  classifying?: boolean
  priority?: PriorityLevel | null
  /** Offered priorities; without onPriorityChange the chip is static. */
  priorityOptions?: readonly PriorityLevel[]
  onPriorityChange?: (priority: PriorityLevel) => void
  /** Controls the priority menu from outside (a command opens it). */
  priorityMenu?: { open: boolean; onOpenChange: (open: boolean) => void }
  categories: readonly HeadingCategory[]
  /** "Wrong classification?" opens this popover. Hidden when read-only or absent. */
  reclassify?: Omit<ReclassifyPopoverProps, 'trigger'>
  /** sla-indicator, full variant; hidden when the SLA is unknown. */
  sla?: ReactNode
  /** Final status: static priority chip, no correction. */
  readOnly?: boolean
  labels: {
    /** "Priority P1, change". */
    priorityChip: (priority: string) => string
    priorityMenu: string
    wrongClassification: string
    classifying: string
  }
}

function TicketHeading({ subject, classifying, priority, priorityOptions, onPriorityChange, priorityMenu: priorityMenuState, categories, reclassify, sla, readOnly, labels }: TicketHeadingProps) {
  const editable = !readOnly && !!priorityOptions && !!onPriorityChange
  const priorityContent = priority ? (
    <>
      <PriorityGlyph priority={priority} size={12} label={false} />
      <Text font="mono" fontSize={11.5} fontWeight={500} color={tokens['text.primary']}>
        {priority}
      </Text>
    </>
  ) : null
  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Text tag="h2" display="block" margin={0} fontSize={22} fontWeight={600} lineHeightRatio={1.25} letterSpacing={-0.33} color={tokens['text.primary']}>
        {subject}
      </Text>
      <Box display="flex" flexWrap="wrap" alignItems="center" gap={6}>
        {classifying ? (
          <Box display="flex" gap={6} role="status" aria-label={labels.classifying}>
            <Skeleton width={64} height={24} borderRadius={999} />
            <Skeleton width={64} height={24} borderRadius={999} />
          </Box>
        ) : (
          <>
            {priority &&
              (editable ? (
                <Popover open={priorityMenuState?.open} onOpenChange={priorityMenuState?.onOpenChange}>
                  <PopoverTrigger>
                    <Pressable
                      aria-label={labels.priorityChip(priority)}
                      aria-haspopup="menu"
                      display="inline-flex"
                      alignItems="center"
                      gap={4}
                      height={px(tokens['size.chip'])}
                      paddingHorizontal={9}
                      borderRadius={px(tokens['radius.pill'])}
                      borderWidth={1}
                      borderStyle="solid"
                      borderColor={tokens['border.default']}
                      backgroundColor={tokens['surface.panel']}
                      color={tokens['text.primary']}
                      hoverStyle={{ borderColor: tokens['border.strong'] }}
                    >
                      {priorityContent}
                      <Icon name="down" size={11} color={tokens['text.tertiary']} />
                    </Pressable>
                  </PopoverTrigger>
                  <PopoverContent role="menu" label={labels.priorityMenu} width={170}>
                    <Menu label={labels.priorityMenu}>
                      {priorityOptions.map((level) => (
                        <MenuItem
                          key={level}
                          label={level}
                          current={level === priority}
                          icon={<PriorityGlyph priority={level} size={12} label={false} />}
                          onSelect={() => onPriorityChange(level)}
                        />
                      ))}
                    </Menu>
                  </PopoverContent>
                </Popover>
              ) : (
                <Chip icon={priorityContent} />
              ))}
            {categories.map((category) => (
              <CategoryChip key={category.id} scale={category.scale} value={category.value} label={category.label} />
            ))}
            {!readOnly && reclassify && (
              <ReclassifyPopover
                {...reclassify}
                trigger={
                  <Button variant="ghost" size="xs" icon={<Icon name="flag" size={12} />}>
                    {labels.wrongClassification}
                  </Button>
                }
              />
            )}
          </>
        )}
      </Box>
      {sla}
    </Box>
  )
}

export { TicketHeading }
export type { HeadingCategory, TicketHeadingProps }
