import { describe, expect, it } from 'vitest'
import { loadFilters, SCENE_FILTERS } from './sceneFilters'

describe('scene filters', () => {
  it('controls and their labels are separate filters; old stored state keeps labels on', () => {
    expect(SCENE_FILTERS.map((f) => f.label)).toContain('Popisky ovládání')
    const f = loadFilters(JSON.stringify({ controls: false })) // stored before the split
    expect(f.controls).toBe(false)
    expect(f.controlLabels).toBe(true)
  })
})
