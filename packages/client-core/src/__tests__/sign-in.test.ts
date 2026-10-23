import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initClientCore } from '../config'
import { redirectToSignIn } from '../api-client'
import { googleSignInUrl, openLanding, startGoogleSignIn } from '../endpoints'
import { classifySignInError } from '../auth'
import type { PlatformPorts } from '../platform'

function platform(kind: 'web' | 'desktop', navigate = vi.fn()): PlatformPorts {
  return {
    kind,
    host: null,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigation: { navigate },
    clipboard: { writeText: async () => {} },
    appFocus: { subscribe: () => () => {} },
    authHandoff: { takeHandoffTokens: async () => null },
  }
}

function init(ports: PlatformPorts) {
  initClientCore({
    apiBaseUrl: '',
    bffBaseUrl: '',
    landingUrl: 'https://kairo.example',
    supabaseUrl: 'https://acme.supabase.co',
    supabaseAnonKey: 'anon-key',
    platform: ports,
  })
}

describe('sign-in entry points', () => {
  const navigate = vi.fn()

  beforeEach(() => navigate.mockClear())

  it('the web app leaves for the sign-in surface when there is no session', () => {
    init(platform('web', navigate))
    redirectToSignIn()
    expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/')
  })

  it('the desktop app never opens the browser just because there is no session', () => {
    init(platform('desktop', navigate))
    redirectToSignIn()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('the Google sign-in carries the desktop destination only from the desktop app', () => {
    init(platform('web', navigate))
    expect(googleSignInUrl()).toBe('https://kairo.example/bff/auth/google')
    init(platform('desktop', navigate))
    expect(googleSignInUrl()).toBe('https://kairo.example/bff/auth/google?desktop=1')
    expect(googleSignInUrl(4010)).toBe('https://kairo.example/bff/auth/google?desktop=1&port=4010')
  })

  it('starts the Google sign-in and opens the landing pages through the navigation port', async () => {
    const host = { os: 'macos' as const, setBadge: vi.fn(), setMenu: vi.fn(), setWindowSize: vi.fn(), startSignInListener: vi.fn(async () => 4010), onMenuAction: vi.fn(() => () => {}), notify: vi.fn() }
    init({ ...platform('desktop', navigate), host })
    await expect(startGoogleSignIn()).resolves.toBe('https://kairo.example/bff/auth/google?desktop=1&port=4010')
    expect(host.startSignInListener).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenLastCalledWith('https://kairo.example/bff/auth/google?desktop=1&port=4010')
    openLanding('/set-password')
    expect(navigate).toHaveBeenLastCalledWith('https://kairo.example/set-password')
  })
})

describe('classifySignInError', () => {
  it('names wrong credentials and everything else, without the provider text', () => {
    expect(classifySignInError('Invalid login credentials')).toBe('invalid')
    expect(classifySignInError('Email not confirmed')).toBe('unexpected')
    expect(classifySignInError('network down')).toBe('unexpected')
  })
})
