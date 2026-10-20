import { cloneElement, useId, type ReactElement } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { tokens } from '@kairo/tokens'
import { Spinner } from './loading'

// React Native field: label above, control, then hint and error.

type FieldProps = {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  unit?: string
  loading?: boolean
  size?: 'app' | 'web'
  children: ReactElement<TextInputProps & { invalid?: boolean }>
}

function Field({ label, hideLabel, hint, error, unit, loading, children }: FieldProps) {
  const id = useId()
  const decorated = cloneElement(children, {
    accessibilityLabel: label,
    nativeID: id,
    invalid: error ? true : undefined,
    accessibilityHint: error ?? hint,
  })
  return (
    <View style={styles.wrapper}>
      {!hideLabel && <Text style={styles.label}>{label}</Text>}
      <View>
        {decorated}
        {(unit || loading) && (
          <View style={styles.adornment} pointerEvents="none">
            {loading ? <Spinner /> : <Text style={styles.unit}>{unit}</Text>}
          </View>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[styles.message, { color: tokens['color.bad-ink'] }]}>
          {error}
        </Text>
      )}
      {hint && <Text style={styles.message}>{hint}</Text>}
    </View>
  )
}

type FieldControlProps = TextInputProps & { invalid?: boolean; size?: 'app' | 'web' }

function FieldInput({ invalid, size = 'app', style, ...props }: FieldControlProps) {
  return (
    <TextInput
      placeholderTextColor={tokens['text.tertiary']}
      style={[styles.control, size === 'web' ? styles.web : styles.app, invalid && styles.invalid, style]}
      {...props}
    />
  )
}

function FieldTextarea({ invalid, size = 'app', style, ...props }: FieldControlProps) {
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      placeholderTextColor={tokens['text.tertiary']}
      style={[styles.control, styles.area, size === 'web' ? styles.webText : styles.appText, invalid && styles.invalid, style]}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tokens['text.tertiary'] },
  control: {
    backgroundColor: tokens['surface.sunken'],
    borderWidth: 1,
    borderColor: tokens['border.default'],
    borderRadius: 8,
    color: tokens['text.primary'],
    paddingHorizontal: 11,
  },
  app: { height: 36, fontSize: 13 },
  web: { height: 40, fontSize: 14 },
  appText: { fontSize: 13 },
  webText: { fontSize: 14 },
  area: { minHeight: 72, paddingVertical: 8 },
  invalid: { borderColor: tokens['color.bad-line'] },
  adornment: { position: 'absolute', right: 11, top: 0, bottom: 0, justifyContent: 'center' },
  unit: { fontSize: 12, color: tokens['text.tertiary'] },
  message: { fontSize: 12, color: tokens['text.tertiary'] },
})

export { Field, FieldInput, FieldTextarea }
export type { FieldProps, FieldControlProps }
