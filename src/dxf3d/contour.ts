import { outerOutline } from '../pipeline/cabOutline'
import type { P2, Seg4 } from './types'

/**
 * Exact outer boundary of a view drawn as line work.
 *
 * Segments are split at every crossing and T-junction, dangling trees (centre lines, leader
 * stubs) are pruned, and the outer face is walked from the left-most vertex always taking the
 * outermost turn. Returns a counter-clockwise ring or null if the line work does not close.
 */
export function graphOuterContour(segs: readonly Seg4[], eps: number): P2[] | null {
  if (segs.length < 3) return null
  const split = splitAll(segs, eps)
  // Snap vertices into nodes.
  const nodeOf = new Map<string, number>()
  const nodes: P2[] = []
  const key = (x: number, y: number) => `${Math.round(x / eps)},${Math.round(y / eps)}`
  const node = (x: number, y: number) => {
    const k = key(x, y)
    let id = nodeOf.get(k)
    if (id === undefined) {
      id = nodes.length
      nodes.push({ x, y })
      nodeOf.set(k, id)
    }
    return id
  }
  const adj: Set<number>[] = []
  for (const [x1, y1, x2, y2] of split) {
    const a = node(x1, y1)
    const b = node(x2, y2)
    if (a === b) continue
    while (adj.length < nodes.length) adj.push(new Set())
    adj[a].add(b)
    adj[b].add(a)
  }
  while (adj.length < nodes.length) adj.push(new Set())
  // Prune dangling trees.
  const stack: number[] = []
  for (let i = 0; i < adj.length; i++) if (adj[i].size === 1) stack.push(i)
  while (stack.length) {
    const v = stack.pop()!
    if (adj[v].size !== 1) continue
    const [w] = adj[v]
    adj[v].delete(w)
    adj[w].delete(v)
    if (adj[w].size === 1) stack.push(w)
  }
  let start = -1
  for (let i = 0; i < nodes.length; i++) {
    if (adj[i].size < 2) continue
    if (start < 0 || nodes[i].x < nodes[start].x - eps * 0.1 || (Math.abs(nodes[i].x - nodes[start].x) <= eps * 0.1 && nodes[i].y < nodes[start].y)) start = i
  }
  if (start < 0) return null
  const ang = (a: number, b: number) => Math.atan2(nodes[b].y - nodes[a].y, nodes[b].x - nodes[a].x)
  const TWO = Math.PI * 2
  const pick = (v: number, backAngle: number, from: number) => {
    let best = -1
    let bestD = -1
    for (const w of adj[v]) {
      let d = (ang(v, w) - backAngle) % TWO
      if (d < 0) d += TWO
      if (w === from || d < 1e-9) d = 0
      if (d > bestD) {
        bestD = d
        best = w
      }
    }
    return best
  }
  // Pretend we arrived heading east into the leftmost vertex (back direction points west).
  const first = pick(start, Math.PI, -1)
  if (first < 0) return null
  const ring: number[] = [start]
  let prev = start
  let cur = first
  const limit = nodes.length * 4 + 10
  for (let step = 0; step < limit; step++) {
    if (cur === start) {
      const next = pick(start, ang(start, prev), prev)
      if (next === first) break
    }
    ring.push(cur)
    const next = pick(cur, ang(cur, prev), prev)
    if (next < 0) return null
    prev = cur
    cur = next
    if (step === limit - 1) return null
  }
  let pts = ring.map((i) => nodes[i])
  pts = dropColinear(pts, eps)
  if (pts.length < 3) return null
  if (area(pts) < 0) pts.reverse()
  if (selfIntersects(pts)) return null
  return pts
}

/** True if two non-adjacent edges of the ring cross (touching at a vertex is allowed). */
export function selfIntersects(ring: readonly P2[]): boolean {
  const n = ring.length
  if (n > 5000) return false
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % n]
    const ax0 = Math.min(a.x, b.x)
    const ax1 = Math.max(a.x, b.x)
    const ay0 = Math.min(a.y, b.y)
    const ay1 = Math.max(a.y, b.y)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const c = ring[j]
      const d = ring[(j + 1) % n]
      if (Math.max(c.x, d.x) < ax0 || Math.min(c.x, d.x) > ax1 || Math.max(c.y, d.y) < ay0 || Math.min(c.y, d.y) > ay1) continue
      const d1 = cross(c, d, a)
      const d2 = cross(c, d, b)
      const d3 = cross(a, b, c)
      const d4 = cross(a, b, d)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
    }
  }
  return false
}

function cross(o: P2, p: P2, q: P2): number {
  return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x)
}

/** Raster outline for dense views (thousands of segments). Accuracy ≈ one cell. */
export function rasterOuterContour(segs: readonly Seg4[], span: number): P2[] | null {
  const lines = segs.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 }))
  // outerOutline works in millimetres with a 200 mm floor; scale small parts up and back.
  const k = span < 400 ? 400 / span : 1
  const scaled = k === 1 ? lines : lines.map((s) => ({ x1: s.x1 * k, y1: s.y1 * k, x2: s.x2 * k, y2: s.y2 * k }))
  const S = span * k
  let ring: P2[] | null = null
  // Coarser rasters close bigger gaps in the outline; stop at the first that seals.
  for (const [cellDiv, closeDiv] of [
    [900, 250],
    [600, 120],
    [350, 60],
  ]) {
    ring = outerOutline(scaled, { cell: S / cellDiv, close: S / closeDiv, open: 0 })
    if (ring) break
  }
  if (!ring) return null
  return k === 1 ? ring : ring.map((p) => ({ x: p.x / k, y: p.y / k }))
}

export function area(ring: readonly P2[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

function dropColinear(pts: P2[], eps: number): P2[] {
  const out: P2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = out.length ? out[out.length - 1] : pts[pts.length - 1]
    const b = pts[i]
    const c = pts[(i + 1) % pts.length]
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const len = Math.hypot(c.x - a.x, c.y - a.y)
    if (len > 0 && Math.abs(cross) / len < eps * 0.5) continue
    out.push(b)
  }
  return out
}

/** Split segments at mutual intersections and T-junctions using a uniform grid. */
function splitAll(segs: readonly Seg4[], eps: number): Seg4[] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of segs) {
    x0 = Math.min(x0, s[0], s[2])
    x1 = Math.max(x1, s[0], s[2])
    y0 = Math.min(y0, s[1], s[3])
    y1 = Math.max(y1, s[1], s[3])
  }
  const span = Math.max(x1 - x0, y1 - y0, eps)
  const n = Math.max(1, Math.min(256, Math.round(Math.sqrt(segs.length) * 2)))
  const cell = span / n + eps
  const grid = new Map<number, number[]>()
  segs.forEach((s, idx) => {
    const i0 = Math.floor((Math.min(s[0], s[2]) - x0 - eps) / cell)
    const i1 = Math.floor((Math.max(s[0], s[2]) - x0 + eps) / cell)
    const j0 = Math.floor((Math.min(s[1], s[3]) - y0 - eps) / cell)
    const j1 = Math.floor((Math.max(s[1], s[3]) - y0 + eps) / cell)
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = i * 100003 + j
        let list = grid.get(k)
        if (!list) grid.set(k, (list = []))
        list.push(idx)
      }
  })
  const cuts: number[][] = segs.map(() => [0, 1])
  const seen = new Set<number>()
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const i = Math.min(list[a], list[b])
        const j = Math.max(list[a], list[b])
        const pairKey = i * segs.length + j
        if (seen.has(pairKey)) continue
        seen.add(pairKey)
        intersect(segs[i], segs[j], eps, cuts[i], cuts[j])
      }
  }
  const out: Seg4[] = []
  segs.forEach((s, idx) => {
    const ts = Array.from(new Set(cuts[idx].map((t) => Math.round(t * 1e9) / 1e9))).sort((p, q) => p - q)
    for (let k = 1; k < ts.length; k++) {
      const ta = ts[k - 1]
      const tb = ts[k]
      out.push([s[0] + (s[2] - s[0]) * ta, s[1] + (s[3] - s[1]) * ta, s[0] + (s[2] - s[0]) * tb, s[1] + (s[3] - s[1]) * tb])
    }
  })
  return out
}

function intersect(p: Seg4, q: Seg4, eps: number, cp: number[], cq: number[]) {
  const rx = p[2] - p[0]
  const ry = p[3] - p[1]
  const sx = q[2] - q[0]
  const sy = q[3] - q[1]
  const lp = Math.hypot(rx, ry)
  const lq = Math.hypot(sx, sy)
  if (lp < 1e-12 || lq < 1e-12) return
  const denom = rx * sy - ry * sx
  // Endpoint-on-segment (T-junctions and collinear overlaps).
  const onSeg = (px: number, py: number, s: Seg4, len: number, dx: number, dy: number, cuts: number[]) => {
    const t = ((px - s[0]) * dx + (py - s[1]) * dy) / (len * len)
    if (t <= 1e-9 || t >= 1 - 1e-9) return
    const ex = s[0] + dx * t - px
    const ey = s[1] + dy * t - py
    if (Math.hypot(ex, ey) <= eps) cuts.push(t)
  }
  onSeg(q[0], q[1], p, lp, rx, ry, cp)
  onSeg(q[2], q[3], p, lp, rx, ry, cp)
  onSeg(p[0], p[1], q, lq, sx, sy, cq)
  onSeg(p[2], p[3], q, lq, sx, sy, cq)
  if (Math.abs(denom) < 1e-12 * lp * lq) return
  const qpx = q[0] - p[0]
  const qpy = q[1] - p[1]
  const t = (qpx * sy - qpy * sx) / denom
  const u = (qpx * ry - qpy * rx) / denom
  if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) {
    cp.push(t)
    cq.push(u)
  }
}
