import { tessellateArc, tessellateBulge, tessellateCircle, tessellateEllipse, tessellateSpline } from './tessellate'
import type { ArcRec, Circ, DxfDb, DxfEntity, FlatDrawing, Txt } from './types'

const TOL = 0.5
const CORE_IGNORE_BLOCKS = new Set(['PREL', 'PRELIM', 'PRELIMINARY'])

export interface FlattenOptions {
  ignoreBlocks?: string[]
  ignoreLayers?: string[]
  /** Skip curve/line geometry on these layers (texts are kept). */
  geometryIgnoreLayers?: string[]
}

/**
 * Recursively explodes INSERTs. Entities on layer 0 inherit the insert layer.
 * Block contents keep their own semantic layer — inserts themselves are usually on 0.
 */
export function flatten(db: DxfDb, options: FlattenOptions = {}): FlatDrawing {
  const ignoreBlocks = new Set([...CORE_IGNORE_BLOCKS, ...(options.ignoreBlocks ?? [])])
  const ignoreLayers = new Set(options.ignoreLayers ?? [])
  const geometryIgnore = new Set(options.geometryIgnoreLayers ?? [])
  const flat: FlatDrawing = {
    version: db.version,
    units: db.units,
    segments: [],
    circles: [],
    arcs: [],
    texts: [],
    layers: new Map(),
    blockInserts: [],
  }
  const stack = new Set<string>()

  const emitSeg = (layer: string, x1: number, y1: number, x2: number, y2: number, block: string) => {
    if (ignoreLayers.has(layer)) return
    if (Math.hypot(x2 - x1, y2 - y1) < 0.05) return
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
  ) => {
    const layer = !entity.layer || entity.layer === '0' ? parentLayer : entity.layer
    if (entity.type !== 'INSERT' && entity.type !== 'TEXT' && geometryIgnore.has(layer)) return
    switch (entity.type) {
      case 'LINE': {
        const [x1, y1] = xf(entity.x ?? 0, entity.y ?? 0)
        const [x2, y2] = xf(entity.x2 ?? 0, entity.y2 ?? 0)
        emitSeg(layer, x1, y1, x2, y2, rootBlock)
        break
      }
      case 'CIRCLE': {
        const r = entity.r ?? 0
        if (!(r > 0)) break
        const [x, y] = xf(entity.x ?? 0, entity.y ?? 0)
        if (ignoreLayers.has(layer)) break
        const circ: Circ = { layer, x, y, r, block: rootBlock }
        flat.circles.push(circ)
        flat.layers.set(layer, (flat.layers.get(layer) ?? 0) + 1)
        if (r >= 15 && r < 2500) emitPoly(layer, tessellateCircle(x, y, r, TOL), rootBlock)
        break
      }
      case 'ARC': {
        const r = entity.r ?? 0
        if (!(r > 0)) break
        const [cx, cy] = xf(entity.x ?? 0, entity.y ?? 0)
        if (!ignoreLayers.has(layer)) {
          const arc: ArcRec = {
            layer,
            cx,
            cy,
            r,
            a0: entity.a0 ?? 0,
            a1: entity.a1 ?? 0,
            block: rootBlock,
          }
          flat.arcs.push(arc)
        }
        emitPoly(layer, tessellateArc(cx, cy, r, entity.a0 ?? 0, entity.a1 ?? 0, TOL), rootBlock)
        break
      }
      case 'POLYLINE': {
        const verts = entity.verts ?? []
        if (verts.length < 2) break
        const count = entity.closed ? verts.length : verts.length - 1
        for (let i = 0; i < count; i++) {
          const a = verts[i]
          const b = verts[(i + 1) % verts.length]
          const [x1, y1] = xf(a.x, a.y)
          const [x2, y2] = xf(b.x, b.y)
          emitPoly(layer, tessellateBulge(x1, y1, x2, y2, a.bulge || 0, TOL), rootBlock)
        }
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
          TOL,
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
          TOL,
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
        if (!name || ignoreBlocks.has(name) || stack.has(name)) break
        const block = db.blocks.get(name)
        if (!block) break
        stack.add(name)
        const child = makeTransform(
          entity.x ?? 0,
          entity.y ?? 0,
          entity.rotation ?? 0,
          entity.sx ?? 1,
          entity.sy ?? 1,
          block.baseX,
          block.baseY,
          xf,
        )
        const childRoot = rootBlock || name
        for (const ent of block.entities) visit(ent, child, layer, childRoot, depth + 1)
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
      if (name && !ignoreBlocks.has(name)) flat.blockInserts.push(name)
    }
    visit(entity, (x, y) => [x, y], entity.layer || '0', '', 0)
  }
  return flat
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
