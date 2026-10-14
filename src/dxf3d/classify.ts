import type { Island, Projection, ViewAssignment } from './types'

const ALIGN_TOL = 0.03

interface Pair {
  other: number
  err: number
  /** Other view is above (vertical) / right (horizontal) of the base view. */
  positive: boolean
}

/**
 * Find front/top/side among part islands from their alignment on the sheet:
 * the top view shares the front's width (stacked vertically), the side view shares its height
 * (side by side) and top depth equals side width. Top below front ⇒ first angle (ISO-E),
 * top above ⇒ third angle (ISO-A).
 */
export function classifyViews(islands: readonly Island[]): { candidates: ViewAssignment[]; confident: boolean } {
  const parts = islands.filter((i) => i.kind === 'part')
  const totalArea = parts.reduce((sum, i) => sum + i.width * i.height, 0) || 1
  const vertical = (a: Island): Pair[] =>
    parts
      .filter((b) => b.id !== a.id)
      .flatMap((b) => {
        const w = Math.max(a.box.x1 - a.box.x0, b.box.x1 - b.box.x0)
        const err = alignErr(a.box.x0, a.box.x1, b.box.x0, b.box.x1, w)
        const apart = b.box.y0 >= a.box.y1 || b.box.y1 <= a.box.y0
        return err !== null && apart && !blocked(a, b, 'v') ? [{ other: b.id, err, positive: b.box.y0 >= a.box.y1 }] : []
      })
  const horizontal = (a: Island): Pair[] =>
    parts
      .filter((b) => b.id !== a.id)
      .flatMap((b) => {
        const h = Math.max(a.box.y1 - a.box.y0, b.box.y1 - b.box.y0)
        const err = alignErr(a.box.y0, a.box.y1, b.box.y0, b.box.y1, h)
        const apart = b.box.x0 >= a.box.x1 || b.box.x1 <= a.box.x0
        return err !== null && apart && !blocked(a, b, 'h') ? [{ other: b.id, err, positive: b.box.x0 >= a.box.x1 }] : []
      })

  // A projected view is the nearest one: another part island sitting in between blocks the pair.
  const blocked = (a: Island, b: Island, dir: 'h' | 'v') =>
    parts.some((c) => {
      if (c.id === a.id || c.id === b.id) return false
      if (dir === 'h') {
        const lo = Math.min(a.box.x1, b.box.x1)
        const hi = Math.max(a.box.x0, b.box.x0)
        const between = c.box.x0 >= lo - 1e-9 && c.box.x1 <= hi + 1e-9
        const ov = Math.min(a.box.y1, c.box.y1) - Math.max(a.box.y0, c.box.y0)
        return between && ov > (a.box.y1 - a.box.y0) * 0.5
      }
      const lo = Math.min(a.box.y1, b.box.y1)
      const hi = Math.max(a.box.y0, b.box.y0)
      const between = c.box.y0 >= lo - 1e-9 && c.box.y1 <= hi + 1e-9
      const ov = Math.min(a.box.x1, c.box.x1) - Math.max(a.box.x0, c.box.x0)
      return between && ov > (a.box.x1 - a.box.x0) * 0.5
    })
  const out: ViewAssignment[] = []
  for (const f of parts) {
    const vs = vertical(f)
    const hs = horizontal(f)
    for (const v of vs) {
      const t = islands[v.other]
      const projection: Projection = v.positive ? 'third' : 'first'
      for (const h of hs) {
        const s = islands[h.other]
        const depthErr = Math.abs(t.height - s.width) / Math.max(t.height, s.width, 1e-9)
        const size = (f.width * f.height + t.width * t.height + s.width * s.height) / totalArea
        // Three views always beat two (a missing view becomes a box); depth mismatch costs up to 0.3.
        const score = 0.5 + 0.4 * Math.max(0, 1 - (v.err + h.err) * 10) - Math.min(0.3, depthErr * 0.6) + 0.1 * Math.min(1, size)
        // Nearest neighbours only: a view further away than a closer aligned one is a detail.
        const reasons = [
          `šířka čelní/půdorys ±${(v.err * 100).toFixed(1)} %`,
          `výška čelní/bokorys ±${(h.err * 100).toFixed(1)} %`,
          `hloubka půdorys/bokorys ±${(depthErr * 100).toFixed(1)} %`,
          projection === 'first' ? 'půdorys pod čelním pohledem ⇒ ISO-E (1. kvadrant)' : 'půdorys nad čelním pohledem ⇒ ISO-A (3. kvadrant)',
        ]
        if (depthErr > 0.05) reasons.push('hloubka půdorysu a bokorysu nesouhlasí — pohledy možná nepatří k sobě')
        out.push({ front: f.id, top: t.id, side: s.id, projection, sideRight: h.positive, score: score - gapPenalty(f, t, s), reasons })
      }
      // Two views only: front + top.
      out.push({
        front: f.id,
        top: t.id,
        side: null,
        projection,
        sideRight: true,
        score: Math.max(0, 1 - v.err * 10) * 0.4,
        reasons: ['jen čelní pohled + půdorys, bokorys dopočítán jako obdélník'],
      })
    }
    for (const h of hs) {
      out.push({
        front: f.id,
        top: null,
        side: h.other,
        projection: 'first',
        sideRight: h.positive,
        score: Math.max(0, 1 - h.err * 10) * 0.35,
        reasons: ['jen čelní pohled + bokorys, půdorys dopočítán jako obdélník'],
      })
    }
  }
  out.sort((a, b) => b.score - a.score)
  // Drop duplicates that use the same set of islands with a lower score.
  const seen = new Set<string>()
  const unique = out.filter((c) => {
    const key = [c.front, c.top, c.side].join('/')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const best = unique[0]
  const second = unique.find((c) => best && c !== best && !(c.front === best.front && (c.top === null || c.side === null)))
  const confident = !!best && best.top !== null && best.side !== null && best.score > 0.85 && (!second || best.score - second.score > 0.05)
  return { candidates: unique.slice(0, 12), confident }
}

/**
 * Alignment error of two ranges, or null when they are not aligned. Both edges within 3 % is a
 * full match; one shared edge (within 3 %) with ≥ 70 % overlap is a weaker partial match —
 * typical for real drawings where one view shows an extra part (legs, a boom) past the others.
 */
function alignErr(a0: number, a1: number, b0: number, b1: number, span: number): number | null {
  const both = (Math.abs(a0 - b0) + Math.abs(a1 - b1)) / (2 * span)
  if (both < ALIGN_TOL) return both
  const one = Math.min(Math.abs(a0 - b0), Math.abs(a1 - b1)) / span
  const overlap = (Math.min(a1, b1) - Math.max(a0, b0)) / Math.min(a1 - a0, b1 - b0)
  if (one < 0.03 && overlap > 0.7) return ALIGN_TOL + both * 0.2
  return null
}

/** Views far apart relative to their size are less likely to belong together. */
function gapPenalty(f: Island, t: Island, s: Island): number {
  const fy = Math.max(t.box.y0 - f.box.y1, f.box.y0 - t.box.y1)
  const fx = Math.max(s.box.x0 - f.box.x1, f.box.x0 - s.box.x1)
  const fh = f.box.y1 - f.box.y0
  const fw = f.box.x1 - f.box.x0
  return Math.min(0.2, (Math.max(0, fy / fh - 1.5) + Math.max(0, fx / fw - 1.5)) * 0.05)
}

/** Manual assignment from the UI. */
export function manualAssignment(front: number, top: number | null, side: number | null, islands: readonly Island[], projection?: Projection): ViewAssignment {
  const f = islands[front]
  const t = top !== null ? islands[top] : null
  const s = side !== null ? islands[side] : null
  const proj: Projection = projection ?? (t && t.box.y0 >= f.box.y1 ? 'third' : 'first')
  return {
    front,
    top,
    side,
    projection: proj,
    sideRight: s ? (s.box.x0 + s.box.x1) / 2 >= (f.box.x0 + f.box.x1) / 2 : true,
    score: 0,
    reasons: ['ruční přiřazení'],
  }
}
