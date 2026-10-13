import { describe, expect, it } from 'vitest'
import real from './sample-cs-sim-real.json'
import trwSample from './sample-export.json'
import { parseCsSimResult } from './csSimResult'
import { TrwAuthError } from './trwConfig'
import { csSimLink, csSimMessageData, fetchTrwUrl, parseLinkParams, stripLinkParams, trwFromCsSim, validateTrwUrl } from './links'

const U = 'https://trw.propoj.app/api/config/export?id=97330'

describe('link params', () => {
  it('validates trw origin exactly', () => {
    expect(validateTrwUrl(U)).toEqual({ url: U })
    for (const bad of ['http://trw.propoj.app/x', 'https://trw.propoj.app.evil.com/x', 'https://evil.com/?https://trw.propoj.app', 'https://x@trw.propoj.app/', 'https://trw.propoj.app:8443/', 'javascript:alert(1)', '/api/x', 'nic'])
      expect('error' in validateTrwUrl(bad), bad).toBe(true)
  })
  it('parses ?trw= and ?from=cssim', () => {
    expect(parseLinkParams(`?trw=${encodeURIComponent(U)}`)).toEqual({ kind: 'trw', url: U })
    expect(parseLinkParams('?trw=https://evil.com/a')?.kind).toBe('invalid')
    expect(parseLinkParams('?from=cssim')).toEqual({ kind: 'cssim' })
    expect(parseLinkParams('?x=1')).toBeNull()
    expect(stripLinkParams(`https://frame.propoj.app/?a=1&trw=${encodeURIComponent(U)}`)).toBe('/?a=1#novy')
    expect(stripLinkParams('https://frame.propoj.app/?from=cssim')).toBe('/#novy')
  })
  it('builds CS Sim link', () => {
    expect(csSimLink(null)).toBe('https://sim.propoj.app/')
    expect(csSimLink(U)).toBe(`https://sim.propoj.app/?trw=${encodeURIComponent(U)}`)
  })
})

describe('CS Sim messages', () => {
  const data = { type: 'cs-sim/trw-export@1', data: real }
  it('accepts only sim origin and matching type', () => {
    expect(csSimMessageData({ origin: 'https://sim.propoj.app', data })).toBe(real)
    expect(csSimMessageData({ origin: 'https://evil.com', data })).toBeNull()
    expect(csSimMessageData({ origin: 'https://sim.propoj.app', data: { type: 'ready' } })).toBeNull()
    expect(csSimMessageData({ origin: 'https://sim.propoj.app', data: 'x' })).toBeNull()
    expect(csSimMessageData({ origin: 'https://sim.propoj.app', data: { type: 'cs-sim/trw-export@1' } })).toBeNull()
  })
  it('builds a chassis from CS Sim inputs', () => {
    const r = trwFromCsSim(parseCsSimResult(real), real)
    expect(r.preset.config.axles.map((a) => a.position)).toEqual([0, 4200, 5550])
    expect(r.preset.config.frame.sectionHeight).toBe(220)
    expect(r.preset.config.make).toBe('man')
    expect(r.warnings[0]).toContain('CS Sim')
  })
})

describe('fetchTrwUrl', () => {
  const resp = (status: number, body = '') => (async () => new Response(body, { status })) as unknown as typeof fetch
  it('GETs with credentials and maps', async () => {
    let init: RequestInit | undefined
    const f = (async (_u: string, i: RequestInit) => {
      init = i
      return new Response(JSON.stringify(trwSample))
    }) as unknown as typeof fetch
    expect((await fetchTrwUrl(U, f)).preset.config.gvw).toBe(26000)
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
  })
  it('handles 401, 405 and foreign URLs', async () => {
    await expect(fetchTrwUrl(U, resp(401))).rejects.toBeInstanceOf(TrwAuthError)
    await expect(fetchTrwUrl(U, resp(405))).rejects.toThrow(/POST/)
    await expect(fetchTrwUrl('https://evil.com/', resp(200))).rejects.toThrow(/povolena/)
  })
})
