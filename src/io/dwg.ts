import type { DwgDatabase } from '@mlightcad/libredwg-web'

const SUPPORTED = ['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032'] as const

const VERSION_NAME: Record<string, string> = {
  AC1009: 'AutoCAD R12',
  AC1012: 'AutoCAD R13',
  AC1014: 'AutoCAD R14',
  AC1015: 'AutoCAD 2000',
  AC1018: 'AutoCAD 2004',
  AC1021: 'AutoCAD 2007',
  AC1024: 'AutoCAD 2010',
  AC1027: 'AutoCAD 2013',
  AC1032: 'AutoCAD 2018',
}

const CRITICAL = 128 | 256 | 512 | 1024 | 2048 | 4096 | 8192

/**
 * LibreDWG 0.13.3 reports a clean read on some large R2004/R2018 drawings and
 * still drops whole stretches of geometry (section-map bug). Those files go
 * through the bundled 0.13.4 reader first.
 */
const LARGE_DWG = 4 * 1024 * 1024

/**
 * Read a DWG in the browser via LibreDWG (WASM) and hand the existing DXF pipeline a text file.
 * The shipped WASM reads AutoCAD 2000–2018 (AC1015–AC1032). R13/R14 are attempted.
 * Writing DWG is not part of this build; test files are produced with the LibreDWG dxf2dwg CLI (R2000).
 */
export async function dwgBytesToDxf(bytes: Uint8Array): Promise<string> {
  const header = ascii(bytes.subarray(0, 6))
  if (!header.startsWith('AC')) {
    throw new Error('Soubor nevypadá jako DWG. Čtečka očekává AutoCAD 2000 až 2018.')
  }
  if (!isAttemptable(header)) {
    throw new Error(versionError(header))
  }
  if (bytes.byteLength > LARGE_DWG) {
    const rich = await tryFiltered(bytes)
    if (rich) return rich
  }
  const lib = await openLibre()
  const api = lib as unknown as WasmDwg
  const fileName = `in-${Date.now()}.dwg`
  api.FS.writeFile(fileName, bytes)
  let data = 0
  let error = 0
  try {
    const result = api.dwg_read_file(fileName)
    data = result?.data ?? 0
    error = result?.error ?? 0
  } finally {
    try {
      api.FS.unlink(fileName)
    } catch {
      /* already removed */
    }
  }
  if (!data || error & CRITICAL || error & 2) {
    if (data) lib.dwg_free(data)
    return filteredOrThrow(bytes, header)
  }
  try {
    const db = lib.convert(data)
    const text = databaseToDxf(db, header)
    if (!text.includes('ENTITIES')) return filteredOrThrow(bytes, header)
    return text
  } catch {
    return filteredOrThrow(bytes, header)
  } finally {
    lib.dwg_free(data)
  }
}

async function tryFiltered(bytes: Uint8Array): Promise<string | null> {
  const { filteredDwgToDxf } = await import('./dwgFilter')
  const text = await filteredDwgToDxf(bytes)
  return text?.includes('ENTITIES') ? text : null
}

async function filteredOrThrow(bytes: Uint8Array, header: string): Promise<string> {
  const text = await tryFiltered(bytes)
  if (text) return text
  throw new Error(versionError(header))
}

function isAttemptable(header: string) {
  return SUPPORTED.includes(header as (typeof SUPPORTED)[number]) || header === 'AC1012' || header === 'AC1014'
}

function versionError(header: string) {
  const name = VERSION_NAME[header] ?? 'neznámá verze'
  return `Soubor DWG ve verzi ${name} (${header}) se nepodařilo přečíst. Prohlížeč umí AutoCAD 2000 až 2018 (AC1015–AC1032).`
}

async function openLibre() {
  const { LibreDwg } = await import('@mlightcad/libredwg-web')
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process
  const inNode = !!proc?.versions?.node && typeof window === 'undefined'
  if (!inNode) return LibreDwg.create()
  // The published bundle replaces node:module with an empty Vite external, so Node uses the raw wasm glue.
  const glue = new URL('../../node_modules/@mlightcad/libredwg-web/wasm/libredwg-web.js', import.meta.url)
  const loaded = (await import(/* @vite-ignore */ glue.href)) as { default: (options: { locateFile: (file: string) => string }) => Promise<never> }
  const wasm = await loaded.default({
    locateFile: (file) => new URL(file, new URL('./', glue)).href,
  })
  return LibreDwg.createByWasmInstance(wasm)
}

interface WasmDwg {
  FS: {
    writeFile: (name: string, data: Uint8Array) => void
    unlink: (name: string) => void
  }
  dwg_read_file: (name: string) => { error: number; data: number }
}

type Ent = {
  type?: string
  layer?: string
  isInPaperSpace?: boolean
  [key: string]: unknown
}

export function databaseToDxf(db: DwgDatabase, fallbackVersion: string): string {
  const header = db.header?.ACADVER || fallbackVersion || 'AC1015'
  const units = db.header?.INSUNITS ?? 4
  const lines: string[] = []
  const push = (code: number, value: string | number) => {
    lines.push(String(code))
    lines.push(String(value))
  }
  push(0, 'SECTION')
  push(2, 'HEADER')
  push(9, '$ACADVER')
  push(1, header)
  push(9, '$INSUNITS')
  push(70, units)
  push(0, 'ENDSEC')
  push(0, 'SECTION')
  push(2, 'BLOCKS')
  const blocks = new Map<string, (typeof db.tables.BLOCK_RECORD.entries)[number]>()
  for (const block of db.tables?.BLOCK_RECORD?.entries ?? []) {
    const name = block.name || ''
    if (!name || isSpace(name)) continue
    const prev = blocks.get(name)
    if (!prev || (block.entities?.length ?? 0) > (prev.entities?.length ?? 0)) blocks.set(name, block)
  }
  const minLine = entityCount(db) > 100000 ? 8 : 0
  for (const block of blocks.values()) {
    const name = block.name || ''
    push(0, 'BLOCK')
    push(8, '0')
    push(2, name)
    push(70, block.flags ?? 0)
    push(10, block.basePoint?.x ?? 0)
    push(20, block.basePoint?.y ?? 0)
    push(30, block.basePoint?.z ?? 0)
    push(3, name)
    for (const entity of block.entities ?? []) emitEntity(push, entity as unknown as Ent, minLine)
    push(0, 'ENDBLK')
  }
  push(0, 'ENDSEC')
  push(0, 'SECTION')
  push(2, 'ENTITIES')
  for (const entity of db.entities ?? []) emitEntity(push, entity as unknown as Ent, minLine)
  push(0, 'ENDSEC')
  push(0, 'EOF')
  return lines.join('\n')
}

function isSpace(name: string) {
  const upper = name.toUpperCase()
  return upper === '*MODEL_SPACE' || upper === '*PAPER_SPACE' || upper.startsWith('*PAPER_SPACE')
}

function entityCount(db: DwgDatabase) {
  let count = db.entities?.length ?? 0
  for (const block of db.tables?.BLOCK_RECORD?.entries ?? []) count += block.entities?.length ?? 0
  return count
}

function emitEntity(push: (code: number, value: string | number) => void, entity: Ent, minLine = 0) {
  if (!entity?.type || entity.isInPaperSpace) return
  const layer = entity.layer || '0'
  switch (entity.type) {
    case 'LINE': {
      const start = pt(entity.startPoint)
      const end = pt(entity.endPoint)
      if (minLine > 0 && Math.hypot(end.x - start.x, end.y - start.y) < minLine) break
      push(0, 'LINE')
      push(8, layer)
      push(10, start.x)
      push(20, start.y)
      push(11, end.x)
      push(21, end.y)
      break
    }
    case 'CIRCLE': {
      const center = pt(entity.center)
      push(0, 'CIRCLE')
      push(8, layer)
      push(10, center.x)
      push(20, center.y)
      push(40, num(entity.radius))
      break
    }
    case 'ARC': {
      const center = pt(entity.center)
      push(0, 'ARC')
      push(8, layer)
      push(10, center.x)
      push(20, center.y)
      push(40, num(entity.radius))
      push(50, deg(num(entity.startAngle)))
      push(51, deg(num(entity.endAngle)))
      break
    }
    case 'TEXT':
      emitText(push, layer, entity)
      break
    case 'MTEXT': {
      const at = pt(entity.insertionPoint)
      push(0, 'MTEXT')
      push(8, layer)
      push(10, at.x)
      push(20, at.y)
      push(1, plain(String(entity.text ?? '')))
      push(50, deg(num(entity.rotation)))
      break
    }
    case 'ATTRIB': {
      const text = (entity.text ?? {}) as Ent
      emitText(push, layer, { ...text, text: text.text ?? entity.attrTag ?? '' })
      break
    }
    case 'INSERT': {
      const at = pt(entity.insertionPoint)
      push(0, 'INSERT')
      push(8, layer)
      push(2, String(entity.name ?? ''))
      push(10, at.x)
      push(20, at.y)
      push(41, num(entity.xScale, 1))
      push(42, num(entity.yScale, 1))
      push(50, deg(num(entity.rotation)))
      const attribs = Array.isArray(entity.attribs) ? (entity.attribs as Ent[]) : []
      for (const attrib of attribs) {
        const text = (attrib.text ?? {}) as Ent
        emitText(push, attrib.layer || layer, { ...text, text: text.text ?? attrib.attrTag ?? '' })
      }
      break
    }
    case 'LWPOLYLINE':
    case 'POLYLINE2D':
    case 'POLYLINE3D': {
      const verts = vertices(entity)
      if (verts.length < 2) break
      const closed = (num(entity.flag) & 1) === 1
      push(0, 'LWPOLYLINE')
      push(8, layer)
      push(90, verts.length)
      push(70, closed ? 1 : 0)
      for (const vert of verts) {
        push(10, vert.x)
        push(20, vert.y)
        push(42, vert.bulge)
      }
      break
    }
    case 'ELLIPSE': {
      const center = pt(entity.center)
      const major = pt(entity.majorAxisEndPoint)
      push(0, 'ELLIPSE')
      push(8, layer)
      push(10, center.x)
      push(20, center.y)
      push(11, major.x)
      push(21, major.y)
      push(40, num(entity.axisRatio, 1))
      push(41, num(entity.startAngle))
      push(42, num(entity.endAngle, Math.PI * 2))
      break
    }
    case 'SPLINE': {
      const controls = Array.isArray(entity.controlPoints) ? (entity.controlPoints as Ent[]) : []
      const knots = Array.isArray(entity.knots) ? (entity.knots as number[]) : []
      const fits = Array.isArray(entity.fitPoints) ? (entity.fitPoints as Ent[]) : []
      push(0, 'SPLINE')
      push(8, layer)
      push(71, num(entity.degree, 3))
      for (const knot of knots) push(40, knot)
      for (const point of controls) {
        const p = pt(point)
        push(10, p.x)
        push(20, p.y)
      }
      for (const point of fits) {
        const p = pt(point)
        push(11, p.x)
        push(21, p.y)
      }
      break
    }
    case 'DIMENSION': {
      const text = plain(String(entity.text ?? ''))
      const measure = num(entity.measurement, NaN)
      const label = text && text !== '<>' ? text : Number.isFinite(measure) ? String(Math.round(measure * 1000) / 1000) : ''
      if (!label) break
      const at = pt(entity.textPoint ?? entity.definitionPoint)
      push(0, 'DIMENSION')
      push(8, layer)
      push(10, at.x)
      push(20, at.y)
      push(1, label)
      if (Number.isFinite(measure)) push(42, measure)
      break
    }
    case 'HATCH': {
      const paths = Array.isArray(entity.boundaryPaths) ? (entity.boundaryPaths as Ent[]) : []
      for (const path of paths) {
        const verts = hatchVerts(path)
        if (verts.length < 3) continue
        push(0, 'HATCH')
        push(8, layer)
        push(70, 1)
        for (const vert of verts) {
          push(10, vert.x)
          push(20, vert.y)
        }
      }
      break
    }
    default:
      break
  }
}

function emitText(push: (code: number, value: string | number) => void, layer: string, entity: Ent) {
  const text = plain(String(entity.text ?? ''))
  if (!text) return
  const at = pt(entity.startPoint ?? entity.insertionPoint)
  const align = pt(entity.endPoint)
  const halign = num(entity.halign)
  const valign = num(entity.valign)
  push(0, 'TEXT')
  push(8, layer)
  push(10, at.x)
  push(20, at.y)
  push(40, num(entity.textHeight, 2.5))
  push(1, text)
  push(50, deg(num(entity.rotation)))
  if (halign || valign) {
    push(11, align.x)
    push(21, align.y)
    push(72, halign)
    push(73, valign)
  }
}

function vertices(entity: Ent): { x: number; y: number; bulge: number }[] {
  const raw = (entity.vertices ?? entity.points ?? []) as Ent[]
  if (!Array.isArray(raw)) return []
  return raw.map((vert) => {
    const p = pt(vert.position ?? vert.point ?? vert)
    return { x: p.x, y: p.y, bulge: num(vert.bulge) }
  })
}

function hatchVerts(path: Ent): { x: number; y: number }[] {
  if (Array.isArray(path.vertices)) {
    return (path.vertices as Ent[]).map((vert) => pt(vert))
  }
  const edges = Array.isArray(path.edges) ? (path.edges as Ent[]) : []
  const pts: { x: number; y: number }[] = []
  for (const edge of edges) {
    if (edge.start) pts.push(pt(edge.start))
    if (edge.end) pts.push(pt(edge.end))
    if (edge.center && edge.radius) {
      const c = pt(edge.center)
      const r = num(edge.radius)
      pts.push({ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y })
    }
  }
  return pts
}

function pt(value: unknown): { x: number; y: number; z: number } {
  if (value && typeof value === 'object') {
    const point = value as { x?: number; y?: number; z?: number }
    return { x: num(point.x), y: num(point.y), z: num(point.z) }
  }
  return { x: 0, y: 0, z: 0 }
}

function num(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** LibreDWG stores ARC/TEXT/INSERT angles in radians. DXF group 50 is degrees. */
function deg(radians: number) {
  return (radians * 180) / Math.PI
}

function plain(text: string) {
  return text
    .replace(/\\P/gi, ' ')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .trim()
}

function ascii(bytes: Uint8Array) {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i])
  return out
}
