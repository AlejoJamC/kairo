import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  Bold,
  DraftCard,
  NoteCard,
  NotificationRow,
  ThreadMessage,
  TicketRow,
  Bullet,
  ConfidenceRing,
  FollowUps,
  InlineCode,
  MentionMark,
  PasswordStrength,
  ProgressBar,
  PromptStarters,
  SentimentFace,
  SlaIndicator,
  SlaScale,
  SourceList,
  StatusChip,
  Toast,
  UiProvider,
} from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('SentimentFace', () => {
  it.each(['vector', 'emoji', 'text'] as const)('shares one accessible name in the %s variant', (variant) => {
    renderUi(<SentimentFace sentiment="frustrated" variant={variant} label="Sentiment: frustrated" word="frustrated" />)
    expect(screen.getByTitle('Sentiment: frustrated')).toBeTruthy()
  })

  it('draws brows only for aggressive and nothing without a value', () => {
    const { container, rerender } = renderUi(<SentimentFace sentiment="aggressive" label="Sentiment: aggressive" />)
    expect(container.querySelectorAll('path').length).toBe(2)
    rerender(
      <UiProvider>
        <SentimentFace sentiment="positive" label="Sentiment: positive" />
      </UiProvider>,
    )
    expect(container.querySelectorAll('path').length).toBe(1)
    rerender(
      <UiProvider>
        <SentimentFace sentiment={null} label="none" />
      </UiProvider>,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('shows the emoji and the word', () => {
    const { rerender } = renderUi(<SentimentFace sentiment="positive" variant="emoji" label="Sentiment: positive" />)
    expect(screen.getByText('🙂')).toBeTruthy()
    rerender(
      <UiProvider>
        <SentimentFace sentiment="neutral" variant="text" label="Sentiment: neutral" word="neutral" />
      </UiProvider>,
    )
    expect(screen.getByText('neutral')).toBeTruthy()
  })
})

describe('ConfidenceRing', () => {
  it('names the graphic with its value and colors the arc by band', () => {
    const colors = (value: number) => {
      const { container, unmount } = renderUi(<ConfidenceRing value={value} label="Confidence" />)
      const arc = container.querySelectorAll('circle')[1]!.getAttribute('stroke')
      unmount()
      return arc
    }
    const high = colors(0.95)
    const mid = colors(0.8)
    const low = colors(0.4)
    expect(new Set([high, mid, low]).size).toBe(3)
    renderUi(<ConfidenceRing value={0.73} label="Confidence" />)
    expect(screen.getByRole('img', { name: 'Confidence 0.73' })).toBeTruthy()
  })

  it('shows the dotted no-data ring and the numeric dash', () => {
    const { container, rerender } = renderUi(<ConfidenceRing value={null} label="Confidence" noDataLabel="no data" />)
    expect(screen.getByRole('img', { name: 'Confidence no data' })).toBeTruthy()
    expect(container.querySelector('circle')?.getAttribute('stroke-dasharray')).toBeTruthy()
    rerender(
      <UiProvider>
        <ConfidenceRing value={undefined} variant="numeric" label="Confidence" />
      </UiProvider>,
    )
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows the number with two decimals in the numeric and graphic-with-value variants', () => {
    const { rerender } = renderUi(<ConfidenceRing value={0.5} variant="numeric" label="Confidence" />)
    expect(screen.getByText('0.50')).toBeTruthy()
    rerender(
      <UiProvider>
        <ConfidenceRing value={0.9} showValue label="Confidence" />
      </UiProvider>,
    )
    expect(screen.getByText('0.90')).toBeTruthy()
  })
})

describe('ProgressBar', () => {
  it('exposes its progress and shows the legend', () => {
    renderUi(<ProgressBar value={0.4} label="Scan" status="classifying…" running />)
    const bar = screen.getByRole('progressbar', { name: 'Scan' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(screen.getByRole('status').textContent).toContain('40%')
  })

  it('clamps out-of-range values and shows the failure', () => {
    const { rerender } = renderUi(<ProgressBar value={2} label="Scan" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100')
    rerender(
      <UiProvider>
        <ProgressBar value={0.3} label="Scan" error="Scan failed" />
      </UiProvider>,
    )
    expect(screen.getByRole('status').textContent).toBe('Scan failed')
  })
})

describe('PasswordStrength', () => {
  const requirements = [
    { label: 'At least 8 characters', met: true },
    { label: 'A number', met: false },
    { label: 'Passwords match', met: false, failed: true },
  ]

  it('lists every requirement and the strength word', () => {
    renderUi(<PasswordStrength score={2} scoreLabel="fair" requirements={requirements} />)
    expect(screen.getByText('fair')).toBeTruthy()
    expect(screen.getAllByRole('listitem').length).toBe(3)
  })

  it('hides the bars from assistive technology and marks a failed requirement with an x', () => {
    const { container } = renderUi(<PasswordStrength score={4} scoreLabel="strong" requirements={requirements} id="rules" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(container.querySelector('#rules')).toBeTruthy()
    expect(screen.getByText('Passwords match').closest('li')?.querySelector('svg')).toBeTruthy()
  })
})

describe('Toast', () => {
  it('is a status with a close button and an optional action', () => {
    const onClose = vi.fn()
    const onAction = vi.fn()
    renderUi(
      <Toast closeLabel="Close" onClose={onClose} actionLabel="Undo" onAction={onAction}>
        Ticket resolved
      </Toast>,
    )
    expect(screen.getByRole('status').textContent).toContain('Ticket resolved')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has an error tone with a retry', () => {
    renderUi(
      <Toast tone="error" closeLabel="Close" onClose={() => {}} actionLabel="Retry" onAction={() => {}}>
        Could not save
      </Toast>,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})

describe('SourceList', () => {
  it('renders nothing without rows', () => {
    const { container } = renderUi(<SourceList title="Sources" items={[]} />)
    expect(container.textContent).toBe('')
  })

  it('makes rows that open into buttons and leaves the others static', () => {
    const onOpen = vi.fn()
    renderUi(
      <SourceList
        title="Sources"
        items={[
          { id: 't', kind: 'ticket', code: 'KAI-101', title: 'Export fails', meta: 'open', onOpen },
          { id: 'c', kind: 'client', title: 'Acme' },
        ]}
      />,
    )
    expect(screen.getByText('Sources')).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: /Export fails/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Acme')).toBeTruthy()
  })
})

describe('PromptStarters and FollowUps', () => {
  const starters = [
    { id: 'summary', icon: 'summary' as const, text: 'Summarize this ticket' },
    { id: 'draft', icon: 'draft' as const, text: 'Draft a first response' },
  ]

  it('sends the chosen starter and shows a spinner on the pending one', () => {
    const onPick = vi.fn()
    const { container } = renderUi(<PromptStarters title="Suggestions" items={starters} onPick={onPick} pendingId="draft" />)
    fireEvent.click(screen.getByRole('button', { name: /Summarize/ }))
    expect(onPick).toHaveBeenCalledWith('summary')
    expect(container.querySelectorAll('.kairo-ui-spin').length).toBe(1)
  })

  it('disables follow-ups while the AI answers', () => {
    const onPick = vi.fn()
    renderUi(<FollowUps items={[{ id: 'short', text: 'Make it shorter' }]} onPick={onPick} disabled />)
    const pill = screen.getByRole('button', { name: /shorter/ }) as HTMLButtonElement
    expect(pill.disabled).toBe(true)
    fireEvent.click(pill)
    expect(onPick).not.toHaveBeenCalled()
  })
})

describe('StatusChip', () => {
  const options = [
    { status: 'open' as const, label: 'Open' },
    { status: 'resolved' as const, label: 'Resolved' },
  ]

  it('opens a menu with the current status marked and reports a change', () => {
    const onChange = vi.fn()
    renderUi(<StatusChip status="open" options={options} onChange={onChange} menuLabel="Change status" />)
    fireEvent.click(screen.getByRole('button', { name: /Open/ }))
    expect(screen.getByRole('menuitem', { name: 'Open' }).getAttribute('aria-current')).toBe('true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resolved' }))
    expect(onChange).toHaveBeenCalledWith('resolved')
  })

  it('is read-only with a lock for a final status', () => {
    renderUi(<StatusChip status="resolved" options={options} onChange={() => {}} menuLabel="m" readOnly readOnlyLabel="Read only" />)
    expect(screen.getByText('Read only')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is disabled with a spinner while updating', () => {
    const { container } = renderUi(<StatusChip status="open" options={options} onChange={() => {}} menuLabel="m" updating />)
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('.kairo-ui-spin')).toBeTruthy()
  })
})

describe('SlaIndicator', () => {
  it('shows the compact time with a title', () => {
    renderUi(<SlaIndicator variant="compact" time="48m" title="SLA" />)
    expect(screen.getByTitle('SLA').textContent).toContain('48m')
  })

  it('shows the full label and the elapsed bar', () => {
    const { container } = renderUi(<SlaIndicator variant="full" label="SLA overdue by 30m" progress={0.5} />)
    expect(screen.getByText('SLA overdue by 30m')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows the scale legend and an order error as an alert', () => {
    renderUi(
      <SlaScale
        alert={60}
        escalation={120}
        maximum={240}
        labels={{ minimum: '15m', alert: '60m', escalation: '120m', breach: '240m' }}
        orderError="The order must be minimum < alert < escalation < maximum"
      />,
    )
    expect(screen.getByText('240m')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('minimum < alert')
  })
})

describe('rich text marks', () => {
  it('keeps semantic tags', () => {
    renderUi(
      <p>
        <Bold>bold</Bold> <InlineCode>KAI-1</InlineCode> <MentionMark self>@Ana</MentionMark>
      </p>,
    )
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('KAI-1').tagName).toBe('CODE')
    expect(screen.getByText('@Ana')).toBeTruthy()
  })

  it('draws a bullet with a decorative dot', () => {
    const { container } = renderUi(<Bullet>point</Bullet>)
    expect(screen.getByText('point')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('TicketRow', () => {
  const base = { code: 'KAI-101', subject: 'Export fails', age: '12m', sender: 'Dana', onPress: () => {} }

  it('is a button named by id and subject that reports selection and presses', () => {
    const onPress = vi.fn()
    renderUi(<TicketRow {...base} selected onPress={onPress} priority="P1" />)
    const row = screen.getByRole('button', { name: 'KAI-101 Export fails' })
    expect(row.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows the signals of line two with titles', () => {
    renderUi(
      <TicketRow
        {...base}
        sentiment="frustrated"
        sentimentLabel="Sentiment: frustrated"
        mention={{ label: 'Mentions you' }}
        notes={{ count: 2, label: '2 notes' }}
        messageCount={{ count: 4, label: '4 messages' }}
        confidence={0.8}
        confidenceLabel="Confidence"
      />,
    )
    expect(screen.getByTitle('Sentiment: frustrated')).toBeTruthy()
    expect(screen.getByLabelText('Mentions you')).toBeTruthy()
    expect(screen.getByTitle('2 notes').textContent).toContain('2')
    expect(screen.getByTitle('4 messages')).toBeTruthy()
    expect(screen.getByTitle('Confidence 0.80')).toBeTruthy()
  })

  it('replaces the confidence with an alert icon when classification failed', () => {
    renderUi(<TicketRow {...base} confidence={0.9} failedLabel="Classification failed" />)
    expect(screen.getByRole('img', { name: 'Classification failed' })).toBeTruthy()
    expect(screen.queryByRole('img', { name: /Confidence/ })).toBeNull()
  })

  it('renders the optional third line and the leading control', () => {
    renderUi(<TicketRow {...base} leading={<input type="checkbox" aria-label="Select" />} footer={<span>Last reply</span>} />)
    expect(screen.getByLabelText('Select')).toBeTruthy()
    expect(screen.getByText('Last reply')).toBeTruthy()
  })
})

describe('NoteCard', () => {
  it('shows the author, time and body', () => {
    renderUi(<NoteCard author="Sam" authorName="Sam Agent" time="10:02">Check the invoice</NoteCard>)
    expect(screen.getByText('Sam')).toBeTruthy()
    expect(screen.getByText('10:02')).toBeTruthy()
    expect(screen.getByText('Check the invoice')).toBeTruthy()
  })

  it('marks an unread mention with a badge and presses on enter', () => {
    const onPress = vi.fn()
    renderUi(
      <NoteCard author="Sam" unread mentionedYouLabel="Mentioned you" onPress={onPress} title="View in thread" hint="View in thread">
        body
      </NoteCard>,
    )
    expect(screen.getByText('Mentioned you')).toBeTruthy()
    const card = screen.getByRole('button')
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.click(card)
    expect(onPress).toHaveBeenCalledTimes(2)
  })
})

describe('ThreadMessage', () => {
  it('is an article with author, tag, meta and body', () => {
    const { container } = renderUi(
      <ThreadMessage variant="reply" avatar={<span>A</span>} name="Support" tag={<span>reply · sent</span>} meta="10:00">
        Hello
      </ThreadMessage>,
    )
    expect(container.querySelector('article')).toBeTruthy()
    expect(screen.getByText('Support')).toBeTruthy()
    expect(screen.getByText('reply · sent')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('explains a missing body', () => {
    renderUi(
      <ThreadMessage variant="initial" avatar={<span>D</span>} name="Dana" missingBody="The message has no body" />,
    )
    expect(screen.getByText('The message has no body')).toBeTruthy()
  })
})

describe('NotificationRow', () => {
  it('is a button with who, what, target and time', () => {
    const onPress = vi.fn()
    renderUi(<NotificationRow variant="activity" who="SLA" what="is at risk" target="KAI-106" time="5m" unread onPress={onPress} />)
    const row = screen.getByRole('button')
    expect(row.textContent).toContain('KAI-106')
    expect(row.textContent).toContain('5m')
    fireEvent.click(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows a mention with its excerpt', () => {
    renderUi(<NotificationRow variant="mention" avatar={<span>S</span>} text="Sam mentioned you in KAI-101" excerpt="Please check" time="1h" onPress={() => {}} />)
    expect(screen.getByText('Please check')).toBeTruthy()
  })
})

describe('DraftCard', () => {
  it('shows the badge, heading, body and actions', () => {
    renderUi(<DraftCard badge="DRAFT AI" heading="Re: Export fails" body="Hi Dana" actions={<button>Copy</button>} />)
    expect(screen.getByText('DRAFT AI')).toBeTruthy()
    expect(screen.getByText('Re: Export fails')).toBeTruthy()
    expect(screen.getByText('Hi Dana')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })

  it('shows skeleton bars while regenerating', () => {
    const { container } = renderUi(<DraftCard badge="DRAFT AI" body="old" loading actions={<button>Copy</button>} />)
    expect(container.querySelectorAll('.kairo-ui-shim').length).toBe(3)
    expect(screen.queryByText('old')).toBeNull()
  })

  it('replaces the body with a callout and hides the actions on error', () => {
    const onRetry = vi.fn()
    renderUi(<DraftCard badge="DRAFT AI" body="x" error={{ message: 'Draft failed', retryLabel: 'Retry', onRetry }} actions={<button>Copy</button>} />)
    expect(screen.getByRole('alert').textContent).toContain('Draft failed')
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
