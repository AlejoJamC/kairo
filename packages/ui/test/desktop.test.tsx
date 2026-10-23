import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  PageFrame,
  QueueHeader,
  UiProvider,
  WINDOW_CONTROLS_SLOT,
  WindowChromeProvider,
  WindowControlsSlot,
  WindowDragArea,
  buildAppMenu,
  buildSystemNotification,
  clampExcerpt,
  dockBadgeCount,
  dockBadgeLabel,
  dockBadgeWindowsOverlay,
  shouldSendSystemNotification,
  type AppMenuGroup,
  type AppMenuState,
} from '../src'

const renderUi = (ui: ReactElement) => render(<UiProvider>{ui}</UiProvider>)

afterEach(cleanup)

describe('WindowChrome', () => {
  it('reserves the 52×20 controls slot and keeps it out of the tab order', () => {
    const { container } = renderUi(<WindowControlsSlot />)
    const slot = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(slot).toBeTruthy()
    expect(slot.textContent).toBe('')
    expect(slot.getAttribute('role')).toBeNull()
    expect(slot.getAttribute('tabindex')).toBeNull()
    expect(WINDOW_CONTROLS_SLOT).toEqual({ width: 52, height: 20 })
  })

  it('marks a drag region for the native window and is not a control', () => {
    renderUi(
      <WindowDragArea height={14}>
        <span>queue title</span>
      </WindowDragArea>,
    )
    const region = screen.getByText('queue title').parentElement as HTMLElement
    expect(region.getAttribute('data-tauri-drag-region')).toBe('')
    expect(region.getAttribute('role')).toBeNull()
  })
})

describe('WindowChromeProvider', () => {
  it('marks the top row of a column as a drag area only inside the macOS window', () => {
    const { container, unmount } = renderUi(<QueueHeader title="Triage" />)
    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull()
    unmount()
    const inside = renderUi(
      <WindowChromeProvider macos>
        <QueueHeader title="Triage" />
      </WindowChromeProvider>,
    )
    expect(inside.container.querySelector('[data-tauri-drag-region]')).toBeTruthy()
  })

  it('puts a 14px drag strip above the page frame in the macOS window and none elsewhere', () => {
    const outside = renderUi(<PageFrame>content</PageFrame>)
    expect(outside.container.querySelector('[data-tauri-drag-region]')).toBeNull()
    outside.unmount()
    const inside = renderUi(
      <WindowChromeProvider macos>
        <PageFrame>content</PageFrame>
      </WindowChromeProvider>,
    )
    expect(inside.container.querySelector('[data-tauri-drag-region]')).toBeTruthy()
  })
})

describe('DockBadge', () => {
  it('clears the counter for zero and non-finite counts', () => {
    expect(dockBadgeCount(0)).toBeNull()
    expect(dockBadgeCount(-1)).toBeNull()
    expect(dockBadgeCount(Number.NaN)).toBeNull()
    expect(dockBadgeCount(3)).toBe(3)
  })

  it('shows the number up to 99 and 99+ from 100', () => {
    expect(dockBadgeLabel(1)).toBe('1')
    expect(dockBadgeLabel(99)).toBe('99')
    expect(dockBadgeLabel(100)).toBe('99+')
    expect(dockBadgeLabel(0)).toBe('')
  })

  it('draws the Windows overlay number only up to 9 and names the full count', () => {
    expect(dockBadgeWindowsOverlay(9)).toEqual({ number: true, description: 'Kairo, 9 unread' })
    expect(dockBadgeWindowsOverlay(12)).toEqual({ number: false, description: 'Kairo, 12 unread' })
    expect(dockBadgeWindowsOverlay(0)).toEqual({ number: false, description: '' })
  })
})

describe('SystemNotification', () => {
  it('builds the mention text with the excerpt clamped to two lines', () => {
    expect(clampExcerpt('line one\nline two\nline three')).toBe('line one\nline two')
    const n = buildSystemNotification({ kind: 'mention', from: 'Ana', ticketId: 'KAI-12', excerpt: 'Check this\n@Alex' })
    expect(n.title).toBe('Ana mentioned you in KAI-12')
    expect(n.body).toBe('Check this\n@Alex')
    expect(n.actions.map((a) => a.label)).toEqual(['Open ticket', 'Mark read'])
    expect(n.dedupKey).toBe('KAI-12:mention:Ana')
  })

  it('builds the three SLA states with one open action', () => {
    expect(buildSystemNotification({ kind: 'sla-at-risk', ticketId: 'KAI-3', minutesLeft: 40, subject: 'Export fails', client: 'Acme' }).title).toBe('SLA at risk on KAI-3 · 40m left')
    expect(buildSystemNotification({ kind: 'sla-escalating', ticketId: 'KAI-3', minutesLeft: 12, subject: 'Export fails', client: 'Acme' }).title).toBe('SLA almost breached on KAI-3 · escalates in 12m')
    expect(buildSystemNotification({ kind: 'sla-overdue', ticketId: 'KAI-3', subject: 'Export fails', client: 'Acme' }).title).toBe('First response overdue on KAI-3')
  })

  const baseRules = { presence: 'online' as const, doNotDisturb: false, windowActive: false, openTicketId: null, notificationsDisabled: false }

  it('respects DnD, presence and the OS switch', () => {
    const event = { kind: 'sla-overdue' as const, ticketId: 'KAI-3', subject: 'x', client: 'y' }
    expect(shouldSendSystemNotification(event, { ...baseRules, doNotDisturb: true })).toBe(false)
    expect(shouldSendSystemNotification(event, { ...baseRules, presence: 'away' })).toBe(false)
    expect(shouldSendSystemNotification(event, { ...baseRules, notificationsDisabled: true })).toBe(false)
    expect(shouldSendSystemNotification(event, baseRules)).toBe(true)
  })

  it('stays silent while the window is active on that ticket', () => {
    const event = { kind: 'sla-at-risk' as const, ticketId: 'KAI-3', minutesLeft: 40, subject: 'x', client: 'y' }
    expect(shouldSendSystemNotification(event, { ...baseRules, windowActive: true, openTicketId: 'KAI-3' })).toBe(false)
    expect(shouldSendSystemNotification(event, { ...baseRules, windowActive: true, openTicketId: 'KAI-9' })).toBe(true)
  })
})

describe('AppMenu', () => {
  const base: AppMenuState = {
    view: 'triage',
    language: 'en',
    sidebarExpanded: true,
    ticketOpen: true,
    ticketAwaitingCustomer: false,
    ticketFinal: false,
    ticketPriority: 'P1',
    ticketStatus: 'open',
    statusOptions: ['open', 'resolved'],
    composerEmpty: false,
    similarTicketId: null,
  }

  const menu = (groups: AppMenuGroup[], id: string) => groups.find((g) => g.id === id)!
  const findItem = (groups: AppMenuGroup[], id: string) => {
    for (const g of groups) {
      for (const it of g.items) {
        if (it.kind === 'item' && it.id === id) return it
        if (it.kind === 'submenu') {
          const found = it.items.find((s) => s.kind === 'item' && s.id === id)
          if (found) return found
        }
      }
    }
    return undefined
  }

  it('lists the seven menus in order', () => {
    const groups = buildAppMenu(base)
    expect(groups.map((g) => g.label)).toEqual(['Kairo', 'Edit', 'View', 'Go', 'Ticket', 'Window', 'Help'])
  })

  it('checks the current view in Go and the language in View', () => {
    const groups = buildAppMenu({ ...base, view: 'knowledge', language: 'es' })
    const go = menu(groups, 'go')
    const knowledge = go.items.find((i) => i.id === 'go-knowledge')
    expect(knowledge?.kind).toBe('item')
    expect((knowledge as Extract<typeof knowledge, { kind: 'item' }>).checked).toBe(true)
    const language = menu(groups, 'view').items.find((i) => i.id === 'language')
    expect(language?.kind).toBe('submenu')
    const items = (language as Extract<typeof language, { kind: 'submenu' }>).items
    expect((items.find((i) => i.id === 'language-es') as { checked: boolean }).checked).toBe(true)
  })

  it('shows single-key shortcuts without registering them as accelerators', () => {
    const groups = buildAppMenu(base)
    const acknowledge = findItem(groups, 'acknowledge') as { shortcut?: string; accelerator?: string }
    expect(acknowledge.shortcut).toBe('A')
    expect(acknowledge.accelerator).toBeUndefined()
    const send = findItem(groups, 'send') as { shortcut?: string; accelerator?: string }
    expect(send.accelerator).toBe('CmdOrCtrl+Enter')
  })

  it('disables the whole Ticket menu without a ticket', () => {
    const groups = buildAppMenu({ ...base, ticketOpen: false })
    const ticket = menu(groups, 'ticket').items
    for (const it of ticket) {
      if (it.kind === 'item' && it.id !== 'ask-assistant') expect(it.disabled).toBe(true)
    }
  })

  it('disables Send and Send and resolve with an empty composer', () => {
    const groups = buildAppMenu({ ...base, composerEmpty: true })
    expect((findItem(groups, 'send') as { disabled?: boolean }).disabled).toBe(true)
    expect((findItem(groups, 'send-resolve') as { disabled?: boolean }).disabled).toBe(true)
    expect((findItem(groups, 'acknowledge') as { disabled?: boolean }).disabled).toBe(false)
  })

  it('on a final status disables every ticket item except Ask Kairo Assistant', () => {
    const groups = buildAppMenu({ ...base, ticketFinal: true })
    const ticket = menu(groups, 'ticket').items
    for (const it of ticket) {
      if (it.kind === 'item') {
        expect(it.disabled).toBe(it.id === 'ask-assistant' ? false : true)
      }
    }
  })

  it('adds Group with [ID] only when a similar ticket exists', () => {
    expect(findItem(buildAppMenu(base), 'group-with')).toBeUndefined()
    expect(findItem(buildAppMenu({ ...base, similarTicketId: 'KAI-7' }), 'group-with')).toBeTruthy()
  })
})
