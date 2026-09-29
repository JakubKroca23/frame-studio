import { describe, expect, it } from 'vitest'
import { reviewCommand } from './reviewKeys'

describe('review shortcuts', () => {
  it('deletes with Delete or Backspace and undoes with Ctrl+Z or Cmd+Z', () => {
    expect(reviewCommand({ key: 'Delete', ctrlKey: false, metaKey: false, altKey: false })).toBe('delete')
    expect(reviewCommand({ key: 'Backspace', ctrlKey: false, metaKey: false, altKey: false })).toBe('delete')
    expect(reviewCommand({ key: 'z', ctrlKey: true, metaKey: false, altKey: false })).toBe('undo')
    expect(reviewCommand({ key: 'Z', ctrlKey: false, metaKey: true, altKey: false })).toBe('undo')
    expect(reviewCommand({ key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true })).toBeNull()
    expect(reviewCommand({ key: 'f', ctrlKey: false, metaKey: false, altKey: false })).toBe('fit')
    expect(reviewCommand({ key: 'Home', ctrlKey: false, metaKey: false, altKey: false })).toBe('fit')
    expect(reviewCommand({ key: 'f', ctrlKey: true, metaKey: false, altKey: false })).toBeNull()
  })
})