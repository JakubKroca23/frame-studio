import { describe, expect, it } from 'vitest'
import sample from './sample-export.json'
import cs from './sample-cs-sim-real.json'
import { TrwAuthError } from './trwConfig'
import { classifyFile, convertTrwFile, reportLines, unwrapConfig } from './fromTrw'

const file = new File(['TRW'], 'projekt.trw')
const mock = (status: number, body: unknown, seen?: { url?: string; init?: RequestInit }) =>
  (async (url: string, init: RequestInit) => {
    if (seen) Object.assign(seen, { url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch

describe('convertTrwFile', () => {
  it('maps a bare config with multipart upload and credentials', async () => {
    const seen: { url?: string; init?: RequestInit } = {}
    const r = await convertTrwFile(file, mock(200, sample, seen))
    expect(seen.url).toBe('https://trw.propoj.app/api/config/from-trw')
    expect(seen.init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect((seen.init?.body as FormData).get('file')).toBeInstanceOf(Blob)
    expect(r.preset.config.gvw).toBe(26000)
    expect(r.report).toEqual([])
  })
  it('unwraps config + report', async () => {
    const r = await convertTrwFile(file, mock(200, { config: sample, report: { taken: ['axle_x_mm', 'rail_profile'], missing: ['frame_width_mm'] } }))
    expect(r.preset.config.axles).toHaveLength(3)
    expect(r.report).toEqual(['převzato: axle_x_mm', 'převzato: rail_profile', 'nepřevzato: frame_width_mm'])
    expect(r.warnings[0]).toBe('TrailerWIN: převzato: axle_x_mm')
    const d = await convertTrwFile(file, mock(200, { data: sample, missing: [{ field: 'crane', reason: 'není v projektu' }] }))
    expect(d.report).toEqual(['nepřevzato: crane: není v projektu'])
  })
  it('401 → auth error, 413/400 → Czech message with detail', async () => {
    await expect(convertTrwFile(file, mock(401, { error: 'unauthorized' }))).rejects.toBeInstanceOf(TrwAuthError)
    await expect(convertTrwFile(file, mock(413, { error: 'too_large', detail: 'max 5 MB' }))).rejects.toThrow(/příliš velký.*max 5 MB/)
    await expect(convertTrwFile(file, mock(400, { error: 'bad_trw' }))).rejects.toThrow(/nepřijal/)
    await expect(convertTrwFile(file, mock(404, 'Not Found'))).rejects.toThrow(/neexistuje/)
  })
})

describe('classifyFile / helpers', () => {
  it('routes by extension and content', () => {
    expect(classifyFile('a.TRW', null)).toBe('trw-project')
    expect(classifyFile('a.json', JSON.stringify(sample))).toBe('trw-config')
    expect(classifyFile('a.json', JSON.stringify({ config: sample }))).toBe('trw-config')
    expect(classifyFile('a.json', JSON.stringify(cs))).toBe('cs-sim')
    expect(classifyFile('a.json', JSON.stringify({ format: 'cs-sim/trw-export@1' }))).toBe('cs-sim')
    expect(classifyFile('a.json', '{')).toBe('unknown')
    expect(classifyFile('a.dxf', '0\nSECTION')).toBe('unknown')
  })
  it('unwrap and report tolerate odd shapes', () => {
    expect(unwrapConfig(sample)).toBe(sample)
    expect(unwrapConfig({ x: 1 })).toEqual({ x: 1 })
    expect(reportLines({ fields: { gvw: true, track: false } })).toEqual(['gvw: převzato', 'track: nepřevzato'])
    expect(reportLines(null)).toEqual([])
  })
})

import { reportLines as rl2 } from './fromTrw'
import { test as t2, expect as e2 } from 'vitest'
t2('reads trw from-trw report shape', () => {
  const lines = rl2({ config: {}, report: { mapped: [{ target: 'a', label: 'Rozvor', value: 3900, status: 'ověřeno' }, { target: 'b', label: 'Převis', value: 1200, status: 'předpoklad' }], unmapped: [{ target: 'c', label: 'Hydraulika', reason: 'neznámý blok' }], notes: ['test'] } })
  e2(lines).toEqual(['nepřevzato: Hydraulika (neznámý blok)', 'předpoklad: Převis = 1200', 'poznámka: test'])
})
