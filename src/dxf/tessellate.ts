import type { Pt } from '../lib/geom'

const DEG = Math.PI / 180

/** CCW arc from a0Deg to a1Deg (DXF degrees). Both endpoints included. */
export function tessellateArc(
  cx: number,
  cy: number,
  r: number,
  a0Deg: number,
  a1Deg: number,
  tol: number,
): Pt[] {
  if (!(r > 0)) return []
  let sweep = a1Deg - a0Deg
  if (sweep <= 1e-6) sweep += 360
  const sweepRad = sweep * DEG
  const step = 2 * Math.acos(clampCos(1 - tol / r))
  const n = Math.max(2, Math.min(160, Math.ceil(sweepRad / Math.max(step, 0.015))))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = (a0Deg + (sweep * i) / n) * DEG
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

export function tessellateCircle(cx: number, cy: number, r: number, tol: number): Pt[] {
  return tessellateArc(cx, cy, r, 0, 360, tol)
}

/**
 * Bulge is tan(includedAngle/4). Positive bulge is CCW.
 * Returns points from p1 to p2 inclusive.
 */
export function tessellateBulge(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
  tol: number,
): Pt[] {
  if (Math.abs(bulge) < 1e-8) return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-8) return [{ x: x1, y: y1 }]
  const angle = 4 * Math.atan(bulge)
  const radius = dist / (2 * Math.sin(angle / 2))
  const absR = Math.abs(radius)
  if (!Number.isFinite(absR) || absR < 1e-6) return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const l = Math.sqrt(Math.max(0, absR * absR - (dist * dist) / 4))
  const nx = -dy / dist
  const ny = dx / dist
  const side = bulge > 0 ? 1 : -1
  const cx = mx + nx * l * side
  const cy = my + ny * l * side
  const a0 = Math.atan2(y1 - cy, x1 - cx)
  const n = Math.max(2, Math.min(160, Math.ceil(Math.abs(angle) / Math.max(2 * Math.acos(clampCos(1 - tol / absR)), 0.015))))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (angle * i) / n
    pts.push({ x: cx + absR * Math.cos(a), y: cy + absR * Math.sin(a) })
  }
  pts[0] = { x: x1, y: y1 }
  pts[pts.length - 1] = { x: x2, y: y2 }
  return pts
}

/** DXF ellipse. Major axis is relative to center. Parameters are radians. */
export function tessellateEllipse(
  cx: number,
  cy: number,
  mx: number,
  my: number,
  ratio: number,
  t0: number,
  t1: number,
  tol: number,
): Pt[] {
  const major = Math.hypot(mx, my)
  if (!(major > 0)) return []
  const minorX = -my * ratio
  const minorY = mx * ratio
  let sweep = t1 - t0
  if (sweep <= 1e-6) sweep += Math.PI * 2
  const rMax = Math.max(major, major * Math.abs(ratio || 1))
  const step = 2 * Math.acos(clampCos(1 - tol / Math.max(rMax, 0.001)))
  const n = Math.max(3, Math.min(180, Math.ceil(Math.abs(sweep) / Math.max(step, 0.02))))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + (sweep * i) / n
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push({ x: cx + mx * c + minorX * s, y: cy + my * c + minorY * s })
  }
  return pts
}

export interface SplineInput {
  degree: number
  knots: number[]
  controls: { x: number; y: number; w: number }[]
  fits: Pt[]
}

export function tessellateSpline(sp: SplineInput, tol: number): Pt[] {
  const { degree, knots, controls, fits } = sp
  try {
    if (controls.length >= degree + 1 && knots.length >= controls.length + degree + 1 && degree >= 1) {
      const sampled = sampleBSpline(degree, knots, controls, tol)
      if (sampled.length >= 2) return sampled
    }
  } catch {
    /* fall through */
  }
  if (fits.length >= 2) return fits
  if (controls.length >= 2) return controls.map((c) => ({ x: c.x, y: c.y }))
  return []
}

function sampleBSpline(
  degree: number,
  knots: number[],
  controls: { x: number; y: number; w: number }[],
  tol: number,
): Pt[] {
  const n = controls.length - 1
  const p = degree
  const u0 = knots[p]
  const u1 = knots[n + 1]
  if (!(u1 > u0)) return controls.map((c) => ({ x: c.x, y: c.y }))
  let length = 0
  for (let i = 1; i < controls.length; i++) {
    length += Math.hypot(controls[i].x - controls[i - 1].x, controls[i].y - controls[i - 1].y)
  }
  const target = Math.max(4, Math.min(48, Math.ceil(length / Math.max(tol * 12, 8))))
  const pts: Pt[] = []
  for (let i = 0; i <= target; i++) {
    const u = i === target ? u1 - (u1 - u0) * 1e-9 : u0 + ((u1 - u0) * i) / target
    pts.push(deBoor(controls, knots, p, n, u))
  }
  return pts
}

function deBoor(
  controls: { x: number; y: number; w: number }[],
  knots: number[],
  p: number,
  n: number,
  u: number,
): Pt {
  const k = findSpan(n, p, u, knots)
  const d: { x: number; y: number; w: number }[] = []
  for (let j = 0; j <= p; j++) {
    const c = controls[j + k - p]
    d.push({ x: c.x * c.w, y: c.y * c.w, w: c.w })
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = j + k - p
      const den = knots[i + 1 + p - r] - knots[i]
      const alpha = den === 0 ? 0 : (u - knots[i]) / den
      d[j] = {
        x: (1 - alpha) * d[j - 1].x + alpha * d[j].x,
        y: (1 - alpha) * d[j - 1].y + alpha * d[j].y,
        w: (1 - alpha) * d[j - 1].w + alpha * d[j].w,
      }
    }
  }
  const w = d[p].w || 1
  return { x: d[p].x / w, y: d[p].y / w }
}

function findSpan(n: number, p: number, u: number, knots: number[]): number {
  if (u >= knots[n + 1]) return n
  if (u <= knots[p]) return p
  let low = p
  let high = n + 1
  let mid = Math.floor((low + high) / 2)
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) high = mid
    else low = mid
    mid = Math.floor((low + high) / 2)
    if (high - low < 1) break
  }
  return mid
}

function clampCos(v: number): number {
  return Math.max(-1, Math.min(1, v))
}
