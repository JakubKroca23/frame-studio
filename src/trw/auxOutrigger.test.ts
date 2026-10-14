import { describe, expect, it } from 'vitest'
import { pickAuxStab } from './AuxOutriggerModel'
describe('pickAuxStab', () => {
  it('picks by nearest extended spread', () => {
    expect(pickAuxStab(5041)).toBe('5m')
    expect(pickAuxStab(5980)).toBe('6m')
    expect(pickAuxStab(5600)).toBe('6m')
    expect(pickAuxStab(null)).toBe('5m')
  })
})
