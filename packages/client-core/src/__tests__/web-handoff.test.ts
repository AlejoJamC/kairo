import { describe, expect, it } from 'vitest'
import { discardStoredSessions } from '../web'

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (name: string) => { data.delete(name) },
    keys: () => [...data.keys()],
  }
}

describe('discardStoredSessions', () => {
  it('removes stored sessions and code verifiers and keeps everything else', () => {
    const storage = memoryStorage({
      'sb-127-auth-token': '{}',
      'sb-acme-auth-token-code-verifier': 'v',
      'kairo-locale': 'es',
      'sb-notes': 'x',
    })
    discardStoredSessions(storage)
    expect(storage.keys()).toEqual(['kairo-locale', 'sb-notes'])
  })
})
