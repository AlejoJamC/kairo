export type MentionOption = { id: string; name: string; email?: string | null; role: string }

export type MentionMenuProps = {
  /** Header label and accessible name. */
  title: string
  /** What the agent typed after the @. */
  query: string
  options: readonly MentionOption[]
  /** Index of the highlighted option. */
  activeIndex: number
  /** The team list is loading: one searching row. */
  loading?: boolean
  /** The team list could not be loaded: this text replaces the items. */
  error?: string
  onPick: (id: string) => void
  onHover?: (index: number) => void
  testId?: string
  /** id prefix of the options, for aria-activedescendant on the textarea. */
  idPrefix?: string
  labels: {
    /** "2 of 3". */
    counter: string
    empty: string
    searching: string
    keyInsert: string
    keyClose: string
  }
}


export type MentionChipProps = {
  name: string
  email?: string | null
  seed?: string
  onRemove: () => void
  /** Accessible name of the remove button ("Remove Name"). */
  removeLabel: string
}
