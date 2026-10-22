import { describe, it, expect, vi } from 'vitest'
import { createDesktopPlatform, type DesktopPlatformDeps } from '../desktop'

function deps(overrides: Partial<DesktopPlatformDeps> = {}): DesktopPlatformDeps {
  return {
    storage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    clipboard: { writeText: vi.fn(async () => {}) },
    appFocus: { subscribe: vi.fn(() => () => {}) },
    openExternal: vi.fn(),
    takeHandoffTokens: vi.fn(async () => null),
    ...overrides,
  }
}

describe('createDesktopPlatform', () => {
  it('opens the system browser on navigate, never the embedded webview', () => {
    const openExternal = vi.fn()
    const platform = createDesktopPlatform(deps({ openExternal }))
    platform.navigation.navigate('https://acme.com/wizard/')
    expect(openExternal).toHaveBeenCalledWith('https://acme.com/wizard/')
  })

  it('returns the deep-link tokens through the handoff port', async () => {
    const tokens = { access_token: 'at', refresh_token: 'rt' }
    const takeHandoffTokens = vi.fn(async () => tokens)
    const platform = createDesktopPlatform(deps({ takeHandoffTokens }))
    await expect(platform.authHandoff.takeHandoffTokens()).resolves.toEqual(tokens)
    expect(takeHandoffTokens).toHaveBeenCalledTimes(1)
  })

  it('passes storage, clipboard and appFocus through unchanged', () => {
    const storage = { getItem: vi.fn(() => 'x'), setItem: vi.fn(), removeItem: vi.fn() }
    const clipboard = { writeText: vi.fn(async () => {}) }
    const unsubscribe = () => {}
    const appFocus = { subscribe: vi.fn(() => unsubscribe) }
    const platform = createDesktopPlatform(deps({ storage, clipboard, appFocus }))
    expect(platform.storage).toBe(storage)
    expect(platform.clipboard).toBe(clipboard)
    expect(platform.appFocus).toBe(appFocus)
  })
})
