import { TextInput } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Icon, type IconName } from './icon'
import { Box, Pressable, Text } from './layout'
import { px } from './lib/units'

// React Native ask box: the same card without keyboard shortcuts. The text is
// sent with the button; Stop replaces it while an answer runs.

type AskContext = { id: string; label: string; icon?: IconName; add?: boolean; onPress?: () => void }

type AskBoxProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop?: () => void
  answering?: boolean
  error?: boolean
  onRetry?: () => void
  contexts?: readonly AskContext[]
  model?: string
  hint?: string
  labels: { placeholder: string; textarea: string; send: string; stop: string; retry: string; error: string }
}

function AskBox({ value, onChange, onSend, onStop, answering, error, onRetry, contexts, model, hint, labels }: AskBoxProps) {
  const filled = value.trim().length > 0
  return (
    <Box padding={10} borderWidth={1} borderColor={tokens['border.default']} borderRadius={px(tokens['radius.card'])} backgroundColor={tokens['surface.panel']}>
      {contexts && contexts.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" gap={6} marginBottom={8}>
          {contexts.map((context) => (
            <Pressable key={context.id} onPress={context.onPress} paddingVertical={3} paddingHorizontal={8} borderRadius={999} borderWidth={1} borderColor={tokens['border.default']}>
              <Text fontSize={11.5} color={context.add ? tokens['text.tertiary'] : tokens['text.secondary']}>
                {context.label}
              </Text>
            </Pressable>
          ))}
        </Box>
      )}
      {error && (
        <Box flexDirection="row" gap={8} marginBottom={6}>
          <Text fontSize={12} color={tokens['color.bad-ink']}>
            {labels.error}
          </Text>
          {onRetry && (
            <Pressable onPress={onRetry}>
              <Text fontSize={12} color={tokens['color.bad-ink']}>
                {labels.retry}
              </Text>
            </Pressable>
          )}
        </Box>
      )}
      <TextInput
        accessibilityLabel={labels.textarea}
        placeholder={labels.placeholder}
        placeholderTextColor={tokens['text.tertiary']}
        value={value}
        onChangeText={onChange}
        multiline
        numberOfLines={2}
        style={{ color: tokens['text.primary'], fontSize: 13, minHeight: 40 }}
      />
      <Box flexDirection="row" alignItems="center" gap={8} marginTop={6}>
        {model && (
          <Text fontSize={11.5} color={tokens['text.secondary']}>
            {model}
          </Text>
        )}
        {hint ? (
          <Text flexGrow={1} fontSize={11} color={tokens['text.tertiary']}>
            {hint}
          </Text>
        ) : (
          <Box flexGrow={1} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={answering ? labels.stop : labels.send}
          disabled={!answering && !filled}
          onPress={answering ? onStop : onSend}
          alignItems="center"
          justifyContent="center"
          width={30}
          height={30}
          borderRadius={px(tokens['radius.control'])}
          backgroundColor={filled && !answering ? tokens['accent.default'] : tokens['surface.hover']}
        >
          {answering ? (
            <Box width={12} height={12} borderRadius={2} backgroundColor={tokens['text.secondary']} />
          ) : (
            <Icon name="send" size={14} color={filled ? tokens['text.onAccent'] : tokens['text.tertiary']} />
          )}
        </Pressable>
      </Box>
    </Box>
  )
}

export { AskBox }
export type { AskBoxProps, AskContext }
