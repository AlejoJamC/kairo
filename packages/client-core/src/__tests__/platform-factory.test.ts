import { afterEach, describe, it, expect, vi } from 'vitest'
import { createPlatform } from '../platform-factory'

const bridgeKey = '__KAIRO_DESKTOP__'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[bridgeKey]
})

describe('createPlatform', () => {
  it('returns the web ports when no desktop bridge is injected', () => {
    const platform = createPlatform()
    expect(platform.kind).toBe('web')
    expect(platform.host).toBeNull()
    expect(typeof platform.navigation.navigate).toBe('function')
    expect(typeof platform.authHandoff.takeHandoffTokens).toBe('function')
  })

  it('returns the desktop ports when the shell injected its bridge', async () => {
    const openExternal = vi.fn()
    const tokens = { access_token: 'at', refresh_token: 'rt' }
    ;(globalThis as Record<string, unknown>)[bridgeKey] = {
      openExternal,
      takeHandoffTokens: async () => tokens,
      os: 'macos',
      setBadge: vi.fn(),
      setMenu: vi.fn(), setWindowSize: vi.fn(), startSignInListener: vi.fn(async () => 4010),
      onMenuAction: vi.fn(() => () => {}),
      notify: vi.fn(),
    }

    const platform = createPlatform()
    expect(platform.kind).toBe('desktop')
    expect(platform.host?.os).toBe('macos')
    platform.navigation.navigate('https://acme.com/wizard/')
    expect(openExternal).toHaveBeenCalledWith('https://acme.com/wizard/')
    await expect(platform.authHandoff.takeHandoffTokens()).resolves.toEqual(tokens)
  })
})
