import { TextInput } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Avatar } from './avatar'
import { Button } from './button'
import { Callout } from './callout'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { Segmented } from './segmented'
import { px } from './lib/units'
import type { ComposerProps, MentionListProps } from './composer-types'

// React Native composer: reply and internal-note modes, send with the button.
// Drag resize, keyboard shortcuts and the split-send menu are web only.

function ComposerPill({ icon, children }: { icon?: IconName; children: string }) {
  return (
    <Pressable flexDirection="row" alignItems="center" gap={4} paddingVertical={4} paddingHorizontal={9} borderWidth={1} borderColor={tokens['border.default']} borderRadius={999}>
      {icon && <Icon name={icon} size={11} />}
      <Text fontSize={11} color={tokens['text.secondary']}>
        {children}
      </Text>
    </Pressable>
  )
}

function Composer({ mode, onModeChange, value, onChange, onSend, sending, error, onRetry, status, tools, banner, panel, actions, sendOptions, counter, popover, placeholder, maxLength, height = 80, labels }: ComposerProps) {
  const note = mode === 'note'
  const canSend = value.trim().length > 0 && !sending
  return (
    <Box padding={12} borderTopWidth={1} borderColor={tokens['border.default']} backgroundColor={note ? tokens['notes.background'] : tokens['surface.panel']}>
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
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap={4} marginBottom={8}>
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
      {popover}
      {banner ?? (
        <TextInput
          accessibilityLabel={labels.textarea}
          placeholder={placeholder}
          placeholderTextColor={tokens['text.tertiary']}
          maxLength={maxLength}
          value={value}
          editable={!sending}
          onChangeText={(text) => onChange(text, text.length)}
          multiline
          style={{ color: note ? tokens['notes.text'] : tokens['text.primary'], fontSize: 14, height, borderWidth: 1, borderColor: note ? tokens['notes.border'] : tokens['border.default'], borderRadius: 8, padding: 10 }}
        />
      )}
      {panel}
      {actions && (
        <Box flexDirection="row" gap={6} marginVertical={8}>
          {actions}
        </Box>
      )}
      <Box flexDirection="row" alignItems="center" justifyContent="flex-end" gap={8} marginTop={8}>
        {counter && (
          <Text marginRight="auto" font="mono" fontSize={11} color={counter.over ? tokens['color.bad'] : tokens['notes.label']}>
            {counter.text}
          </Text>
        )}
        {!note &&
          sendOptions?.map((option) => (
            <Button key={option.id} variant="ghost" disabled={option.disabled || !canSend} onPress={option.onSelect}>
              {option.label}
            </Button>
          ))}
        <Button variant="primary" disabled={!canSend} loading={sending} loadingLabel={labels.sending} onPress={onSend}>
          {labels.send}
        </Button>
      </Box>
      {status && (
        <Text marginTop={6} fontSize={status.tone === 'hint' ? 11 : 12} color={status.tone === 'hint' ? tokens['text.tertiary'] : tokens['color.ok']}>
          {status.text}
        </Text>
      )}
    </Box>
  )
}

function MentionList({ title, query, options, activeIndex, loading, onPick, labels }: MentionListProps) {
  return (
    <Box accessibilityLabel={title} borderWidth={1} borderColor={tokens['border.default']} borderRadius={px(tokens['radius.input'])} backgroundColor={tokens['surface.panel']} marginBottom={6} overflow="hidden">
      <Text font="mono" fontSize={9.5} paddingVertical={7} paddingHorizontal={11} color={tokens['text.tertiary']}>
        {title}
        {query ? ` @${query}` : ''} · {loading ? '…' : labels.counter}
      </Text>
      {!loading && options.length === 0 && (
        <Text fontSize={12.5} padding={18} color={tokens['text.secondary']}>
          {labels.empty}
        </Text>
      )}
      {options.map((option, index) => (
        <Pressable key={option.id} onPress={() => onPick(option.id)} flexDirection="row" alignItems="center" gap={10} paddingVertical={8} paddingHorizontal={12} backgroundColor={index === activeIndex ? tokens['surface.hover'] : 'transparent'}>
          <Avatar name={option.name} email={option.email} seed={option.id} size={24} />
          <Text flexGrow={1} fontSize={13} fontWeight={500} color={tokens['text.primary']}>
            {option.name}
          </Text>
          <Text font="mono" fontSize={11} color={tokens['text.tertiary']}>
            {option.role}
          </Text>
        </Pressable>
      ))}
    </Box>
  )
}

export { Composer, ComposerPill, MentionList }
export type { ComposerProps, MentionListProps } from './composer-types'
