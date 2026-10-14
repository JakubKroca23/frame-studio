import { describe, expect, it } from 'vitest'
import { classify, factorAt, mergeSectors, sectorFan } from './stabilitySectors'
import { isResult, liveLevel, StabilityLive, type LiveResponse } from './stabilityLive'
import { liveDocOf } from './trwConfig'
import type { ExtStability } from './trwExtended'

const st = (pts: [number, number][], requiredN: number | null = 1.4): ExtStability => ({
  angles: pts.map(([angleDeg, factor]) => ({ angleDeg, factor, pass: requiredN ? factor >= requiredN : null, tippingLines: [], reactions: [] })),
  pass: null, verified: false, minFactor: null, requiredN,
}) as ExtStability

describe('sector classification', () => {
  it('ok / warn / fail by utilisation n/k with the 85 % band', () => {
    expect(classify(3, 1.4)).toBe('ok')
    expect(classify(1.4 / 0.85 + 0.001, 1.4)).toBe('ok')
    expect(classify(1.6, 1.4)).toBe('warn') // u = 87.5 %
    expect(classify(1.4, 1.4)).toBe('warn') // exactly at the limit
    expect(classify(1.39, 1.4)).toBe('fail')
    expect(classify(5, 1.4, false)).toBe('fail') // trw pass flag wins
    expect(classify(null, 1.4)).toBe('unknown')
    expect(classify(2, null, true)).toBe('ok')
    expect(classify(2, null, false)).toBe('fail')
  })
})

describe('angle lookup', () => {
  const s = st([[0, 4], [90, 1], [180, 4], [270, 1]])
  it('interpolates between neighbours and wraps at 360°', () => {
    expect(factorAt(s, 45).factor).toBeCloseTo(2.5)
    expect(factorAt(s, 90).factor).toBeCloseTo(1)
    expect(factorAt(s, 315).factor).toBeCloseTo(2.5)
    expect(factorAt(s, -45).factor).toBeCloseTo(2.5)
    expect(factorAt(s, 405).factor).toBeCloseTo(2.5)
    expect(factorAt(s, 60).nearest?.angleDeg).toBe(90)
    expect(factorAt(s, 80).pass).toBe(false)
  })
  it('merges 1° samples into contiguous sectors covering 360°', () => {
    const sec = mergeSectors(s)
    const total = sec.reduce((a, x) => a + x.toDeg - x.fromDeg, 0)
    expect(total).toBe(360)
    expect(sec.some((x) => x.status === 'fail')).toBe(true)
    expect(sec.some((x) => x.status === 'warn')).toBe(true)
    const fan = sectorFan(sec, 1000, 100)
    expect(fan.positions.length).toBe(fan.colors.length)
    expect(fan.positions.length).toBe(360 * 6 * 3)
  })
})

describe('live client', () => {
  const req = { slew_deg: 10, outreach_mm: 5000, load_kg: 1000 }
  const doc = { document: { crane: { hook_kg: 1000 } } }
  it('falls back silently when neither WebSocket nor POST is available', async () => {
    const c = new StabilityLive({ WebSocket: undefined, fetch: undefined })
    expect(await c.connect(doc)).toBe('unavailable')
    expect(() => c.send(req)).not.toThrow()
  })
  it('falls back to POST when the socket fails, and stays silent on 404', async () => {
    class FailWS { onerror?: () => void; onopen?: () => void; onclose?: () => void; onmessage?: () => void; constructor() { setTimeout(() => this.onerror?.(), 0) } close() {} send() {} }
    const missing = new StabilityLive({ WebSocket: FailWS as never, fetch: (async () => ({ ok: false, json: async () => ({}) })) as never })
    expect(await missing.connect(doc)).toBe('unavailable')
    const res: LiveResponse = { factor: 1.2, pass: false, reactions: [{ id: 'L', kN: 40 }] }
    const calls: unknown[] = []
    const fetchOk = (async (_u: string, init: RequestInit) => { calls.push(init); return { ok: true, json: async () => res } }) as never
    const frames: (() => void)[] = []
    const c = new StabilityLive({ WebSocket: FailWS as never, fetch: fetchOk, raf: (cb) => frames.push(cb) })
    expect(await c.connect(doc)).toBe('http')
    expect((calls[0] as RequestInit).credentials).toBe('include')
    expect(JSON.parse((calls[0] as RequestInit).body as string).document).toEqual(doc.document) // probe carries the document
    const got: LiveResponse[] = []
    c.onResult((r) => got.push(r))
    c.send(req); c.send({ ...req, slew_deg: 11 }); c.send({ ...req, slew_deg: 12 })
    expect(frames.length).toBe(1) // throttled to one per frame
    frames.shift()!()
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.length).toBe(2)
    expect(JSON.parse((calls[1] as RequestInit).body as string).slew_deg).toBe(12)
    expect(JSON.parse((calls[1] as RequestInit).body as string).document).toBeTruthy() // POST is stateless
    expect(got[0].factor).toBe(1.2)
  })
  it('uses the WebSocket when it opens', async () => {
    const sent: string[] = []
    class OkWS { onopen?: () => void; onmessage?: (e: { data: string }) => void; onerror?: () => void; onclose?: () => void; constructor() { setTimeout(() => this.onopen?.(), 0) } send(m: string) { sent.push(m); setTimeout(() => this.onmessage?.({ data: JSON.stringify({ factor: 2, pass: true }) }), 0) } close() {} }
    const frames: (() => void)[] = []
    const c = new StabilityLive({ WebSocket: OkWS as never, fetch: undefined, raf: (cb) => frames.push(cb) })
    expect(await c.connect({ document_id: 12 })).toBe('ws')
    const got: LiveResponse[] = []
    c.onResult((r) => got.push(r))
    c.send(req); frames.shift()!()
    await new Promise((r) => setTimeout(r, 5))
    c.send({ ...req, slew_deg: 20 }); frames.shift()!()
    await new Promise((r) => setTimeout(r, 5))
    expect(sent.length).toBe(2)
    expect(JSON.parse(sent[0]).document_id).toBe(12) // first message carries the document id
    expect(JSON.parse(sent[1])).toEqual({ ...req, slew_deg: 20 }) // later ones only the inputs
    expect(got[0]).toEqual({ factor: 2, pass: true })
  })
  it('never connects without a document (no 422 probe)', async () => {
    let n = 0
    const c = new StabilityLive({ WebSocket: class { constructor() { n++ } } as never, fetch: (async () => { n++; return { ok: true } }) as never })
    expect(await c.connect(null)).toBe('unavailable')
    expect(n).toBe(0)
  })
  it('accepts null factor (cannot tip) and colours by level', () => {
    const r = { schema: 'trw/stability-live@2', factor: null, pass: true, status: 'green', level: 'ok' } as LiveResponse
    expect(isResult(r)).toBe(true)
    expect(liveLevel(r)).toBe('ok')
    expect(isResult({ schema: 'x', error: 'missing document' })).toBe(false)
    expect(liveLevel({ factor: 1.5, pass: true, status: 'orange' })).toBe('warn')
    expect(liveLevel({ factor: 1.5, pass: true, status: 'green', level: 'fail' })).toBe('fail')
  })
  it('finds the document for the live API in imports', () => {
    expect(liveDocOf({ document_id: 7 })).toEqual({ document_id: 7 })
    expect(liveDocOf({ document: { a: 1 }, meziram: {} })).toEqual({ document: { a: 1 } })
    expect(liveDocOf({ schema: 'trw/config@1' })).toBeNull()
  })
})

import { convertTrwFile } from './fromTrw'
import { liveStatusText } from './stabilityLive'
import sampleConfig from './sample-crane-142-3d.json'
describe('from-trw → live document', () => {
  it('passes the from-trw document to the live client', async () => {
    const document = { chassis: { foh: 1475 }, crane: { enabled: true, hook_kg: 2000 } }
    const fetcher = (async () => ({ ok: true, status: 200, json: async () => ({ filename: 'a.trw', config: sampleConfig, document, report: {} }) })) as never
    const r = await convertTrwFile(new Blob(['x']) as Blob & { name?: string }, fetcher)
    expect(r.liveDoc).toEqual({ document })
  })
  it('prefers a document_id from the response', async () => {
    const fetcher = (async () => ({ ok: true, status: 200, json: async () => ({ config: sampleConfig, document: { a: 1 }, document_id: 42 }) })) as never
    const r = await convertTrwFile(new Blob(['x']) as Blob & { name?: string }, fetcher)
    expect(r.liveDoc).toEqual({ document_id: 42 })
  })
})
describe('live status text', () => {
  it('explains why live is off', async () => {
    expect(liveStatusText(null).text).toContain('lokální data (chybí dokument trw)')
    const c401 = new StabilityLive({ WebSocket: undefined, fetch: (async () => ({ ok: false, status: 401, json: async () => ({}) })) as never })
    await c401.connect({ document: {} })
    expect(liveStatusText(c401).text).toBe('Živé spojení s trw: nedostupné (nepřihlášen v trw – otevřete frame tlačítkem „Otevřít ve frame-studio“ v trw) – lokální data')
    const c422 = new StabilityLive({ WebSocket: undefined, fetch: (async () => ({ ok: false, status: 422, json: async () => ({ detail: 'Dokument nemá zapnutý jeřáb.' }) })) as never })
    await c422.connect({ document: {} })
    expect(liveStatusText(c422).text).toContain('dokument nelze použít (Dokument nemá zapnutý jeřáb.)')
    const ok = new StabilityLive({ WebSocket: undefined, fetch: (async () => ({ ok: true, json: async () => ({ factor: null, pass: true }) })) as never })
    await ok.connect({ document_id: 1 })
    expect(liveStatusText(ok).text).toBe('Živé spojení s trw: připojeno (HTTP)')
  })
  it('WS close 4401 → nepřihlášen', async () => {
    class WS4401 { onclose?: (e: { code: number }) => void; onopen?: () => void; onerror?: () => void; onmessage?: () => void; constructor() { setTimeout(() => { this.onopen?.(); setTimeout(() => this.onclose?.({ code: 4401 }), 0) }, 0) } close() {} send() {} }
    const c = new StabilityLive({ WebSocket: WS4401 as never, fetch: undefined })
    await c.connect({ document: {} })
    await new Promise((r) => setTimeout(r, 5))
    expect(c.mode).toBe('unavailable')
    expect(c.reason).toContain('nepřihlášen v trw – otevřete frame tlačítkem „Otevřít ve frame-studio“')
  })
})
