import { describe, expect, it } from 'vitest'
import { useTriageStore } from '../stores/triage-store'

describe('threadRevision', () => {
  it('increases each time content is added to the open ticket', () => {
    const before = useTriageStore.getState().threadRevision
    useTriageStore.getState().bumpThreadRevision()
    useTriageStore.getState().bumpThreadRevision()
    expect(useTriageStore.getState().threadRevision).toBe(before + 2)
  })
})
