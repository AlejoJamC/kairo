import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Callout } from './callout'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text, type PressableProps } from './layout'
import { Skeleton, Spinner } from './loading'
import { Kbd } from './kbd'
import { Menu, MenuItem } from './menu'
import { PlainTextarea } from './plain'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Segmented } from './segmented'
import { px } from './lib/units'
import type { ComposerProps, MentionListProps } from './composer-types'

// Reply and internal-note composer of a ticket. Internal-note mode switches the
// whole surface to the note palette. Send is disabled while empty; ⌘↵ sends.
// The caller owns the behavior (drafts, mentions, templates); this piece owns
// the frame, the modes, the split Send and the sending and error states.

const ACCENT_GRADIENT = `linear-gradient(180deg, ${tokens['accent.default']}, ${tokens['color.accent-indigo']})`
const NOTE_GRADIENT = `linear-gradient(180deg, ${tokens['color.warn']}, ${tokens['color.cat-billing']})`

type ComposerPillProps = Omit<PressableProps, 'children'> & { icon?: IconName; children: string }

/** The small outlined button of the tool row (quick reply, attach). */
function ComposerPill({ icon, children, ...props }: ComposerPillProps) {
  return (
    <Pressable
      type="button"
      {...props}
      display="flex"
      alignItems="center"
      gap={4}
      fontSize={11}
      paddingVertical={4}
      paddingHorizontal={9}
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={999}
      color={tokens['text.secondary']}
      backgroundColor={tokens['surface.panel']}
      hoverStyle={{ borderColor: tokens['border.strong'] }}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </Pressable>
  )
}

function SendControls({ note, canSend, sending, onSend, sendOptions, labels }: Pick<ComposerProps, 'sending' | 'onSend' | 'sendOptions' | 'labels'> & { note: boolean; canSend: boolean }) {
  const text = sending ? labels.sending : labels.send
  if (note) {
    return (
      <Pressable
        type="button"
        disabled={!canSend}
        onClick={onSend}
        display="flex"
        alignItems="center"
        gap={5}
        fontSize={12}
        fontWeight={600}
        paddingVertical={6}
        paddingHorizontal={14}
        borderRadius={6}
        backgroundColor={canSend || sending ? tokens['notes.sendAction'] : tokens['border.default']}
        color={canSend || sending ? tokens['text.onAccent'] : tokens['text.tertiary']}
        cursor={canSend ? 'pointer' : 'not-allowed'}
        transition="background 0.1s ease"
      >
        {sending ? <Spinner onAccent /> : <Icon name="lock" size={11} />}
        {text}
      </Pressable>
    )
  }
  const background = canSend || sending ? tokens['accent.default'] : tokens['border.default']
  const color = canSend || sending ? tokens['text.onAccent'] : tokens['text.tertiary']
  return (
    <Box display="flex" alignItems="stretch">
      <Pressable
        type="button"
        title={`${labels.send} (⌘↵)`}
        disabled={!canSend}
        onClick={onSend}
        display="flex"
        alignItems="center"
        gap={5}
        fontSize={12}
        fontWeight={500}
        paddingVertical={6}
        paddingHorizontal={14}
        borderTopLeftRadius={6}
        borderBottomLeftRadius={6}
        borderTopRightRadius={sendOptions?.length ? 0 : 6}
        borderBottomRightRadius={sendOptions?.length ? 0 : 6}
        backgroundColor={background}
        color={color}
        cursor={canSend ? 'pointer' : 'not-allowed'}
        transition="background 0.1s ease"
      >
        {sending ? <Spinner onAccent /> : <Icon name="send" size={12} />}
        {text}
      </Pressable>
      {sendOptions && sendOptions.length > 0 && (
        <Popover>
          <PopoverTrigger>
            <Pressable
              type="button"
              disabled={!canSend}
              aria-label={labels.sendOptions}
              display="flex"
              alignItems="center"
              justifyContent="center"
              width={26}
              alignSelf="stretch"
              borderTopRightRadius={6}
              borderBottomRightRadius={6}
              borderLeftWidth={1}
              borderStyle="solid"
              borderLeftColor={canSend ? tokens['color.inverse-faint'] : tokens['border.default']}
              backgroundColor={background}
              color={color}
              cursor={canSend ? 'pointer' : 'not-allowed'}
            >
              <Icon name="down" size={13} />
            </Pressable>
          </PopoverTrigger>
          <PopoverContent role="menu" label={labels.sendOptions} side="top" align="end" width={180}>
            <Menu label={labels.sendOptions}>
              {sendOptions.map((option) => (
                <MenuItem key={option.id} label={option.label} disabled={option.disabled} onSelect={option.onSelect} />
              ))}
            </Menu>
          </PopoverContent>
        </Popover>
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
  status,
  tools,
  banner,
  panel,
  actions,
  sendOptions,
  counter,
  popover,
  placeholder,
  maxLength,
  height = 80,
  onResizeStart,
  fieldRef,
  onFieldKeyDown,
  onFieldSelect,
  labels,
}: ComposerProps) {
  const note = mode === 'note'
  const canSend = value.trim().length > 0 && !sending
  return (
    <Box
      position="relative"
      borderTopWidth={1}
      borderStyle="solid"
      borderTopColor={tokens['border.default']}
      backgroundColor={note ? tokens['notes.background'] : tokens['surface.panel']}
      paddingHorizontal={16}
      paddingBottom={10}
      flexShrink={0}
    >
      <Box position="absolute" left={0} top={0} bottom={0} width={2} backgroundImage={note ? NOTE_GRADIENT : ACCENT_GRADIENT} transition="background 0.2s ease" />
      <Box
        aria-label={labels.dragHandle}
        onMouseDown={onResizeStart}
        display="flex"
        justifyContent="center"
        alignItems="center"
        paddingTop={6}
        paddingBottom={4}
        cursor="ns-resize"
        userSelect="none"
      >
        <Box width={32} height={4} borderRadius={999} backgroundColor={tokens['border.default']} hoverStyle={{ backgroundColor: tokens['text.tertiary'] }} transition="background 0.15s ease" />
      </Box>
      {onModeChange && (
        <Box marginBottom={8}>
          <Segmented
            label={labels.modeGroup}
            value={mode}
            onChange={sending ? () => {} : onModeChange}
            items={[
              { value: 'reply', label: labels.reply, disabled: sending },
              { value: 'note', label: labels.note, tone: 'note', disabled: sending },
            ]}
          />
        </Box>
      )}
      {tools && (
        <Box display="flex" alignItems="center" gap={4} flexWrap="wrap" marginBottom={8}>
          {tools}
        </Box>
      )}
      {error && (
        <Box marginBottom={8}>
          <Callout tone="error" actionLabel={onRetry ? labels.retry : undefined} onAction={onRetry}>
            {error}
          </Callout>
        </Box>
      )}
      {banner ?? (
        <Box position="relative" marginBottom={8}>
          {popover}
          <PlainTextarea
            ref={fieldRef}
            aria-label={labels.textarea}
            placeholder={placeholder}
            maxLength={maxLength}
            value={value}
            readOnly={sending}
            onChange={(event) => onChange(event.target.value, event.target.selectionStart ?? 0)}
            onSelect={(event) => {
              const field = event.currentTarget as HTMLTextAreaElement
              onFieldSelect?.(field.value, field.selectionStart ?? 0)
            }}
            onKeyDown={(event) => {
              onFieldKeyDown?.(event)
              if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canSend) onSend()
              }
            }}
            display="block"
            width="100%"
            height={height}
            resize="none"
            borderRadius={8}
            borderWidth={1}
            borderStyle="solid"
            borderColor={note ? tokens['notes.border'] : tokens['border.default']}
            backgroundColor={note ? tokens['notes.background'] : tokens['surface.sidebar']}
            paddingVertical={10}
            paddingHorizontal={12}
            fontSize={14}
            lineHeight={22.4}
            color={note ? tokens['notes.text'] : tokens['text.primary']}
            outlineWidth={0}
            transition="border-color 0.1s ease, background 0.1s ease"
            focusStyle={{
              borderColor: note ? tokens['color.warn'] : tokens['accent.default'],
              boxShadow: `0 0 0 2px ${note ? tokens['color.note-soft'] : tokens['accent.soft']}`,
            }}
          />
        </Box>
      )}
      {panel}
      {actions && (
        <Box display="flex" gap={6} marginBottom={8}>
          {actions}
        </Box>
      )}
      <Box display="flex" alignItems="center" justifyContent="flex-end" gap={8}>
        {counter && (
          <Text marginRight="auto" font="mono" fontSize={11} color={counter.over ? tokens['color.bad'] : tokens['notes.label']}>
            {counter.text}
          </Text>
        )}
        <SendControls note={note} canSend={canSend} sending={sending} onSend={onSend} sendOptions={note ? undefined : sendOptions} labels={labels} />
      </Box>
      {status && (
        <Text
          tag="p"
          display="block"
          marginTop={6}
          marginBottom={0}
          fontSize={status.tone === 'hint' ? 11 : 12}
          font={status.tone === 'hint' ? 'mono' : undefined}
          color={status.tone === 'hint' ? tokens['text.tertiary'] : note ? tokens['color.cat-billing'] : tokens['color.ok']}
        >
          {status.text}
        </Text>
      )}
    </Box>
  )
}

/** Highlights the matched run inside a name. */
function highlightMatch(text: string, query: string) {
  if (!query) return text
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <Text backgroundColor={tokens['accent.soft']} color={tokens['accent.ink']} borderRadius={2}>
        {text.slice(at, at + query.length)}
      </Text>
      {text.slice(at + query.length)}
    </>
  )
}

/** The @mention picker, anchored above the note composer: loading, empty and list states. */
function MentionList({ title, query, options, activeIndex, loading, onPick, onHover, testId, labels }: MentionListProps) {
  const empty = !loading && options.length === 0
  return (
    <Box
      data-testid={testId}
      role="listbox"
      aria-label={title}
      position="absolute"
      bottom="calc(100% + 6px)"
      left={0}
      width={300}
      maxWidth="100%"
      zIndex={30}
      overflow="hidden"
      borderWidth={1}
      borderStyle="solid"
      borderColor={tokens['border.default']}
      borderRadius={px(tokens['radius.input'])}
      backgroundColor={tokens['surface.panel']}
      boxShadow={tokens['shadow.pop']}
    >
      <Box paddingVertical={7} paddingHorizontal={11} borderBottomWidth={1} borderStyle="solid" borderBottomColor={tokens['border.default']} display="flex" alignItems="center" gap={6} backgroundColor={tokens['surface.sidebar']}>
        <Text font="mono" fontSize={9.5} color={tokens['text.tertiary']} textTransform="uppercase" letterSpacing={0.57}>
          {title}
        </Text>
        {query && (
          <Text font="mono" fontSize={10} color={tokens['accent.ink']}>
            @{query}
          </Text>
        )}
        <Text marginLeft="auto" font="mono" fontSize={9.5} color={tokens['text.tertiary']}>
          {loading ? '…' : labels.counter}
        </Text>
      </Box>
      {loading && (
        <Box padding={6}>
          {[0, 1, 2, 3].map((index) => (
            <Box key={index} display="flex" alignItems="center" gap={9} padding={7}>
              <Box circle overflow="hidden">
                <Skeleton width={24} height={24} />
              </Box>
              <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                <Box marginBottom={5}>
                  <Skeleton height={8} width={108 - index * 12} />
                </Box>
                <Skeleton height={7} width={62} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {empty && (
        <Box paddingVertical={26} paddingHorizontal={18} alignItems="center">
          <Text tag="div" display="block" font="mono" fontSize={15} color={tokens['border.default']} marginBottom={8}>
            ◌
          </Text>
          <Text tag="div" display="block" fontSize={12.5} color={tokens['text.secondary']} marginBottom={3}>
            {labels.empty}
          </Text>
          <Text tag="div" display="block" font="mono" fontSize={11} color={tokens['text.tertiary']}>
            «{query}»
          </Text>
        </Box>
      )}
      {!loading && !empty && (
        <Box padding={4} maxHeight={258} scroll>
          {options.map((option, index) => {
            const active = index === activeIndex
            return (
              <Pressable
                key={option.id}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onPick(option.id)
                }}
                onMouseEnter={() => onHover?.(index)}
                display="flex"
                alignItems="center"
                gap={9}
                width="100%"
                paddingVertical={6}
                paddingHorizontal={8}
                borderRadius={6}
                textAlign="left"
                backgroundColor={active ? tokens['accent.soft'] : 'transparent'}
                boxShadow={active ? `inset 2px 0 0 ${tokens['accent.default']}` : undefined}
              >
                <Avatar name={option.name} email={option.email} seed={option.id} size={24} />
                <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
                  <Text tag="div" display="block" fontSize={12.5} fontWeight={500} color={tokens['text.primary']} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                    {highlightMatch(option.name, query)}
                  </Text>
                  <Text tag="div" display="block" fontSize={10.5} font="mono" color={tokens['text.tertiary']}>
                    {option.role}
                  </Text>
                </Box>
                {active && <Kbd>↵</Kbd>}
              </Pressable>
            )
          })}
          {!query && labels.more && (
            <Text tag="div" display="block" paddingTop={5} paddingHorizontal={10} paddingBottom={3} font="mono" fontSize={9.5} color={tokens['text.tertiary']}>
              {labels.more}
            </Text>
          )}
        </Box>
      )}
      <Box paddingVertical={6} paddingHorizontal={11} borderTopWidth={1} borderStyle="solid" borderTopColor={tokens['border.default']} backgroundColor={tokens['surface.sidebar']} display="flex" gap={10}>
        {(
          [
            ['↑↓', labels.keyNavigate],
            ['↵', labels.keyInsert],
            ['esc', labels.keyClose],
          ] as const
        ).map(([key, text]) => (
          <Box key={key} display="flex" alignItems="center" gap={4}>
            <Kbd>{key}</Kbd>
            <Text fontSize={10} color={tokens['text.tertiary']}>
              {text}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export { Composer, ComposerPill, MentionList }
export type { ComposerPillProps }
export type { ComposerProps, ComposerMode, ComposerLabels, SendOption, MentionOption, MentionListProps } from './composer-types'
