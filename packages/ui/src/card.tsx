import { styled, Stack, Text, type GetProps } from '@tamagui/core'

// ─── Card ────────────────────────────────────────────────────────────────────

const Card = styled(Stack, {
  name: 'Card',
  flexDirection: 'column',
  backgroundColor: '$background',
  borderRadius: '$card',
  borderWidth: 1,
  borderColor: '$borderColor',
  paddingVertical: '$5',   // 24px
  gap: '$5',               // 24px
  // Web shadow — ignored on RN (use elevation there if needed)
  shadowColor: '$black',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
})

// ─── CardHeader ──────────────────────────────────────────────────────────────
// Original used CSS Container Query (@container/card-header) for the
// action-column layout. That's web-only; on RN we use XStack with flex.

const CardHeader = styled(Stack, {
  name: 'CardHeader',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: '$2',               // 8px
  paddingHorizontal: '$5', // 24px
  flexWrap: 'wrap',
})

// ─── CardTitle ───────────────────────────────────────────────────────────────

const CardTitle = styled(Text, {
  name: 'CardTitle',
  fontSize: '$5',          // 20px (card h3 in type scale)
  fontWeight: '600',
  lineHeight: 20,
  color: '$color',
  flexShrink: 1,
})

// ─── CardDescription ─────────────────────────────────────────────────────────

const CardDescription = styled(Text, {
  name: 'CardDescription',
  fontSize: '$3',          // 14px
  color: '$colorSecondary',
  lineHeight: 20,
  flexShrink: 1,
})

// ─── CardAction ──────────────────────────────────────────────────────────────
// Positioned to the trailing end of CardHeader. On web the original used
// CSS grid; here we use marginLeft: 'auto' which works on both platforms.

const CardAction = styled(Stack, {
  name: 'CardAction',
  flexDirection: 'column',
  marginLeft: 'auto',
  alignSelf: 'flex-start',
})

// ─── CardContent ─────────────────────────────────────────────────────────────

const CardContent = styled(Stack, {
  name: 'CardContent',
  flexDirection: 'column',
  paddingHorizontal: '$5', // 24px
})

// ─── CardFooter ──────────────────────────────────────────────────────────────

const CardFooter = styled(Stack, {
  name: 'CardFooter',
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: '$5', // 24px
})

// ─── Types ───────────────────────────────────────────────────────────────────

type CardProps        = GetProps<typeof Card>
type CardHeaderProps  = GetProps<typeof CardHeader>
type CardTitleProps   = GetProps<typeof CardTitle>
type CardDescriptionProps = GetProps<typeof CardDescription>
type CardActionProps  = GetProps<typeof CardAction>
type CardContentProps = GetProps<typeof CardContent>
type CardFooterProps  = GetProps<typeof CardFooter>

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardActionProps,
  CardContentProps,
  CardFooterProps,
}
