import { flatten } from '../dxf/flatten'
import { parseDxf } from '../dxf/parse'
import type { Circ, Seg, Txt } from '../dxf/types'
import {
  bboxOf,
  boxHeight,
  boxOk,
  boxWidth,
  layerMatches,
  overlap1d,
  robustPoints,
  segLen,
  type BBox,
  type Pt,
} from '../lib/geom'
import type { Axle, CabModel, ChassisModel, Crossmember, Dimension, Hole, PartModel, Slice } from '../model/types'
import { detectProfile } from '../profile/registry'
import { scaniaIcdProfile } from '../profile/scania-icd'
import type { Profile } from '../profile/types'
import { dimensionMap, pairDimensions } from './dimensions'
import { extractFrame } from './frame'

const PART_RE = /^(\d{7})(?:_\d+)?$/

/**
 * Pure DXF → chassis model pipeline.
 * The same function runs in a worker today and can move to a server function later;
 * the UI only consumes ChassisModel plus parameters.
 */
export function analyzeDxf(text: string): ChassisModel {
  const t0 = performance.now()
  const db = parseDxf(text)
  const match = detectProfile(db)
  const profile = match?.profile ?? scaniaIcdProfile
  const warnings: string[] = []
  if (!match) {
    warnings.push('Profil výrobce nebyl rozpoznán. Detekce zkouší pravidla Scania ICD jako výchozí.')
  }

  const named = (patterns: string[]) => [...db.layers].filter((l) => layerMatches(l, patterns))
  const flat = flatten(db, {
    ignoreBlocks: profile.ignore.blocks,
    ignoreLayers: profile.ignore.layers,
    geometryIgnoreLayers: named([...profile.views.dimensions, ...profile.views.info]),
  })

  const on = (patterns: string[]) => (layer: string) => layerMatches(layer, patterns)
  const frameTop = flat.segments.filter((s) => on(profile.views.frameTop)(s.layer))
  const frameSide = flat.segments.filter((s) => on(profile.views.frameSide)(s.layer))
  const dims = pairDimensions(flat.texts, profile, on(profile.views.dimensions))
  const dmap = dimensionMap(dims)
  const sem = profile.semantics

  const frame = extractFrame(frameTop, frameSide, {
    outerWidth: sem.frameOuterWidth ? dmap.get(sem.frameOuterWidth) : undefined,
    flange: sem.flangeWidth ? dmap.get(sem.flangeWidth) : undefined,
    height: sem.frameHeight ? dmap.get(sem.frameHeight) : undefined,
  })
  if (!frame) warnings.push('Podélníky se nepodařilo spolehlivě najít.')

  const splitY = frame ? (frame.topZ + frame.centerY) / 2 : estimateSplitY(flat.segments)
  const holes = extractHoles(flat.circles, profile, frame)
  const axles = extractAxles(flat.circles, flat.arcs, profile, dmap, frame)
  if (axles.length === 0) warnings.push('Nápravy se nepodařilo najít.')
  const crossmembers = frame ? extractCrossmembers(frameTop, frame) : []
  const cab = extractCab(flat.segments, profile, splitY)
  if (!cab) warnings.push('Kabina se nepodařila ohraničit.')
  const components = extractComponents(flat.segments, profile, splitY, frame, axles, cab)

  verify(dims, frame, axles)
  const header = readHeader(flat.texts)
  const extents = extentsOf(flat.segments, flat.texts)
  const views = {
    side: frame
      ? bboxOf(frameSide.flatMap((s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]).filter((p) => p.y > splitY - 200))
      : null,
    top: frame
      ? bboxOf(frameTop.flatMap((s) => [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]).filter((p) => p.y < splitY))
      : null,
  }

  const preview = buildPreview(flat.segments, flat.circles, profile, frame, axles, cab, components, splitY)

  return {
    version: 1,
    profileId: match?.profile.id ?? 'unmatched',
    profileName: profile.name,
    manufacturer: match ? profile.manufacturer : 'neznámý',
    score: match?.score ?? 0,
    warnings,
    units: 'mm',
    dxfVersion: db.version,
    header,
    extents: extents ?? { x0: 0, y0: 0, x1: 1, y1: 1 },
    views,
    dimensions: dims,
    frame,
    holes,
    axles,
    crossmembers,
    cab,
    components,
    preview,
    stats: {
      segmentCount: flat.segments.length,
      circleCount: flat.circles.length,
      blockCount: flat.blockInserts.length,
      holeCount: holes.length,
      parseMs: Math.round(performance.now() - t0),
    },
  }
}

function extractHoles(circles: Circ[], profile: Profile, frame: ChassisModel['frame']): Hole[] {
  if (!frame) return []
  const holes: Hole[] = []
  const x0 = Math.min(frame.left[0].x, frame.right[0].x) - 40
  const x1 = Math.max(frame.left[frame.left.length - 1].x, frame.right[frame.right.length - 1].x) + 40
  const push = (c: Circ, side: 'left' | 'right') => {
    const d = c.r * 2
    if (d < 6 || d > 40) return
    if (c.x < x0 || c.x > x1) return
    if (c.y < frame.bottomZ - 8 || c.y > frame.topZ + 8) return
    holes.push({ x: c.x, z: c.y, d, side })
  }
  for (const c of circles) {
    if (layerMatches(c.layer, profile.views.holesLeft)) push(c, 'left')
    else if (layerMatches(c.layer, profile.views.holesRight)) push(c, 'right')
  }
  return holes
}

function extractAxles(
  circles: Circ[],
  arcs: { layer: string; cx: number; cy: number; r: number }[],
  profile: Profile,
  dmap: Map<string, number>,
  frame: ChassisModel['frame'],
): Axle[] {
  const sideOk = (layer: string) => layerMatches(layer, profile.views.frameSide)
  const rims: { x: number; y: number }[] = []
  for (const c of circles) {
    if (!sideOk(c.layer)) continue
    const d = c.r * 2
    if (d < 450 || d > 780) continue
    if (frame && (c.y > frame.bottomZ + 80 || c.y < frame.bottomZ - 1000)) continue
    rims.push({ x: c.x, y: c.y })
  }
  const clusters: { x: number; y: number; n: number }[] = []
  for (const r of rims) {
    const hit = clusters.find((c) => Math.abs(c.x - r.x) < 180)
    if (hit) {
      hit.x = (hit.x * hit.n + r.x) / (hit.n + 1)
      hit.y = (hit.y * hit.n + r.y) / (hit.n + 1)
      hit.n++
    } else clusters.push({ x: r.x, y: r.y, n: 1 })
  }
  clusters.sort((a, b) => a.x - b.x)
  const diameters = (profile.semantics.tireDiameters ?? []).map((k) => dmap.get(k) ?? null)
  const tracks = (profile.semantics.tracks ?? []).map((k) => dmap.get(k) ?? null)

  return clusters.map((c, index) => {
    const diams: number[] = []
    for (const src of [...circles, ...arcs]) {
      const d = src.r * 2
      if (d < 850 || d > 1400) continue
      if (!sideOk(src.layer)) continue
      const cx = 'cx' in src ? src.cx : src.x
      const cy = 'cy' in src ? src.cy : src.y
      if (Math.abs(cx - c.x) > 150 || Math.abs(cy - c.y) > 120) continue
      diams.push(Math.round(d))
    }
    const counted = mode(diams)
    const fromLabel = diameters[index] ?? null
    const tireDiameter = counted ?? fromLabel ?? 1076
    const dual = clusters.length >= 3 ? index === 1 : index === clusters.length - 1 && clusters.length > 1
    return {
      index,
      x: Math.round(c.x),
      z: Math.round(c.y),
      tireDiameter,
      track: tracks[index] ?? null,
      dual,
    }
  })
}

function extractCrossmembers(top: Seg[], frame: NonNullable<ChassisModel['frame']>): Crossmember[] {
  const inner = frame.outerWidthStraight - 2 * frame.flangeWidth
  if (inner < 200) return []
  const hits: number[] = []
  for (const s of top) {
    if (Math.abs(s.x1 - s.x2) > 14) continue
    const len = Math.abs(s.y2 - s.y1)
    if (len < inner * 0.72 || len > inner * 1.35) continue
    const my = (s.y1 + s.y2) / 2
    if (Math.abs(my - frame.centerY) > inner * 0.35) continue
    const mx = (s.x1 + s.x2) / 2
    if (mx < frame.left[0].x || mx > frame.left[frame.left.length - 1].x) continue
    hits.push(mx)
  }
  hits.sort((a, b) => a - b)
  const groups: number[][] = []
  for (const x of hits) {
    const g = groups[groups.length - 1]
    if (g && x - g[g.length - 1] < 100) g.push(x)
    else groups.push([x])
  }
  return groups.map((g) => {
    const span = g[g.length - 1] - g[0]
    return { x: (g[0] + g[g.length - 1]) / 2, thickness: span >= 8 ? span : 60 }
  })
}

function extractCab(segs: Seg[], profile: Profile, splitY: number): CabModel | null {
  const cabSegs = segs.filter((s) => layerMatches(s.layer, profile.views.cab))
  const sidePts = mainCluster(
    robustPoints(pointsOf(cabSegs, (y) => y > splitY + 80)),
    90,
  )
  const side = bboxOf(sidePts)
  if (!side || boxWidth(side) < 400 || boxHeight(side) < 600) return null
  const topPts = robustPoints(
    pointsOf(cabSegs, (y) => y < splitY - 80).filter((p) => p.x > side.x0 - 400 && p.x < side.x1 + 400),
  )
  const top = bboxOf(topPts)
  if (!top || boxWidth(top) < 300) return null
  const samples = makeSlices(sidePts, topPts, side, top, 22)
  return { side, top, samples }
}

function extractComponents(
  segs: Seg[],
  profile: Profile,
  splitY: number,
  frame: ChassisModel['frame'],
  axles: Axle[],
  cab: CabModel | null,
): PartModel[] {
  const byBlock = new Map<string, Seg[]>()
  for (const s of segs) {
    if (!s.block || !PART_RE.test(s.block)) continue
    let list = byBlock.get(s.block)
    if (!list) {
      list = []
      byBlock.set(s.block, list)
    }
    list.push(s)
  }
  const groups = new Map<string, string[]>()
  for (const name of byBlock.keys()) {
    const stem = name.match(PART_RE)?.[1]
    if (!stem) continue
    let g = groups.get(stem)
    if (!g) {
      g = []
      groups.set(stem, g)
    }
    g.push(name)
  }

  const parts: PartModel[] = []
  for (const [stem, names] of groups) {
    const sides: { name: string; bb: BBox; pts: Pt[] }[] = []
    const tops: { name: string; bb: BBox; pts: Pt[] }[] = []
    const both: { side: BBox; top: BBox; sidePts: Pt[]; topPts: Pt[] }[] = []
    for (const name of names) {
      const list = byBlock.get(name) ?? []
      const sidePts = robustPoints(pointsOf(list, (y, layer) => isSidePoint(layer, y, profile, splitY)))
      const topPts = robustPoints(pointsOf(list, (y, layer) => isTopPoint(layer, y, profile, splitY)))
      const sb = bboxOf(sidePts)
      const tb = bboxOf(topPts)
      if (sb && tb) both.push({ side: sb, top: tb, sidePts, topPts })
      else if (sb) sides.push({ name, bb: sb, pts: sidePts })
      else if (tb) tops.push({ name, bb: tb, pts: topPts })
    }
    const used = new Set<number>()
    for (const s of sides) {
      let best = -1
      let bestOv = 40
      for (let i = 0; i < tops.length; i++) {
        if (used.has(i)) continue
        const ov = overlap1d(s.bb.x0, s.bb.x1, tops[i].bb.x0, tops[i].bb.x1)
        if (ov > bestOv) {
          bestOv = ov
          best = i
        }
      }
      if (best >= 0) {
        used.add(best)
        both.push({ side: s.bb, top: tops[best].bb, sidePts: s.pts, topPts: tops[best].pts })
      }
    }
    let n = 0
    for (const item of both) {
      if (!keepPart(item.side, item.top, frame, axles, cab)) continue
      const samples = makeSlices(item.sidePts, item.topPts, item.side, item.top, 14)
      parts.push({
        id: `${stem}-${n}`,
        partNumber: stem,
        side: item.side,
        top: item.top,
        samples,
      })
      n++
    }
  }
  parts.sort((a, b) => partVolume(b) - partVolume(a))
  return parts.slice(0, 48)
}

function keepPart(side: BBox, top: BBox, _frame: ChassisModel['frame'], axles: Axle[], cab: CabModel | null): boolean {
  const sx = boxWidth(side)
  const sz = boxHeight(side)
  const tx = boxWidth(top)
  const ty = boxHeight(top)
  if (sx > 5000 || sz > 3600 || tx > 5000 || ty > 4500) return false
  if (sx < 70 || sz < 40 || ty < 30) return false
  const overlap = overlap1d(side.x0, side.x1, top.x0, top.x1)
  if (overlap < 40) return false
  if (sz > 200 && sz < 360 && sx > 700 && ty > 400 && ty < 1900) return false
  const cx = (Math.max(side.x0, top.x0) + Math.min(side.x1, top.x1)) / 2
  if (sz > 850 && axles.some((a) => Math.abs(a.x - cx) < 500)) return false
  if (cab && contained(side, cab.side, 0.75) && contained(top, cab.top, 0.55) && sz > 500) return false
  return true
}

function contained(inner: BBox, outer: BBox, frac: number): boolean {
  const ox = overlap1d(inner.x0, inner.x1, outer.x0, outer.x1)
  const oy = overlap1d(inner.y0, inner.y1, outer.y0, outer.y1)
  return ox > boxWidth(inner) * frac && oy > boxHeight(inner) * frac
}

function partVolume(p: PartModel): number {
  if (!p.side || !p.top) return 0
  const x = overlap1d(p.side.x0, p.side.x1, p.top.x0, p.top.x1)
  return x * boxHeight(p.side) * boxHeight(p.top)
}

function isSidePoint(layer: string, y: number, profile: Profile, splitY: number): boolean {
  if (layerMatches(layer, profile.views.cab)) return y >= splitY
  if (layerMatches(layer, profile.views.holesLeft) || layerMatches(layer, profile.views.holesRight)) return false
  return layerMatches(layer, profile.views.side)
}

function isTopPoint(layer: string, y: number, profile: Profile, splitY: number): boolean {
  if (layerMatches(layer, profile.views.cab)) return y < splitY
  return layerMatches(layer, profile.views.top)
}

function pointsOf(segs: Seg[], pred: (y: number, layer: string) => boolean): Pt[] {
  const pts: Pt[] = []
  for (const s of segs) {
    const len = segLen(s.x1, s.y1, s.x2, s.y2)
    if (len > 2400 || len < 0.4) continue
    const my = (s.y1 + s.y2) / 2
    if (!pred(my, s.layer)) continue
    pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
  }
  return pts
}

function makeSlices(sidePts: Pt[], topPts: Pt[], side: BBox, top: BBox, bins: number): Slice[] {
  const x0 = Math.max(side.x0, top.x0)
  const x1 = Math.min(side.x1, top.x1)
  if (x1 - x0 < 15) {
    return [
      { x: side.x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
      { x: side.x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    ]
  }
  const slices: Slice[] = []
  for (let i = 0; i < bins; i++) {
    const a = x0 + ((x1 - x0) * i) / bins
    const b = x0 + ((x1 - x0) * (i + 1)) / bins
    let z0 = Infinity
    let z1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    let zs = 0
    let ys = 0
    for (const p of sidePts) {
      if (p.x < a || p.x > b) continue
      if (p.y < z0) z0 = p.y
      if (p.y > z1) z1 = p.y
      zs++
    }
    for (const p of topPts) {
      if (p.x < a || p.x > b) continue
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
      ys++
    }
    if (zs < 2 || ys < 2) continue
    slices.push({ x: (a + b) / 2, z0, z1, y0, y1 })
  }
  if (slices.length < 2) {
    return [
      { x: x0, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
      { x: x1, z0: side.y0, z1: side.y1, y0: top.y0, y1: top.y1 },
    ]
  }
  return slices
}

function mainCluster(pts: Pt[], cell: number): Pt[] {
  if (pts.length < 30) return pts
  const bins = new Map<string, Pt[]>()
  for (const p of pts) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
    let list = bins.get(k)
    if (!list) {
      list = []
      bins.set(k, list)
    }
    list.push(p)
  }
  const seen = new Set<string>()
  let best: string[] = []
  for (const start of bins.keys()) {
    if (seen.has(start)) continue
    const stack = [start]
    seen.add(start)
    const comp = [start]
    while (stack.length) {
      const cur = stack.pop() as string
      const [x, y] = cur.split(',').map(Number)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const n = `${x + dx},${y + dy}`
          if (bins.has(n) && !seen.has(n)) {
            seen.add(n)
            stack.push(n)
            comp.push(n)
          }
        }
      }
    }
    if (comp.length > best.length) best = comp
  }
  const kept = new Set(best)
  const mainPts = best.flatMap((k) => bins.get(k) ?? [])
  const mb = bboxOf(mainPts)
  if (mb) {
    for (const [k, list] of bins) {
      if (kept.has(k)) continue
      const bb = bboxOf(list)
      if (!bb) continue
      const near =
        bb.x1 >= mb.x0 - cell * 2 &&
        bb.x0 <= mb.x1 + cell * 2 &&
        bb.y1 >= mb.y0 - cell * 2 &&
        bb.y0 <= mb.y1 + cell * 2
      if (near) kept.add(k)
    }
  }
  const out: Pt[] = []
  for (const k of kept) out.push(...(bins.get(k) ?? []))
  return out.length ? out : pts
}

function verify(dims: Dimension[], frame: ChassisModel['frame'], axles: Axle[]) {
  const by = new Map<string, Dimension>()
  for (const d of dims) if (!by.has(d.label)) by.set(d.label, d)
  const mark = (label: string, expected: number, method: string) => {
    const d = by.get(label)
    if (!d || d.value === null) return
    const delta = d.value - expected
    d.verified = { method, expected, delta, ok: Math.abs(delta) <= 5 }
    if (d.verified.ok) d.confidence = Math.max(d.confidence, 0.98)
  }
  if (axles.length >= 2) mark('L011', axles[1].x - axles[0].x, 'vzdálenost 1. a 2. nápravy')
  if (axles.length >= 3) mark('L012.2', axles[2].x - axles[1].x, 'vzdálenost 2. a 3. nápravy')
  if (frame) {
    mark('W036', frame.outerWidthStraight, 'vnější šířka podélníků')
    mark('H032.1', frame.topZ - frame.bottomZ, 'výška podélníku v bokorysu')
    mark('W032.1', frame.flangeWidth, 'šířka pásnice')
    const rearX = Math.max(frame.left[frame.left.length - 1].x, frame.right[frame.right.length - 1].x)
    if (axles.length) mark('L019', rearX - axles[axles.length - 1].x, 'konec rámu mínus poslední náprava')
  }
}

function readHeader(texts: Txt[]): ChassisModel['header'] {
  const header: ChassisModel['header'] = {}
  const weights: { y: number; text: string }[] = []
  for (const t of texts) {
    const raw = t.text.trim()
    if (!header.title && /SCANIA ICD/i.test(raw)) header.title = raw
    if (!header.chassisType && /^G\s+\d/i.test(raw)) header.chassisType = raw
    if (!header.icdNo && /^\d{13}$/.test(raw)) header.icdNo = raw
    if (/^\d+\s*kg$/i.test(raw)) weights.push({ y: t.y, text: raw })
  }
  weights.sort((a, b) => b.y - a.y)
  if (weights[0]) header.totalWeight = weights[0].text
  if (weights[1]) header.frontWeight = weights[1].text
  if (weights[2]) header.rearWeight = weights[2].text
  return header
}

function extentsOf(segs: Seg[], texts: Txt[]): BBox | null {
  const pts: Pt[] = []
  for (const s of segs) {
    if (segLen(s.x1, s.y1, s.x2, s.y2) > 8000) continue
    pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })
  }
  for (const t of texts) pts.push({ x: t.x, y: t.y })
  return bboxOf(robustPoints(pts))
}

function estimateSplitY(segs: Seg[]): number {
  const hist = new Map<number, number>()
  for (const s of segs) {
    const y = Math.round((s.y1 + s.y2) / 2 / 100) * 100
    hist.set(y, (hist.get(y) ?? 0) + 1)
  }
  const keys = [...hist.keys()].sort((a, b) => a - b)
  let bestGap = 0
  let split = 3500
  for (let i = 1; i < keys.length; i++) {
    const gap = keys[i] - keys[i - 1]
    if (gap > bestGap && hist.get(keys[i - 1])! > 10 && hist.get(keys[i])! > 10) {
      bestGap = gap
      split = (keys[i] + keys[i - 1]) / 2
    }
  }
  return split
}

function buildPreview(
  segs: Seg[],
  circles: Circ[],
  profile: Profile,
  frame: ChassisModel['frame'],
  axles: Axle[],
  cab: CabModel | null,
  components: PartModel[],
  splitY: number,
): ChassisModel['preview'] {
  const segments: Record<string, number[]> = {
    chassis: [],
    cab: [],
    frame: [],
    axle: [],
    component: [],
  }
  const circs: Record<string, number[]> = { holes: [] }
  const push = (role: string, s: Seg) => {
    const arr = segments[role]
    arr.push(s.x1, s.y1, s.x2, s.y2)
  }
  for (const s of segs) {
    if (layerMatches(s.layer, profile.views.cab)) push('cab', s)
    else if (layerMatches(s.layer, profile.views.frameTop) || layerMatches(s.layer, profile.views.frameSide))
      push('chassis', s)
  }
  if (frame) {
    pushPoly(segments.frame, frame.left)
    pushPoly(segments.frame, frame.right)
  }
  for (const axle of axles) {
    segments.axle.push(axle.x, splitY - 1600, axle.x, splitY + 2200)
  }
  if (cab) pushRect(segments.component, cab.side)
  for (const part of components) {
    if (part.top) pushRect(segments.component, part.top)
    if (part.side) pushRect(segments.component, part.side)
  }
  for (const c of circles) {
    if (layerMatches(c.layer, profile.views.holesLeft) || layerMatches(c.layer, profile.views.holesRight)) {
      if (c.r * 2 >= 6 && c.r * 2 <= 40) circs.holes.push(c.x, c.y, c.r)
    }
  }
  return { segments, circles: circs }
}

function pushPoly(arr: number[], pts: Pt[]) {
  for (let i = 1; i < pts.length; i++) arr.push(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)
}

function pushRect(arr: number[], b: BBox) {
  if (!boxOk(b)) return
  arr.push(b.x0, b.y0, b.x1, b.y0, b.x1, b.y0, b.x1, b.y1, b.x1, b.y1, b.x0, b.y1, b.x0, b.y1, b.x0, b.y0)
}

function mode(values: number[]): number | null {
  if (values.length === 0) return null
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = values[0]
  let n = 0
  for (const [v, c] of counts) {
    if (c > n) {
      best = v
      n = c
    }
  }
  return best
}
