import { flatten } from '../dxf/flatten'
import { parseDxf } from '../dxf/parse'
import type { DxfDb, DxfEntity } from '../dxf/types'
import { classifyViews } from './classify'
import { area, graphOuterContour, rasterOuterContour } from './contour'
import { attachDimsToIslands, collectDims, detectScale, unitsInfo } from './scale'
import type { Box2, Dxf3dAnalysis, Hole2, Island, IslandKind, P2, Seg4 } from './types'

/** Layers that carry annotation, not part outline. */
const ANNOTATION_LAYER = /dim|kót|kot[ay]?$|^kot|text|title|razitk|rámeč|ramec|frame|border|hatch|šraf|sraf|center|centre|^osa|axis|mittel|symbol|tabul|table|^tbl|^defpoints$/i

const GRAPH_LIMIT = 6000

export function analyzeDxf3d(text: string, progress?: (stage: string) => void): Dxf3dAnalysis {
  const t0 = Date.now()
  progress?.('Čtu DXF…')
  const db = parseDxf(text)
  return analyzeDb(db, text, progress, t0)
}

export function analyzeDb(db: DxfDb, rawText = '', progress?: (stage: string) => void, t0 = Date.now()): Dxf3dAnalysis {
  const warnings: string[] = []
  const ext = rawExtents(db.entities)
  const diag0 = Math.max(1e-6, Math.hypot(ext.x1 - ext.x0, ext.y1 - ext.y0))
  progress?.('Rozkládám bloky…')
  const flat = flatten(db, { circleSegments: false, curveTolerance: Math.max(diag0 * 2e-5, 1e-4) })

  // ---- items (segments + circles) in drawing units
  const segs: Seg4[] = []
  for (const s of flat.segments) {
    if (ANNOTATION_LAYER.test(s.layer)) continue
    segs.push([s.x1, s.y1, s.x2, s.y2])
  }
  const circles: Hole2[] = []
  for (const c of flat.circles) {
    if (ANNOTATION_LAYER.test(c.layer)) continue
    circles.push({ x: c.x, y: c.y, r: c.r })
  }
  if (segs.length + circles.length < 3) throw new Error('Ve výkresu nejsou žádné obrysové čáry.')

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
  for (const c of circles) {
    x0 = Math.min(x0, c.x - c.r)
    x1 = Math.max(x1, c.x + c.r)
    y0 = Math.min(y0, c.y - c.r)
    y1 = Math.max(y1, c.y + c.r)
  }
  const diag = Math.hypot(x1 - x0, y1 - y0)

  // ---- islands by raster connectivity
  progress?.('Hledám ostrovy pohledů…')
  const g = diag * 0.002
  const nItems = segs.length + circles.length
  const parent = new Int32Array(nItems)
  for (let i = 0; i < nItems; i++) parent[i] = i
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  const cells = new Map<number, number>()
  const K = 1 << 22
  const mark = (x: number, y: number, item: number) => {
    const key = Math.floor((x - x0) / g) * K + Math.floor((y - y0) / g)
    const owner = cells.get(key)
    if (owner === undefined) cells.set(key, item)
    else union(owner, item)
  }
  segs.forEach((s, i) => {
    const len = Math.hypot(s[2] - s[0], s[3] - s[1])
    const steps = Math.max(1, Math.ceil(len / (g * 0.7)))
    for (let k = 0; k <= steps; k++) mark(s[0] + ((s[2] - s[0]) * k) / steps, s[1] + ((s[3] - s[1]) * k) / steps, i)
  })
  circles.forEach((c, i) => {
    const steps = Math.max(8, Math.ceil((2 * Math.PI * c.r) / (g * 0.7)))
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      mark(c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, segs.length + i)
    }
  })

  interface Raw {
    root: number
    segs: number[]
    circles: number[]
    box: Box2
    axisLen: number
    totalLen: number
    parent: number | null
    kind: IslandKind
    circleOnly: boolean
  }
  const byRoot = new Map<number, Raw>()
  const rawOf = (root: number) => {
    let r = byRoot.get(root)
    if (!r) {
      r = { root, segs: [], circles: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, axisLen: 0, totalLen: 0, parent: null, kind: 'part', circleOnly: true }
      byRoot.set(root, r)
    }
    return r
  }
  segs.forEach((s, i) => {
    const r = rawOf(find(i))
    r.segs.push(i)
    r.circleOnly = false
    grow(r.box, s[0], s[1])
    grow(r.box, s[2], s[3])
    const len = Math.hypot(s[2] - s[0], s[3] - s[1])
    r.totalLen += len
    if (Math.abs(s[2] - s[0]) < len * 0.002 || Math.abs(s[3] - s[1]) < len * 0.002) r.axisLen += len
  })
  circles.forEach((c, i) => {
    const r = rawOf(find(segs.length + i))
    r.circles.push(i)
    grow(r.box, c.x - c.r, c.y - c.r)
    grow(r.box, c.x + c.r, c.y + c.r)
    r.totalLen += 2 * Math.PI * c.r
  })
  const raws = [...byRoot.values()].sort((a, b) => boxArea(b.box) - boxArea(a.box))
  const rdiag = (r: Raw) => Math.hypot(r.box.x1 - r.box.x0, r.box.y1 - r.box.y0)

  // Containment: each island points at the smallest island whose bbox holds it.
  for (let i = 0; i < raws.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (contains(raws[j].box, raws[i].box)) {
        raws[i].parent = j
        break
      }
    }
  }
  const texts = flat.texts
  // Frames (sheet border, title block) contain several big islands; tables are text-filled grids.
  const kids = (j: number) => raws.map((r, i) => ({ r, i })).filter(({ r }) => r.parent === j)
  for (let j = 0; j < raws.length; j++) {
    const r = raws[j]
    const axisFrac = r.axisLen / Math.max(r.totalLen, 1e-9)
    const bigKids = kids(j).filter(({ r: k }) => !k.circleOnly && rdiag(k) > rdiag(r) * 0.1)
    if (axisFrac > 0.9 && (bigKids.length >= 2 || bigKids.some(({ r: k }) => k.segs.length > r.segs.length && rdiag(k) > rdiag(r) * 0.25))) {
      r.kind = 'frame'
      for (const { r: k } of kids(j)) k.parent = r.parent
      continue
    }
    const inside = texts.filter((t) => t.x >= r.box.x0 && t.x <= r.box.x1 && t.y >= r.box.y0 && t.y <= r.box.y1).length
    if (axisFrac > 0.97 && inside >= 6 && r.circles.length === 0) r.kind = 'table'
  }
  // Resolve parents through frames/tables again (containment chain may point at a removed frame).
  for (const r of raws) {
    while (r.parent !== null && raws[r.parent].kind === 'frame') r.parent = raws[r.parent].parent
  }
  // Merge children into their top-level part.
  const top = raws.filter((r) => r.parent === null && r.kind === 'part')
  const maxDiag = Math.max(1e-9, ...top.map(rdiag))
  for (const r of top) if (rdiag(r) < maxDiag * 0.04 || r.circleOnly || r.segs.length + r.circles.length < 4) r.kind = 'small'
  const topIndex = (r: Raw): Raw | null => {
    let cur: Raw = r
    let guard = 0
    while (cur.parent !== null && guard++ < 64) cur = raws[cur.parent]
    return cur.kind === 'part' ? cur : null
  }
  for (const r of raws) {
    if (r.parent === null || r.kind !== 'part') continue
    const host = topIndex(r)
    if (!host || host === r) continue
    host.segs.push(...r.segs)
    host.circles.push(...r.circles)
    r.kind = 'small'
  }
  const parts = raws.filter((r) => r.parent === null && r.kind === 'part').slice(0, 24)

  // ---- scale
  progress?.('Ověřuji měřítko z kót…')
  const dims = collectDims(collectDimEntities(db))
  const titleTexts = [...texts.map((t) => t.text), ...rawScaleStrings(rawText)]
  const scale = detectScale(dims, db.units, titleTexts)
  const islandBoxes = parts.map((r, id) => ({ ...r.box, id }))
  attachDimsToIslands(dims, islandBoxes)
  if (scale.source === 'units' && scale.dimsTotal > 0) warnings.push(scale.note)
  if (scale.titleHint && scale.source === 'dims' && Math.abs(Number.parseFloat(scale.titleHint.split(':')[1]) - scale.ratio) / scale.ratio > 0.1)
    warnings.push(`Měřítko z kót ${scale.label} nesouhlasí s razítkem ${scale.titleHint}.`)

  // ---- per-island geometry in local mm
  progress?.('Měřím obrysy pohledů…')
  const islands: Island[] = parts.map((r, id) => {
    const own = dims.filter((d) => d.island === id && (d.kind === 'linear' || d.kind === 'aligned')).map((d) => d.ratio)
    let mmPerUnit = scale.mmPerUnit
    let scaleSource: Island['scaleSource'] = scale.source === 'dims' ? 'sheet-dims' : 'units'
    if (own.length >= 2) {
      const med = own.slice().sort((a, b) => a - b)[Math.floor(own.length / 2)]
      const agree = own.filter((v) => Math.abs(v - med) / med < 0.03)
      if (agree.length >= 2 && Math.abs(med - scale.mmPerUnit) / scale.mmPerUnit > 0.03) {
        mmPerUnit = agree.reduce((a, b) => a + b, 0) / agree.length
        scaleSource = 'view-dims'
      }
    }
    const k = mmPerUnit
    const bx = r.box
    const local: Seg4[] = r.segs.map((i) => {
      const s = segs[i]
      return [(s[0] - bx.x0) * k, (s[1] - bx.y0) * k, (s[2] - bx.x0) * k, (s[3] - bx.y0) * k]
    })
    const localCircles = dedupeCircles(r.circles.map((i) => ({ x: (circles[i].x - bx.x0) * k, y: (circles[i].y - bx.y0) * k, r: circles[i].r * k })))
    const width = (bx.x1 - bx.x0) * k
    const height = (bx.y1 - bx.y0) * k
    const span = Math.max(width, height)
    const ringSegs = local.concat(localCircles.flatMap((c) => circleSegs(c, span)))
    let contour: P2[] | null = null
    let method: Island['contourMethod'] = 'graph'
    if (ringSegs.length <= GRAPH_LIMIT) contour = graphOuterContour(ringSegs, Math.max(span * 2e-5, 1e-4))
    // A walk that misses most of the bbox means the outline did not close.
    if (contour && Math.abs(area(contour)) < width * height * 0.02) contour = null
    if (!contour) {
      method = 'raster'
      contour = rasterOuterContour(ringSegs, span)
    }
    if (!contour) {
      method = 'bbox'
      contour = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]
    }
    return {
      id,
      kind: 'part',
      box: bx,
      segments: r.segs.length,
      mmPerUnit,
      scaleSource,
      width,
      height,
      contour,
      contourMethod: method,
      circles: localCircles,
      lines: local.length > 20000 ? local.filter(isAxisSeg) : local,
    }
  })
  const ignored = raws.filter((r) => r.parent === null && r.kind !== 'part')
  const nFrames = ignored.filter((r) => r.kind === 'frame').length
  const nTables = ignored.filter((r) => r.kind === 'table').length
  if (nFrames || nTables) warnings.push(`Ignorováno: ${nFrames}× rám/razítko, ${nTables}× tabulka.`)

  progress?.('Přiřazuji pohledy…')
  const { candidates, confident } = classifyViews(islands)
  if (!candidates.length) warnings.push('Nenašel jsem tři zarovnané pohledy — přiřaďte je ručně.')
  else if (!confident) warnings.push('Přiřazení pohledů není jisté — zkontrolujte je.')
  void unitsInfo
  return {
    fileUnits: db.units,
    scale,
    islands,
    dims,
    candidates,
    assignment: candidates[0] ?? null,
    confident,
    warnings,
    stats: { entities: db.entities.length, segments: segs.length, circles: circles.length, texts: texts.length, ms: Date.now() - t0 },
  }
}

function isAxisSeg(s: Seg4): boolean {
  const len = Math.hypot(s[2] - s[0], s[3] - s[1])
  return Math.abs(s[2] - s[0]) <= len * 0.01 || Math.abs(s[3] - s[1]) <= len * 0.01
}

function circleSegs(c: Hole2, span: number): Seg4[] {
  const n = Math.max(16, Math.min(96, Math.ceil((2 * Math.PI * c.r) / Math.max(span / 300, 1e-6))))
  const out: Seg4[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const b = ((i + 1) / n) * Math.PI * 2
    out.push([c.x + Math.cos(a) * c.r, c.y + Math.sin(a) * c.r, c.x + Math.cos(b) * c.r, c.y + Math.sin(b) * c.r])
  }
  return out
}

function dedupeCircles(list: Hole2[]): Hole2[] {
  const out: Hole2[] = []
  for (const c of list) {
    if (out.some((o) => Math.abs(o.x - c.x) < 1e-3 * (1 + c.r) && Math.abs(o.y - c.y) < 1e-3 * (1 + c.r) && Math.abs(o.r - c.r) < 1e-3 * (1 + c.r))) continue
    out.push(c)
  }
  return out
}

function grow(b: Box2, x: number, y: number) {
  if (x < b.x0) b.x0 = x
  if (x > b.x1) b.x1 = x
  if (y < b.y0) b.y0 = y
  if (y > b.y1) b.y1 = y
}

function boxArea(b: Box2): number {
  return Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0)
}

function contains(outer: Box2, inner: Box2): boolean {
  return inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1 && boxArea(inner) < boxArea(outer)
}

function rawExtents(entities: readonly DxfEntity[]): Box2 {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const e of entities) {
    if (e.x !== undefined && e.y !== undefined) grow(b, e.x, e.y)
    if (e.x2 !== undefined && e.y2 !== undefined) grow(b, e.x2, e.y2)
    if (e.verts) for (const v of e.verts) grow(b, v.x, v.y)
  }
  if (!Number.isFinite(b.x0)) return { x0: 0, y0: 0, x1: 1000, y1: 1000 }
  return b
}

/** "1:20"-like group values anywhere in the file (title blocks are often ACAD_TABLE cells). */
function rawScaleStrings(text: string): string[] {
  const out: string[] = []
  const re = /\n\s*([^\n]{0,40}?\b1\s?:\s?\d{1,4})\s*\r?\n/g
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(text)) && guard++ < 50) {
    const value = m[1].trim()
    if (/^1\s?:\s?\d{1,4}$/.test(value) || /scale|měřítko|meritko/i.test(value)) out.push(value)
  }
  return out
}

/** DIMENSION entities from model space and inserted blocks, transformed to world coordinates. */
function collectDimEntities(db: DxfDb): DxfEntity[] {
  const out: DxfEntity[] = []
  type Xf = (x: number, y: number) => [number, number]
  const visit = (entities: readonly DxfEntity[], xf: Xf, depth: number, stack: Set<string>, rotDeg: number) => {
    for (const e of entities) {
      if (e.type === 'DIMENSION' && e.dim) {
        const p = (q: { x: number; y: number }) => {
          const [x, y] = xf(q.x, q.y)
          return { x, y }
        }
        out.push({ ...e, dim: { ...e.dim, angle: (e.dim.angle ?? 0) + rotDeg, p10: p(e.dim.p10), p13: p(e.dim.p13), p14: p(e.dim.p14), p15: p(e.dim.p15) } })
      } else if (e.type === 'INSERT' && depth < 4) {
        const block = db.blocks.get(e.name ?? '')
        if (!block || stack.has(block.name) || block.name.startsWith('*D')) continue
        const rot = ((e.rotation ?? 0) * Math.PI) / 180
        const cos = Math.cos(rot)
        const sin = Math.sin(rot)
        const sx = e.sx ?? 1
        const sy = e.sy ?? 1
        const ox = e.x ?? 0
        const oy = e.y ?? 0
        const child: Xf = (x, y) => {
          const dx = (x - block.baseX) * sx
          const dy = (y - block.baseY) * sy
          return xf(dx * cos - dy * sin + ox, dx * sin + dy * cos + oy)
        }
        stack.add(block.name)
        visit(block.entities, child, depth + 1, stack, rotDeg + (e.rotation ?? 0))
        stack.delete(block.name)
      }
    }
  }
  visit(db.entities, (x, y) => [x, y], 0, new Set(), 0)
  return out
}
