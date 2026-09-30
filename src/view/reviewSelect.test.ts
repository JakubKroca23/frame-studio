import { describe, expect, it } from 'vitest'
import type { ReviewElement } from '../pipeline/review'
import { applyWindowSelection, idsInWindow, toggleMember } from './reviewSelect'

function item(id: string, x0: number, y0: number, x1: number, y1: number, role: ReviewElement['role'] = 'equipment'): ReviewElement {
  return {
    id,
    role,
    title: id,
    confidence: 0.5,
    source: 'estimated',
    evidence: '',
    side: { x0, y0, x1, y1 },
    top: null,
    fields: [],
  }
}

describe('review selection', () => {
  it('replaces the selection, or toggles with Ctrl or Shift', () => {
    expect(toggleMember(['a'], 'b', false)).toEqual(['b'])
    expect(toggleMember(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleMember(['a', 'b'], 'a', true)).toEqual(['b'])
  })

  it('collects elements inside a window and can add them to the current selection', () => {
    const elements = [item('cab', 0, 0, 100, 80), item('tank', 200, 0, 280, 40), item('hole', 10, 10, 20, 20, 'hole')]
    const hits = idsInWindow(elements, { x0: -10, y0: -10, x1: 120, y1: 100 }, true)
    expect(hits).toEqual(['cab'])
    expect(applyWindowSelection(['tank'], hits, false)).toEqual(['cab'])
    expect(applyWindowSelection(['tank'], hits, true)).toEqual(['tank', 'cab'])
  })
})
