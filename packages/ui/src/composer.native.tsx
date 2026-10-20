import { TextInput } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Button } from './button'
import { Callout } from './callout'
import { Box, Text } from './layout'
import { Segmented } from './segmented'
import type { ComposerProps } from './composer-types'

// React Native composer: reply and internal-note modes, send with the button.
// Drag resize, keyboard shortcuts and the split-send menu are web only.

function Composer({ mode, onModeChange, value, onChange, onSend, sending, error, onRetry, hint, status, tools, noteRow, banner, panel, actions, sendOptions, counter, popover, placeholder, maxLength, labels }: ComposerProps) {
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
      {(tools || (note && noteRow)) && (
        <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap={4} marginBottom={8}>
          {tools}
          {note && noteRow}
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
          style={{ color: note ? tokens['notes.text'] : tokens['text.primary'], fontSize: 14, height: 80, borderWidth: 1, borderColor: note ? tokens['notes.border'] : tokens['border.default'], borderRadius: 8, padding: 10 }}
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
      {(status || hint) && (
        <Text marginTop={6} fontSize={status ? 12 : 11} color={status ? tokens['color.ok'] : tokens['text.tertiary']}>
          {status?.text ?? hint}
        </Text>
      )}
    </Box>
  )
}

export { Composer }
export type { ComposerProps, ComposerMode, ComposerLabels, SendOption } from './composer-types'
