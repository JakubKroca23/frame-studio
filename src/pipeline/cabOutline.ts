import type { BBox, Pt } from '../lib/geom'

/** A drawing line segment in the coordinates of one view. */
export interface LineSeg {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface OutlineOptions {
  /** Raster cell in millimetres. Defaults to about 1/380 of the larger side. */
  cell?: number
  /** Gaps in the outer line work up to about twice this radius are closed (mm). */
  close?: number
  /** Appendages thinner than about twice this radius are dropped: antennas, mirror arms, lamps (mm). */
  open?: number
  /**
   * Cut everything that sticks out sideways past the body, like mirrors in plan or front view.
   * 'y' clamps the drawing Y extent per column, 'x' clamps the drawing X extent per row.
   */
  clamp?: 'x' | 'y'
  /** Only segments inside this box (with a small margin) are used. */
  crop?: BBox
}

/**
 * Outer silhouette of a view drawn as line work.
 *
 * The lines are rasterised, small gaps are closed, everything not reachable from outside is
 * filled (so windows, door seams and other inner lines disappear), thin appendages are opened
 * away and the largest blob is traced back to a smooth closed ring (counter-clockwise).
 */
export function outerOutline(segments: readonly LineSeg[], options: OutlineOptions = {}): Pt[] | null {
  const crop = options.crop
  const margin = 60
  const segs = crop
    ? segments.filter(
        (s) =>
          Math.min(s.x1, s.x2) >= crop.x0 - margin &&
          Math.max(s.x1, s.x2) <= crop.x1 + margin &&
          Math.min(s.y1, s.y2) >= crop.y0 - margin &&
          Math.max(s.y1, s.y2) <= crop.y1 + margin,
      )
    : segments.slice()
  if (segs.length < 4) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const s of segs) {
    x0 = Math.min(x0, s.x1, s.x2)
    y0 = Math.min(y0, s.y1, s.y2)
    x1 = Math.max(x1, s.x1, s.x2)
    y1 = Math.max(y1, s.y1, s.y2)
  }
  const span = Math.max(x1 - x0, y1 - y0)
  if (!(span > 200)) return null
  const cell = options.cell ?? Math.min(20, Math.max(4, span / 380))
  const close = options.close ?? 18
  const open = options.open ?? 120
  const pad = Math.ceil((close * 4 + open) / cell) + 3
  const W = Math.ceil((x1 - x0) / cell) + 1 + pad * 2
  const H = Math.ceil((y1 - y0) / cell) + 1 + pad * 2
  if (W * H > 4_000_000) return null
  const ox = x0 - pad * cell
  const oy = y0 - pad * cell

  const lines = new Uint8Array(W * H)
  for (const s of segs) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1)
    const steps = Math.max(1, Math.ceil(len / (cell * 0.5)))
    for (let k = 0; k <= steps; k++) {
      const t = k / steps
      const i = Math.floor((s.x1 + (s.x2 - s.x1) * t - ox) / cell)
      const j = Math.floor((s.y1 + (s.y2 - s.y1) * t - oy) / cell)
      lines[i + j * W] = 1
    }
  }

  let filled: Uint8Array | null = null
  const lineArea = count(lines)
  for (let attempt = 0; attempt < 4 && !filled; attempt++) {
    const radius = (close * 2 ** attempt) / cell
    const walls = dilate(lines, W, H, radius)
    const inside = fillInside(walls, W, H)
    const body = erode(inside, W, H, radius)
    // A leak lets the flood reach the inside and leaves only the thickened lines.
    if (count(body) > lineArea * 3) filled = body
  }
  if (!filled) return null

  if (options.clamp) clampSides(filled, W, H, options.clamp, Math.max(1, Math.round(6 / cell)))

  const openRadius = open / cell
  let mask = openRadius >= 1 ? dilate(erode(filled, W, H, openRadius), W, H, openRadius) : filled
  mask = largestComponent(mask, W, H)
  if (count(mask) < 16) return null

  const traced = traceOuter(mask, W, H)
  if (!traced || traced.length < 4) return null
  const mm = traced.map((p) => ({ x: ox + p.x * cell, y: oy + p.y * cell }))
  // The traced ring is a staircase of cell edges: resample, smooth it out, then thin the points.
  let ring = smoothRing(resampleRing(mm, cell), 10)
  // A few millimetres of tolerance keeps long panels truly flat, so they shade evenly.
  ring = simplifyRing(ring, Math.max(2.5, cell * 0.35))
  if (ring.length < 4) return null
  return signedArea(ring) < 0 ? ring.reverse() : ring
}

export function ringBounds(ring: readonly Pt[]): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of ring) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

export function signedArea(ring: readonly Pt[]): number {
  let area = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

function count(mask: Uint8Array): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]
  return n
}

/** Squared Euclidean distance (in cells) from every cell to the nearest set cell. */
function distanceSquared(mask: Uint8Array, W: number, H: number, value: number): Float64Array {
  const INF = 1e20
  const n = Math.max(W, H)
  const out = new Float64Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = mask[i] === value ? 0 : INF
  const f = new Float64Array(n)
  const d = new Float64Array(n)
  const v = new Int32Array(n)
  const z = new Float64Array(n + 1)
  const pass = (length: number) => {
    let k = 0
    v[0] = 0
    z[0] = -INF
    z[1] = INF
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
  }
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) f[j] = out[i + j * W]
    pass(H)
    for (let j = 0; j < H; j++) out[i + j * W] = d[j]
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) f[i] = out[i + j * W]
    pass(W)
    for (let i = 0; i < W; i++) out[i + j * W] = d[i]
  }
  return out
}

function dilate(mask: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  const dist = distanceSquared(mask, W, H, 1)
  const r2 = radius * radius
  const out = new Uint8Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = dist[i] <= r2 ? 1 : 0
  return out
}

function erode(mask: Uint8Array, W: number, H: number, radius: number): Uint8Array {
  const dist = distanceSquared(mask, W, H, 0)
  const r2 = radius * radius
  const out = new Uint8Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = dist[i] > r2 ? 1 : 0
  return out
}

/** Everything the outside cannot reach through the walls. */
function fillInside(walls: Uint8Array, W: number, H: number): Uint8Array {
  const outside = new Uint8Array(W * H)
  const stack: number[] = []
  const push = (index: number) => {
    if (outside[index] || walls[index]) return
    outside[index] = 1
    stack.push(index)
  }
  for (let i = 0; i < W; i++) {
    push(i)
    push(i + (H - 1) * W)
  }
  for (let j = 0; j < H; j++) {
    push(j * W)
    push(W - 1 + j * W)
  }
  while (stack.length) {
    const index = stack.pop() as number
    const i = index % W
    if (i > 0) push(index - 1)
    if (i < W - 1) push(index + 1)
    if (index >= W) push(index - W)
    if (index < W * (H - 1)) push(index + W)
  }
  const inside = new Uint8Array(W * H)
  for (let i = 0; i < inside.length; i++) inside[i] = outside[i] ? 0 : 1
  return inside
}

/**
 * Take the typical side line of the body (median over the middle of the view) and cut
 * whatever pokes out past it, which is how mirrors and their arms are dropped.
 */
function clampSides(mask: Uint8Array, W: number, H: number, axis: 'x' | 'y', tolerance: number) {
  // Along = the axis the extents are measured along; across = lines we walk.
  const lines = axis === 'y' ? W : H
  const along = axis === 'y' ? H : W
  const at = (line: number, pos: number) => (axis === 'y' ? line + pos * W : pos + line * W)
  const lo: number[] = []
  const hi: number[] = []
  const used: number[] = []
  for (let line = 0; line < lines; line++) {
    let a = -1
    let b = -1
    for (let pos = 0; pos < along; pos++) {
      if (!mask[at(line, pos)]) continue
      if (a < 0) a = pos
      b = pos
    }
    if (a >= 0) {
      used.push(line)
      lo[line] = a
      hi[line] = b
    }
  }
  if (used.length < 8) return
  const first = used[0]
  const last = used[used.length - 1]
  const middle = used.filter((line) => line >= first + (last - first) * 0.3 && line <= first + (last - first) * 0.85)
  if (middle.length < 4) return
  const median = (values: number[]) => {
    const sorted = values.slice().sort((p, q) => p - q)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const low = median(middle.map((line) => lo[line])) - tolerance
  const high = median(middle.map((line) => hi[line])) + tolerance
  for (let line = 0; line < lines; line++) {
    for (let pos = 0; pos < along; pos++) {
      if (pos < low || pos > high) mask[at(line, pos)] = 0
    }
  }
}

function largestComponent(mask: Uint8Array, W: number, H: number): Uint8Array {
  const label = new Int32Array(W * H)
  let best = 0
  let bestSize = 0
  let next = 0
  const stack: number[] = []
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue
    next++
    let size = 0
    label[start] = next
    stack.push(start)
    while (stack.length) {
      const index = stack.pop() as number
      size++
      const i = index % W
      const around = [i > 0 ? index - 1 : -1, i < W - 1 ? index + 1 : -1, index - W, index + W]
      for (const n of around) {
        if (n < 0 || n >= mask.length || !mask[n] || label[n]) continue
        label[n] = next
        stack.push(n)
      }
    }
    if (size > bestSize) {
      bestSize = size
      best = next
    }
  }
  const out = new Uint8Array(W * H)
  for (let i = 0; i < out.length; i++) out[i] = label[i] === best && best > 0 ? 1 : 0
  return out
}

/** Walk the cell edges of the blob with the inside on the left. Vertices are cell corners. */
function traceOuter(mask: Uint8Array, W: number, H: number): Pt[] | null {
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && mask[i + j * W] === 1
  let si = -1
  let sj = -1
  for (let j = 0; j < H && si < 0; j++) {
    for (let i = 0; i < W; i++) {
      if (mask[i + j * W]) {
        si = i
        sj = j
        break
      }
    }
  }
  if (si < 0) return null
  // Directions: 0 east, 1 north, 2 west, 3 south.
  const DX = [1, 0, -1, 0]
  const DY = [0, 1, 0, -1]
  // An edge leaving corner (x, y) in direction d exists when the cell on its left is filled and the right one is empty.
  const leftCell = (x: number, y: number, d: number): [number, number] =>
    d === 0 ? [x, y] : d === 1 ? [x - 1, y] : d === 2 ? [x - 1, y - 1] : [x, y - 1]
  const rightCell = (x: number, y: number, d: number): [number, number] =>
    d === 0 ? [x, y - 1] : d === 1 ? [x, y] : d === 2 ? [x - 1, y] : [x - 1, y - 1]
  const edge = (x: number, y: number, d: number) => {
    const [li, lj] = leftCell(x, y, d)
    const [ri, rj] = rightCell(x, y, d)
    return filled(li, lj) && !filled(ri, rj)
  }
  const out: Pt[] = []
  let x = si
  let y = sj
  let d = 0
  const limit = W * H * 4
  for (let guard = 0; guard < limit; guard++) {
    out.push({ x, y })
    x += DX[d]
    y += DY[d]
    if (x === si && y === sj && d === 0) return out
    // Prefer a left turn, then straight, then right: keeps diagonal cells apart.
    let turned = false
    for (const nd of [(d + 1) % 4, d, (d + 3) % 4]) {
      if (edge(x, y, nd)) {
        if (nd !== d) out.push({ x, y })
        d = nd
        turned = true
        break
      }
    }
    if (!turned) return null
    if (x === si && y === sj && d === 0) return dedupe(out)
  }
  return null
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
  }
  return out
}

export function simplifyRing(ring: Pt[], epsilon: number): Pt[] {
  if (ring.length < 5) return ring
  // Split at the two most distant points so the closed ring simplifies as two open chains.
  let far = 0
  let best = -1
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i].x - ring[0].x) ** 2 + (ring[i].y - ring[0].y) ** 2
    if (d > best) {
      best = d
      far = i
    }
  }
  const a = simplifyChain(ring.slice(0, far + 1), epsilon)
  const b = simplifyChain([...ring.slice(far), ring[0]], epsilon)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

function simplifyChain(chain: Pt[], epsilon: number): Pt[] {
  if (chain.length < 3) return chain
  const keep = new Uint8Array(chain.length)
  keep[0] = 1
  keep[chain.length - 1] = 1
  const stack: [number, number][] = [[0, chain.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number]
    const a = chain[s]
    const b = chain[e]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    let index = -1
    let dist = epsilon
    for (let i = s + 1; i < e; i++) {
      const p = chain[i]
      const d = len > 1e-9 ? Math.abs(dx * (a.y - p.y) - dy * (a.x - p.x)) / len : Math.hypot(p.x - a.x, p.y - a.y)
      if (d > dist) {
        dist = d
        index = i
      }
    }
    if (index >= 0) {
      keep[index] = 1
      stack.push([s, index], [index, e])
    }
  }
  return chain.filter((_, i) => keep[i])
}

export function resampleRing(ring: Pt[], step: number): Pt[] {
  const out: Pt[] = []
  let carry = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    let t = carry
    while (t < len) {
      out.push({ x: a.x + ((b.x - a.x) * t) / len, y: a.y + ((b.y - a.y) * t) / len })
      t += step
    }
    carry = t - len
  }
  return out.length >= 4 ? out : ring
}

/** Binomial [1 2 1] smoothing, applied `rounds` times around the closed ring. */
export function smoothRing(ring: Pt[], rounds: number): Pt[] {
  let current = ring
  const n = ring.length
  for (let round = 0; round < rounds; round++) {
    const next: Pt[] = new Array(n)
    for (let i = 0; i < n; i++) {
      const a = current[(i + n - 1) % n]
      const b = current[i]
      const c = current[(i + 1) % n]
      next[i] = { x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 }
    }
    current = next
  }
  return current
}

/** Outer envelope of a point cloud. X is the station axis, Y the other drawing axis. */
export function envelope(points: readonly Pt[], bins = 48): Pt[] | null {
  if (points.length < 8) return null
  let minX = Infinity
  let maxX = -Infinity
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
  }
  const span = maxX - minX
  if (span < 40) return null
  const top: (number | null)[] = new Array(bins).fill(null)
  const bot: (number | null)[] = new Array(bins).fill(null)
  for (const point of points) {
    let index = Math.floor(((point.x - minX) / span) * (bins - 1))
    if (index < 0) index = 0
    if (index >= bins) index = bins - 1
    if (top[index] === null || point.y > (top[index] as number)) top[index] = point.y
    if (bot[index] === null || point.y < (bot[index] as number)) bot[index] = point.y
  }
  const filledTop = fillGaps(top)
  const filledBot = fillGaps(bot)
  if (!filledTop || !filledBot) return null
  for (let index = 0; index < bins; index++) {
    if (filledTop[index] < filledBot[index]) {
      const swap = filledTop[index]
      filledTop[index] = filledBot[index]
      filledBot[index] = swap
    }
  }
  despike(filledTop)
  despike(filledBot)
  const upper: Pt[] = []
  const lower: Pt[] = []
  for (let index = 0; index < bins; index++) {
    const x = minX + (span * index) / Math.max(1, bins - 1)
    upper.push({ x, y: filledTop[index] })
    lower.push({ x, y: filledBot[index] })
  }
  const ring = [...simplifyOpen(upper, 8), ...simplifyOpen(lower, 8).reverse()]
  return ring.length >= 4 ? ring : null
}

function fillGaps(values: (number | null)[]): number[] | null {
  if (!values.some((value) => value !== null)) return null
  const out = values.slice()
  let index = 0
  while (index < out.length) {
    if (out[index] !== null) {
      index++
      continue
    }
    let end = index
    while (end < out.length && out[end] === null) end++
    const left = index > 0 ? (out[index - 1] as number) : null
    const right = end < out.length ? (out[end] as number) : null
    for (let cursor = index; cursor < end; cursor++) {
      if (left !== null && right !== null) {
        const t = (cursor - (index - 1)) / (end - (index - 1))
        out[cursor] = left + (right - left) * t
      } else {
        out[cursor] = (left ?? right) as number
      }
    }
    index = end
  }
  return out as number[]
}

/** Drop a one-bin needle. A real slope stays between its neighbours, so it is kept. */
function despike(values: number[]) {
  const next = values.slice()
  for (let index = 1; index < values.length - 1; index++) {
    const peak = Math.max(values[index - 1], values[index + 1])
    const valley = Math.min(values[index - 1], values[index + 1])
    if (values[index] > peak + 80) next[index] = peak
    else if (values[index] < valley - 80) next[index] = valley
  }
  for (let index = 0; index < values.length; index++) values[index] = next[index]
}

function simplifyOpen(chain: Pt[], epsilon: number): Pt[] {
  if (chain.length < 3) return chain
  let farthest = 0
  let distance = 0
  const start = chain[0]
  const end = chain[chain.length - 1]
  const span = Math.hypot(end.x - start.x, end.y - start.y) || 1
  for (let index = 1; index < chain.length - 1; index++) {
    const point = chain[index]
    const t = ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / (span * span)
    const px = start.x + (end.x - start.x) * t
    const py = start.y + (end.y - start.y) * t
    const d = Math.hypot(point.x - px, point.y - py)
    if (d > distance) {
      distance = d
      farthest = index
    }
  }
  if (distance <= epsilon) return [start, end]
  const left = simplifyOpen(chain.slice(0, farthest + 1), epsilon)
  const right = simplifyOpen(chain.slice(farthest), epsilon)
  return [...left.slice(0, -1), ...right]
}

