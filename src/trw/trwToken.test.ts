import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureTrwToken, getTrwToken, TRW_TOKEN_KEY, TRW_TOKEN_TTL_MS, trwAuthReason } from './trwToken'
import { StabilityLive } from './stabilityLive'
import { convertTrwFile } from './fromTrw'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m } }
let ls: ReturnType<typeof mem>
beforeEach(() => { ls = mem(); vi.stubGlobal('localStorage', ls) })
afterEach(() => vi.unstubAllGlobals())

describe('trw token', () => {
  it('captures from the hash, stores with timestamp, strips it from the URL', () => {
    const replace = vi.fn()
    expect(captureTrwToken({ hash: '#trw_token=abc%2B1', pathname: '/', search: '' }, ls, { replaceState: replace }, 1000)).toBe('abc+1')
    expect(JSON.parse(ls.getItem(TRW_TOKEN_KEY)!)).toEqual({ token: 'abc+1', ts: 1000 })
    expect(replace).toHaveBeenCalledWith(null, '', '/')
    captureTrwToken({ hash: '#novy&trw_token=t2', pathname: '/app/', search: '?bench' }, ls, { replaceState: replace }, 2000)
    expect(replace).toHaveBeenLastCalledWith(null, '', '/app/?bench#novy')
    expect(captureTrwToken({ hash: '#novy', pathname: '/', search: '' }, ls, { replaceState: replace })).toBeNull()
    expect(replace).toHaveBeenCalledTimes(2)
  })
  it('expires after 12 h', () => {
    ls.setItem(TRW_TOKEN_KEY, JSON.stringify({ token: 't', ts: 0 }))
    expect(getTrwToken(ls, TRW_TOKEN_TTL_MS - 1)).toBe('t')
    expect(getTrwToken(ls, TRW_TOKEN_TTL_MS + 1)).toBeNull()
    expect(ls.getItem(TRW_TOKEN_KEY)).toBeNull()
  })
  it('reason points to the trw button with or without a token', () => {
    expect(trwAuthReason(null)).toMatch(/^nepřihlášen v trw – otevřete frame tlačítkem „Otevřít ve frame-studio“/)
    expect(trwAuthReason('x')).toMatch(/^token trw neplatný nebo vypršel – otevřete/)
  })
  it('Bearer on from-trw and live POST, credentials kept', async () => {
    ls.setItem(TRW_TOKEN_KEY, JSON.stringify({ token: 'tok', ts: Date.now() }))
    const calls: RequestInit[] = []
    const f = (async (_u: string, init: RequestInit) => { calls.push(init); return { ok: false, status: 401, json: async () => ({}) } }) as never
    await expect(convertTrwFile(new Blob(['x']), f)).rejects.toThrow()
    const c = new StabilityLive({ WebSocket: undefined, fetch: f })
    await c.connect({ document: { a: 1 } })
    for (const i of calls) { expect(i.credentials).toBe('include'); expect((i.headers as Record<string, string>).Authorization).toBe('Bearer tok') }
    expect(calls.length).toBe(2)
    expect(c.reason).toMatch(/^token trw neplatný nebo vypršel/)
  })
  it('WS: token in the first message only; 4401 → unavailable, no retry', async () => {
    ls.setItem(TRW_TOKEN_KEY, JSON.stringify({ token: 'tok', ts: Date.now() }))
    const sent: unknown[] = []
    let made = 0
    class WS { onclose?: (e: { code: number }) => void; onopen?: () => void; onerror?: () => void; onmessage?: () => void; constructor() { made++; setTimeout(() => this.onopen?.(), 0) } close() {} send(m: string) { sent.push(JSON.parse(m)); if (sent.length === 2) setTimeout(() => this.onclose?.({ code: 4401 }), 0) } }
    const fetchSpy = vi.fn()
    const c = new StabilityLive({ WebSocket: WS as never, fetch: fetchSpy as never })
    expect(await c.connect({ document_id: 7 })).toBe('ws')
    const req = { slew_deg: 0, outreach_mm: null, load_kg: null }
    c.send(req); await new Promise((r) => setTimeout(r, 30)); c.send({ ...req, slew_deg: 5 }); await new Promise((r) => setTimeout(r, 30))
    expect(sent[0]).toMatchObject({ token: 'tok', document_id: 7 })
    expect(sent[1]).not.toHaveProperty('token')
    expect(c.mode).toBe('unavailable')
    expect(c.reason).toMatch(/^token trw neplatný/)
    expect(await c.connect({ document_id: 7 })).toBe('unavailable')
    expect(made).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
