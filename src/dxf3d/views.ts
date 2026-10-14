import type { AxisCheck, Dxf3dAnalysis, HoleSpec, Island, P2, Seg4, ViewAssignment, ViewSet } from './types'

type Role = 'front' | 'top' | 'side'

export const ROLE_LABEL: Record<Role, string> = { front: 'čelní pohled', top: 'půdorys', side: 'bokorys' }

/** Side view drawn with depth running right-to-left (Y = width − u). */
export function sideMirrored(a: Pick<ViewAssignment, 'projection' | 'sideRight'>): boolean {
  return (a.projection === 'third') !== a.sideRight
}

/**
 * Turn the assigned islands into three silhouettes in model millimetres, cross-check the shared
 * sizes and work out which circles are holes confirmed by the other views.
 */
export function buildViewSet(analysis: Dxf3dAnalysis, a: ViewAssignment): ViewSet {
  const F = analysis.islands[a.front]
  const T = a.top !== null ? analysis.islands[a.top] : null
  const S = a.side !== null ? analysis.islands[a.side] : null
  const mirror = sideMirrored(a)
  const warnings: string[] = []

  // Views drawn at the same scale on one sheet share their projection lines: use the sheet
  // offsets so a view that shows extra parts (legs, a boom) past the others still lines up.
  const same = (A: Island | null) => !!A && Math.abs(A.mmPerUnit - F.mmPerUnit) / F.mmPerUnit < 0.01
  const oxT = T && same(T) ? (T.box.x0 - F.box.x0) * F.mmPerUnit : 0
  const ozS = S && same(S) ? (S.box.y0 - F.box.y0) * F.mmPerUnit : 0
  const minX = Math.min(0, T ? oxT : 0)
  const minZ = Math.min(0, S ? ozS : 0)
  const fx = -minX
  const fz = -minZ
  const sx = Math.max(F.width, T ? oxT + T.width : 0) + fx
  const sz = Math.max(F.height, S ? ozS + S.height : 0) + fz
  let sy: number
  let ySource: AxisCheck['source'] = 'measured'
  if (T && S) sy = Math.max(T.height, S.width)
  else if (T) sy = T.height
  else if (S) sy = S.width
  else {
    sy = Math.min(F.width, F.height) * 0.1
    ySource = 'computed'
  }

  const dimsOf = (isl: Island | null) => (isl ? analysis.dims.filter((d) => d.island === isl.id) : [])
  const matchDim = (value: number, views: (Island | null)[]) => {
    const tol = Math.max(0.5, value * 0.005)
    for (const v of views) for (const d of dimsOf(v)) if (Math.abs(d.value - value) <= tol) return d.value
    return null
  }
  const check = (
    axis: AxisCheck['axis'],
    label: string,
    va: { view: string; value: number | null },
    vb: { view: string; value: number | null },
    views: (Island | null)[],
  ): AxisCheck => {
    const vals = [va.value, vb.value].filter((v): v is number => v !== null)
    const value = vals.length ? vals.reduce((p, q) => p + q, 0) / vals.length : sy
    const delta = va.value !== null && vb.value !== null ? Math.abs(va.value - vb.value) : null
    const tol = Math.max(0.5, value * 0.005)
    return {
      axis,
      label,
      a: va,
      b: vb,
      value,
      source: vals.length === 2 ? 'measured' : vals.length === 1 ? 'measured' : 'computed',
      delta,
      ok: delta === null || delta <= tol,
      dim: matchDim(value, views),
    }
  }
  const checks: AxisCheck[] = [
    check('X', 'Šířka (X)', { view: ROLE_LABEL.front, value: F.width }, { view: ROLE_LABEL.top, value: T ? T.width : null }, [F, T]),
    check('Z', 'Výška (Z)', { view: ROLE_LABEL.front, value: F.height }, { view: ROLE_LABEL.side, value: S ? S.height : null }, [F, S]),
    check('Y', 'Hloubka (Y)', { view: ROLE_LABEL.top, value: T ? T.height : null }, { view: ROLE_LABEL.side, value: S ? S.width : null }, [T, S]),
  ]
  if (ySource === 'computed') checks[2].source = 'computed'
  for (const c of checks) {
    if (!c.ok) warnings.push(`${c.label}: ${c.a.view} ${fmt(c.a.value)} mm vs ${c.b.view} ${fmt(c.b.value)} mm (Δ ${fmt(c.delta)} mm)`)
    if (c.a.value === null || c.b.value === null) c.source = c.source === 'computed' ? 'computed' : 'measured'
  }
  if (!T) warnings.push('Půdorys chybí — dopočítán jako obdélník z šířky a hloubky bokorysu.')
  if (!S) warnings.push('Bokorys chybí — dopočítán jako obdélník z výšky a hloubky půdorysu.')
  if (!T && !S) warnings.push(`Hloubka neznámá — použita náhradní hodnota ${fmt(sy)} mm (dopočítáno, ne z výkresu).`)

  const rectAt = (x: number, y: number, w: number, h: number): P2[] => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
  const front = F.contour.map((p) => ({ x: p.x + fx, y: p.y + fz }))
  const top = T ? T.contour.map((p) => ({ x: p.x + oxT + fx, y: p.y })) : rectAt(fx, 0, F.width, sy)
  let side = S ? S.contour.map((p) => ({ x: mirror ? S.width - p.x : p.x, y: p.y + ozS + fz })) : rectAt(0, fz, sy, F.height)
  if (mirror) side = side.reverse()

  // ---- holes
  const holes: HoleSpec[] = []
  const skipped: HoleSpec[] = []
  const span = Math.max(sx, sy, sz)
  const tol = Math.max(0.05, span * 0.002)
  const extentOf = (lines: readonly Seg4[] | undefined, along: 'u' | 'v', at: number[]): [number, number] | null => {
    // along 'v': lines running vertically at u ≈ at[i]; return their v range.
    if (!lines) return null
    const ranges: [number, number][] = []
    let hits = 0
    for (const target of at) {
      let lo = Infinity
      let hi = -Infinity
      for (const [x1, y1, x2, y2] of lines) {
        if (along === 'v') {
          if (Math.abs(x1 - x2) > tol || Math.abs((x1 + x2) / 2 - target) > tol) continue
          lo = Math.min(lo, y1, y2)
          hi = Math.max(hi, y1, y2)
        } else {
          if (Math.abs(y1 - y2) > tol || Math.abs((y1 + y2) / 2 - target) > tol) continue
          lo = Math.min(lo, x1, x2)
          hi = Math.max(hi, x1, x2)
        }
      }
      if (hi - lo > tol) {
        hits++
        ranges.push([lo, hi])
      }
    }
    if (hits < at.length) return null
    return [Math.max(...ranges.map((r) => r[0])), Math.min(...ranges.map((r) => r[1]))]
  }
  const sideU = (y: number) => (S && mirror ? S.width - y : y)
  const sideRangeToY = (r: [number, number] | null): [number, number] | null =>
    r && S && mirror ? [S.width - r[1], S.width - r[0]] : r
  const shift = (r: [number, number] | null, d: number): [number, number] | null => (r ? [r[0] + d, r[1] + d] : null)
  const consider = (view: Role, isl: Island, ring: readonly P2[], depth: number) => {
    for (const c0 of isl.circles) {
      // Circle centre in the view's model frame.
      const c =
        view === 'front'
          ? { x: c0.x + fx, y: c0.y + fz, r: c0.r }
          : view === 'top'
            ? { x: c0.x + oxT + fx, y: c0.y, r: c0.r }
            : { x: sideU(c0.x), y: c0.y + ozS + fz, r: c0.r }
      if (!insideRing(ring, c) || edgeDistance(ring, c) < c.r - tol) continue
      let range: [number, number] | null = null
      let evidence = ''
      if (view === 'front') {
        const fromTop = T ? extentOf(T.lines, 'v', [c.x - oxT - fx - c.r, c.x - oxT - fx + c.r]) : null
        const fromSide = S ? sideRangeToY(extentOf(S.lines, 'u', [c.y - ozS - fz - c.r, c.y - ozS - fz + c.r])) : null
        range = fromTop ?? fromSide
        evidence = fromTop ? 'skryté hrany v půdorysu' : fromSide ? 'skryté hrany v bokorysu' : ''
      } else if (view === 'top') {
        const fromFront = shift(extentOf(F.lines, 'v', [c.x - fx - c.r, c.x - fx + c.r]), fz)
        const fromSide = S ? shift(extentOf(S.lines, 'v', [sideU(c.y - c.r), sideU(c.y + c.r)]), ozS + fz) : null
        range = fromFront ?? fromSide
        evidence = fromFront ? 'skryté hrany v čelním pohledu' : fromSide ? 'skryté hrany v bokorysu' : ''
      } else {
        const fromFront = shift(extentOf(F.lines, 'u', [c.y - fz - c.r, c.y - fz + c.r]), fx)
        const fromTop = T ? shift(extentOf(T.lines, 'u', [c.x - c.r, c.x + c.r]), oxT + fx) : null
        range = fromFront ?? fromTop
        evidence = fromFront ? 'skryté hrany v čelním pohledu' : fromTop ? 'skryté hrany v půdorysu' : ''
      }
      const axis = view === 'front' ? 'Y' : view === 'top' ? 'Z' : 'X'
      const spec: HoleSpec = {
        axis,
        view,
        u: c.x,
        v: c.y,
        r: c.r,
        from: range ? range[0] : 0,
        to: range ? range[1] : depth,
        through: !!range && range[0] <= tol * 2 && range[1] >= depth - tol * 2,
        confirmed: !!range,
        evidence: evidence || 'v ostatních pohledech chybí odpovídající hrany',
      }
      if (range && range[1] - range[0] > tol) holes.push(spec)
      else skipped.push(spec)
    }
  }
  consider('front', F, front, sy)
  if (T) consider('top', T, top, sz)
  if (S) consider('side', S, side, sx)
  if (skipped.length) warnings.push(`${skipped.length}× kružnice bez potvrzení v ostatních pohledech — díra nevytvořena.`)

  return {
    front,
    top,
    side,
    size: { x: sx, y: sy, z: sz },
    computed: { front: false, top: !T, side: !S },
    checks,
    holes,
    skippedHoles: skipped,
    warnings,
  }
}

export function fmt(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits)
}

export function insideRing(ring: readonly P2[], p: P2): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function edgeDistance(ring: readonly P2[], p: P2): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, segDist(p, ring[i], ring[(i + 1) % ring.length]))
  return best
}

export function segDist(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}
