import { describe, expect, it } from 'vitest'
import sample from './sample-export.json'
import request from './sample-request.json'
import { TrwAuthError, fetchTrwExport, mapTrwExport } from './trwConfig'
import { configToModel } from '../presets/configModel'

describe('trw/config@1 mapper', () => {
  const r = mapTrwExport(sample)
  const c = r.preset.config

  it('maps axles relative to the first axle', () => {
    expect(c.axles.map((a) => a.position)).toEqual([0, 4200, 5550])
    expect(c.axles.map((a) => a.maxLoad)).toEqual([7500, 11500, 7500])
    expect(c.axles[0].steered).toBe(true)
    expect(c.axles.every((a) => a.tyre === '315/70R22.5')).toBe(true)
  })

  it('maps overhangs, height, profile, gvw and steel', () => {
    expect(c.frontOverhang).toBe(1475)
    expect(c.rearOverhang).toBe(2150)
    expect(c.axles[2].position + c.frontOverhang + c.rearOverhang).toBe(9175)
    expect(c.frame.topHeight).toBe(938)
    expect([c.frame.sectionHeight, c.frame.flange, c.frame.thickness]).toEqual([220, 80, 6])
    expect(c.gvw).toBe(26000)
    expect(c.make).toBe('man')
    expect(c.kind).toBe('rigid')
    expect(r.steel?.re_MPa).toBe(420)
    expect(r.subframe?.profile?.H_mm).toBe(160)
    expect(c.frame.frontEnd).toBeLessThanOrEqual(c.frontOverhang)
  })

  it('marks null fields as estimated and measured ones not', () => {
    for (const p of ['frame.widthRear', 'frame.widthFront', 'axles.0.track', 'axles.1.tyre', 'frame.frontEnd', 'cab.length']) expect(r.preset.approx).toContain(p)
    for (const p of ['frame.topHeight', 'frame.sectionHeight', 'axles.1.position', 'axles.1.maxLoad', 'rearOverhang', 'gvw']) expect(r.preset.approx).not.toContain(p)
    expect(r.basePresetId.startsWith('man-')).toBe(true)
    expect(r.warnings.some((w) => w.includes('Šířka rámu'))).toBe(true)
  })

  it('converts crane and outrigger positions', () => {
    expect(r.markers.crane?.x).toBe(4104 - 1475)
    expect(r.markers.outriggers).toEqual([
      { x: 3675 - 1475, side: 'left', spread: 5788 },
      { x: 3845 - 1475, side: 'right', spread: 5788 },
    ])
  })

  it('builds a model', () => {
    expect(configToModel(c).axles).toHaveLength(3)
  })

  it('rejects other documents', () => {
    expect(() => mapTrwExport({ schema: 'x' })).toThrow(/trw/)
    expect(() => mapTrwExport(request)).toThrow()
  })

  it('fetches with credentials and reports 401', async () => {
    let init: RequestInit | undefined
    const ok = (async (_u: string, i: RequestInit) => {
      init = i
      return new Response(JSON.stringify(sample), { status: 200 })
    }) as unknown as typeof fetch
    expect((await fetchTrwExport(request, ok)).preset.config.gvw).toBe(26000)
    expect(init?.credentials).toBe('include')
    expect(init?.method).toBe('POST')
    const denied = (async () => new Response('', { status: 401 })) as unknown as typeof fetch
    await expect(fetchTrwExport(request, denied)).rejects.toBeInstanceOf(TrwAuthError)
  })
})
