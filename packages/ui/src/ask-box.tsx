import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { PlainTextarea } from './plain'
import { px } from './lib/units'

// The input to ask the AI, fixed at the bottom of the assistant panel. Enter
// sends, Shift+Enter adds a line. While an answer is running the send button
// becomes Stop and no new question can be sent. The textarea grows with its
// content up to 120px.

type AskContext = {
  id: string
  label: string
  icon?: IconName
  /** Dashed "add context" chip. */
  add?: boolean
  onPress?: () => void
}

type AskBoxProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  /** An answer is running. */
  answering?: boolean
  /** The last question was not sent. The text is kept. */
  error?: boolean
  onRetry?: () => void
  contexts?: readonly AskContext[]
  /** Name of the model, shown in the selector chip. */
  model?: string
  hint?: string
  /** Moves the focus to the field (Cmd+J); `onFocused` tells the caller it happened. */
  autoFocus?: boolean
  onFocused?: () => void
  labels: { placeholder: string; textarea: string; send: string; stop: string; retry: string; error: string }
}

const CHIP = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  paddingVertical: 2,
  paddingHorizontal: 7,
  borderRadius: 6,
  borderWidth: 1,
  font: 'mono',
  fontSize: 11,
} as const

function grow(element: HTMLElement) {
  const target = element as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = `${Math.min(120, target.scrollHeight)}px`
}

function AskBox({ value, onChange, onSend, onStop, answering, error, onRetry, contexts, model, hint, autoFocus, onFocused, labels }: AskBoxProps) {
  const filled = value.trim().length > 0
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!autoFocus) return
    field.current?.focus()
    onFocused?.()
  }, [autoFocus, onFocused])
  useEffect(() => {
    if (!value && field.current) field.current.style.height = 'auto'
  }, [value])
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (filled && !answering) onSend()
    }
  }
  return (
    <Box
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={12}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.xs']}
      overflow="hidden"
    >
      {contexts && contexts.length > 0 && (
        <Box display="flex" alignItems="center" gap={5} paddingTop={7} paddingHorizontal={8} flexWrap="wrap">
          {contexts.map((context) => (
            <Pressable
              key={context.id}
              type="button"
              onClick={context.onPress}
              {...CHIP}
              borderStyle={context.add ? 'dashed' : 'solid'}
              borderColor={tokens['border.default']}
              backgroundColor={context.add ? 'transparent' : tokens['surface.sidebar']}
              color={context.add ? tokens['text.tertiary'] : tokens['text.secondary']}
              maxWidth={150}
              cursor={context.onPress ? 'pointer' : 'default'}
              hoverStyle={{ borderColor: tokens['border.strong'] }}
            >
              {context.icon && <Icon name={context.icon} size={11} color={tokens['text.tertiary']} />}
              <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {context.label}
              </Text>
            </Pressable>
          ))}
        </Box>
      )}
      {error && (
        <Box role="alert" display="flex" gap={8} paddingTop={6} paddingHorizontal={12}>
          <Text fontSize={12} color={tokens['color.bad-ink']}>
            {labels.error}
          </Text>
          {onRetry && (
            <Pressable type="button" onClick={onRetry} fontSize={12} color={tokens['color.bad-ink']} textDecoration="underline">
              {labels.retry}
            </Pressable>
          )}
        </Box>
      )}
      <PlainTextarea
        ref={field}
        aria-label={labels.textarea}
        placeholder={labels.placeholder}
        value={value}
        rows={1}
        onChange={(event) => {
          onChange(event.target.value)
          grow(event.target)
        }}
        onKeyDown={onKeyDown}
        display="block"
        width="100%"
        paddingTop={8}
        paddingHorizontal={12}
        paddingBottom={4}
        borderWidth={0}
        backgroundColor="transparent"
        fontSize={13.5}
        lineHeight={20.25}
        color={tokens['text.primary']}
        resize="none"
        outlineWidth={0}
      />
      <Box display="flex" alignItems="center" gap={8} paddingTop={4} paddingHorizontal={8} paddingBottom={8} minWidth={0}>
        {model && (
          <Text
            display="flex"
            alignItems="center"
            gap={5}
            flexShrink={0}
            whiteSpace="nowrap"
            overflow="hidden"
            paddingVertical={3}
            paddingHorizontal={7}
            borderRadius={6}
            borderWidth={1}
            borderStyle="solid"
            borderColor={tokens['border.default']}
            font="mono"
            fontSize={11.5}
            color={tokens['text.secondary']}
          >
            <Box width={6} height={6} circle flexShrink={0} backgroundImage={`linear-gradient(135deg, ${tokens['accent.default']}, ${tokens['color.accent-indigo']})`} />
            {model}
          </Text>
        )}
        {hint && (
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" font="mono" fontSize={10.5} color={tokens['text.tertiary']}>
            {hint}
          </Text>
        )}
        {answering ? (
          <Pressable
            type="button"
            aria-label={labels.stop}
            title={labels.stop}
            onClick={onStop}
            marginLeft="auto"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            width={30}
            height={30}
            borderRadius={8}
            backgroundColor={tokens['surface.hover']}
          >
            <Icon name="square" size={12} color={tokens['text.secondary']} />
          </Pressable>
        ) : (
          <Pressable
            type="button"
            aria-label={labels.send}
            title={labels.send}
            disabled={!filled}
            onClick={onSend}
            marginLeft="auto"
            flexShrink={0}
            display="flex"
            alignItems="center"
            justifyContent="center"
            width={30}
            height={30}
            borderRadius={px(tokens['radius.control'])}
            backgroundColor={filled ? tokens['accent.default'] : tokens['surface.hover']}
            cursor={filled ? 'pointer' : 'default'}
            transition="background .12s"
            hoverStyle={filled ? { opacity: 0.93 } : undefined}
          >
            <Icon name="escalate" size={15} color={filled ? tokens['text.onAccent'] : tokens['text.tertiary']} />
          </Pressable>
        )}
      </Box>
    </Box>
  )
}

export { AskBox }
export type { AskBoxProps, AskContext }
