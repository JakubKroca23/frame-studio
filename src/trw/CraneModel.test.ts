import { describe, expect, it } from 'vitest'
import { craneModelFor } from './CraneModel'

describe('craneModelFor', () => {
  it('matches HIAB X-HiPro 142 spellings', () => {
    for (const n of ['HIAB X-HiPro 142 E-4', 'eX 142E4', 'Hiab XHiPro 142', 'HIAB 142 E-4']) expect(craneModelFor(n)?.file).toBe('hiab-x-hipro-142e4.glb')
    expect(craneModelFor('HIAB X-HiPro 858 EP-4')).toBeNull()
    expect(craneModelFor('HIAB X-HiPro 302 EP-4')?.def.key).toBe('ex302-ep')
    expect(craneModelFor(null)).toBeNull()
  })
})
