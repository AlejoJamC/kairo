import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { initClientCore } from '../config'
import { apiCall, redirectToSignIn } from '../api-client'
import { googleSignInUrl, openLanding, startGoogleSignIn } from '../endpoints'
import { AuthProvider, classifySignInError, useAuth } from '../auth'
import type { PlatformPorts } from '../platform'
import { createDesktopPlatform } from '../desktop'

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
}))
vi.mock('../supabase', () => ({ createClient: () => ({ auth: authMock, from: authMock.from }) }))

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
    const host = { os: 'macos' as const, setBadge: vi.fn(), setMenu: vi.fn(), setWindowSize: vi.fn(), setMinWindowSize: vi.fn(), startSignInListener: vi.fn(async () => 4010), onMenuAction: vi.fn(() => () => {}), notify: vi.fn() }
    init({ ...platform('desktop', navigate), host })
    await expect(startGoogleSignIn()).resolves.toBe('https://kairo.example/bff/auth/google?desktop=1&port=4010')
    expect(host.startSignInListener).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenLastCalledWith('https://kairo.example/bff/auth/google?desktop=1&port=4010')
    openLanding('/set-password')
    expect(navigate).toHaveBeenLastCalledWith('https://kairo.example/set-password')
  })
})

describe('unauthorized product requests', () => {
  const navigate = vi.fn()
  const session = { access_token: 'access', refresh_token: 'refresh' }

  beforeEach(() => {
    vi.clearAllMocks()
    init(platform('web', navigate))
    authMock.getSession.mockResolvedValue({ data: { session }, error: null })
    authMock.signOut.mockResolvedValue({ error: null })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('signs out when the auth server confirms the session is invalid', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
    const response = await apiCall('/api/v1/tickets')
    expect(response.status).toBe(401)
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/')
  })

  it('keeps a valid session when a product endpoint returns 401', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    expect((await apiCall('/api/v1/tickets')).status).toBe(401)
    expect(authMock.signOut).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not clear a session because of a transient auth service error', async () => {
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } })
    await apiCall('/api/v1/tickets')
    expect(authMock.signOut).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not clear a newer session after an older request fails', async () => {
    authMock.getSession.mockResolvedValueOnce({ data: { session }, error: null })
      .mockResolvedValueOnce({ data: { session: { ...session, access_token: 'new-access' } }, error: null })
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
    await apiCall('/api/v1/tickets')
    expect(authMock.signOut).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('classifySignInError', () => {
  it('names wrong credentials and everything else, without the provider text', () => {
    expect(classifySignInError('Invalid login credentials')).toBe('invalid')
    expect(classifySignInError('Email not confirmed')).toBe('unexpected')
    expect(classifySignInError('network down')).toBe('unexpected')
  })
})

describe('dashboard session initialization', () => {
  const navigate = vi.fn()
  const user = { id: 'user-1', email: 'support@acme.com' }
  const session = { user, access_token: 'access', refresh_token: 'refresh' }
  let listener: (event: string, value: typeof session | null) => void

  function Probe() {
    const auth = useAuth()
    return createElement('div', null, auth.loading ? 'loading' : auth.user ? 'authenticated' : 'anonymous')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    init(platform('web', navigate))
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null })
    authMock.setSession.mockResolvedValue({ data: { session }, error: null })
    authMock.getUser.mockResolvedValue({ data: { user }, error: null })
    authMock.onAuthStateChange.mockImplementation((callback) => {
      listener = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    authMock.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({ data: { ...user, name: 'Acme' }, error: null }),
        maybeSingle: async () => ({ data: table === 'account_members' ? { role: 'agent', account_id: 'account-1' } : null, error: null }),
      }
      return query
    })
  })

  afterEach(cleanup)

  it('redirects an unauthenticated browser without setting a user', async () => {
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/'))
    expect(screen.getByText('anonymous')).toBeTruthy()
  })

  it('uses new handoff tokens before any older stored session', async () => {
    const ports = platform('web', navigate)
    ports.authHandoff.takeHandoffTokens = async () => ({ access_token: 'access', refresh_token: 'refresh' })
    init(ports)
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy())
    expect(authMock.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' })
    expect(authMock.getSession).not.toHaveBeenCalled()
    expect(authMock.getUser).toHaveBeenCalled()
  })

  it('opens the desktop session when StrictMode initializes twice', async () => {
    const base = platform('desktop', navigate)
    const takeHandoffTokens = vi.fn(async () => ({ access_token: 'access', refresh_token: 'refresh' }))
    const host = { os: 'macos' as const, setBadge: vi.fn(), setMenu: vi.fn(), setWindowSize: vi.fn(), setMinWindowSize: vi.fn(), startSignInListener: vi.fn(async () => 4010), onMenuAction: vi.fn(() => () => {}), notify: vi.fn() }
    init(createDesktopPlatform({ storage: base.storage, clipboard: base.clipboard, appFocus: base.appFocus, openExternal: navigate, takeHandoffTokens, host }))
    render(createElement(StrictMode, null, createElement(AuthProvider, null, createElement(Probe))))
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy())
    expect(takeHandoffTokens).toHaveBeenCalledTimes(1)
    expect(authMock.setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' })
  })

  it('rejects a stored session that the auth server no longer accepts', async () => {
    authMock.getSession.mockResolvedValue({ data: { session }, error: null })
    authMock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } })
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/'))
    expect(screen.getByText('anonymous')).toBeTruthy()
  })

  it('clears the authenticated user when the session is lost', async () => {
    authMock.getSession.mockResolvedValue({ data: { session }, error: null })
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy())
    act(() => listener('SIGNED_OUT', null))
    expect(screen.getByText('anonymous')).toBeTruthy()
    expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/')
  })

  it('does not restore profile data when sign-out races an account lookup', async () => {
    authMock.getSession.mockResolvedValue({ data: { session }, error: null })
    let finishProfile!: (value: { data: { id: string; email: string; name: string }; error: null }) => void
    const pendingProfile = new Promise<{ data: { id: string; email: string; name: string }; error: null }>((resolve) => { finishProfile = resolve })
    authMock.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        single: () => pendingProfile,
        maybeSingle: async () => ({ data: table === 'account_members' ? { role: 'agent', account_id: 'account-1' } : null, error: null }),
      }
      return query
    })
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(authMock.from).toHaveBeenCalled())
    act(() => listener('SIGNED_OUT', null))
    await act(async () => { finishProfile({ data: { ...user, name: 'Acme' }, error: null }); await pendingProfile })
    expect(screen.getByText('anonymous')).toBeTruthy()
    expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/')
  })

  it('does not fall back to a previous session when the new handoff fails', async () => {
    const ports = platform('web', navigate)
    ports.authHandoff.takeHandoffTokens = async () => ({ access_token: 'access', refresh_token: 'refresh' })
    init(ports)
    authMock.setSession.mockResolvedValue({ data: { session: null }, error: { status: 401 } })
    render(createElement(AuthProvider, null, createElement(Probe)))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://kairo.example/wizard/'))
    expect(screen.getByText('anonymous')).toBeTruthy()
    expect(authMock.getSession).not.toHaveBeenCalled()
  })
})
