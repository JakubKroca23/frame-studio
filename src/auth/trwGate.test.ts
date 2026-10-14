import { describe, expect, it } from 'vitest'
import { checkGate, loginWithPassword, TRW_AUTH_ME_URL, TRW_AUTH_PASSWORD_URL } from './trwGate'

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
const f = (status: number, body: unknown, seen?: [string, RequestInit][]) => (async (u: string, i: RequestInit) => { seen?.push([u, i]); return res(status, body) }) as unknown as typeof fetch

describe('trw password gate', () => {
  it('opens on 200 / no password, locks only on the new 401 contract', async () => {
    const seen: [string, RequestInit][] = []
    expect(await checkGate(f(200, { authenticated: true, password_required: true }, seen))).toEqual({ kind: 'open', loggedIn: true })
    expect(seen[0][0]).toBe(TRW_AUTH_ME_URL)
    expect(seen[0][1].credentials).toBe('include')
    expect(await checkGate(f(200, { authenticated: true, password_required: false }))).toEqual({ kind: 'open', loggedIn: false })
    expect(await checkGate(f(401, { authenticated: false, password_required: true }))).toEqual({ kind: 'locked' })
  })
  it('network errors still open, any 401 locks', async () => {
    expect((await checkGate(f(401, { detail: 'Přihlaste se.' }))).kind).toBe('locked') // any 401 locks
    expect((await checkGate(f(404, null))).kind).toBe('open')
    expect((await checkGate((async () => { throw new TypeError('Failed to fetch') }) as never)).kind).toBe('open')
  })
  it('login posts the password, Czech errors', async () => {
    const seen: [string, RequestInit][] = []
    expect(await loginWithPassword('x', f(200, { ok: true }, seen))).toBeNull()
    expect(seen[0][0]).toBe(TRW_AUTH_PASSWORD_URL)
    expect(seen[0][1]).toMatchObject({ method: 'POST', credentials: 'include', body: '{"password":"x"}' })
    expect(await loginWithPassword('x', f(401, { error: 'bad_password' }))).toBe('Špatné heslo.')
    expect(await loginWithPassword('x', f(429, {}))).toMatch(/Příliš mnoho pokusů/)
  })
})
