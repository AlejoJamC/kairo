import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'

// Anatomy of a public web section: container, vertical rhythm, header and
// alternating backgrounds. The grid background is decorative.

type SectionProps = {
  /** Background: page and sidebar alternate; one dark band per page. */
  surface?: 'page' | 'sidebar' | 'inverse'
  /** Narrow container (960px) for text-heavy sections. */
  narrow?: boolean
  /** First section of a page has no top border. */
  first?: boolean
  /** Masked grid, only in hero, final CTA, auth and wizard. */
  grid?: boolean
  id?: string
  children: ReactNode
}

const BACKGROUND = {
  page: tokens['surface.page'],
  sidebar: tokens['surface.sidebar'],
  inverse: tokens['surface.inverse'],
} as const

function GridBackground() {
  return (
    <Box
      aria-hidden
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
      pointerEvents="none"
      backgroundImage={`linear-gradient(${tokens['border.default']} 1px, transparent 1px), linear-gradient(90deg, ${tokens['border.default']} 1px, transparent 1px)`}
      opacity={0.6}
    />
  )
}

function Section({ surface = 'page', narrow, first, grid, id, children }: SectionProps) {
  return (
    <Box
      tag="section"
      id={id}
      position="relative"
      paddingVertical={120}
      backgroundColor={BACKGROUND[surface]}
      borderTopWidth={first ? 0 : 1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      overflow="hidden"
    >
      {grid && <GridBackground />}
      <Box position="relative" maxWidth={narrow ? 960 : 1200} marginHorizontal="auto" paddingHorizontal={32}>
        {children}
      </Box>
    </Box>
  )
}

type SectionHeaderProps = {
  /** Numbered eyebrow, for example "01 · Triage". */
  eyebrow?: string
  title: string
  body?: string
  /** Heading level. */
  level?: 'h1' | 'h2'
  inverse?: boolean
}

function SectionHeader({ eyebrow, title, body, level = 'h2', inverse }: SectionHeaderProps) {
  return (
    <Box marginBottom={56}>
      {eyebrow && (
        <Text tag="div" display="block" marginBottom={14} font="mono" fontSize={11.5} letterSpacing={0.7} textTransform="uppercase" color={inverse ? tokens['color.inverse-faint'] : tokens['text.tertiary']}>
          {eyebrow}
        </Text>
      )}
      <Text tag={level} display="block" margin={0} fontSize={44} fontWeight={600} letterSpacing={-1.2} lineHeightRatio={1.08} color={inverse ? tokens['color.inverse-text'] : tokens['text.primary']}>
        {title}
      </Text>
      {body && (
        <Text tag="p" display="block" margin={0} marginTop={16} maxWidth={600} fontSize={17} lineHeightRatio={1.55} color={inverse ? tokens['color.inverse-faint'] : tokens['text.secondary']}>
          {body}
        </Text>
      )}
    </Box>
  )
}

export { Section, SectionHeader, GridBackground }
export type { SectionProps, SectionHeaderProps }
