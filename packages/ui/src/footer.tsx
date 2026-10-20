import type { ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Box, Text } from './layout'

// The public web footer, and the reduced one-line footer of the auth pages.
// Each column is its own navigation landmark.

type FooterLink = { label: string; href: string }
type FooterColumn = { title: string; links: readonly FooterLink[] }

type SiteFooterProps = {
  brand: ReactNode
  description: string
  /** Optional mono line under the description. */
  note?: string
  columns: readonly FooterColumn[]
  copyright: string
  /** Web version in mono. */
  version?: string
}

function LinkText({ link }: { link: FooterLink }) {
  return (
    <Text tag="a" href={link.href} fontSize={13.5} color={tokens['text.secondary']} textDecoration="none" hoverStyle={{ color: tokens['text.primary'] }}>
      {link.label}
    </Text>
  )
}

function SiteFooter({ brand, description, note, columns, copyright, version }: SiteFooterProps) {
  return (
    <Box tag="footer" backgroundColor={tokens['surface.sidebar']} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
      <Box maxWidth={1200} marginHorizontal="auto" paddingVertical={56} paddingHorizontal={32}>
        <Box grid gridTemplateColumns="2fr repeat(4, 1fr)" gap={32}>
          <Box>
            {brand}
            <Text tag="p" display="block" margin={0} marginTop={12} maxWidth={280} fontSize={13.5} lineHeightRatio={1.55} color={tokens['text.secondary']}>
              {description}
            </Text>
            {note && (
              <Text tag="div" display="block" marginTop={20} font="mono" fontSize={11} color={tokens['text.tertiary']}>
                {note}
              </Text>
            )}
          </Box>
          {columns.map((column) => (
            <Box key={column.title} tag="nav" aria-label={column.title}>
              <Text tag="div" display="block" marginBottom={12} font="mono" fontSize={10.5} letterSpacing={0.6} textTransform="uppercase" color={tokens['text.tertiary']}>
                {column.title}
              </Text>
              <Box display="flex" flexDirection="column" gap={8}>
                {column.links.map((link) => (
                  <LinkText key={link.label} link={link} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        <Box display="flex" justifyContent="space-between" marginTop={40} paddingTop={20} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']}>
          <Text fontSize={12.5} color={tokens['text.tertiary']}>
            {copyright}
          </Text>
          {version && (
            <Text font="mono" fontSize={11.5} color={tokens['text.tertiary']}>
              {version}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  )
}

type AuthFooterProps = { links: readonly FooterLink[]; copyright: string }

function AuthFooter({ links, copyright }: AuthFooterProps) {
  return (
    <Box tag="footer" display="flex" justifyContent="center" gap={14} paddingVertical={20}>
      {links.map((link) => (
        <Text key={link.label} tag="a" href={link.href} font="mono" fontSize={11.5} color={tokens['text.tertiary']} textDecoration="none" hoverStyle={{ color: tokens['text.primary'] }}>
          {link.label}
        </Text>
      ))}
      <Text font="mono" fontSize={11.5} color={tokens['text.tertiary']}>{copyright}</Text>
    </Box>
  )
}

export { SiteFooter, AuthFooter }
export type { SiteFooterProps, AuthFooterProps, FooterColumn, FooterLink }
