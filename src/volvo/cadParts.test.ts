import { describe, expect, it } from 'vitest'
import { fitRear } from './cadParts'

describe('Volvo rear CAD fit', () => {
  it('puts the CAD tandem on the last two axles and the rear end on the frame end', () => {
    const f = fitRear([{ position: 0 }, { position: 4200 }, { position: 5570 }], 5570 + 1470 + 0)
    expect(f.ok).toBe(true)
    expect(8.64 * 1000 + f.tx).toBe(4200)
    expect(11.48 * 1000 + f.tx + f.rearShift).toBeCloseTo(7040, 6)
    expect(f.replaces).toEqual([1, 2])
    expect(f.notes.some((n) => n.includes('Rozvor tandemu'))).toBe(false)
  })
  it('reports a different tandem spacing and refuses single rear axles', () => {
    expect(fitRear([{ position: 0 }, { position: 4000 }, { position: 5300 }], 7000).notes[0]).toContain('1300')
    expect(fitRear([{ position: 0 }, { position: 4500 }], 6000).ok).toBe(false)
  })
})
