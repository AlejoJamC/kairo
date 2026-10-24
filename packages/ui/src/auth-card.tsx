import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Icon } from './icon'
import { Spinner } from './loading'
import { Box, Text } from './layout'
import { Path, Svg } from './lib/svg'
import { px } from './lib/units'

// The centered card for sign-in, invitation and password pages. AuthLayout is
// the page (header, reduced footer, masked grid); AuthCard is the form card.

type AuthLayoutProps = {
  header?: ReactNode
  footer?: ReactNode
  /** 420px column for invitations instead of 400px. */
  wide?: boolean
  children: ReactNode
}

function AuthLayout({ header, footer, wide, children }: AuthLayoutProps) {
  return (
    <Box display="flex" flexDirection="column" minHeight="100vh" backgroundColor={tokens['surface.sidebar']}>
      {header}
      <Box flexGrow={1} display="flex" alignItems="center" justifyContent="center" paddingVertical={40} paddingHorizontal={16}>
        <Box width="100%" maxWidth={wide ? 420 : 400}>
          {children}
        </Box>
      </Box>
      {footer}
    </Box>
  )
}

type AuthProvider = { id: string; label: string; icon?: ReactNode; onPress: () => void }

/** Desktop: the card that replaces the form while the browser confirms the sign-in. */
type AuthWait = {
  title: string
  body: string
  copyLabel: string
  /** Read after the link was copied: "Link copied". */
  copiedLabel: string
  copied: boolean
  onCopy: () => void
  cancelLabel: string
  onCancel: () => void
}

type AuthCardProps = {
  /** Desktop: the brand mark above a centered title. */
  mark?: ReactNode
  /** Desktop, continue in your browser: replaces the form card. */
  wait?: AuthWait
  title: string
  subtitle?: string
  providers?: readonly AuthProvider[]
  /** The "or with email" divider text. */
  dividerLabel?: string
  /** Fields with labels. */
  children?: ReactNode
  /** Link under the fields (forgot password). */
  aside?: ReactNode
  error?: string
  submitLabel: string
  loading?: boolean
  loadingLabel?: string
  /** Submit disabled until the form is valid. */
  submitDisabled?: boolean
  /** Key shown inside the submit button (↵ in the desktop sign-in). */
  submitKey?: string
  onSubmit: () => void
  /** Text below the card (no account yet, and so on). */
  footer?: ReactNode
}

function AuthCard({ mark, wait, title, subtitle, providers, dividerLabel, children, aside, error, submitLabel, loading, loadingLabel, submitDisabled, submitKey, onSubmit, footer }: AuthCardProps) {
  return (
    <Box>
      <Box marginBottom={24} display="flex" flexDirection="column" alignItems={mark ? 'center' : 'flex-start'} gap={12}>
        {mark}
        <Box>
          <Text tag="h1" display="block" margin={0} textAlign={mark ? 'center' : 'left'} fontSize={26} fontWeight={600} color={tokens['text.primary']}>
            {title}
          </Text>
          {subtitle && (
            <Text tag="p" display="block" margin={0} marginTop={6} textAlign={mark ? 'center' : 'left'} fontSize={14.5} color={tokens['text.secondary']}>
              {subtitle}
            </Text>
          )}
        </Box>
      </Box>
      {wait ? (
        <AuthWaitCard {...wait} />
      ) : (
      <Box
        padding={24}
        borderWidth={1}
        borderStyle="solid"
        borderColor={tokens['border.default']}
        borderRadius={px(tokens['radius.card'])}
        backgroundColor={tokens['surface.panel']}
        boxShadow={tokens['shadow.xs']}
      >
        {providers && providers.length > 0 && (
          <Box display="flex" flexDirection="column" gap={8}>
            {providers.map((provider) => (
              <Button key={provider.id} size="web" full disabled={loading} icon={provider.icon} onPress={provider.onPress}>
                {provider.label}
              </Button>
            ))}
            {dividerLabel && (
              <Box display="flex" alignItems="center" gap={10} marginVertical={8}>
                <Box flexGrow={1} height={1} backgroundColor={tokens['border.default']} />
                <Text fontSize={12} color={tokens['text.tertiary']}>
                  {dividerLabel}
                </Text>
                <Box flexGrow={1} height={1} backgroundColor={tokens['border.default']} />
              </Box>
            )}
          </Box>
        )}
        <Box
          tag="form"
          display="flex"
          flexDirection="column"
          gap={14}
          onSubmit={(event: FormEvent<HTMLElement>) => {
            event.preventDefault()
            if (!loading && !submitDisabled) onSubmit()
          }}
        >
          {children}
          {aside}
          {error && <Callout tone="error">{error}</Callout>}
          <Button variant="primary" size="web" full loading={loading} loadingLabel={loadingLabel} disabled={submitDisabled} keyHint={submitKey} type="submit">
            {submitLabel}
          </Button>
        </Box>
      </Box>
      )}
      {footer && (
        <Text tag="div" display="block" marginTop={16} textAlign="center" fontSize={13} color={tokens['text.secondary']}>
          {footer}
        </Text>
      )}
    </Box>
  )
}

/** The slice of the DOM the focus move needs; the native build has no DOM types. */
type FocusRoot = { querySelector(selector: string): { focus(): void } | null }

function AuthWaitCard({ title, body, copyLabel, copiedLabel, copied, onCopy, cancelLabel, onCancel }: AuthWait) {
  const ref = useRef<HTMLElement>(null)
  // Focus moves to Copy link when the card appears.
  useEffect(() => {
    (ref.current as unknown as FocusRoot | null)?.querySelector('button')?.focus()
  }, [])
  return (
    <Box
      ref={ref}
      role="status"
      aria-live="polite"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={14}
      paddingVertical={28}
      paddingHorizontal={24}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.card'])}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.pop']}
    >
      <Spinner size="md" />
      <Box display="flex" flexDirection="column" gap={6}>
        <Text textAlign="center" fontSize={15} fontWeight={600} color={tokens['text.primary']}>
          {title}
        </Text>
        <Text textAlign="center" maxWidth={300} fontSize={12.5} color={tokens['text.secondary']}>
          {body}
        </Text>
      </Box>
      <Box display="flex" flexWrap="wrap" justifyContent="center" gap={8}>
        <Button icon={<Icon name="copy" size={13} />} onPress={onCopy}>
          {copied ? copiedLabel : copyLabel}
        </Button>
        <Button variant="ghost" onPress={onCancel}>
          {cancelLabel}
        </Button>
      </Box>
    </Box>
  )
}

type InvitationSummaryProps = {
  workspace: string
  /** Avatar of the inviter, shown beside the workspace tile. */
  inviter?: ReactNode
  rows: readonly { label: string; value: string }[]
}

function InvitationSummary({ workspace, inviter, rows }: InvitationSummaryProps) {
  return (
    <Box marginBottom={16}>
      <Box display="flex" alignItems="center" gap={12} marginBottom={12}>
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          width={44}
          height={44}
          borderRadius={px(tokens['radius.row'])}
          backgroundColor={tokens['accent.soft']}
        >
          <Text fontSize={18} fontWeight={600} color={tokens['accent.ink']}>
            {workspace.slice(0, 1).toUpperCase()}
          </Text>
        </Box>
        {inviter}
      </Box>
      {rows.map((row, index) => (
        <Box
          key={row.label}
          display="flex"
          justifyContent="space-between"
          paddingVertical={8}
          borderTopWidth={index === 0 ? 0 : 1}
          borderStyle="solid"
          borderTopColor={tokens['border.default']}
        >
          <Text fontSize={13} color={tokens['text.tertiary']}>{row.label}</Text>
          <Text fontSize={13} color={tokens['text.primary']}>{row.value}</Text>
        </Box>
      ))}
    </Box>
  )
}


/** The Google "G" in its brand colors, for the provider button. */
function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <Path fill="#EA4335" d="M12 11v3.4h4.8a4.8 4.8 0 01-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5 0-.7-.1-1.4-.2-2L12 11z" />
      <Path fill="#34A853" d="M12 21c2.7 0 5-.9 6.6-2.4l-3.3-2.6c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.5-4H3.2v2.5A10 10 0 0012 21z" />
      <Path fill="#FBBC05" d="M6.5 13c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V6.5H3.2A10 10 0 002 11c0 1.6.4 3.2 1.2 4.5L6.5 13z" />
      <Path fill="#4285F4" d="M12 5.4c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 2.3 14.6 1.4 12 1.4A10 10 0 003.2 6.5L6.5 9c.8-2.3 3-4 5.5-4z" />
    </Svg>
  )
}

export { AuthLayout, AuthCard, InvitationSummary, GoogleMark }
export type { AuthLayoutProps, AuthWait, AuthCardProps, AuthProvider, InvitationSummaryProps }
