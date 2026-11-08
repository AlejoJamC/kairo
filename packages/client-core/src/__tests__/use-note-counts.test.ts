import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

type Reply = { ok: boolean; json: () => Promise<unknown> }
const pending: Array<(reply: Reply) => void> = []
const getNoteCounts = vi.fn(() => new Promise<Reply>((resolve) => { pending.push(resolve) }))

vi.mock('../endpoints', () => ({ getNoteCounts: () => getNoteCounts() }))

const { useNoteCounts } = await import('../hooks/use-note-counts')
const { useTriageStore } = await import('../stores/triage-store')

const reply = (data: Record<string, { notes: number; unread_mentions: number }>): Reply => ({ ok: true, json: async () => ({ data }) })

beforeEach(() => {
  pending.length = 0
  getNoteCounts.mockClear()
  useTriageStore.setState({ noteCounts: {}, noteCountsRevision: 0, threadRevision: 0 })
})
afterEach(() => vi.useRealTimers())

describe('useNoteCounts', () => {
  it('keeps the numbers already shown when a read fails', async () => {
    useTriageStore.setState({ noteCounts: { t1: { notes: 3, unread_mentions: 0 } } })
    renderHook(() => useNoteCounts(true, 3600))
    await act(async () => { pending[0]!({ ok: false, json: async () => ({}) }) })
    expect(useTriageStore.getState().noteCounts).toEqual({ t1: { notes: 3, unread_mentions: 0 } })
  })

  it('reads again when a note is added and ignores an older answer that arrives later', async () => {
    renderHook(() => useNoteCounts(true, 3600))
    expect(getNoteCounts).toHaveBeenCalledTimes(1)

    act(() => useTriageStore.getState().bumpThreadRevision())
    await waitFor(() => expect(getNoteCounts).toHaveBeenCalledTimes(2))

    await act(async () => { pending[1]!(reply({ t1: { notes: 2, unread_mentions: 0 } })) })
    await act(async () => { pending[0]!(reply({ t1: { notes: 1, unread_mentions: 0 } })) })
    expect(useTriageStore.getState().noteCounts).toEqual({ t1: { notes: 2, unread_mentions: 0 } })
  })

  it('reads again when the counters are refreshed after a mention is read', async () => {
    renderHook(() => useNoteCounts(true, 3600))
    act(() => useTriageStore.getState().refreshNoteCounts())
    await waitFor(() => expect(getNoteCounts).toHaveBeenCalledTimes(2))
  })
})

describe('clearUnreadMentions', () => {
  it('drops only the unread counter of that ticket', () => {
    useTriageStore.setState({ noteCounts: { t1: { notes: 4, unread_mentions: 2 }, t2: { notes: 1, unread_mentions: 1 } } })
    useTriageStore.getState().clearUnreadMentions('t1')
    expect(useTriageStore.getState().noteCounts).toEqual({ t1: { notes: 4, unread_mentions: 0 }, t2: { notes: 1, unread_mentions: 1 } })
  })
})
