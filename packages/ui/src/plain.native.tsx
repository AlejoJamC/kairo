import { TextInput, type TextInputProps } from 'react-native'

// Web-only controls: on React Native a plain input is the platform text input
// and the select has no equivalent.
type PlainInputProps = TextInputProps
type PlainTextareaProps = TextInputProps & { rows?: number }
type PlainSelectProps = Record<string, never>

function PlainInput(props: PlainInputProps) {
  return <TextInput {...props} />
}

function PlainTextarea({ rows = 3, ...props }: PlainTextareaProps) {
  return <TextInput multiline numberOfLines={rows} {...props} />
}

function PlainSelect(_props: PlainSelectProps) {
  return null
}

export { PlainInput, PlainTextarea, PlainSelect }
export type { PlainInputProps, PlainTextareaProps, PlainSelectProps }
