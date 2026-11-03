import { describe, expect, it } from 'vitest'
import { bodyLabel } from './bodyGeometry'
import { bodydataTypeCode, bodyTypeFromTrwCode, isSkippedBodyType } from './trwFormatCodes'
import { normalizeBodyType, parseConfigBody } from './trwExtended'

describe('trwFormatCodes: BODYDATA TYPE token', () => {
  it('splits first word as code and remainder as catalog name', () => {
    expect(bodydataTypeCode('la AllDoor')).toEqual({ code: 'la', catalogName: 'AllDoor' })
    expect(bodydataTypeCode('spec CustomBox 2')).toEqual({ code: 'spec', catalogName: 'CustomBox 2' })
    expect(bodydataTypeCode('hookframe')).toEqual({ code: 'hookframe', catalogName: null })
    expect(bodydataTypeCode('')).toEqual({ code: '', catalogName: null })
  })

  it('maps known codes to BodyType; empty skips body', () => {
    expect(bodyTypeFromTrwCode('la')).toBe('cabinet')
    expect(bodyTypeFromTrwCode('la AllDoor')).toBe('cabinet')
    expect(bodyTypeFromTrwCode('hookframe')).toBe('hooklift')
    expect(bodyTypeFromTrwCode('con')).toBe('container')
    expect(bodyTypeFromTrwCode('spec MySpec')).toBe('spec')
    expect(bodyTypeFromTrwCode('pkippi')).toBe('other')
    expect(bodyTypeFromTrwCode('empty')).toBeNull()
    expect(isSkippedBodyType('empty')).toBe(true)
    expect(isSkippedBodyType('la')).toBe(false)
  })

  it('pkippi is not treated as tipper by name heuristics', () => {
    expect(normalizeBodyType('pkippi')).toBe('other')
    expect(normalizeBodyType('pkippi dump')).toBe('other')
  })

  it('parseConfigBody skips empty and warns on pkippi', () => {
    expect(parseConfigBody({ type: 'empty', x_from_mm: 0, x_to_mm: 4000 }, 0)).toBeUndefined()
    const w: string[] = []
    const b = parseConfigBody({ type: 'pkippi', x_from_mm: 1000, x_to_mm: 5000 }, 0, w)!
    expect(b.type).toBe('other')
    expect(b.typeCode).toBe('pkippi')
    expect(w.some((s) => s.includes('pkippi') && s.includes('ne sklápěč'))).toBe(true)
  })

  it('bodyLabel shows catalog-aware Czech labels', () => {
    expect(bodyLabel('cabinet', 'la', 'la', 'AllDoor')).toBe('Nástavba (la)')
    expect(bodyLabel('spec', 'spec Foo', 'spec', 'Foo')).toBe('Nástavba (spec · Foo)')
    expect(bodyLabel('container', 'con', 'con', null)).toBe('Kontejner (con)')
    expect(bodyLabel('hooklift', 'hookframe', 'hookframe', null)).toBe('hákový nosič (hookframe)')
  })
})
