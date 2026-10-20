import type { ReactNode, Ref } from 'react'

export type ComposerMode = 'reply' | 'note'

export type ComposerLabels = {
  modeGroup: string
  reply: string
  note: string
  textarea: string
  placeholder: string
  send: string
  sending: string
  retry: string
  sendOptions: string
}

export type SendOption = {
  id: string
  label: string
  disabled?: boolean
  /** Shortcut shown at the end of the item ('⌘⇧↵'). The first option also runs on that key. */
  shortcut?: string
  onSelect: () => void
}

export type ComposerProps = {
  mode: ComposerMode
  /** Without it the mode switch is not rendered (reply-only composer). */
  onModeChange?: (mode: ComposerMode) => void
  value: string
  onChange: (value: string, caret: number) => void
  onSend: () => void
  sending?: boolean
  /** The last send failed; shown above the textarea. The text is kept. */
  error?: string | null
  onRetry?: () => void
  /** Hint after the mode switch: who the reply goes to, or who sees the note. */
  hint?: string
  /** The success message; replaces the hint until the next edit. */
  status?: { tone: 'success'; text: string }
  /** Icon buttons at the end of the mode row (quick reply, attach). */
  tools?: ReactNode
  /** Note mode row: team-only badge, mention chips and their hint. */
  noteRow?: ReactNode
  /** Replaces the textarea (the AI draft card owns its own field). */
  banner?: ReactNode
  /** Inline panel above the actions (escalation). */
  panel?: ReactNode
  /** Ticket actions (Acknowledge, Resolve, Escalate). */
  actions?: ReactNode
  /** Split-send menu items (reply mode). */
  sendOptions?: readonly SendOption[]
  /** Counter shown left of Send near the length cap. */
  counter?: { text: string; over?: boolean }
  /** Mentions popover, rendered over the textarea. */
  popover?: ReactNode
  placeholder?: string
  maxLength?: number
  fieldRef?: Ref<HTMLTextAreaElement>
  onFieldKeyDown?: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => void
  onFieldSelect?: (value: string, caret: number) => void
  labels: ComposerLabels
}
