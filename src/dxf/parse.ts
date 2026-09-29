import type { DxfBlock, DxfDb, DxfEntity } from './types'

interface Bag {
  type: string
  layer: string
  n: Map<number, number[]>
  s: Map<number, string[]>
}

const NUM_CODES = new Set([
  10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 40, 41, 42, 43, 50, 51, 70, 71, 72, 73, 74,
])

/**
 * ASCII DXF reader (R12–R2018 group codes). Heavy polylines, splines and
 * ellipses are kept structured so a later pass can tessellate them.
 * This is the browser-side stand-in for the server parser in the design doc.
 */
export function parseDxf(text: string): DxfDb {
  if (!looksLikeDxf(text)) {
    throw new Error('Soubor nevypadá jako textový DXF.')
  }
  const db: DxfDb = {
    version: '',
    units: 0,
    blocks: new Map(),
    entities: [],
    layers: new Set(),
    textSamples: [],
  }

  let mode: 'none' | 'header' | 'blocks' | 'entities' = 'none'
  let headerKey = ''
  let currentBlock: DxfBlock | null = null
  let bag: Bag | null = null
  let poly: { layer: string; flags: number; verts: { x: number; y: number; bulge: number }[] } | null = null

  const finish = () => {
    if (!bag) return
    const finished = bag
    bag = null
    if (finished.type === 'SECTION') return
    if (finished.type === 'BLOCK') {
      const name = str(finished, 2) || 'UNNAMED'
      currentBlock = {
        name,
        baseX: num(finished, 10) ?? 0,
        baseY: num(finished, 20) ?? 0,
        layer: finished.layer || '0',
        entities: [],
      }
      db.blocks.set(name, currentBlock)
      return
    }
    if (finished.type === 'POLYLINE') {
      poly = { layer: finished.layer || '0', flags: num(finished, 70) ?? 0, verts: [] }
      return
    }
    if (finished.type === 'VERTEX' && poly) {
      poly.verts.push({
        x: num(finished, 10) ?? 0,
        y: num(finished, 20) ?? 0,
        bulge: num(finished, 42) ?? 0,
      })
      return
    }
    if (finished.type === 'SEQEND' && poly) {
      const entity: DxfEntity = {
        type: 'POLYLINE',
        layer: poly.layer,
        verts: poly.verts,
        closed: (poly.flags & 1) === 1,
      }
      pushEntity(db, mode, currentBlock, entity)
      poly = null
      return
    }
    const entity = entityFromBag(finished)
    if (entity) {
      if (entity.text) db.textSamples.push(entity.text)
      pushEntity(db, mode, currentBlock, entity)
    }
  }

  let i = 0
  const n = text.length
  const nextLine = (): string | null => {
    if (i >= n) return null
    let j = text.indexOf('\n', i)
    if (j < 0) j = n
    let line = text.slice(i, j)
    if (line.endsWith('\r')) line = line.slice(0, -1)
    i = j + 1
    return line
  }

  while (i < n) {
    const codeLine = nextLine()
    if (codeLine === null) break
    const valueLine = nextLine()
    if (valueLine === null) break
    const code = Number.parseInt(codeLine.trim(), 10)
    if (!Number.isFinite(code)) continue
    const value = valueLine.trim()

    if (mode === 'header') {
      if (code === 9) headerKey = value
      else if (headerKey === '$ACADVER' && code === 1) db.version = value
      else if (headerKey === '$INSUNITS' && code === 70) db.units = Number.parseInt(value, 10) || 0
      else if (code === 0 && value === 'ENDSEC') {
        mode = 'none'
        headerKey = ''
      }
      if (code === 0 && value !== 'ENDSEC') {
        /* header ended without ENDSEC being the only code 0; fall through */
      } else {
        continue
      }
    }

    if (code === 0) {
      finish()
      if (value === 'EOF') break
      if (value === 'ENDSEC') {
        mode = 'none'
        currentBlock = null
        poly = null
        continue
      }
      if (value === 'ENDBLK') {
        currentBlock = null
        poly = null
        continue
      }
      bag = { type: value, layer: '0', n: new Map(), s: new Map() }
      continue
    }

    if (!bag) continue
    if (bag.type === 'SECTION' && code === 2) {
      if (value === 'HEADER') mode = 'header'
      else if (value === 'BLOCKS') mode = 'blocks'
      else if (value === 'ENTITIES') mode = 'entities'
      else mode = 'none'
      bag = null
      continue
    }
    if (code === 8) {
      bag.layer = value || '0'
      if (value) db.layers.add(value)
    } else if (NUM_CODES.has(code)) {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) {
        let arr = bag.n.get(code)
        if (!arr) {
          arr = []
          bag.n.set(code, arr)
        }
        arr.push(parsed)
      }
    } else if (code === 1 || code === 2 || code === 3 || code === 7) {
      let arr = bag.s.get(code)
      if (!arr) {
        arr = []
        bag.s.set(code, arr)
      }
      arr.push(value)
    }
  }
  finish()
  return db
}

function pushEntity(db: DxfDb, mode: string, block: DxfBlock | null, entity: DxfEntity) {
  if (entity.layer) db.layers.add(entity.layer)
  if (mode === 'blocks' && block) block.entities.push(entity)
  else if (mode === 'entities') db.entities.push(entity)
}

function entityFromBag(bag: Bag): DxfEntity | null {
  const layer = bag.layer || '0'
  switch (bag.type) {
    case 'LINE':
      return {
        type: 'LINE',
        layer,
        x: num(bag, 10) ?? 0,
        y: num(bag, 20) ?? 0,
        x2: num(bag, 11) ?? 0,
        y2: num(bag, 21) ?? 0,
      }
    case 'CIRCLE':
      return { type: 'CIRCLE', layer, x: num(bag, 10) ?? 0, y: num(bag, 20) ?? 0, r: num(bag, 40) ?? 0 }
    case 'ARC':
      return {
        type: 'ARC',
        layer,
        x: num(bag, 10) ?? 0,
        y: num(bag, 20) ?? 0,
        r: num(bag, 40) ?? 0,
        a0: num(bag, 50) ?? 0,
        a1: num(bag, 51) ?? 0,
      }
    case 'TEXT':
    case 'MTEXT':
    case 'ATTRIB': {
      const chunks = [...(bag.s.get(3) ?? []), ...(bag.s.get(1) ?? [])]
      const text = chunks.join('')
      const halign = num(bag, 72) ?? 0
      const valign = num(bag, 73) ?? 0
      const useAlign = (halign !== 0 || valign !== 0) && bag.n.has(11)
      return {
        type: 'TEXT',
        layer,
        text,
        x: useAlign ? (num(bag, 11) ?? 0) : (num(bag, 10) ?? 0),
        y: useAlign ? (num(bag, 21) ?? 0) : (num(bag, 20) ?? 0),
        rotation: num(bag, 50) ?? 0,
      }
    }
    case 'INSERT':
      return {
        type: 'INSERT',
        layer,
        name: str(bag, 2) || '',
        x: num(bag, 10) ?? 0,
        y: num(bag, 20) ?? 0,
        sx: num(bag, 41) ?? 1,
        sy: num(bag, 42) ?? 1,
        rotation: num(bag, 50) ?? 0,
      }
    case 'ELLIPSE':
      return {
        type: 'ELLIPSE',
        layer,
        x: num(bag, 10) ?? 0,
        y: num(bag, 20) ?? 0,
        mx: num(bag, 11) ?? 0,
        my: num(bag, 21) ?? 0,
        ratio: num(bag, 40) ?? 1,
        a0: num(bag, 41) ?? 0,
        a1: num(bag, 42) ?? Math.PI * 2,
      }
    case 'SPLINE': {
      const xs = bag.n.get(10) ?? []
      const ys = bag.n.get(20) ?? []
      const ws = bag.n.get(41) ?? []
      const fxs = bag.n.get(11) ?? []
      const fys = bag.n.get(21) ?? []
      return {
        type: 'SPLINE',
        layer,
        degree: num(bag, 71) ?? 3,
        knots: bag.n.get(40) ?? [],
        controls: xs.map((x, i) => ({ x, y: ys[i] ?? 0, w: ws[i] ?? 1 })),
        fits: fxs.map((x, i) => ({ x, y: fys[i] ?? 0 })),
      }
    }
    default:
      return null
  }
}

function num(bag: Bag, code: number): number | undefined {
  return bag.n.get(code)?.[0]
}

function str(bag: Bag, code: number): string | undefined {
  return bag.s.get(code)?.[0]
}

function looksLikeDxf(text: string): boolean {
  const head = text.slice(0, 400)
  return head.includes('SECTION') && (head.includes('HEADER') || head.includes('ENTITIES') || head.includes('BLOCKS'))
}
