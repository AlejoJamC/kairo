// Native menu bar of the desktop app. The OS draws the menu; this module
// builds its content from the app state so the desktop shell can map it 1:1 to
// the native menu. No action exists only here: every item runs the same action
// as its in-app counterpart.

export type AppView =
  | 'triage'
  | 'awaiting'
  | 'resolved'
  | 'escalated'
  | 'ai-review'
  | 'knowledge'
  | 'clients'
  | 'settings'

export type AppMenuItem =
  | { kind: 'item'; id: string; label: string; shortcut?: string; accelerator?: string; disabled?: boolean; checked?: boolean }
  | { kind: 'separator' }
  | { kind: 'checkbox'; id: string; label: string; checked: boolean; shortcut?: string; accelerator?: string; disabled?: boolean }
  | { kind: 'submenu'; id: string; label: string; items: AppMenuItem[] }

export type AppMenuGroup = { id: string; label: string; items: AppMenuItem[] }

export interface AppMenuState {
  view: AppView
  language: 'en' | 'es'
  sidebarExpanded: boolean
  /** The ticket list of the queue views is shown (⌘⇧F). */
  ticketListShown: boolean
  /** Tab of the context panel that is open, when a ticket is. */
  contextTab: 'client' | 'assistant' | 'notes' | 'escalate' | null
  /** No ticket open: the whole Ticket menu is disabled. */
  ticketOpen: boolean
  /** Awaiting customer: Acknowledge and Resolve are disabled, as in the composer. */
  ticketAwaitingCustomer: boolean
  /** Final status: every Ticket item is disabled except Ask Kairo Assistant. */
  ticketFinal: boolean
  ticketPriority: 'P1' | 'P2' | 'P3'
  ticketStatus: string
  statusOptions: string[]
  composerEmpty: boolean
  /** "Group with [ID]" shows only while there is a similar, ungrouped ticket. */
  similarTicketId: string | null
}

const item = (id: string, label: string, extra: Partial<Extract<AppMenuItem, { kind: 'item' }>> = {}): AppMenuItem => ({ kind: 'item', id, label, ...extra })
const separator = (): AppMenuItem => ({ kind: 'separator' })
const radio = (id: string, label: string, checked: boolean): AppMenuItem => ({ kind: 'item', id, label, checked })
const submenu = (id: string, label: string, items: AppMenuItem[]): AppMenuItem => ({ kind: 'submenu', id, label, items })

export function buildAppMenu(state: AppMenuState): AppMenuGroup[] {
  const goViews: Array<{ id: string; view: AppView; label: string }> = [
    { id: 'go-triage', view: 'triage', label: 'Triage' },
    { id: 'go-awaiting', view: 'awaiting', label: 'Awaiting customer' },
    { id: 'go-resolved', view: 'resolved', label: 'Resolved' },
    { id: 'go-escalated', view: 'escalated', label: 'Escalated' },
    { id: 'go-ai-review', view: 'ai-review', label: 'AI Classification' },
    { id: 'go-knowledge', view: 'knowledge', label: 'Knowledge' },
  ]

  const queueViews: AppView[] = ['triage', 'awaiting', 'resolved', 'escalated', 'ai-review']
  const contextTabs = [
    { id: 'client', label: 'Client' },
    { id: 'assistant', label: 'Assistant' },
    { id: 'notes', label: 'Notes' },
    { id: 'escalate', label: 'Escalate' },
  ] as const

  const ticketItems: AppMenuItem[] = [
    item('acknowledge', 'Acknowledge', { shortcut: 'A', disabled: !state.ticketOpen || state.ticketAwaitingCustomer || state.ticketFinal }),
    item('resolve', 'Resolve', { shortcut: 'R', disabled: !state.ticketOpen || state.ticketAwaitingCustomer || state.ticketFinal }),
    item('escalate', 'Escalate', { shortcut: 'E', disabled: !state.ticketOpen || state.ticketFinal }),
    item('internal-note', 'Internal note', { shortcut: 'N', disabled: !state.ticketOpen || state.ticketFinal }),
    separator(),
    item('send', 'Send', { shortcut: '⌘↵', accelerator: 'CmdOrCtrl+Enter', disabled: !state.ticketOpen || state.ticketFinal || state.composerEmpty }),
    item('send-resolve', 'Send and resolve', { shortcut: '⌘⇧↵', accelerator: 'CmdOrCtrl+Shift+Enter', disabled: !state.ticketOpen || state.ticketFinal || state.composerEmpty }),
    separator(),
    submenu('priority', 'Priority', [
      radio('priority-p1', 'P1', state.ticketPriority === 'P1'),
      radio('priority-p2', 'P2', state.ticketPriority === 'P2'),
      radio('priority-p3', 'P3', state.ticketPriority === 'P3'),
    ]),
    submenu('status', 'Status', state.statusOptions.map((s) => radio(`status-${s}`, s, state.ticketStatus === s))),
    item('wrong-classification', 'Wrong classification?…', { disabled: !state.ticketOpen || state.ticketFinal }),
    ...(state.similarTicketId ? [item('group-with', `Group with ${state.similarTicketId}`, { disabled: !state.ticketOpen || state.ticketFinal })] : []),
    separator(),
    item('ask-assistant', 'Ask Kairo Assistant', { shortcut: '⌘J', accelerator: 'CmdOrCtrl+J', disabled: !state.ticketOpen }),
  ]

  return [
    {
      id: 'kairo',
      label: 'Kairo',
      items: [
        item('about', 'About Kairo'),
        separator(),
        item('settings', 'Settings…', { shortcut: '⌘,', accelerator: 'CmdOrCtrl+,' }),
        separator(),
        item('sign-out', 'Sign out'),
        item('quit', 'Quit Kairo', { shortcut: '⌘Q', accelerator: 'CmdOrCtrl+Q' }),
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        item('undo', 'Undo'),
        item('redo', 'Redo'),
        separator(),
        item('cut', 'Cut'),
        item('copy', 'Copy'),
        item('paste', 'Paste'),
        item('select-all', 'Select all'),
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { kind: 'checkbox', id: 'sidebar', label: 'Sidebar', checked: state.sidebarExpanded, shortcut: '⌃⌘S', accelerator: 'Ctrl+Cmd+S' },
        { kind: 'checkbox', id: 'ticket-list', label: 'Ticket list', checked: state.ticketListShown, shortcut: '⌘⇧F', accelerator: 'CmdOrCtrl+Shift+F', disabled: !queueViews.includes(state.view) },
        submenu('context', 'Context', contextTabs.map((tab, index) =>
          item(`context-${tab.id}`, tab.label, { checked: state.contextTab === tab.id, shortcut: `⌘${index + 1}`, accelerator: `CmdOrCtrl+${index + 1}`, disabled: !state.ticketOpen }),
        )),
        separator(),
        item('switch-theme', 'Switch theme', { shortcut: '⌘⇧L', accelerator: 'CmdOrCtrl+Shift+L' }),
        submenu('language', 'Language', [
          radio('language-es', 'Español', state.language === 'es'),
          radio('language-en', 'English', state.language === 'en'),
        ]),
      ],
    },
    {
      id: 'go',
      label: 'Go',
      items: [
        item('search', 'Search or run a command…', { shortcut: '⌘K', accelerator: 'CmdOrCtrl+K' }),
        separator(),
        ...goViews.map((g) => radio(g.id, g.label, state.view === g.view)),
        separator(),
        radio('go-clients', 'Clients', state.view === 'clients'),
        radio('go-settings', 'Settings', state.view === 'settings'),
        separator(),
        item('next-ticket', 'Next ticket', { shortcut: 'J' }),
        item('previous-ticket', 'Previous ticket', { shortcut: 'K' }),
      ],
    },
    { id: 'ticket', label: 'Ticket', items: ticketItems },
    {
      id: 'window',
      label: 'Window',
      items: [item('minimize', 'Minimize'), item('zoom', 'Zoom'), separator(), item('bring-all', 'Bring all to front')],
    },
    { id: 'help', label: 'Help', items: [item('all-commands', 'All commands', { shortcut: '⌘/', accelerator: 'CmdOrCtrl+/' })] },
  ]
}
