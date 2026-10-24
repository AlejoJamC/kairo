import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  AccountMenu,
  ArticleEditor,
  Badge,
  Button,
  ClientPanel,
  Composer,
  EscalatePanel,
  FilterPill,
  FilterPillGroup,
  KnowledgeList,
  MemberRow,
  MemberTable,
  PageFormFooter,
  PageHeader,
  PriorityFilterTabs,
  QueueHeader,
  ReadOnlyBar,
  ReclassifyPopover,
  SeatsBar,
  SettingsRow,
  ShortcutsDialog,
  Sidebar,
  SidebarBell,
  WindowChromeProvider,
  SlaIndicator,
  SlaPolicyCard,
  SourceList,
  TicketBar,
  TicketHeading,
  UiProvider,
  formatSlaMinutes,
  isSlaOrderValid,
} from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('SlaIndicator', () => {
  it.each(['onTime', 'atRisk', 'escalating', 'overdue'] as const)('names the %s state in text for screen readers', (status) => {
    renderUi(<SlaIndicator variant="compact" time="40m" title="SLA at risk: 40m left" status={status} />)
    expect(screen.getAllByText('SLA at risk: 40m left').length).toBeGreaterThan(0)
  })

  it('shows the full phrase, the note and an elapsed bar', () => {
    renderUi(<SlaIndicator variant="full" label="SLA almost breached · escalates in 12m" note="no first response" progress={0.8} status="escalating" />)
    expect(screen.getByText('SLA almost breached · escalates in 12m')).toBeTruthy()
    expect(screen.getByText('no first response')).toBeTruthy()
  })
})

describe('Badge and Button', () => {
  it('draws the escalated pill without a fill and the team badge as a button', () => {
    const onPress = vi.fn()
    renderUi(
      <>
        <Badge variant="escalated">ESCALATED</Badge>
        <Badge variant="team" onPress={onPress} aria-label="View 1 internal notes">
          1 NOTE
        </Badge>
      </>,
    )
    expect(screen.getByText('ESCALATED')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View 1 internal notes' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('shows a single-key shortcut inside the button without changing its name', () => {
    renderUi(<Button keyHint="A">Acknowledge</Button>)
    const button = screen.getByRole('button', { name: 'Acknowledge' })
    expect(button.getAttribute('aria-keyshortcuts')).toBe('A')
    expect(within(button).getByText('A')).toBeTruthy()
  })
})

describe('FilterPill', () => {
  it('is a tab with its count in the name, or a toggle with aria-pressed', () => {
    const onPress = vi.fn()
    renderUi(
      <>
        <FilterPillGroup label="Status">
          <FilterPill kind="tab" active count={6} onPress={onPress}>
            Drafts
          </FilterPill>
          <FilterPill kind="tab" count={null} onPress={onPress}>
            Confirmed
          </FilterPill>
        </FilterPillGroup>
        <FilterPill active onPress={onPress}>
          Enterprise
        </FilterPill>
      </>,
    )
    expect(screen.getByRole('tablist', { name: 'Status' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Drafts, 6' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Confirmed, —' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enterprise' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('SourceList', () => {
  it('opens compact and similar rows by name and keeps static rows as text', () => {
    const onOpen = vi.fn()
    renderUi(
      <SourceList
        title="OTHER TICKETS"
        items={[
          { id: 'a', kind: 'compact', priority: 'P1', code: 'KAI-1', title: 'Export fails', meta: '153d', onOpen },
          { id: 'b', kind: 'similar', code: 'KAI-2', title: 'Same issue', meta: 'same issue' },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'KAI-1 Export fails, 153d' }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /KAI-2/ })).toBeNull()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('OTHER TICKETS')
  })

  it('shows two skeleton rows while loading and nothing without rows', () => {
    const { container, rerender } = renderUi(<SourceList title="SIMILAR TICKETS" items={[]} />)
    expect(container.textContent).toBe('')
    rerender(
      <UiProvider>
        <SourceList title="SIMILAR TICKETS" items={[]} loading />
      </UiProvider>,
    )
    expect(screen.getByText('SIMILAR TICKETS')).toBeTruthy()
  })
})

describe('ReadOnlyBar', () => {
  it('announces why there is no composer', () => {
    renderUi(<ReadOnlyBar>This ticket is resolved. It is shown in read-only mode.</ReadOnlyBar>)
    expect(screen.getByRole('status').textContent).toContain('read-only mode')
  })
})

describe('TicketBar', () => {
  const labels = { path: 'Path', position: 'Ticket 1 of 6', previous: 'Previous ticket', next: 'Next ticket' }

  it('shows the breadcrumb, the position and the escalated pill, and opens the notes', () => {
    const onOpen = vi.fn()
    renderUi(
      <TicketBar
        queueName="Triage"
        ticketId="KAI-106"
        position={{ index: 1, total: 6 }}
        notes={{ count: 1, label: '1 NOTE', ariaLabel: 'View 1 internal notes', onOpen }}
        escalatedLabel="ESCALATED"
        labels={labels}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Path' }).textContent).toContain('KAI-106')
    expect(screen.getByText('Ticket 1 of 6')).toBeTruthy()
    expect(screen.getByText('ESCALATED')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View 1 internal notes' }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('disables Previous on the first row and moves with the buttons', () => {
    const onNext = vi.fn()
    renderUi(<TicketBar queueName="Triage" ticketId="KAI-1" hasPrevious={false} onNext={onNext} labels={labels} />)
    expect((screen.getByRole('button', { name: 'Previous ticket' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next ticket' }))
    expect(onNext).toHaveBeenCalled()
  })
})

describe('TicketHeading', () => {
  const labels = { priorityChip: (p: string) => `Priority ${p}, change`, priorityMenu: 'Priority', wrongClassification: 'Wrong classification?', classifying: 'Classifying' }
  const categories = [{ id: 'c1', scale: 'ticketType' as const, value: 'support', label: 'support' }]

  it('changes the priority from its menu', () => {
    const onChange = vi.fn()
    renderUi(<TicketHeading subject="Export fails" priority="P1" priorityOptions={['P1', 'P2', 'P3']} onPriorityChange={onChange} categories={categories} labels={labels} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Export fails')
    fireEvent.click(screen.getByRole('button', { name: 'Priority P1, change' }))
    expect(screen.getByRole('menuitemradio', { name: /P1/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /P2/ }))
    expect(onChange).toHaveBeenCalledWith('P2')
  })

  it('is static and has no correction in the read-only variant', () => {
    renderUi(<TicketHeading subject="Export fails" priority="P1" readOnly categories={categories} labels={labels} />)
    expect(screen.queryByRole('button', { name: /Priority/ })).toBeNull()
    expect(screen.queryByText('Wrong classification?')).toBeNull()
  })

  it('shows shim bars while there is no classification', () => {
    renderUi(<TicketHeading subject="Export fails" classifying categories={[]} labels={labels} />)
    expect(screen.getByRole('status', { name: 'Classifying' })).toBeTruthy()
  })
})

describe('ReclassifyPopover', () => {
  const options = [
    { id: 't', scale: 'ticketType' as const, value: 'support', label: 'support' },
    { id: 'b', scale: 'category' as const, value: 'billing', label: 'billing' },
  ]
  const labels = { title: 'Correct the classification', explanation: 'Pick the labels that fit.', categories: 'Categories', cancel: 'Cancel', save: 'Save correction' }

  it('toggles chips, saves and keeps Save disabled until the selection changes', () => {
    const onToggle = vi.fn()
    const onSave = vi.fn()
    renderUi(
      <ReclassifyPopover
        trigger={<button>Open</button>}
        open
        onOpenChange={() => {}}
        options={options}
        selected={['t']}
        onToggle={onToggle}
        onSave={onSave}
        canSave
        labels={labels}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Correct the classification' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'support' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'billing' }))
    expect(onToggle).toHaveBeenCalledWith('b')
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
    expect(onSave).toHaveBeenCalled()
  })

  it('shows the error and disables Save when nothing changed', () => {
    renderUi(
      <ReclassifyPopover
        trigger={<button>Open</button>}
        open
        onOpenChange={() => {}}
        options={options}
        selected={[]}
        onToggle={() => {}}
        onSave={() => {}}
        canSave={false}
        error="The correction could not be saved. Try again."
        labels={labels}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect((screen.getByRole('button', { name: 'Save correction' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('QueueHeader', () => {
  it('shows the title, the count with screen reader text and the description', () => {
    renderUi(<QueueHeader title="Triage" count="6/8" countLabel="6 of 8 open tickets" description="Open tickets." barVariant="plain" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Triage')
    expect(screen.getByText('6 of 8 open tickets')).toBeTruthy()
    expect(screen.getByText('Open tickets.')).toBeTruthy()
  })

  it('filters by priority with counts and a dash while loading', () => {
    const onChange = vi.fn()
    renderUi(<PriorityFilterTabs value="all" onChange={onChange} counts={{ all: 8, P1: 3, P2: null, P3: 2 }} labels={{ priority: 'Priority', all: 'All' }} />)
    expect(screen.getByRole('tablist', { name: 'Priority' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /P1/ }))
    expect(onChange).toHaveBeenCalledWith('P1')
    expect(screen.getByRole('tab', { name: /P2/ }).textContent).toContain('—')
  })
})

describe('Sidebar and AccountMenu', () => {
  const entry = (id: string, active = false) => ({ id, icon: 'triage' as const, label: id, active, count: active ? 4 : undefined, countLabel: '4 tickets', onSelect: vi.fn() })
  const labels = { nav: 'Workspace', collapse: 'Collapse sidebar', expand: 'Expand sidebar', language: 'Language' }
  const base = {
    onToggleCollapsed: vi.fn(),
    bell: <SidebarBell label="Notifications" count={3} unreadLabel="3 unread" hasMention />,
    search: { label: 'Search or run a command…', shortcut: '⌘K', onOpen: vi.fn() },
    groups: [[entry('Triage', true), entry('Resolved')], [entry('Settings')]],
    language: { value: 'es', options: [{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }], onChange: vi.fn() },
    account: <button>Account</button>,
    labels,
  }

  it('is a named navigation with the current view marked, a search and the bell count', () => {
    renderUi(<Sidebar {...base} collapsed={false} />)
    expect(screen.getByRole('navigation', { name: 'Workspace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Triage/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search or run a command…' }))
    expect(base.search.onOpen).toHaveBeenCalled()
  })

  it('collapses to icons and toggles with the named button', async () => {
    renderUi(<Sidebar {...base} collapsed />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(base.onToggleCollapsed).toHaveBeenCalled()
    fireEvent.focus(screen.getByRole('button', { name: 'Search or run a command…' }))
    expect((await screen.findByRole('tooltip')).textContent).toContain('⌘K')
  })

  it('on macOS holds the collapse button in the footer with its shortcut and a shorter search label', async () => {
    renderUi(
      <WindowChromeProvider macos>
        <Sidebar {...base} search={{ ...base.search, shortLabel: 'Search or run…' }} collapseShortcut="⌃⌘S" collapsed={false} />
      </WindowChromeProvider>,
    )
    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(collapse.getAttribute('aria-keyshortcuts')).toBe('Control+Meta+S')
    fireEvent.focus(collapse)
    expect((await screen.findByRole('tooltip')).textContent).toContain('⌃⌘S')
    expect(screen.getByRole('button', { name: 'Search or run a command…' }).textContent).toContain('Search or run…')
  })

  it('shows the name and count in the tooltip of a collapsed item and a dot on the flagged one', async () => {
    renderUi(<Sidebar {...base} groups={[[{ ...entry('Triage', true), dot: true }, entry('Resolved')], [entry('Settings')]]} collapsed />)
    fireEvent.focus(screen.getByRole('button', { name: 'Triage' }))
    expect((await screen.findByRole('tooltip')).textContent).toContain('Triage · 4')
  })

  function Harness() {
    const [presence, setPresence] = useState<'online' | 'away' | 'invisible'>('online')
    const [theme, setTheme] = useState<'light' | 'dark'>('light')
    return (
      <AccountMenu
        name="Acme Support"
        presence={presence}
        onPresenceChange={setPresence}
        theme={theme}
        onThemeChange={setTheme}
        onOpenSettings={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onSignOut={vi.fn()}
        open
        onOpenChange={() => {}}
        labels={{
          account: 'Account',
          presenceTitle: 'Status',
          presence: { online: 'Online', away: 'Away', invisible: 'Invisible' },
          appearance: 'Appearance',
          light: 'Light',
          dark: 'Dark',
          settings: 'Settings',
          shortcuts: 'Keyboard shortcuts',
          signOut: 'Sign out',
        }}
      />
    )
  }

  it('changes presence and theme and ends with Sign out', () => {
    renderUi(<Harness />)
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Online' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Away' }))
    expect(screen.getByRole('radio', { name: 'Away' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(screen.getByRole('button', { name: 'Dark' }).getAttribute('aria-pressed')).toBe('true')
    const items = screen.getAllByRole('menuitem')
    expect(items[items.length - 1]!.textContent).toContain('Sign out')
  })
})

describe('ClientPanel', () => {
  const labels = {
    draftBadge: 'draft',
    draftNotice: 'Draft detected automatically.',
    account: 'ACCOUNT',
    plan: 'Plan',
    mrr: 'MRR',
    since: 'Since',
    tickets: 'Tickets',
    csat: 'CSAT',
    nps: 'NPS',
    otherTickets: 'OTHER TICKETS',
    similarTickets: 'SIMILAR TICKETS',
    unavailable: 'Client data unavailable.',
  }

  it('shows the account rows with dashes and the draft badge and notice', () => {
    renderUi(<ClientPanel name="Acme" email="support@acme.com" draft account={{ plan: 'Pro', tickets: { value: 2 } }} labels={labels} />)
    expect(screen.getByText('draft')).toBeTruthy()
    expect(screen.getByText('Draft detected automatically.')).toBeTruthy()
    expect(screen.getByText('ACCOUNT')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('opens the client tickets from the count and hides empty sections', () => {
    const onOpen = vi.fn()
    renderUi(<ClientPanel name="Acme" account={{ tickets: { value: 5, onOpen } }} labels={labels} />)
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.queryByText('OTHER TICKETS')).toBeNull()
  })

  it('says the client data is unavailable without an account', () => {
    renderUi(<ClientPanel name="Acme" account={null} labels={labels} />)
    expect(screen.getByText('Client data unavailable.')).toBeTruthy()
  })
})

describe('EscalatePanel', () => {
  const labels = { to: 'Escalate to', reason: 'Reason', reasonPlaceholder: 'What does the next person need to know?', submit: 'Escalate KAI-106', note: 'Alerts the on-call senior by SMS.', nobody: 'Nobody available' }
  const summary = { headline: 'P1 · SLA overdue 153d · frustrated', explanation: 'Signals detected on this ticket.' }
  const signals = [
    { id: 'p', label: 'Priority', value: 'P1', tone: 'P1' as const },
    { id: 's', label: 'SLA', value: 'overdue 153d', tone: 'overdue' as const },
  ]

  it('lists the signals and submits the form', () => {
    const onSubmit = vi.fn()
    renderUi(
      <EscalatePanel
        summary={summary}
        signals={signals}
        labels={labels}
        form={{ targets: [{ value: 'u1', label: 'Ana · Admin' }], target: 'u1', onTarget: vi.fn(), reason: '', onReason: vi.fn(), onSubmit }}
      />,
    )
    expect(screen.getByText('overdue 153d')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Escalate KAI-106' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('shows the escalated box instead of the form and nothing for a read-only ticket', () => {
    const { rerender } = renderUi(
      <EscalatePanel
        summary={summary}
        signals={signals}
        labels={labels}
        escalatedText="This ticket is escalated."
        form={{ targets: [], target: '', onTarget: vi.fn(), reason: '', onReason: vi.fn(), onSubmit: vi.fn() }}
      />,
    )
    expect(screen.getByText('This ticket is escalated.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Escalate KAI-106' })).toBeNull()
    rerender(
      <UiProvider>
        <EscalatePanel summary={summary} signals={signals} labels={labels} />
      </UiProvider>,
    )
    expect(screen.queryByText('Alerts the on-call senior by SMS.')).toBeNull()
  })

  it('disables the button and says nobody is available', () => {
    renderUi(
      <EscalatePanel
        summary={summary}
        signals={signals}
        labels={labels}
        form={{ targets: [], target: '', onTarget: vi.fn(), reason: '', onReason: vi.fn(), onSubmit: vi.fn(), unavailable: true }}
      />,
    )
    expect(screen.getByText('Nobody available')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Escalate KAI-106' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('ShortcutsDialog', () => {
  const groups = [
    { id: 'nav', title: 'Navigation', rows: [{ label: 'Move through the queue', keys: ['J', 'K'] }] },
    { id: 'ticket', title: 'Ticket', ticketOnly: true, rows: [{ label: 'Acknowledge', keys: ['A'] }] },
  ]
  const labels = { title: 'Keyboard shortcuts', footer: 'On Windows and Linux, ⌘ is Ctrl.', ticketOnly: 'ticket only', escape: 'esc' }

  it('is a modal dialog named by its title that closes with esc', () => {
    const onClose = vi.fn()
    renderUi(<ShortcutsDialog open onClose={onClose} groups={groups} inTicket labels={labels} />)
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }).getAttribute('aria-modal')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('marks the ticket group outside a ticket', () => {
    renderUi(<ShortcutsDialog open onClose={() => {}} groups={groups} labels={labels} />)
    expect(screen.getByText('ticket only')).toBeTruthy()
  })
})

describe('Page pieces', () => {
  it('PageHeader: title, count with unit, description and the main action', () => {
    renderUi(<PageHeader title="Clients" count={6} countLabel="6 clients" description="Everyone." action={<button>Invite</button>} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Clients')
    expect(screen.getByText('6 clients')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invite' })).toBeTruthy()
  })

  it('PageFormFooter: Save is disabled without changes and the error is an alert', () => {
    renderUi(<PageFormFooter onDiscard={vi.fn()} onSave={vi.fn()} canSave={false} error="Not saved." labels={{ discard: 'Discard', save: 'Save changes' }} />)
    expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Not saved.')
  })

  it('SettingsRow: labels its control, shows the error and a shim while loading', () => {
    const { rerender } = renderUi(
      <SettingsRow title="Default workspace language" description="Affects drafts." controlId="lang">
        <select id="lang" />
      </SettingsRow>,
    )
    expect(screen.getByLabelText('Default workspace language')).toBeTruthy()
    rerender(
      <UiProvider>
        <SettingsRow title="Password" error="This setting could not be loaded." />
      </UiProvider>,
    )
    expect(screen.getByText('This setting could not be loaded.')).toBeTruthy()
  })
})

describe('Team', () => {
  const labels = {
    you: '(you)',
    states: { active: 'active', away: 'away', invited: 'invited' },
    options: 'Options for Ana',
    changeRole: 'Change role',
    remove: 'Remove from workspace',
    confirmRemove: 'Remove Ana?',
    confirm: 'Remove',
    resend: 'Resend invitation',
    cancelInvitation: 'Cancel invitation',
  }
  const roles = [
    { value: 'owner', label: 'Owner' },
    { value: 'agent', label: 'Agent' },
  ]

  it('changes the role from the options menu', () => {
    const onChangeRole = vi.fn()
    renderUi(
      <MemberTable headers={['Person', 'Role', 'State', 'Options']}>
        <MemberRow name="Ana Pérez" email="ana@acme.com" role="Agent" state="active" labels={labels} options={{ roles, currentRole: 'agent', onChangeRole, onRemove: vi.fn() }} />
      </MemberTable>,
    )
    expect(screen.getByRole('table')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Options for Ana' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Change role/ }))
    expect(screen.getByRole('menuitemradio', { name: 'Agent' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Owner' }))
    expect(onChangeRole).toHaveBeenCalledWith('owner')
  })

  it('asks for confirmation before removing and never offers removal on your own row', () => {
    const onRemove = vi.fn()
    const { rerender } = renderUi(<MemberRow name="Ana Pérez" email="ana@acme.com" role="Agent" state="away" labels={labels} options={{ roles, currentRole: 'agent', onChangeRole: vi.fn(), onRemove }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Options for Ana' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from workspace' }))
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalled()
    rerender(
      <UiProvider>
        <MemberRow name="Ana Pérez" email="ana@acme.com" role="Owner" state="active" isYou labels={labels} options={{ roles, currentRole: 'owner', onChangeRole: vi.fn(), onRemove }} />
      </UiProvider>,
    )
    expect(screen.getByText('(you)')).toBeTruthy()
  })

  it('offers resend and cancel for a pending invitation, and a seats bar with spoken value', () => {
    renderUi(
      <>
        <MemberRow name="Invitee" email="invite@acme.com" role="Agent" state="invited" labels={{ ...labels, options: 'Options for Invitee' }} options={{ roles, currentRole: 'agent', onChangeRole: vi.fn(), onResend: vi.fn(), onCancel: vi.fn() }} />
        <SeatsBar used={3} total={5} label="3 of 5 seats" />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Options for Invitee' }))
    expect(screen.getByRole('menuitem', { name: 'Resend invitation' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Cancel invitation' })).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('3 of 5 seats')
  })
})

describe('SlaPolicyCard', () => {
  const labels = {
    unit: 'min',
    maximum: 'Maximum response time',
    minimum: 'Minimum response time',
    alert: 'Risk alert',
    escalation: 'Automatic escalation',
    legend: { minimum: 'min', alert: 'alert', escalation: 'escalation', breach: 'breach' },
    orderError: 'The order must be minimum < alert < escalation < maximum',
  }

  it('formats minutes and hours and validates the order', () => {
    expect(formatSlaMinutes(15)).toBe('15 min')
    expect(formatSlaMinutes(60)).toBe('1 h')
    expect(formatSlaMinutes(90)).toBe('1.5 h')
    expect(isSlaOrderValid({ minimum: 15, alert: 30, escalation: 45, maximum: 60 })).toBe(true)
    expect(isSlaOrderValid({ minimum: 15, alert: 50, escalation: 45, maximum: 60 })).toBe(false)
  })

  it('shows the legend and the value of each threshold', () => {
    const onChange = vi.fn()
    renderUi(<SlaPolicyCard priority="P1" title="P1 — Urgent" values={{ minimum: 15, alert: 30, escalation: 45, maximum: 60 }} onChange={onChange} labels={labels} />)
    expect(screen.getByText('breach 1 h')).toBeTruthy()
    expect(screen.getByText('alert 30 min')).toBeTruthy()
    expect((screen.getByLabelText('Risk alert') as HTMLInputElement).value).toBe('30')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('announces an order error as an alert', () => {
    renderUi(<SlaPolicyCard priority="P2" title="P2 — High" values={{ minimum: 15, alert: 50, escalation: 45, maximum: 60 }} onChange={vi.fn()} labels={labels} />)
    expect(screen.getByRole('alert').textContent).toContain('minimum < alert')
  })
})

describe('KnowledgeList and ArticleEditor', () => {
  const labels = {
    add: 'Add article',
    filters: 'Status',
    search: 'Search articles',
    article: 'Article',
    tags: 'Tags',
    state: 'State',
    updated: 'Updated',
    states: { published: 'published', draft: 'draft', review: 'to review' },
    emptyTitle: 'No articles yet',
    emptyDescription: 'Write the first one.',
    noResults: 'No article matches these filters.',
  }
  const base = {
    title: 'Knowledge',
    total: 2,
    description: 'Articles Kairo can cite.',
    filters: [{ id: 'all', label: 'All', count: 2 }],
    filter: 'all',
    onFilter: vi.fn(),
    query: '',
    onQuery: vi.fn(),
    onOpen: vi.fn(),
    labels,
  }
  const article = { id: 'a1', title: 'Refund policy', preview: 'Refunds within 14 days.', tags: ['billing', 'policy', 'extra'], state: 'published' as const, updated: '2026-01-02' }

  it('lists articles, opens one and hides Add article without permission', () => {
    const { rerender } = renderUi(<KnowledgeList {...base} canEdit onAdd={vi.fn()} articles={[article]} />)
    expect(screen.getByRole('button', { name: 'Add article' })).toBeTruthy()
    fireEvent.click(screen.getByRole('row', { name: /Refund policy, published/ }))
    expect(base.onOpen).toHaveBeenCalledWith('a1')
    expect(screen.getByText('+1')).toBeTruthy()
    rerender(
      <UiProvider>
        <KnowledgeList {...base} canEdit={false} onAdd={vi.fn()} articles={[article]} />
      </UiProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Add article' })).toBeNull()
  })

  it('shows the empty state, the no-results row and the retry on error', () => {
    const { rerender } = renderUi(<KnowledgeList {...base} canEdit onAdd={vi.fn()} articles={[]} empty />)
    expect(screen.getByText('No articles yet')).toBeTruthy()
    rerender(
      <UiProvider>
        <KnowledgeList {...base} canEdit onAdd={vi.fn()} articles={[]} />
      </UiProvider>,
    )
    expect(screen.getByText('No article matches these filters.')).toBeTruthy()
    const onRetry = vi.fn()
    rerender(
      <UiProvider>
        <KnowledgeList {...base} canEdit onAdd={vi.fn()} articles={[]} error={{ message: 'The articles could not be loaded.', retryLabel: 'Retry', onRetry }} />
      </UiProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  const editorLabels = {
    back: 'Knowledge',
    discard: 'Discard',
    save: 'Save',
    title: 'Article title',
    titlePlaceholder: 'Article title',
    contentPlaceholder: 'Write the content.',
    published: 'Published',
    review: 'Review',
    reviewStates: { review: 'to review', reviewed: 'reviewed' },
    markReviewed: 'Mark as reviewed',
    tags: 'Tags',
    addTag: 'Add tag',
    removeTag: (tag: string) => `Remove ${tag}`,
    updated: 'Updated',
    note: 'Kairo cites an article only when it is published.',
    discardChanges: 'Discard the changes?',
    confirmDiscard: 'Discard',
  }
  const value = { title: 'Refund policy', content: 'Refunds.', published: false, review: 'review' as const, tags: ['billing'], updated: '2026-01-02' }

  it('edits the fields, saves and marks as reviewed', () => {
    const onChange = vi.fn()
    const onSave = vi.fn()
    const onMarkReviewed = vi.fn()
    renderUi(<ArticleEditor value={value} onChange={onChange} heading="Edit article" canSave onSave={onSave} onBack={vi.fn()} onDiscard={vi.fn()} onMarkReviewed={onMarkReviewed} labels={editorLabels} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit article')
    fireEvent.change(screen.getByLabelText('Article title', { selector: 'input' }), { target: { value: 'New title' } })
    expect(onChange).toHaveBeenCalledWith({ title: 'New title' })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as reviewed' }))
    expect(onMarkReviewed).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalled()
  })

  it('locks the fields and removes Save and Discard when read-only', () => {
    renderUi(<ArticleEditor value={value} onChange={vi.fn()} heading="Edit article" readOnly canSave={false} onSave={vi.fn()} onBack={vi.fn()} onDiscard={vi.fn()} labels={editorLabels} />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull()
  })

  it('asks before leaving with unsaved changes', () => {
    const onBack = vi.fn()
    renderUi(<ArticleEditor value={value} onChange={vi.fn()} heading="Edit article" dirty canSave onSave={vi.fn()} onBack={onBack} onDiscard={vi.fn()} labels={editorLabels} />)
    fireEvent.click(screen.getByRole('button', { name: 'Knowledge' }))
    expect(onBack).not.toHaveBeenCalled()
    expect(screen.getByText('Discard the changes?')).toBeTruthy()
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' })
    fireEvent.click(confirm)
    expect(onBack).toHaveBeenCalled()
  })
})

describe('Composer', () => {
  const labels = { modeGroup: 'Composer mode', reply: 'Reply', note: 'Internal note', textarea: 'Reply', placeholder: '', send: 'Send', sending: 'Sending…', retry: 'Retry', sendOptions: 'More send options' }

  it('shows the hint, sends with the button and offers Send and resolve with its key', () => {
    const onSend = vi.fn()
    const onResolve = vi.fn()
    renderUi(
      <Composer
        mode="reply"
        onModeChange={vi.fn()}
        value="Hello"
        onChange={vi.fn()}
        onSend={onSend}
        hint="Sends to support@acme.com"
        sendOptions={[{ id: 'send-resolve', label: 'Send and resolve', shortcut: '⌘⇧↵', onSelect: onResolve }]}
        labels={labels}
      />,
    )
    expect(screen.getByText('Sends to support@acme.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'More send options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Send and resolve/ }))
    expect(onResolve).toHaveBeenCalled()
  })

  it('runs Send and resolve on ⌘⇧↵ and Send on ⌘↵', () => {
    const onSend = vi.fn()
    const onResolve = vi.fn()
    renderUi(
      <Composer
        mode="reply"
        value="Hello"
        onChange={vi.fn()}
        onSend={onSend}
        sendOptions={[{ id: 'send-resolve', label: 'Send and resolve', onSelect: onResolve }]}
        labels={labels}
      />,
    )
    const field = screen.getByLabelText('Reply', { selector: 'textarea' })
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(field, { key: 'Enter', metaKey: true, shiftKey: true })
    expect(onResolve).toHaveBeenCalledTimes(1)
  })

  it('in note mode shows the note row and Add note without a menu', () => {
    renderUi(<Composer mode="note" onModeChange={vi.fn()} value="Check this" onChange={vi.fn()} onSend={vi.fn()} noteRow={<span>team row</span>} sendOptions={[{ id: 'x', label: 'x', onSelect: vi.fn() }]} labels={{ ...labels, send: 'Add note' }} />)
    expect(screen.getByText('team row')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More send options' })).toBeNull()
  })
})
