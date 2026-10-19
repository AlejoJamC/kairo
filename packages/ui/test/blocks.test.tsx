import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  AiProposal,
  AskBox,
  AssistantEmpty,
  AssistantTurn,
  AuthCard,
  AuthFooter,
  AuthHeader,
  BenefitCard,
  BentoCard,
  ChoiceCard,
  ChoiceGroup,
  CommandPalette,
  Composer,
  DataTable,
  EvidencePanel,
  Faq,
  IntegrationCard,
  MentionList,
  PermissionList,
  PlanCard,
  PricingTable,
  ProductFrame,
  ProgressSteps,
  ReasoningSteps,
  Section,
  SectionHeader,
  SiteFooter,
  StatusBar,
  StatusPanel,
  Stepper,
  TierCard,
  TopNav,
  UiProvider,
  UserTurn,
  WizardHeader,
} from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('Stepper', () => {
  const steps = [
    { id: 'connect', label: 'Connect' },
    { id: 'detect', label: 'Detect' },
    { id: 'done', label: 'Done' },
  ]

  it('marks only the current step and names the list', () => {
    renderUi(<Stepper steps={steps} current="detect" label="Setup progress" />)
    expect(screen.getByRole('list', { name: 'Setup progress' })).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null])
  })

  it('hides the labels when compact', () => {
    renderUi(<Stepper steps={steps} current="connect" label="Setup progress" compact />)
    expect(screen.queryByText('Connect')).toBeNull()
  })
})

describe('ChoiceCard', () => {
  it('toggles an available choice and reports the press', () => {
    const onSelect = vi.fn()
    renderUi(
      <ChoiceGroup legend="Channel">
        <ChoiceCard icon={<span />} name="Gmail" availability="available" selected onSelect={onSelect} />
      </ChoiceGroup>,
    )
    const button = screen.getByRole('button', { name: /Gmail/ })
    expect(button.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Channel')).toBeTruthy()
  })

  it('keeps a coming-soon choice inert', () => {
    const onSelect = vi.fn()
    renderUi(<ChoiceCard icon={<span />} name="Slack" availability="coming soon" soon onSelect={onSelect} />)
    const button = screen.getByRole('button', { name: /Slack/ }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBeNull()
    fireEvent.click(button)
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('ProgressSteps', () => {
  const base = { title: 'Setting up', doneLabel: 'ready' }

  it('shows the call to action only when every step is done', () => {
    const onPress = vi.fn()
    const steps = [
      { id: 'a', label: 'Read inbox', status: 'done' as const },
      { id: 'b', label: 'Classify', status: 'active' as const },
    ]
    const { rerender } = renderUi(<ProgressSteps {...base} steps={steps} cta={{ label: 'Open app', onPress }} />)
    expect(screen.queryByText('Open app')).toBeNull()
    expect(screen.getByText('ready')).toBeTruthy()
    rerender(
      <UiProvider>
        <ProgressSteps {...base} steps={steps.map((step) => ({ ...step, status: 'done' as const }))} cta={{ label: 'Open app', onPress }} fallback={{ label: 'Continue manually', href: '/app' }} />
      </UiProvider>,
    )
    fireEvent.click(screen.getByText('Open app'))
    expect(onPress).toHaveBeenCalled()
    expect(screen.getByText('Continue manually').getAttribute('href')).toBe('/app')
  })

  it('offers a retry when a step fails and keeps later steps pending', () => {
    const onRetry = vi.fn()
    renderUi(
      <ProgressSteps
        {...base}
        steps={[
          { id: 'a', label: 'Read inbox', status: 'failed' },
          { id: 'b', label: 'Classify', status: 'pending' },
        ]}
        cta={{ label: 'Open app', onPress: vi.fn() }}
        retryLabel="Try again"
        onRetry={onRetry}
      />,
    )
    expect(screen.queryByText('Open app')).toBeNull()
    fireEvent.click(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('ReasoningSteps', () => {
  const labels = { thinking: 'Thinking…', writing: 'Writing…', done: 'Reasoned · 2 steps' }
  const steps = [
    { id: 'a', label: 'Reading the thread', status: 'done' as const, detail: '3 messages' },
    { id: 'b', label: 'Writing in brand tone', status: 'active' as const },
  ]

  it('stays open while running regardless of the toggle', () => {
    renderUi(<ReasoningSteps steps={steps} phase="thinking" open={false} onOpenChange={vi.fn()} labels={labels} />)
    expect(screen.getByRole('button', { name: /Thinking/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Reading the thread')).toBeTruthy()
  })

  it('opens and closes itself when uncontrolled', () => {
    renderUi(<ReasoningSteps steps={steps} phase="done" labels={labels} />)
    const trigger = screen.getByRole('button', { name: /Reasoned/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Reading the thread')).toBeTruthy()
  })

  it('collapses to a summary when done and toggles on press', () => {
    const onOpenChange = vi.fn()
    renderUi(<ReasoningSteps steps={steps} phase="done" open={false} onOpenChange={onOpenChange} labels={labels} />)
    const trigger = screen.getByRole('button', { name: /Reasoned/ })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Reading the thread')).toBeNull()
    fireEvent.click(trigger)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

describe('AiProposal', () => {
  const props = {
    title: 'AI proposal',
    model: 'model-x',
    fields: [
      { label: 'Type', value: 'Support' },
      { label: 'Category', value: null },
    ],
    confidence: 0.92,
    confidenceLabel: 'Confidence',
    onConfirm: vi.fn(),
    onReject: vi.fn(),
    onRetry: vi.fn(),
    labels: { confirm: 'Confirm', reject: 'Reject', retry: 'Retry', error: 'Proposal failed' },
    shortcuts: { confirm: '⌘↵', reject: 'R' },
  }

  it('shows missing fields as a dash and carries shortcuts in the titles', () => {
    renderUi(<AiProposal {...props} />)
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' }).getAttribute('title')).toBe('Confirm (⌘↵)')
    expect(screen.getByRole('button', { name: 'Reject' }).getAttribute('title')).toBe('Reject (R)')
  })

  it('disables both actions while the proposal is computed', () => {
    renderUi(<AiProposal {...props} state="loading" />)
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('replaces the chips with an alert and hides Confirm on failure', () => {
    renderUi(<AiProposal {...props} state="error" />)
    expect(screen.getByRole('alert').textContent).toContain('Proposal failed')
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('marks Confirm busy while the change is saved and renders the compact card', () => {
    renderUi(<AiProposal {...props} state="confirming" variant="compact" />)
    expect(screen.getByRole('button', { name: /Confirm/ }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Support')).toBeTruthy()
  })
})

describe('AskBox', () => {
  const labels = { placeholder: 'Ask about this ticket', textarea: 'Question', send: 'Send', stop: 'Stop', retry: 'Retry', error: 'Not sent' }
  const base = { value: '', onChange: vi.fn(), onSend: vi.fn(), labels }

  it('disables send while empty and sends on Enter but not Shift+Enter', () => {
    const onSend = vi.fn()
    const { rerender } = renderUi(<AskBox {...base} onSend={onSend} />)
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(
      <UiProvider>
        <AskBox {...base} value="What happened?" onSend={onSend} />
      </UiProvider>,
    )
    const textarea = screen.getByLabelText('Question')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('turns send into Stop while answering and blocks Enter', () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    renderUi(<AskBox {...base} value="again" onSend={onSend} onStop={onStop} answering />)
    fireEvent.keyDown(screen.getByLabelText('Question'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onStop).toHaveBeenCalled()
  })

  it('announces a failed send with Retry and keeps the text', () => {
    const onRetry = vi.fn()
    renderUi(<AskBox {...base} value="kept" error onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Not sent')
    expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe('kept')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('Assistant conversation', () => {
  const stepsLabels = { thinking: 'Thinking…', writing: 'Writing…', done: 'Reasoned · 1 step' }
  const steps = [{ id: 'a', label: 'Reading the thread', status: 'done' as const }]

  it('renders the empty state and the user bubble', () => {
    renderUi(
      <>
        <AssistantEmpty name="Kairo Assistant" tagline="Agent copilot" intro="Ask me about this ticket.">
          <span>starters</span>
        </AssistantEmpty>
        <UserTurn>Summarize it</UserTurn>
      </>,
    )
    expect(screen.getByText('Kairo Assistant')).toBeTruthy()
    expect(screen.getByText('starters')).toBeTruthy()
    expect(screen.getByText('Summarize it')).toBeTruthy()
  })

  it('shows draft, sources and follow-ups only when the answer is done', () => {
    const base = { steps, stepsLabels, draft: <span>draft</span>, sources: <span>sources</span>, followUps: <span>follow-ups</span> }
    const { rerender } = renderUi(<AssistantTurn {...base} phase="writing">Here is the summary</AssistantTurn>)
    expect(screen.getByText('Here is the summary')).toBeTruthy()
    expect(screen.queryByText('sources')).toBeNull()
    expect(screen.queryByText('follow-ups')).toBeNull()
    expect(screen.queryByText('draft')).toBeNull()
    rerender(
      <UiProvider>
        <AssistantTurn {...base} phase="done">
          Here is the summary
        </AssistantTurn>
      </UiProvider>,
    )
    expect(screen.getByText('sources')).toBeTruthy()
    expect(screen.getByText('follow-ups')).toBeTruthy()
    expect(screen.getByText('draft')).toBeTruthy()
  })

  it('replaces the answer with an alert and Retry when it fails', () => {
    const onRetry = vi.fn()
    renderUi(
      <AssistantTurn
        steps={[{ id: 'a', label: 'Reading the thread', status: 'failed' }]}
        phase="done"
        stepsLabels={stepsLabels}
        error={{ message: 'The answer failed', retryLabel: 'Retry', onRetry }}
      >
        never shown
      </AssistantTurn>,
    )
    expect(screen.getByRole('alert').textContent).toContain('The answer failed')
    expect(screen.queryByText('never shown')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('Composer', () => {
  const labels = {
    modeGroup: 'Composer mode',
    reply: 'Reply',
    note: 'Internal note',
    textarea: 'Message',
    placeholder: 'Write…',
    send: 'Send',
    sending: 'Sending…',
    retry: 'Retry',
    sendOptions: 'More send options',
    dragHandle: 'Resize',
  }
  const base = { mode: 'reply' as const, value: '', onChange: vi.fn(), onSend: vi.fn(), labels }

  it('disables Send while empty and sends with ⌘↵', () => {
    const onSend = vi.fn()
    const { rerender } = renderUi(<Composer {...base} onSend={onSend} />)
    expect((screen.getByRole('button', { name: /Send/ }) as HTMLButtonElement).disabled).toBe(true)
    rerender(
      <UiProvider>
        <Composer {...base} value="Hello" onSend={onSend} />
      </UiProvider>,
    )
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('lets the caller handle a key first and skips the shortcut then', () => {
    const onSend = vi.fn()
    renderUi(<Composer {...base} value="Hello" onSend={onSend} onFieldKeyDown={(event) => event.preventDefault()} />)
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter', metaKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('reports the value and caret on change', () => {
    const onChange = vi.fn()
    renderUi(<Composer {...base} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi @a' } })
    expect(onChange).toHaveBeenCalledWith('Hi @a', expect.any(Number))
  })

  it('makes the textarea read-only, busy and the mode switch inert while sending', () => {
    const onModeChange = vi.fn()
    renderUi(<Composer {...base} value="Hello" sending onModeChange={onModeChange} />)
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.getByText('Sending…')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Internal note' }))
    expect(onModeChange).not.toHaveBeenCalled()
  })

  it('has no mode switch without a mode handler', () => {
    renderUi(<Composer {...base} />)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('renders the tool row in note mode and has no split send', () => {
    renderUi(<Composer {...base} mode="note" tools={<span>TEAM ONLY</span>} sendOptions={[{ id: 'a', label: 'Send & resolve', onSelect: vi.fn() }]} value="x" />)
    expect(screen.getByText('TEAM ONLY')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'More send options' })).toBeNull()
  })

  it('announces a failed send and offers Retry', () => {
    const onRetry = vi.fn()
    renderUi(<Composer {...base} value="kept" error="Could not send" onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toContain('Could not send')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('kept')
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalled()
  })

  it('opens the split-send menu and runs an option', () => {
    const onSelect = vi.fn()
    renderUi(<Composer {...base} value="Hello" sendOptions={[{ id: 'resolve', label: 'Send & resolve', onSelect }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More send options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Send & resolve' }))
    expect(onSelect).toHaveBeenCalled()
  })

  it('shows the counter and the status line', () => {
    renderUi(<Composer {...base} mode="note" counter={{ text: '1900 / 2000' }} status={{ tone: 'success', text: 'Note added.' }} value="x" />)
    expect(screen.getByText('1900 / 2000')).toBeTruthy()
    expect(screen.getByText('Note added.')).toBeTruthy()
  })

  it('replaces the textarea with a banner', () => {
    renderUi(<Composer {...base} banner={<span>AI draft</span>} />)
    expect(screen.getByText('AI draft')).toBeTruthy()
    expect(screen.queryByLabelText('Message')).toBeNull()
  })

  const mentionLabels = { counter: '1 of 3', empty: 'No members found', keyNavigate: 'navigate', keyInsert: 'insert', keyClose: 'close' }

  it('lists mentions, highlights the match and picks on mouse down', () => {
    const onPick = vi.fn()
    renderUi(<MentionList title="Mention" query="an" options={[{ id: 'u1', name: 'Ana Pérez', role: 'admin' }]} activeIndex={0} onPick={onPick} labels={mentionLabels} />)
    expect(screen.getByText('1 of 3')).toBeTruthy()
    expect(screen.getByText('@an')).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('option', { name: /Ana Pérez/ }))
    expect(onPick).toHaveBeenCalledWith('u1')
  })

  it('shows the quoted query when nothing matches and skeletons while loading', () => {
    const { rerender } = renderUi(<MentionList title="Mention" query="zz" options={[]} activeIndex={0} onPick={vi.fn()} labels={mentionLabels} />)
    expect(screen.getByText('No members found')).toBeTruthy()
    expect(screen.getByText('«zz»')).toBeTruthy()
    rerender(
      <UiProvider>
        <MentionList title="Mention" query="" options={[]} activeIndex={0} loading onPick={vi.fn()} labels={mentionLabels} />
      </UiProvider>,
    )
    expect(screen.queryByText('No members found')).toBeNull()
  })
})

describe('DataTable', () => {
  type Row = { id: string; name: string; tickets: number }
  const columns = [
    { id: 'name', header: 'Client', width: '2fr', render: (row: Row) => row.name },
    { id: 'tickets', header: 'Tickets', width: '1fr', render: (row: Row) => String(row.tickets) },
  ]
  const base = { columns, rowKey: (row: Row) => row.id, label: 'Clients', emptyLabel: 'No clients match these filters.' }

  it('renders rows and opens the record on click and Enter', () => {
    const onRowClick = vi.fn()
    renderUi(<DataTable {...base} rows={[{ id: '1', name: 'Acme', tickets: 4 }]} onRowClick={onRowClick} />)
    expect(screen.getByRole('table', { name: 'Clients' })).toBeTruthy()
    const row = screen.getAllByRole('row')[1]!
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('shows the empty message, six skeleton rows while loading and a retry on error', () => {
    const onRetry = vi.fn()
    const { rerender } = renderUi(<DataTable {...base} rows={[]} />)
    expect(screen.getByText('No clients match these filters.')).toBeTruthy()
    rerender(
      <UiProvider>
        <DataTable {...base} rows={[]} loading />
      </UiProvider>,
    )
    expect(screen.getAllByRole('row').length).toBe(7)
    rerender(
      <UiProvider>
        <DataTable {...base} rows={[]} error={{ message: 'Could not load', retryLabel: 'Retry', onRetry }} />
      </UiProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByText('Client')).toBeTruthy()
  })
})

describe('EvidencePanel', () => {
  const base = {
    title: 'Decisions and evidence',
    confidence: 0.94,
    confidenceLabel: 'Confidence',
    rows: [
      { id: 'type', key: 'Classified', value: 'Support', sub: 'billing question' },
      { id: 'route', key: 'Decision', value: 'Route to billing', routing: true },
    ],
    expanded: true,
    onToggle: vi.fn(),
    footer: { engine: 'Triage Intelligence', note: 'typed decision · no generated reasoning text' },
  }

  it('toggles through the header button and lists typed rows', () => {
    const onToggle = vi.fn()
    renderUi(<EvidencePanel {...base} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /Decisions and evidence/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Route to billing')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Decisions and evidence/ }))
    expect(onToggle).toHaveBeenCalled()
  })

  it('hides the rows when collapsed and keeps the footer', () => {
    renderUi(<EvidencePanel {...base} expanded={false} />)
    expect(screen.queryByText('Route to billing')).toBeNull()
    expect(screen.getByText('Triage Intelligence')).toBeTruthy()
  })

  it('replaces the rows with an alert and Retry when the trace is unavailable', () => {
    const onRetry = vi.fn()
    renderUi(<EvidencePanel {...base} error={{ message: 'Trace unavailable', retryLabel: 'Retry', onRetry }} />)
    expect(screen.getByRole('alert').textContent).toContain('Trace unavailable')
    expect(screen.queryByText('Route to billing')).toBeNull()
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('CommandPalette', () => {
  const labels = { dialog: 'Command palette', input: 'Search', placeholder: 'Type a command', runFirst: 'run first', close: 'close' }
  const sections = [
    { id: 'tickets', title: 'Tickets', items: [{ id: 't1', label: 'Refund request', meta: 'KAI-1' }] },
    { id: 'actions', title: 'Actions', items: [{ id: 'resolve', label: 'Resolve', shortcut: ['R'] as const }] },
  ]
  const base = { open: true, onClose: vi.fn(), query: '', onQueryChange: vi.fn(), sections, onSelect: vi.fn(), labels }

  it('renders nothing when closed', () => {
    renderUi(<CommandPalette {...base} open={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Esc and selects an item', () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    renderUi(<CommandPalette {...base} onClose={onClose} onSelect={onSelect} />)
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByText('Resolve'))
    expect(onSelect).toHaveBeenCalledWith('resolve')
  })

  it('keeps Actions available when the tickets search fails', () => {
    const onRetry = vi.fn()
    renderUi(
      <CommandPalette
        {...base}
        sections={[{ id: 'tickets', title: 'Tickets', items: [], error: { message: 'Search failed', retryLabel: 'Retry', onRetry } }, sections[1]!]}
      />,
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByText('Resolve')).toBeTruthy()
  })
})

describe('IntegrationCard', () => {
  const labels = { beta: 'BETA', soon: 'Coming soon', connect: 'Connect', connecting: 'Connecting…', reconnect: 'Reconnect', disconnect: 'Disconnect' }
  const base = { name: 'Gmail', initial: 'G', tileColor: '#000000', labels }

  it('offers Connect when available and Reconnect on error with the error text', () => {
    const onConnect = vi.fn()
    const onReconnect = vi.fn()
    const { rerender } = renderUi(<IntegrationCard {...base} status="available" description="Inbox" onConnect={onConnect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
    expect(onConnect).toHaveBeenCalled()
    rerender(
      <UiProvider>
        <IntegrationCard {...base} status="error" description="Inbox" errorMessage="Connection lost" onReconnect={onReconnect} />
      </UiProvider>,
    )
    expect(screen.getByText('Connection lost')).toBeTruthy()
    expect(screen.queryByText('Inbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(onReconnect).toHaveBeenCalled()
  })

  it('disables the action while connecting and has none when coming soon', () => {
    const { rerender } = renderUi(<IntegrationCard {...base} status="connecting" />)
    expect((screen.getByRole('button', { name: /Connecting/ }) as HTMLButtonElement).disabled).toBe(true)
    rerender(
      <UiProvider>
        <IntegrationCard {...base} status="soon" beta />
      </UiProvider>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Coming soon')).toBeTruthy()
    expect(screen.getByText('BETA')).toBeTruthy()
  })
})

describe('PermissionList', () => {
  const items = [
    { id: 'read', name: 'Read messages', description: 'Reads your inbox', required: true, checked: false },
    { id: 'draft', name: 'Draft replies', description: 'Writes drafts', checked: false },
  ]

  it('locks required permissions on and toggles optional ones', () => {
    const onChange = vi.fn()
    renderUi(<PermissionList label="Permissions" provider="Gmail" items={items} onChange={onChange} requirementLabels={{ required: 'required', optional: 'optional' }} />)
    const required = screen.getByRole('switch', { name: 'Read messages, required' }) as HTMLButtonElement
    expect(required.getAttribute('aria-checked')).toBe('true')
    expect(required.disabled).toBe(true)
    const optional = screen.getByRole('switch', { name: 'Draft replies, optional' })
    expect(optional.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(optional)
    expect(onChange).toHaveBeenCalledWith('draft', true)
  })
})

describe('StatusBar and StatusPanel', () => {
  it('shows the engine offline without a pulse', () => {
    renderUi(<StatusBar shortcuts={[{ keys: 'J', label: 'next' }]} status="engine offline" offline />)
    expect(screen.getByText('engine offline')).toBeTruthy()
    expect(screen.getByText('next')).toBeTruthy()
  })

  it('announces the error variant as an alert with its code', () => {
    const onPress = vi.fn()
    renderUi(<StatusPanel tone="error" title="Access denied" description="Domain not allowed." action={{ label: 'Try another account', onPress }} errorCode="ERR_DOMAIN" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('ERR_DOMAIN')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try another account' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('is not an alert in the neutral variant', () => {
    renderUi(<StatusPanel title="Invitation expired" description="Ask for a new one." action={{ label: 'Back', onPress: vi.fn() }} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AuthCard', () => {
  const base = { title: 'Sign in', submitLabel: 'Continue', onSubmit: vi.fn() }

  it('submits the form and shows an error as an alert', () => {
    const onSubmit = vi.fn()
    renderUi(
      <AuthCard {...base} onSubmit={onSubmit} error="Email or password do not match" providers={[{ id: 'google', label: 'Google', onPress: vi.fn() }]} dividerLabel="or with email">
        <label>
          Email
          <input type="email" />
        </label>
      </AuthCard>,
    )
    expect(screen.getByRole('alert').textContent).toContain('do not match')
    expect(screen.getByText('or with email')).toBeTruthy()
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit while loading or disabled', () => {
    const onSubmit = vi.fn()
    const { rerender } = renderUi(<AuthCard {...base} onSubmit={onSubmit} loading loadingLabel="Signing in…" providers={[{ id: 'google', label: 'Google', onPress: vi.fn() }]} />)
    expect((screen.getByRole('button', { name: 'Google' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(screen.getByRole('button', { name: /Signing in/ }).closest('form')!)
    rerender(
      <UiProvider>
        <AuthCard {...base} onSubmit={onSubmit} submitDisabled />
      </UiProvider>,
    )
    fireEvent.submit(screen.getByRole('button', { name: 'Continue' }).closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('renders the auth header and footer', () => {
    renderUi(
      <>
        <AuthHeader brand={<span>Kairo</span>} language={<span>EN</span>} />
        <AuthFooter links={[{ label: 'Terms', href: '/terms' }]} copyright="© Acme" />
      </>,
    )
    expect(screen.getByText('Terms').getAttribute('href')).toBe('/terms')
  })
})

describe('Public web pieces', () => {
  it('Faq uses native disclosure elements', () => {
    const { container } = renderUi(<Faq items={[{ id: '1', question: 'Is there a free plan?', answer: 'Yes.' }, { id: '2', question: 'Can I cancel?', answer: 'Anytime.' }]} />)
    expect(container.querySelectorAll('details').length).toBe(2)
    expect(container.querySelectorAll('summary').length).toBe(2)
  })

  it('feature cards render their content', () => {
    renderUi(
      <>
        <BentoCard title="Accountable AI" text="Every decision is typed." span={4}>
          <span>piece</span>
        </BentoCard>
        <TierCard color="#000000" tier="Tier 1" title="Static rules" text="Free." metricLabel="Cost" metricValue="$0" />
        <BenefitCard icon="zap" title="Fast" text="Seconds." />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Accountable AI' })).toBeTruthy()
    expect(screen.getByText('$0')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fast' })).toBeTruthy()
  })

  it('SiteFooter has one navigation landmark per column', () => {
    renderUi(
      <SiteFooter
        brand={<span>Kairo</span>}
        description="AI support cockpit."
        copyright="© Acme"
        version="web 1.0"
        columns={[
          { title: 'Product', links: [{ label: 'Pricing', href: '/pricing' }] },
          { title: 'Legal', links: [{ label: 'Privacy', href: '/privacy' }] },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Product' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeTruthy()
    expect(screen.getByText('web 1.0')).toBeTruthy()
  })

  it('PlanCard marks the recommended plan and lists inclusions', () => {
    const onPress = vi.fn()
    renderUi(<PlanCard name="Pro" description="For teams" price="$49" period="/ month" recommended recommendedLabel="Recommended" cta={{ label: 'Start free', onPress }} features={['Unlimited tickets', 'Drafts']} />)
    expect(screen.getByRole('heading', { name: /Pro/ })).toBeTruthy()
    expect(screen.getByText('Recommended')).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('PricingTable is a real table with scoped headers', () => {
    const { container } = renderUi(
      <PricingTable
        plans={['Starter', 'Pro']}
        recommended={1}
        featureLabel="Feature"
        includedLabel="Included"
        notIncludedLabel="Not included"
        groups={[{ id: 'g', title: 'Usage', rows: [{ id: 'r', feature: 'Tickets per month', values: ['500', true] }, { id: 's', feature: 'SSO', values: [false, true] }] }]}
      />,
    )
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('th[scope="col"]').length).toBe(3)
    expect(container.querySelectorAll('th[scope="row"]').length).toBe(3)
    expect(screen.getAllByLabelText('Included').length).toBe(2)
    expect(screen.getByLabelText('Not included')).toBeTruthy()
  })

  it('ProductFrame is an image figure with a route pill', () => {
    renderUi(
      <ProductFrame label="Queue view of the product" route="app.acme.com/inbox">
        <span>content</span>
      </ProductFrame>,
    )
    expect(screen.getByRole('img', { name: 'Queue view of the product' }).tagName).toBe('FIGURE')
    expect(screen.getByText('app.acme.com/inbox')).toBeTruthy()
  })

  it('Section renders its header and hides the grid from assistive technology', () => {
    const { container } = renderUi(
      <Section grid>
        <SectionHeader eyebrow="01 · Triage" title="Every email, triaged" body="Zero setup." />
      </Section>,
    )
    expect(screen.getByRole('heading', { name: 'Every email, triaged' })).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('TopNav marks the current link and exposes the mobile menu state', () => {
    const onToggle = vi.fn()
    renderUi(
      <TopNav
        brand={<span>Kairo</span>}
        label="Main"
        links={[{ id: 'product', label: 'Product', href: '/product' }, { id: 'pricing', label: 'Pricing', href: '/pricing' }]}
        current="pricing"
        signIn={{ label: 'Sign in', href: '/login' }}
        cta={{ label: 'Start free', onPress: vi.fn() }}
        menu={{ label: 'Menu', open: false, onToggle }}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(screen.getByText('Pricing').getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Product').getAttribute('aria-current')).toBeNull()
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(menu)
    expect(onToggle).toHaveBeenCalled()
  })

  it('WizardHeader carries the stepper and Exit', () => {
    const onPress = vi.fn()
    renderUi(<WizardHeader brand={<span>Kairo</span>} stepper={<span>steps</span>} exit={{ label: 'Exit', onPress }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(onPress).toHaveBeenCalled()
    expect(screen.getByText('steps')).toBeTruthy()
  })
})
