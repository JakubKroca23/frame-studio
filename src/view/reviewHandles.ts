import type { BBox } from '../lib/geom'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type BoxSide = 'side' | 'top'

export const HANDLE_IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function handleAnchor(box: BBox, id: HandleId): { x: number; y: number } {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  return {
    x: id.includes('e') ? box.x1 : id.includes('w') ? box.x0 : cx,
    y: id.includes('n') ? box.y1 : id.includes('s') ? box.y0 : cy,
  }
}

/** The pointer is on the rectangle border, away from a corner handle. */
export function hitBorder(
  px: number,
  py: number,
  box: BBox,
  map: (x: number, y: number) => readonly [number, number],
  radius = 12,
): HandleId | null {
  const nw = map(box.x0, box.y1)
  const ne = map(box.x1, box.y1)
  const se = map(box.x1, box.y0)
  const sw = map(box.x0, box.y0)
  const edges: [HandleId, readonly [number, number], readonly [number, number]][] = [
    ['n', nw, ne],
    ['e', ne, se],
    ['s', se, sw],
    ['w', sw, nw],
  ]
  let best: { id: HandleId; d: number } | null = null
  for (const [id, a, b] of edges) {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0
    const d = Math.hypot(px - (a[0] + dx * t), py - (a[1] + dy * t))
    if (d <= radius && (!best || d < best.d)) best = { id, d }
  }
  return best?.id ?? null
}

/** Screen-space hit. `map` is world millimetres to canvas pixels. */
export function hitHandle(
  px: number,
  py: number,
  box: BBox,
  map: (x: number, y: number) => readonly [number, number],
  radius = 8,
): HandleId | null {
  let best: { id: HandleId; d: number } | null = null
  for (const id of HANDLE_IDS) {
    const anchor = handleAnchor(box, id)
    const [sx, sy] = map(anchor.x, anchor.y)
    const d = Math.hypot(sx - px, sy - py)
    if (d <= radius && (!best || d < best.d)) best = { id, d }
  }
  return best?.id ?? null
}

/** The opposite corner stays put. The box cannot flip inside out. */
export function resizeBox(start: BBox, handle: HandleId, x: number, y: number, min = 20): BBox {
  let x0 = start.x0
  let y0 = start.y0
  let x1 = start.x1
  let y1 = start.y1
  if (handle.includes('e')) x1 = Math.max(start.x0 + min, x)
  if (handle.includes('w')) x0 = Math.min(start.x1 - min, x)
  if (handle.includes('n')) y1 = Math.max(start.y0 + min, y)
  if (handle.includes('s')) y0 = Math.min(start.y1 - min, y)
  return { x0, y0, x1, y1 }
}
