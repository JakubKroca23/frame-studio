export type ReviewCommand = 'fit' | 'delete' | 'undo'

export function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

/** Keyboard policy for the review canvas. Text fields keep their own keys. */
export function reviewCommand(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey?: boolean
}): ReviewCommand | null {
  const key = event.key
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (key === 'z' || key === 'Z')) return 'undo'
  if (event.ctrlKey || event.metaKey || event.altKey) return null
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'f' || key === 'F' || key === 'Home') return 'fit'
  return null
}
