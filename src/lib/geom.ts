export interface Pt {
  x: number
  y: number
}

export interface BBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function hypot(x: number, y: number): number {
  return Math.hypot(x, y)
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function segLen(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1)
}

export function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

export function emptyBox(): BBox {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
}

export function addPoint(b: BBox, x: number, y: number) {
  if (x < b.x0) b.x0 = x
  if (y < b.y0) b.y0 = y
  if (x > b.x1) b.x1 = x
  if (y > b.y1) b.y1 = y
}

export function boxOk(b: BBox | null | undefined): b is BBox {
  return !!b && b.x1 > b.x0 && b.y1 > b.y0 && Number.isFinite(b.x0)
}

export function boxWidth(b: BBox): number {
  return b.x1 - b.x0
}

export function boxHeight(b: BBox): number {
  return b.y1 - b.y0
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = values.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Drop points that sit far from the dense cloud (spline control-point spikes). */
export function robustPoints(pts: Pt[]): Pt[] {
  if (pts.length < 8) return pts
  const mx = median(pts.map((p) => p.x))
  const my = median(pts.map((p) => p.y))
  const ds = pts.map((p) => Math.hypot(p.x - mx, p.y - my)).sort((a, b) => a - b)
  const p90 = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.9))]
  const lim = Math.max(p90 * 1.85, 500)
  const kept = pts.filter((p) => Math.hypot(p.x - mx, p.y - my) <= lim)
  return kept.length >= 3 ? kept : pts
}

export function bboxOf(pts: Pt[]): BBox | null {
  if (pts.length === 0) return null
  const b = emptyBox()
  for (const p of pts) addPoint(b, p.x, p.y)
  return boxOk(b) ? b : null
}

export function dedupePts(pts: Pt[], tol = 2): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const prev = out[out.length - 1]
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > tol) out.push(p)
  }
  return out
}

export function simplifyColinear(pts: Pt[], tol = 1.2): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const c1x = b.x - a.x
    const c1y = b.y - a.y
    const c2x = c.x - b.x
    const c2y = c.y - b.y
    const cross = Math.abs(c1x * c2y - c1y * c2x)
    const len = Math.hypot(c1x, c1y) + Math.hypot(c2x, c2y)
    if (len === 0 || cross / len > tol) out.push(b)
  }
  out.push(pts[pts.length - 1])
  return out
}

export function layerMatches(name: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p.endsWith('*')) {
      if (name.startsWith(p.slice(0, -1))) return true
    } else if (name === p) return true
  }
  return false
}

export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** 315/80 R22.5 → overall diameter in mm. */
export function tireDiameterMm(spec: string): number | null {
  const m = spec
    .replace(',', '.')
    .match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*R\s*(\d+(?:\.\d+)?)/i)
  if (!m) return null
  const width = Number(m[1])
  const aspect = Number(m[2]) / 100
  const rimIn = Number(m[3])
  if (!(width > 0 && aspect > 0 && rimIn > 0)) return null
  return rimIn * 25.4 + 2 * aspect * width
}
