import { describe, expect, it } from 'vitest'
import { labelWidthMm, layoutLeaders } from './leaderLayout'

describe('leader label layout', () => {
  it('puts labels above the highest anchor and stacks overlapping ones into tiers', () => {
    const m = layoutLeaders([
      { id: 'a', x: 2000, y: 1500, text: 'Jeřáb · 2100 kg' },
      { id: 'b', x: 2300, y: 1200, text: 'Nádrž · 250 kg' },
      { id: 'c', x: 9000, y: 1100, text: 'Nosič' },
    ])
    expect(m.get('a')!.y).toBe(2800)
    expect(m.get('b')!.tier).toBe(1)
    expect(m.get('c')!.tier).toBe(0)
  })
  it('never overlaps two labels in the same tier', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, x: i * 600, y: 1000, text: `Položka ${i} · ${i * 100} kg` }))
    const m = layoutLeaders(items)
    for (const a of items) for (const b of items) {
      if (a.id >= b.id || m.get(a.id)!.tier !== m.get(b.id)!.tier) continue
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual((labelWidthMm(a.text) + labelWidthMm(b.text)) / 2)
    }
  })
})
