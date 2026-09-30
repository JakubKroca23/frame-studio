import { layerMatches } from '../lib/geom'
import { tessellateArc, tessellateBulge, tessellateCircle, tessellateEllipse, tessellateSpline } from './tessellate'
import type { ArcRec, Circ, DxfDb, DxfEntity, FlatDrawing, Loop, Txt } from './types'

const TOL = 0.5
const CORE_IGNORE_BLOCKS = new Set(['PREL', 'PRELIM', 'PRELIMINARY'])

export interface HoleFrameFix {
  /** Layer globs of the 1:10 hole inserts. */
  layers: string[]
  /** Insert names that live in that local frame. */
  name: RegExp
  /** World = insert * scale + offset. Taken from a reference insert such as the cab. */
  scale: number
  ox: number
  oy: number
}

export interface FlattenOptions {
  ignoreBlocks?: string[]
  /** Regular expressions matched against block names. */
  ignoreBlockPatterns?: string[]
  ignoreLayers?: string[]
  /** Skip curve/line geometry on these layers (texts are kept). */
  geometryIgnoreLayers?: string[]
  holeFix?: HoleFrameFix
  /** World-millimetre chord tolerance. Insert scale is divided out. */
  curveTolerance?: number
  /** Skip line segments shorter than this. Circles and texts stay. */
  minSegment?: number
}

/**
 * Recursively explodes INSERTs. Entities on layer 0 inherit the insert layer.
 * Block contents keep their own semantic layer — inserts themselves are usually on 0.
 */
export function flatten(db: DxfDb, options: FlattenOptions = {}): FlatDrawing {
  const ignoreBlocks = new Set([...CORE_IGNORE_BLOCKS, ...(options.ignoreBlocks ?? [])])
  const ignoreBlockRes = (options.ignoreBlockPatterns ?? []).map((pattern) => new RegExp(pattern))
  const ignoredName = (name: string) => ignoreBlocks.has(name) || ignoreBlockRes.some((re) => re.test(name))
  const ignoreLayers = new Set(options.ignoreLayers ?? [])
  const geometryIgnore = new Set(options.geometryIgnoreLayers ?? [])
  const holeFix = options.holeFix
  const worldTol = options.curveTolerance ?? TOL
  const minSegment = options.minSegment ?? 0
  const flat: FlatDrawing = {
    version: db.version,
    units: db.units,
    segments: [],
    circles: [],
    arcs: [],
    texts: [],
    layers: new Map(),
    blockInserts: [],
    inserts: [],
    loops: [],
  }
  const stack = new Set<string>()

  const emitSeg = (layer: string, x1: number, y1: number, x2: number, y2: number, block: string) => {
    if (ignoreLayers.has(layer)) return
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 0.05 || (minSegment > 0 && len < minSegment)) return
    flat.segments.push({ layer, x1, y1, x2, y2, block })
    flat.layers.set(layer, (flat.layers.get(layer) ?? 0) + 1)
  }

  const emitPoly = (layer: string, pts: { x: number; y: number }[], block: string) => {
    for (let i = 1; i < pts.length; i++) emitSeg(layer, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, block)
  }

  const visit = (
    entity: DxfEntity,
    xf: (x: number, y: number) => [number, number],
    parentLayer: string,
    rootBlock: string,
    depth: number,
    scale: number,
    rotDeg: number,
  ) => {
    const localTol = worldTol / Math.max(scale, 1e-6)
    const layer = !entity.layer || entity.layer === '0' ? parentLayer : entity.layer
    if (entity.type !== 'INSERT' && entity.type !== 'TEXT' && entity.type !== 'DIMENSION' && geometryIgnore.has(layer)) return
    switch (entity.type) {
      case 'LINE': {
        const [x1, y1] = xf(entity.x ?? 0, entity.y ?? 0)
        const [x2, y2] = xf(entity.x2 ?? 0, entity.y2 ?? 0)
        emitSeg(layer, x1, y1, x2, y2, rootBlock)
        break
      }
      case 'CIRCLE': {
        const r = (entity.r ?? 0) * scale
        if (!(r > 0)) break
        const [x, y] = xf(entity.x ?? 0, entity.y ?? 0)
        if (ignoreLayers.has(layer)) break
        const circ: Circ = { layer, x, y, r, block: rootBlock }
        flat.circles.push(circ)
        flat.layers.set(layer, (flat.layers.get(layer) ?? 0) + 1)
        if (r >= 15 && r < 2500) emitPoly(layer, tessellateCircle(x, y, r, worldTol), rootBlock)
        break
      }
      case 'ARC': {
        const r = (entity.r ?? 0) * scale
        if (!(r > 0)) break
        const [cx, cy] = xf(entity.x ?? 0, entity.y ?? 0)
        const a0 = (entity.a0 ?? 0) + rotDeg
        const a1 = (entity.a1 ?? 0) + rotDeg
        if (!ignoreLayers.has(layer)) {
          const arc: ArcRec = { layer, cx, cy, r, a0, a1, block: rootBlock }
          flat.arcs.push(arc)
        }
        emitPoly(layer, tessellateArc(cx, cy, r, a0, a1, worldTol), rootBlock)
        break
      }
      case 'POLYLINE': {
        const verts = entity.verts ?? []
        if (verts.length < 2) break
        const worldVerts = verts.map((vert) => {
          const [x, y] = xf(vert.x, vert.y)
          return { x, y, bulge: vert.bulge }
        })
        const count = entity.closed ? worldVerts.length : worldVerts.length - 1
        for (let i = 0; i < count; i++) {
          const a = worldVerts[i]
          const b = worldVerts[(i + 1) % worldVerts.length]
          emitPoly(layer, tessellateBulge(a.x, a.y, b.x, b.y, a.bulge || 0, worldTol), rootBlock)
        }
        if (entity.closed) recordLoop(flat.loops, worldVerts, layer, rootBlock)
        break
      }
      case 'HATCH': {
        const verts = (entity.verts ?? []).map((vert) => {
          const [x, y] = xf(vert.x, vert.y)
          return { x, y }
        })
        recordLoop(flat.loops, verts, layer, rootBlock)
        break
      }
      case 'DIMENSION': {
        if (!entity.text || ignoreLayers.has(layer)) break
        if (!/[LHW]\d{3}/i.test(entity.text)) break
        const [x, y] = xf(entity.x ?? 0, entity.y ?? 0)
        flat.texts.push({
          layer,
          x,
          y,
          text: entity.text,
          rotation: entity.rotation ?? 0,
          block: rootBlock,
        })
        break
      }
      case 'ELLIPSE': {
        const [cx, cy] = xf(entity.x ?? 0, entity.y ?? 0)
        const [mxp, myp] = xf(entity.mx ?? 0, entity.my ?? 0)
        const [ox, oy] = xf(0, 0)
        const pts = tessellateEllipse(
          cx,
          cy,
          mxp - ox,
          myp - oy,
          entity.ratio ?? 1,
          entity.a0 ?? 0,
          entity.a1 ?? Math.PI * 2,
          localTol,
        )
        emitPoly(layer, pts, rootBlock)
        break
      }
      case 'SPLINE': {
        const local = tessellateSpline(
          {
            degree: entity.degree ?? 3,
            knots: entity.knots ?? [],
            controls: (entity.controls ?? []).map((c) => ({ x: c.x, y: c.y, w: c.w ?? 1 })),
            fits: entity.fits ?? [],
          },
          localTol,
        )
        const world = local.map((p) => {
          const [x, y] = xf(p.x, p.y)
          return { x, y }
        })
        emitPoly(layer, world, rootBlock)
        break
      }
      case 'TEXT': {
        if (!entity.text || ignoreLayers.has(layer)) break
        const [x, y] = xf(entity.x ?? 0, entity.y ?? 0)
        const txt: Txt = {
          layer,
          x,
          y,
          text: entity.text,
          rotation: entity.rotation ?? 0,
          block: rootBlock,
        }
        flat.texts.push(txt)
        break
      }
      case 'INSERT': {
        if (depth > 6) break
        const name = entity.name || ''
        if (!name || ignoredName(name) || stack.has(name)) break
        const block = db.blocks.get(name)
        if (!block) break
        let sx = entity.sx ?? 1
        let sy = entity.sy ?? 1
        let ox = entity.x ?? 0
        let oy = entity.y ?? 0
        let rot = entity.rotation ?? 0
        if (depth === 0 && holeFix && layerMatches(layer, holeFix.layers) && holeFix.name.test(name)) {
          sx = holeFix.scale
          sy = holeFix.scale
          ox = (entity.x ?? 0) * holeFix.scale + holeFix.ox
          oy = (entity.y ?? 0) * holeFix.scale + holeFix.oy
          rot = 0
        }
        stack.add(name)
        const child = makeTransform(ox, oy, rot, sx, sy, block.baseX, block.baseY, xf)
        const childRoot = rootBlock || name
        const childScale = scale * Math.abs(sx)
        const childRot = rotDeg + rot
        for (const ent of block.entities) visit(ent, child, layer, childRoot, depth + 1, childScale, childRot)
        stack.delete(name)
        break
      }
      default:
        break
    }
  }

  for (const entity of db.entities) {
    if (entity.type === 'INSERT') {
      const name = entity.name || ''
      if (name && !ignoredName(name)) {
        flat.blockInserts.push(name)
        flat.inserts.push({
          name,
          layer: entity.layer || '0',
          x: entity.x ?? 0,
          y: entity.y ?? 0,
          sx: entity.sx ?? 1,
          sy: entity.sy ?? 1,
        })
      }
    }
    visit(entity, (x, y) => [x, y], entity.layer || '0', '', 0, 1, 0)
  }
  return flat
}

function recordLoop(loops: Loop[], pts: { x: number; y: number }[], layer: string, block: string) {
  if (pts.length < 3) return
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const point of pts) {
    x0 = Math.min(x0, point.x)
    y0 = Math.min(y0, point.y)
    x1 = Math.max(x1, point.x)
    y1 = Math.max(y1, point.y)
  }
  if (x1 - x0 < 20 || y1 - y0 < 20) return
  loops.push({ layer, block, x0, y0, x1, y1 })
}

function makeTransform(
  ox: number,
  oy: number,
  rotDeg: number,
  sx: number,
  sy: number,
  bx: number,
  by: number,
  parent: (x: number, y: number) => [number, number],
): (x: number, y: number) => [number, number] {
  const rot = rotDeg * (Math.PI / 180)
  const hasRot = Math.abs(rot) > 1e-10
  const cos = hasRot ? Math.cos(rot) : 1
  const sin = hasRot ? Math.sin(rot) : 0
  const hasScale = Math.abs(sx - 1) > 1e-10 || Math.abs(sy - 1) > 1e-10
  return (x, y) => {
    let dx = x - bx
    let dy = y - by
    if (hasScale) {
      dx *= sx
      dy *= sy
    }
    if (hasRot) {
      const rx = dx * cos - dy * sin
      const ry = dx * sin + dy * cos
      dx = rx
      dy = ry
    }
    return parent(dx + ox, dy + oy)
  }
}
