import { tokens } from '@kairo/tokens'
import { useId } from 'react'
import { Callout } from './callout'
import { Icon } from './icon'
import { Box, Pressable, Text } from './layout'
import { Spinner } from './loading'
import { Kbd } from './kbd'
import { Menu, MenuItem } from './menu'
import { PlainTextarea } from './plain'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Segmented } from './segmented'
import { px } from './lib/units'
import type { ComposerProps } from './composer-types'

// Reply and internal-note composer of a ticket. Internal-note mode switches the
// whole surface to the note palette. Send is disabled while empty; ⌘↵ sends.
// The caller owns the behavior (drafts, mentions, templates); this piece owns
// the frame, the modes, the split Send and the sending and error states.

function SendControls({ note, canSend, sending, onSend, sendOptions, labels }: Pick<ComposerProps, 'sending' | 'onSend' | 'sendOptions' | 'labels'> & { note: boolean; canSend: boolean }) {
  const text = sending ? labels.sending : labels.send
  const active = canSend || sending
  if (note) {
    return (
      <Pressable
        type="button"
        disabled={!canSend}
        onClick={onSend}
        display="flex"
        alignItems="center"
        gap={6}
        height={px(tokens['size.control'])}
        fontSize={12.5}
        fontWeight={500}
        paddingHorizontal={12}
        borderRadius={px(tokens['radius.control'])}
        backgroundColor={tokens['notes.sendAction']}
        color={tokens['text.onAccent']}
        opacity={active ? 1 : 0.55}
        cursor={canSend ? 'pointer' : 'default'}
        aria-busy={sending || undefined}
      >
        {sending ? <Spinner onAccent /> : <Icon name="lock" size={12} />}
        {text}
      </Pressable>
    )
  }
  const hasOptions = !!sendOptions && sendOptions.length > 0
  return (
    <Box display="flex" alignItems="stretch" height={px(tokens['size.control'])} borderRadius={px(tokens['radius.control'])} overflowX="hidden" overflowY="hidden" backgroundColor={tokens['accent.default']} opacity={active ? 1 : 0.55}>
      <Pressable
        type="button"
        title={`${labels.send} (⌘↵)`}
        aria-keyshortcuts="Meta+Enter"
        disabled={!canSend}
        onClick={onSend}
        aria-busy={sending || undefined}
        display="flex"
        alignItems="center"
        gap={6}
        fontSize={12.5}
        fontWeight={500}
        paddingLeft={11}
        paddingRight={hasOptions ? 12 : 14}
        color={tokens['text.onAccent']}
        hoverStyle={canSend ? { opacity: 0.93 } : undefined}
        cursor={canSend ? 'pointer' : 'default'}
      >
        {sending ? <Spinner onAccent /> : <Icon name="send" size={13} />}
        {text}
      </Pressable>
      {hasOptions && (
        <>
          <Box width={1} alignSelf="center" height={18} backgroundColor={tokens['color.inverse-faint']} aria-hidden />
          <Popover>
            <PopoverTrigger>
              <Pressable
                type="button"
                disabled={!canSend}
                aria-label={labels.sendOptions}
                aria-haspopup="menu"
                display="flex"
                alignItems="center"
                justifyContent="center"
                paddingHorizontal={8}
                alignSelf="stretch"
                color={tokens['text.onAccent']}
                hoverStyle={canSend ? { opacity: 0.93 } : undefined}
                cursor={canSend ? 'pointer' : 'default'}
              >
                <Icon name="down" size={13} />
              </Pressable>
            </PopoverTrigger>
            <PopoverContent role="menu" label={labels.sendOptions} side="top" align="end" width={220}>
              <Menu label={labels.sendOptions}>
                {sendOptions.map((option) => (
                  <MenuItem key={option.id} label={option.label} disabled={option.disabled} shortcut={option.shortcut ? <Kbd>{option.shortcut}</Kbd> : undefined} onSelect={option.onSelect} />
                ))}
              </Menu>
            </PopoverContent>
          </Popover>
        </>
      )}
    </Box>
  )
}

function Composer({
  mode,
  onModeChange,
  value,
  onChange,
  onSend,
  sending,
  error,
  onRetry,
  hint,
  status,
  tools,
  noteRow,
  banner,
  panel,
  actions,
  sendOptions,
  counter,
  popover,
  placeholder,
  maxLength,
  fieldRef,
  onFieldKeyDown,
  onFieldSelect,
  labels,
}: ComposerProps) {
  const note = mode === 'note'
  const canSend = value.trim().length > 0 && !sending
  const hintId = useId()
  const hintText = status?.tone === 'success' ? status.text : hint
  return (
    <Box
      position="relative"
      flexShrink={0}
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={note ? tokens['notes.border'] : tokens['border.default']}
      backgroundColor={note ? tokens['notes.background'] : tokens['surface.panel']}
      paddingTop={10}
      paddingHorizontal={20}
      paddingBottom={14}
    >
      <Box display="flex" flexDirection="column" gap={8} maxWidth={px(tokens['layout.reading'])}>
        <Box display="flex" alignItems="center" gap={8} minWidth={0}>
          {onModeChange && (
            <Segmented
              label={labels.modeGroup}
              value={mode}
              onChange={sending ? () => {} : onModeChange}
              items={[
                { value: 'reply', label: labels.reply, icon: <Icon name="send" size={12} />, disabled: sending },
                { value: 'note', label: labels.note, icon: <Icon name="lock" size={12} />, tone: 'note', disabled: sending },
              ]}
            />
          )}
          <Text id={hintId} flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={12} color={status?.tone === 'success' ? tokens['color.ok-ink'] : tokens['text.tertiary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" title={hintText}>
            {hintText}
          </Text>
          {tools}
        </Box>
        {note && noteRow && (
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            {noteRow}
          </Box>
        )}
        {error && (
          <Callout tone="error" actionLabel={onRetry ? labels.retry : undefined} onAction={onRetry}>
            {error}
          </Callout>
        )}
        {banner ?? (
          <Box position="relative">
            {popover}
            <PlainTextarea
              ref={fieldRef}
              aria-label={labels.textarea}
              aria-describedby={hintId}
              placeholder={placeholder}
              maxLength={maxLength}
              value={value}
              readOnly={sending}
              rows={3}
              onChange={(event) => onChange(event.target.value, event.target.selectionStart ?? 0)}
              onSelect={(event) => {
                const field = event.currentTarget as HTMLTextAreaElement
                onFieldSelect?.(field.value, field.selectionStart ?? 0)
              }}
              onKeyDown={(event) => {
                onFieldKeyDown?.(event)
                if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key !== 'Enter' || !canSend) return
                event.preventDefault()
                if (event.shiftKey && !note && sendOptions?.[0]) sendOptions[0].onSelect()
                else onSend()
              }}
              display="block"
              width="100%"
              resize="none"
              borderRadius={px(tokens['radius.input'])}
              borderWidth={1}
              borderStyle="solid"
              borderColor={note ? tokens['notes.border'] : tokens['border.default']}
              backgroundColor={note ? tokens['surface.panel'] : tokens['surface.sunken']}
              paddingVertical={10}
              paddingHorizontal={12}
              fontSize={13.5}
              lineHeight={21.6}
              color={note ? tokens['notes.text'] : tokens['text.primary']}
              outlineWidth={0}
              transition="border-color 0.1s ease"
              focusStyle={{ borderColor: note ? tokens['notes.label'] : tokens['accent.line'] }}
            />
          </Box>
        )}
        {panel}
        <Box display="flex" flexWrap="wrap" alignItems="center" gap={6}>
          {!note && actions}
          <Box flexGrow={1} />
          {counter && (
            <Text font="mono" fontSize={11} color={counter.over ? tokens['color.bad'] : tokens['notes.label']}>
              {counter.text}
            </Text>
          )}
          <SendControls note={note} canSend={canSend} sending={sending} onSend={onSend} sendOptions={note ? undefined : sendOptions} labels={labels} />
        </Box>
      </Box>
    </Box>
  )
}

export { Composer }
export type { ComposerProps, ComposerMode, ComposerLabels, SendOption } from './composer-types'
