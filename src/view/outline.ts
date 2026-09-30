import type { BBox, Pt } from '../lib/geom'

/** One drawable entity the review canvas can pick. */
export interface DrawEntity {
  id: number
  kind: 'line' | 'circle'
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  r: number
}

export interface EntityIndex {
  entities: DrawEntity[]
  cell: number
  grid: Map<string, number[]>
}

export interface SnapHit {
  x: number
  y: number
  kind: 'endpoint' | 'intersection' | 'free'
}

interface ChainResult {
  ids: number[]
  points: Pt[]
  closed: boolean
}

const JOIN = 4

export function entitiesFromPreview(preview: { segments: Record<string, number[]>; circles: Record<string, number[]> }): DrawEntity[] {
  const out: DrawEntity[] = []
  let id = 0
  const roles = preview.segments.sheet?.length ? ['sheet', 'frame', 'axle'] : ['chassis', 'frame', 'cab', 'component', 'axle', 'front']
  for (const role of roles) {
    const arr = preview.segments[role]
    if (!arr) continue
    for (let i = 0; i < arr.length; i += 4) {
      const x1 = arr[i]
      const y1 = arr[i + 1]
      const x2 = arr[i + 2]
      const y2 = arr[i + 3]
      if (Math.hypot(x2 - x1, y2 - y1) < 0.4) continue
      out.push({ id: id++, kind: 'line', x1, y1, x2, y2, cx: 0, cy: 0, r: 0 })
    }
  }
  for (const arr of Object.values(preview.circles)) {
    for (let i = 0; i < arr.length; i += 3) {
      const cx = arr[i]
      const cy = arr[i + 1]
      const r = arr[i + 2]
      if (!(r > 0)) continue
      out.push({ id: id++, kind: 'circle', x1: cx - r, y1: cy, x2: cx + r, y2: cy, cx, cy, r })
    }
  }
  return out
}

export function buildEntityIndex(entities: DrawEntity[], cell = 500): EntityIndex {
  const grid = new Map<string, number[]>()
  for (const entity of entities) {
    const x0 = Math.min(entity.x1, entity.x2)
    const y0 = Math.min(entity.y1, entity.y2)
    const x1 = Math.max(entity.x1, entity.x2)
    const y1 = Math.max(entity.y1, entity.y2)
    const i0 = Math.floor(x0 / cell)
    const j0 = Math.floor(y0 / cell)
    const i1 = Math.floor(x1 / cell)
    const j1 = Math.floor(y1 / cell)
    let n = 0
    for (let i = i0; i <= i1 && n < 48; i++) {
      for (let j = j0; j <= j1 && n < 48; j++) {
        const key = `${i}:${j}`
        const bucket = grid.get(key)
        if (bucket) bucket.push(entity.id)
        else grid.set(key, [entity.id])
        n++
      }
    }
  }
  return { entities, cell, grid }
}

export function signedArea(points: readonly Pt[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    area += p.x * q.y - q.x * p.y
  }
  return area / 2
}

/** Drop duplicates and the repeated closing vertex. Counter-clockwise. */
export function normalizeRing(points: readonly Pt[]): Pt[] {
  const out: Pt[] = []
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const prev = out[out.length - 1]
    if (prev && Math.hypot(point.x - prev.x, point.y - prev.y) < 0.4) continue
    out.push({ x: point.x, y: point.y })
  }
  if (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.4) out.pop()
  if (signedArea(out) < 0) out.reverse()
  return out
}

export function polygonBounds(points: readonly Pt[]): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const point of points) {
    if (point.x < x0) x0 = point.x
    if (point.y < y0) y0 = point.y
    if (point.x > x1) x1 = point.x
    if (point.y > y1) y1 = point.y
  }
  return { x0, y0, x1, y1 }
}

export function scalePoints(points: readonly Pt[], from: BBox, to: BBox): Pt[] {
  const sx = from.x1 - from.x0 || 1
  const sy = from.y1 - from.y0 || 1
  return points.map((point) => ({
    x: to.x0 + ((point.x - from.x0) / sx) * (to.x1 - to.x0),
    y: to.y0 + ((point.y - from.y0) / sy) * (to.y1 - to.y0),
  }))
}

export function pointInPolygon(x: number, y: number, points: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i]
    const pj = points[j]
    const hit = pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y || 1e-9) + pi.x
    if (hit) inside = !inside
  }
  return inside
}

export function moveVertex(points: readonly Pt[], index: number, at: Pt): Pt[] {
  return points.map((point, i) => (i === index ? { x: at.x, y: at.y } : { x: point.x, y: point.y }))
}

export function removeVertex(points: readonly Pt[], index: number): Pt[] | null {
  if (points.length <= 3 || index < 0 || index >= points.length) return null
  return points.filter((_, i) => i !== index).map((point) => ({ x: point.x, y: point.y }))
}

export function insertVertex(points: readonly Pt[], edge: number, at: Pt): Pt[] {
  const next = points.map((point) => ({ x: point.x, y: point.y }))
  const index = Math.max(0, Math.min(points.length - 1, edge))
  next.splice(index + 1, 0, { x: at.x, y: at.y })
  return next
}

export function dropLastPoint(points: readonly Pt[]): Pt[] {
  return points.slice(0, -1).map((point) => ({ x: point.x, y: point.y }))
}

/** Close when the click lands on the first vertex and the ring already has a shape. */
export function shouldClose(points: readonly Pt[], x: number, y: number, tol: number): boolean {
  if (points.length < 3) return false
  const first = points[0]
  return Math.hypot(first.x - x, first.y - y) <= tol
}

export function hitVertexScreen(
  px: number,
  py: number,
  points: readonly Pt[],
  map: (x: number, y: number) => readonly [number, number],
  radius = 8,
): number | null {
  let best = -1
  let bestD = radius
  points.forEach((point, index) => {
    const [sx, sy] = map(point.x, point.y)
    const distance = Math.hypot(sx - px, sy - py)
    if (distance <= bestD) {
      best = index
      bestD = distance
    }
  })
  return best >= 0 ? best : null
}

export function hitEdgeScreen(
  px: number,
  py: number,
  points: readonly Pt[],
  map: (x: number, y: number) => readonly [number, number],
  radius = 8,
): { edge: number; x: number; y: number } | null {
  if (hitVertexScreen(px, py, points, map, radius) != null) return null
  let best: { edge: number; x: number; y: number; d: number } | null = null
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const [ax, ay] = map(a.x, a.y)
    const [bx, by] = map(b.x, b.y)
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    const sx = ax + dx * t
    const sy = ay + dy * t
    const distance = Math.hypot(sx - px, sy - py)
    if (distance > radius) continue
    if (!best || distance < best.d) best = { edge: i, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: distance }
  }
  return best ? { edge: best.edge, x: best.x, y: best.y } : null
}

function nearEntities(index: EntityIndex, x: number, y: number, reach: number): DrawEntity[] {
  const cell = index.cell
  const i0 = Math.floor((x - reach) / cell)
  const i1 = Math.floor((x + reach) / cell)
  const j0 = Math.floor((y - reach) / cell)
  const j1 = Math.floor((y + reach) / cell)
  const seen = new Set<number>()
  const out: DrawEntity[] = []
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const bucket = index.grid.get(`${i}:${j}`)
      if (!bucket) continue
      for (const id of bucket) {
        if (seen.has(id)) continue
        seen.add(id)
        const entity = index.entities[id]
        if (entity) out.push(entity)
        if (out.length > 160) return out
      }
    }
  }
  return out
}

function distToSegment(x: number, y: number, entity: DrawEntity): number {
  const dx = entity.x2 - entity.x1
  const dy = entity.y2 - entity.y1
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((x - entity.x1) * dx + (y - entity.y1) * dy) / len2)) : 0
  return Math.hypot(x - (entity.x1 + dx * t), y - (entity.y1 + dy * t))
}

export function hitEntity(index: EntityIndex, x: number, y: number, tol: number): DrawEntity | null {
  let best: DrawEntity | null = null
  let bestD = tol
  for (const entity of nearEntities(index, x, y, Math.max(tol, index.cell))) {
    const distance = entity.kind === 'circle' ? Math.abs(Math.hypot(x - entity.cx, y - entity.cy) - entity.r) : distToSegment(x, y, entity)
    if (distance <= bestD) {
      best = entity
      bestD = distance
    }
  }
  return best
}

function crossing(a: DrawEntity, b: DrawEntity): Pt | null {
  const den = (a.x1 - a.x2) * (b.y1 - b.y2) - (a.y1 - a.y2) * (b.x1 - b.x2)
  if (Math.abs(den) < 1e-8) return null
  const t = ((a.x1 - b.x1) * (b.y1 - b.y2) - (a.y1 - b.y1) * (b.x1 - b.x2)) / den
  const u = ((a.x1 - b.x1) * (a.y1 - a.y2) - (a.y1 - b.y1) * (a.x1 - a.x2)) / den
  if (t < -1e-4 || t > 1 + 1e-4 || u < -1e-4 || u > 1 + 1e-4) return null
  return { x: a.x1 + t * (a.x2 - a.x1), y: a.y1 + t * (a.y2 - a.y1) }
}

export function snapPoint(index: EntityIndex, x: number, y: number, tol: number): SnapHit {
  const nearby = nearEntities(index, x, y, Math.max(tol, 1)).filter((entity) => entity.kind === 'line')
  let best: SnapHit | null = null
  let bestD = tol
  const take = (px: number, py: number, kind: SnapHit['kind']) => {
    const distance = Math.hypot(px - x, py - y)
    if (distance < bestD - 1e-6) {
      best = { x: px, y: py, kind }
      bestD = distance
    }
  }
  for (const entity of nearby) {
    take(entity.x1, entity.y1, 'endpoint')
    take(entity.x2, entity.y2, 'endpoint')
  }
  const limit = nearby.slice(0, 48)
  for (let i = 0; i < limit.length; i++) {
    for (let j = i + 1; j < limit.length; j++) {
      const hit = crossing(limit[i], limit[j])
      if (hit) take(hit.x, hit.y, 'intersection')
    }
  }
  return best ?? { x, y, kind: 'free' }
}

function sampleCircle(entity: DrawEntity, count = 24): Pt[] {
  const points: Pt[] = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    points.push({ x: entity.cx + Math.cos(angle) * entity.r, y: entity.cy + Math.sin(angle) * entity.r })
  }
  return points
}

interface Link {
  id: number
  at: Pt
  other: Pt
}

function buildAdj(entities: readonly DrawEntity[], allow: ReadonlySet<number> | null, tol: number) {
  const adj = new Map<string, Link[]>()
  const add = (at: Pt, link: Link) => {
    const key = `${Math.round(at.x / tol)}:${Math.round(at.y / tol)}`
    const bucket = adj.get(key)
    if (bucket) bucket.push(link)
    else adj.set(key, [link])
  }
  for (const entity of entities) {
    if (entity.kind !== 'line') continue
    if (allow && !allow.has(entity.id)) continue
    const p1 = { x: entity.x1, y: entity.y1 }
    const p2 = { x: entity.x2, y: entity.y2 }
    add(p1, { id: entity.id, at: p1, other: p2 })
    add(p2, { id: entity.id, at: p2, other: p1 })
  }
  return adj
}

function linksAt(adj: Map<string, Link[]>, point: Pt, tol: number): Link[] {
  const ix = Math.round(point.x / tol)
  const iy = Math.round(point.y / tol)
  const out: Link[] = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = adj.get(`${ix + dx}:${iy + dy}`)
      if (!bucket) continue
      for (const link of bucket) {
        if (Math.hypot(link.at.x - point.x, link.at.y - point.y) <= tol) out.push(link)
      }
    }
  }
  return out
}

function turn(incoming: Pt, from: Pt, to: Pt): number {
  const vx = from.x - incoming.x
  const vy = from.y - incoming.y
  const wx = to.x - from.x
  const wy = to.y - from.y
  return Math.atan2(vx * wy - vy * wx, vx * wx + vy * wy)
}

/** Walk entities that share endpoints, preferring the left-hand turn at a branch. */
export function chainContour(entities: readonly DrawEntity[], startId: number, tol = JOIN, allow?: ReadonlySet<number>): ChainResult | null {
  const start = entities.find((entity) => entity.id === startId)
  if (!start) return null
  if (start.kind === 'circle') return { ids: [start.id], points: sampleCircle(start), closed: true }
  const adj = buildAdj(entities, allow ?? null, tol)
  const used = new Set<number>([start.id])
  const walk = (from: Pt, incoming: Pt): { points: Pt[]; closed: boolean } => {
    const points: Pt[] = []
    let current = from
    let prev = incoming
    let closed = false
    for (let guard = 0; guard < entities.length + 2; guard++) {
      const options = linksAt(adj, current, tol).filter((link) => !used.has(link.id))
      if (!options.length) break
      options.sort((a, b) => turn(prev, current, a.other) - turn(prev, current, b.other))
      const next = options[options.length - 1]
      used.add(next.id)
      points.push(next.other)
      if (Math.hypot(next.other.x - start.x1, next.other.y - start.y1) <= tol && points.length > 1) {
        closed = true
        break
      }
      prev = current
      current = next.other
    }
    return { points, closed }
  }
  const forward = walk({ x: start.x2, y: start.y2 }, { x: start.x1, y: start.y1 })
  if (forward.closed) {
    return { ids: [...used], points: normalizeRing([{ x: start.x1, y: start.y1 }, { x: start.x2, y: start.y2 }, ...forward.points]), closed: true }
  }
  const back = walk({ x: start.x1, y: start.y1 }, { x: start.x2, y: start.y2 })
  const points = [...back.points.reverse(), { x: start.x1, y: start.y1 }, { x: start.x2, y: start.y2 }, ...forward.points]
  const ring = normalizeRing(points)
  const closed = ring.length >= 3 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) <= tol
  return { ids: [...used], points: ring, closed }
}

/** Chain the picked entities into one outline. The longest closed loop wins. */
export function outlineFromEntities(entities: readonly DrawEntity[], ids: readonly number[], tol = JOIN): ChainResult | null {
  const allow = new Set(ids)
  let best: ChainResult | null = null
  const used = new Set<number>()
  for (const id of ids) {
    if (used.has(id)) continue
    const chain = chainContour(entities, id, tol, allow)
    if (!chain) continue
    for (const item of chain.ids) used.add(item)
    const better = !best || Number(chain.closed) > Number(best.closed) || (chain.closed === best.closed && chain.points.length > best.points.length)
    if (better) best = chain
  }
  return best
}
