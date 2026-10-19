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
  dragHandle: string
}

export type SendOption = {
  id: string
  label: string
  disabled?: boolean
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
  /** Line under the composer: the success message, or the shortcut hint. */
  status?: { tone: 'hint' | 'success'; text: string }
  /** Quick reply, attach, the team-only badge and mention chips. */
  tools?: ReactNode
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
  /** Textarea height in px; the drag handle resizes it. */
  height?: number
  onResizeStart?: (event: { clientY: number; preventDefault: () => void }) => void
  fieldRef?: Ref<HTMLTextAreaElement>
  onFieldKeyDown?: (event: { key: string; metaKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => void
  onFieldSelect?: (value: string, caret: number) => void
  labels: ComposerLabels
}

export type MentionOption = { id: string; name: string; email?: string | null; role: string }

export type MentionListProps = {
  /** Header label and accessible name. */
  title: string
  /** What the agent typed after the @. */
  query: string
  options: readonly MentionOption[]
  activeIndex: number
  /** First open of the session: skeleton rows. */
  loading?: boolean
  onPick: (id: string) => void
  onHover?: (index: number) => void
  testId?: string
  labels: {
    counter: string
    empty: string
    more?: string
    keyNavigate: string
    keyInsert: string
    keyClose: string
  }
}
