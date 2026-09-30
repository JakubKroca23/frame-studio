import type { BBox } from '../lib/geom'
import type { ReviewElement } from '../pipeline/review'

export function toggleMember(current: readonly string[], id: string, extend: boolean): string[] {
  if (!extend) return [id]
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

export function boxesOverlap(a: BBox, b: BBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0
}

/** Elements whose side or plan box meets the window. Holes stay on click-only. */
export function idsInWindow(elements: readonly ReviewElement[], window: BBox, hideSkip: boolean): string[] {
  const hits: string[] = []
  for (const item of elements) {
    if (item.deleted || item.role === 'hole') continue
    if (hideSkip && item.kind === 'skip') continue
    const boxes = [item.side, item.top].filter((box): box is BBox => box != null)
    if (boxes.some((box) => boxesOverlap(box, window))) hits.push(item.id)
  }
  return hits
}

export function applyWindowSelection(current: readonly string[], hits: readonly string[], additive: boolean): string[] {
  if (!additive) return [...hits]
  return [...new Set([...current, ...hits])]
}
