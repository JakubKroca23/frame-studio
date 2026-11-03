import { bodyTypeFromTrwCode, accKindFromCode } from './trwFormatCodes'
import { posNum } from './chassisMeasured'

/**
 * Tolerant parsers for trw/config@1: legacy `body`, schema `bodies[]`, `acc_accessories`, `accessories[]`, `stability`.
 * All x values are converted to configurator coordinates (x - x0, x0 = first axle in trw coordinates).
 * y = lateral (trw y_mm → three.js Z), z/height = up.
 */

export type BodyType = 'flatbed' | 'tipper' | 'hooklift' | 'other'

export interface ExtBody {
  type: BodyType
  /** Raw type string from the export (null if missing). */
  typeRaw: string | null
  /** BODYDATA / BODYDATA_A / HOOK / … when from `bodies[]`. */
  sourceSection?: string | null
  xFrom: number | null
  xTo: number | null
  length: number | null
  width: number | null
  height: number | null
  sideHeight: number | null
  massKg: number | null
  cog: { x: number | null; y: number | null; z: number | null }
}

export interface ExtAccessory {
  name: string
  /** Crane outrigger beam positions (left/right leg x), configurator coords. */
  xLeft?: number | null
  xRight?: number | null
  kind: string | null
  isOutrigger: boolean
  x: number | null
  xFrom: number | null
  xTo: number | null
  y: number | null
  length: number | null
  width: number | null
  height: number | null
  massKg: number | null
  cog: { x: number | null; y: number | null; z: number | null }
  outline: string | null
  reachLeft: number | null
  reachRight: number | null
  /** Rotation about vertical axis [deg] when trw exports it. */
  yawDeg: number | null
  /** Lateral / longitudinal offset [mm] when exported. */
  offsetX: number | null
  offsetY: number | null
}

export interface ExtPoint { x: number; y: number }
export interface ExtReaction {
  kind: 'outrigger' | 'wheel' | 'other'
  id: string
  x: number | null
  y: number | null
  side: 'left' | 'right' | null
  kN: number | null
}
export interface ExtStabilityAngle {
  angleDeg: number
  factor: number | null
  pass: boolean | null
  tippingLines: [ExtPoint, ExtPoint][]
  reactions: ExtReaction[]
}
export interface ExtStability {
  angles: ExtStabilityAngle[]
  /** Overall pass: false if any angle fails, true if all known pass, null if unknown. */
  pass: boolean | null
  /** Always false until verified against CraneWIN (export may set verified: true). */
  verified: boolean
  /** stability.min_factor from trw (worst over all tipping lines) or min over angles as fallback. */
  minFactor: number | null
  /** stability.required_n (required stability factor). */
  requiredN: number | null
}

export interface TrwExtended {
  body?: ExtBody
  /** All superstructure bodies (primary `body` plus `bodies[]` / BODYDATA_*); deduplicated. */
  bodies?: ExtBody[]
  accessories?: ExtAccessory[]
  stability?: ExtStability
  /** Reason why stability is missing (stability_fields.evidence when stability is null). */
  stabilityNote?: string
  /** stability and stability_fields both null → vehicle has no crane. */
  noCrane?: boolean
  /** Crane + its outriggers from accessories[] (not drawn here; used to place reactions). */
  craneAccessories?: ExtAccessory[]
}

type Obj = Record<string, unknown>
/** Values may be wrapped as {value, status, source}. */
const unwrap = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Obj) ? (v as Obj).value : v)
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v0: unknown): number | null => {
  const v = unwrap(v0)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'))
  return null
}
const str = (v0: unknown): string | null => { const v = unwrap(v0); return typeof v === 'string' && v.trim() ? v.trim() : null }
/** First numeric value among the keys. */
const pickNum = (o: Obj, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = num(o[k])
    if (v != null) return v
  }
  return null
}
const pickStr = (o: Obj, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = str(o[k])
    if (v != null) return v
  }
  return null
}
const pickBool = (o: Obj, ...keys: string[]): boolean | null => {
  for (const k of keys) {
    const v = unwrap(o[k])
    if (typeof v === 'boolean') return v
    if (v === 1 || v === 0) return v === 1
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase()
      if (['pass', 'ok', 'true', 'yes', 'vyhovuje', 'ano'].includes(s)) return true
      if (['fail', 'nok', 'false', 'no', 'nevyhovuje', 'ne'].includes(s)) return false
    }
  }
  return null
}
/** Field names that trw marks as `neznámé` (not contained in the .trw), from `fields` / per-value status. */
export function unknownFields(o: Obj): Set<string> {
  const out = new Set<string>()
  for (const [k, f] of Object.entries(obj(o.fields))) if (/^nezn/i.test(String(obj(f).status ?? ''))) out.add(k)
  for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && 'value' in (v as Obj) && /^nezn/i.test(String((v as Obj).status ?? ''))) out.add(k)
  return out
}
const isUnknown = (u: Set<string>, ...keys: string[]) => keys.some((k) => u.has(k) || u.has(k.replace(/_mm$/, '')))
const sub = (v: number | null, x0: number) => (v == null ? null : v - x0)

export const BODY_TYPE_LABEL: Record<BodyType, string> = { flatbed: 'valník', tipper: 'sklápěč', hooklift: 'hákový nosič', other: 'nástavba' }

export function normalizeBodyType(raw: string | null): BodyType {
  const fromCode = bodyTypeFromTrwCode(raw)
  if (fromCode) return fromCode
  const trimmed = (raw ?? '').trim()
  const s = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/flat|valnik|platform|plato|dropside|stake/.test(s)) return 'flatbed'
  if (/tip|sklap|dump|kipper/.test(s)) return 'tipper'
  if (/hook|hak|abroll|roll.?off|multilift|ampliroll/.test(s)) return 'hooklift'
  return 'other'
}

/** COG from cog_x_mm/cog_y_mm/cog_z_mm, cog: number (x), or cog: { x_mm|x, y_mm|y, z_mm|z|h_mm }. */
function parseCog(o: Obj, x0: number) {
  const c = o.cog ?? o.cog_mm ?? o.center_of_gravity
  const co = obj(c)
  const x = pickNum(o, 'cog_x_mm', 'cog_x', 'x_cog_mm') ?? num(c) ?? pickNum(co, 'x_mm', 'x')
  const y = pickNum(o, 'cog_y_mm', 'cog_y') ?? pickNum(co, 'y_mm', 'y')
  const z = pickNum(o, 'cog_z_mm', 'cog_z', 'cog_h_mm') ?? pickNum(co, 'z_mm', 'z', 'h_mm', 'height_mm')
  return { x: sub(x, x0), y, z }
}

function range(o: Obj) {
  const from = pickNum(o, 'x_from_mm', 'x_from', 'from_mm', 'x_start_mm', 'x_min_mm')
  const to = pickNum(o, 'x_to_mm', 'x_to', 'to_mm', 'x_end_mm', 'x_max_mm')
  return { from, to }
}

function dims(o: Obj) {
  const d = obj(o.dimensions ?? o.dims ?? o.size)
  const insd = obj(o.insd ?? o.INSD)
  const hook = obj(o.hook ?? o.HOOK)
  const vtxy = obj(o.vtxy ?? o.VTXY)
  const so = obj(o.side_walls ?? o.sides ?? o.bocnice)
  const all = { ...d, ...insd, ...hook, ...vtxy, ...so, ...o }
  return {
    length: posNum(all.length_mm) ?? posNum(all.length) ?? pickNum(all, 'l_mm', 'L_mm'),
    width: posNum(all.width_mm) ?? pickNum(all, 'width', 'w_mm', 'B_mm'),
    height: posNum(all.height_mm) ?? pickNum(all, 'height', 'h_mm', 'H_mm'),
    sideHeight: posNum(all.side_height_mm) ?? pickNum(all, 'side_wall_height_mm', 'sidewall_height_mm', 'side_height', 'bocnice_mm', 'bocnice') ?? pickNum(so, 'height_mm', 'height'),
    hookHeight: posNum(all.hook_height_mm) ?? pickNum(hook, 'hook_height_mm', 'HH_mm'),
  }
}

/** One entry from export `bodies[]` (trw PR #27 schema). */
export function parseConfigBody(v: unknown, x0: number, warnings: string[] = [], unknown: string[] = []): ExtBody | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Obj
  const u = unknownFields(o)
  const quiet = (label: string, ...keys: string[]) => (isUnknown(u, ...keys) ? (unknown.push(label), true) : false)
  const sourceSection = pickStr(o, 'source_section', 'section')
  const typeRaw = pickStr(o, 'type', 'kind', 'body_type', 'category')
  let type = normalizeBodyType(typeRaw)
  if (/^hook$/i.test(sourceSection ?? '') && type === 'other') type = 'hooklift'
  const from = posNum(o.x_from_mm) ?? pickNum(o, 'x_from', 'from_mm', 'x_start_mm', 'x_min_mm')
  const to = posNum(o.x_to_mm) ?? pickNum(o, 'x_to', 'to_mm', 'x_end_mm', 'x_max_mm')
  const d = dims(o)
  let xFrom = sub(from, x0)
  let xTo = sub(to, x0)
  if (xFrom != null && xTo != null && xTo < xFrom) [xFrom, xTo] = [xTo, xFrom]
  if (xFrom != null && xTo == null && d.length != null) xTo = xFrom + d.length
  if (xTo != null && xFrom == null && d.length != null) xFrom = xTo - d.length
  const length = d.length ?? (xFrom != null && xTo != null ? xTo - xFrom : null)
  const massKg = posNum(o.mass_kg) ?? pickNum(o, 'mass', 'weight_kg')
  const b: ExtBody = {
    type,
    typeRaw,
    sourceSection,
    xFrom,
    xTo,
    length,
    width: d.width,
    height: d.height,
    sideHeight: d.sideHeight,
    massKg,
    cog: parseCog(o, x0),
  }
  if (!typeRaw) warnings.push('Typ nástavby chybí – zobrazen obecný kvádr.')
  else if (type === 'other') warnings.push(`Typ nástavby „${typeRaw}“ není v tabulce typů – zobrazen obecný kvádr.`)
  if (xFrom == null || xTo == null) warnings.push('Poloha nástavby (x od/do) chybí – nástavba nezobrazena.')
  if (d.width == null && !quiet('šířka nástavby', 'width_mm')) warnings.push('Šířka nástavby chybí – použito 2500 mm.')
  if (type === 'flatbed' && b.sideHeight == null && !quiet('výška bočnic', 'side_height_mm')) warnings.push('Výška bočnic valníku chybí – použito 400 mm.')
  if (massKg == null) warnings.push('Hmotnost nástavby chybí.')
  if (b.cog.x == null) warnings.push('Těžiště nástavby chybí.')
  if (b.cog.x != null && (b.cog.y == null || b.cog.z == null)) unknown.push('těžiště nástavby y/z')
  return b
}

export function parseBody(v: unknown, x0: number, warnings: string[] = [], unknown: string[] = []): ExtBody | undefined {
  return parseConfigBody(v, x0, warnings, unknown)
}

const OUTRIGGER_RE = /outrigger|podper|stabiliz|support.?leg/i

export function parseAccessory(v: unknown, i: number, x0: number, warnings: string[] = [], unknown: string[] = []): ExtAccessory {
  const o = obj(v)
  const u = unknownFields(o)
  const kind = pickStr(o, 'kind', 'type', 'category')
  const name = pickStr(o, 'name', 'label', 'title') ?? kind ?? `příslušenství ${i + 1}`
  const norm = `${kind ?? ''} ${name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const reach = obj(o.reach ?? o.reach_mm)
  const reachLeft = pickNum(o, 'reach_left_mm', 'reach_left', 'left_reach_mm', 'spread_left_mm') ?? pickNum(reach, 'left_mm', 'left')
  const reachRight = pickNum(o, 'reach_right_mm', 'reach_right', 'right_reach_mm', 'spread_right_mm') ?? pickNum(reach, 'right_mm', 'right')
  const spread = pickNum(o, 'spread_mm', 'reach_mm')
  const isOutrigger = OUTRIGGER_RE.test(norm) || reachLeft != null || reachRight != null
  const pos = obj(o.position ?? o.pos)
  const { from, to } = range({ ...pos, ...o })
  const cog = parseCog(o, x0)
  let xFrom = sub(from, x0)
  let xTo = sub(to, x0)
  if (xFrom != null && xTo != null && xTo < xFrom) [xFrom, xTo] = [xTo, xFrom]
  const xRaw = pickNum(o, 'x_mm', 'x') ?? pickNum(pos, 'x_mm', 'x') ?? num(o.position)
  const x = sub(xRaw, x0) ?? cog.x ?? (xFrom != null && xTo != null ? (xFrom + xTo) / 2 : xFrom ?? xTo)
  const d = dims(o)
  const outlineO = obj(o.outline)
  const a: ExtAccessory = {
    name,
    xLeft: sub(pickNum(o, 'x_left_mm'), x0),
    xRight: sub(pickNum(o, 'x_right_mm'), x0),
    kind,
    isOutrigger,
    x,
    xFrom,
    xTo,
    y: pickNum(o, 'y_mm', 'y') ?? pickNum(pos, 'y_mm', 'y'),
    length: d.length ?? (xFrom != null && xTo != null ? xTo - xFrom : null),
    width: d.width,
    height: d.height,
    massKg: pickNum(o, 'mass_kg', 'mass', 'weight_kg'),
    cog,
    outline: pickStr(o, 'outline_svg_url', 'outline_url', 'outline_ref', 'outline_id', 'outline') ?? pickStr(outlineO, 'url', 'svg_url', 'id', 'ref'),
    reachLeft: reachLeft ?? (spread != null ? spread / 2 : null),
    reachRight: reachRight ?? (spread != null ? spread / 2 : null),
    yawDeg: pickNum(o, 'yaw_deg', 'yaw', 'rotation_deg', 'angle_deg') ?? pickNum(pos, 'yaw_deg', 'yaw'),
    offsetX: sub(pickNum(o, 'offset_x_mm', 'offset_x'), x0) ?? pickNum(o, 'dx_mm'),
    offsetY: pickNum(o, 'offset_y_mm', 'offset_y', 'offset_z_mm') ?? pickNum(pos, 'offset_y_mm'),
  }
  const massUnknown = a.massKg == null && isUnknown(u, 'mass_kg')
  if (massUnknown) unknown.push(`hmotnost „${name}“`)
  const miss = [a.x == null ? 'polohu' : null, a.massKg == null && !massUnknown ? 'hmotnost' : null].filter(Boolean)
  if (miss.length) warnings.push(`Příslušenství „${name}“ nemá ${miss.join(' ani ')}${a.x == null ? ' – nezobrazeno' : ''}.`)
  const reachUnknown = isUnknown(u, 'reach_left_mm', 'reach_right_mm')
  if (isOutrigger && (a.reachLeft == null || a.reachRight == null) && reachUnknown) unknown.push(`vyložení „${name}“`)
  else if (isOutrigger && (a.reachLeft == null || a.reachRight == null)) warnings.push(`Podpěra „${name}“ nemá vyložení na ${a.reachLeft == null && a.reachRight == null ? 'obě strany' : a.reachLeft == null ? 'levou stranu' : 'pravou stranu'}.`)
  return a
}

const kindOf = (v: unknown) => (pickStr(obj(v), 'kind') ?? '').toLowerCase()

/**
 * Splits accessories[] per doc: crane first (kind "crane"), then its outriggers (kind "outrigger",
 * with x_left_mm/x_right_mm; other accessories carry x_to_mm instead), then the other accessories. Crane + crane outriggers are returned
 * separately (they are drawn by the existing crane/outrigger markers).
 */
export function splitAccessories(v: unknown[]): { crane: unknown[]; other: unknown[] } {
  const crane: unknown[] = []
  const other: unknown[] = []
  let afterCrane = false
  for (const a of v) {
    const k = kindOf(a)
    const o = obj(a)
    if (k === 'crane') {
      crane.push(a)
      afterCrane = true
    } else if (k === 'outrigger' && ('x_left_mm' in o || 'x_right_mm' in o || (afterCrane && !('x_to_mm' in o)))) crane.push(a)
    else {
      afterCrane = false
      other.push(a)
    }
  }
  return { crane, other }
}

export function parseAccessories(v: unknown, x0: number, warnings: string[] = [], unknown: string[] = [], craneOut?: ExtAccessory[]): ExtAccessory[] | undefined {
  if (v == null) return undefined
  if (!Array.isArray(v)) {
    warnings.push('Blok příslušenství (accessories) není seznam – ignorován.')
    return undefined
  }
  const { crane, other } = splitAccessories(v)
  if (craneOut) craneOut.push(...crane.map((a, i) => parseAccessory(a, i, x0, [], [])))
  return other.map((a, i) => parseAccessory(a, i, x0, warnings, unknown))
}

/** Schema `acc_accessories[]` (trw PR #27) — placement via x_to_mm + offsets, no lateral y field. */
export function parseAccAccessories(v: unknown, x0: number, warnings: string[] = []): ExtAccessory[] {
  if (v == null) return []
  if (!Array.isArray(v)) {
    warnings.push('acc_accessories není seznam – ignorováno.')
    return []
  }
  return v.map((item, i) => {
    const o = obj(item)
    const code = pickStr(o, 'code')
    const name = pickStr(o, 'name') ?? code ?? `doplňek ${i + 1}`
    const length = posNum(o.length_mm)
    const width = posNum(o.width_mm)
    const height = posNum(o.height_mm)
    const xToTrw = posNum(o.x_to_mm)
    const offsetXTrw = posNum(o.offset_x_mm)
    const offsetZ = posNum(o.offset_z_mm)
    const yawDeg = num(o.yaw_deg)
    let xTrw = xToTrw
    if (xTrw != null && length != null) xTrw = xTrw - length / 2
    if (xTrw != null && offsetXTrw != null) xTrw += offsetXTrw
    else if (xTrw == null && offsetXTrw != null) xTrw = offsetXTrw
    const x = xTrw == null ? null : xTrw - x0
    const xTo = xToTrw == null ? null : xToTrw - x0
    const xFrom = xTo != null && length != null ? xTo - length : null
    return {
      name,
      kind: accKindFromCode(code),
      isOutrigger: false,
      x,
      xFrom,
      xTo,
      y: offsetZ,
      length,
      width,
      height,
      massKg: null,
      cog: { x, y: offsetZ, z: null },
      outline: null,
      reachLeft: null,
      reachRight: null,
      yawDeg,
      offsetX: offsetXTrw == null ? null : offsetXTrw,
      offsetY: offsetZ,
    } satisfies ExtAccessory
  })
}

function parsePoint(v: unknown, x0: number): ExtPoint | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0])
    const y = num(v[1])
    return x != null && y != null ? { x: x - x0, y } : null
  }
  const o = obj(v)
  const x = pickNum(o, 'x_mm', 'x')
  const y = pickNum(o, 'y_mm', 'y')
  return x != null && y != null ? { x: x - x0, y } : null
}

function parseLine(v: unknown, x0: number): [ExtPoint, ExtPoint] | null {
  let a: unknown, b: unknown
  if (Array.isArray(v)) [a, b] = v
  else {
    const o = obj(v)
    if (Array.isArray(o.points)) [a, b] = o.points
    else {
      a = o.a ?? o.p1 ?? o.from ?? o.start
      b = o.b ?? o.p2 ?? o.to ?? o.end
    }
  }
  const pa = parsePoint(a, x0)
  const pb = parsePoint(b, x0)
  return pa && pb ? [pa, pb] : null
}

function parseReaction(v: unknown, i: number, x0: number): ExtReaction {
  const o = obj(v)
  const k = (pickStr(o, 'kind', 'type') ?? '').toLowerCase()
  const kind: ExtReaction['kind'] = /outrigger|podper|leg/.test(k) ? 'outrigger' : /wheel|kolo|axle|naprav/.test(k) ? 'wheel' : 'other'
  const s = (pickStr(o, 'side') ?? '').toLowerCase()
  const side = /^(l|left|lev)/.test(s) ? 'left' : /^(r|right|prav|p$)/.test(s) ? 'right' : null
  const id = pickStr(o, 'id', 'name', 'label') ?? (num(o.id) != null ? String(o.id) : `${kind}-${i + 1}`)
  return { kind, id, x: sub(pickNum(o, 'x_mm', 'x'), x0), y: pickNum(o, 'y_mm', 'y'), side, kN: pickNum(o, 'kN', 'kn', 'force_kN', 'force_kn', 'reaction_kN', 'value_kN', 'F_kN') }
}

export function parseStability(v: unknown, x0: number, warnings: string[] = [], crane: ExtAccessory[] = []): ExtStability | undefined {
  if (v == null) return undefined
  let list: unknown = v
  let root: Obj = {}
  if (!Array.isArray(v)) {
    root = obj(v)
    list = root.angles ?? root.by_angle ?? root.slew ?? root.cases ?? root.results
  }
  if (!Array.isArray(list)) {
    warnings.push('Stabilita: chybí seznam úhlů natočení (angles / by_angle).')
    return { angles: [], pass: null, verified: false, minFactor: pickNum(root, 'min_factor'), requiredN: pickNum(root, 'required_n') }
  }
  const angles: ExtStabilityAngle[] = []
  let dropped = 0
  // Angle-independent reactions (doc: stability.reactions[]); placed by crane outrigger x_left/x_right when x missing.
  // Crane outrigger = the one with reach/x_left (y_mm = centreline offset); extra outriggers (MAXISTAB) have y/reach null.
  const all = crane.filter((a) => a.isOutrigger || (a.kind ?? '').toLowerCase() === 'outrigger')
  const legs = [...all.filter((a) => a.reachLeft != null || a.reachRight != null || a.xLeft != null || a.xRight != null), ...all]
  const rootReactions = (Array.isArray(root.reactions) ? root.reactions : []).map((r, i) => {
    const re = parseReaction(r, i, x0)
    if (re.x == null && re.side) {
      const leg = legs[0]
      re.x = (re.side === 'left' ? leg?.xLeft : leg?.xRight) ?? leg?.x ?? null
    }
    if (re.y == null && re.side) {
      const leg = legs[0]
      const reach = re.side === 'left' ? leg?.reachLeft : leg?.reachRight
      const yc = leg?.y ?? 0
      if (reach != null) re.y = re.side === 'left' ? yc - Math.abs(reach) : yc + Math.abs(reach)
    }
    return re
  })
  for (const item of list) {
    const o = obj(item)
    const angleDeg = pickNum(o, 'angle_deg', 'angle', 'slew_deg', 'slew_angle_deg', 'deg')
    if (angleDeg == null) {
      dropped++
      continue
    }
    const factor = pickNum(o, 'factor', 'stability_factor', 'k', 'safety_factor', 'sf')
    const lines = (Array.isArray(o.tipping_lines) ? o.tipping_lines : Array.isArray(o.tipping_edges) ? o.tipping_edges : Array.isArray(o.lines) ? o.lines : [])
      .map((l) => parseLine(l, x0))
      .filter((l): l is [ExtPoint, ExtPoint] => !!l)
    const reactions = Array.isArray(o.reactions) ? o.reactions.map((r, i) => parseReaction(r, i, x0)) : rootReactions
    angles.push({ angleDeg, factor, pass: pickBool(o, 'pass', 'ok', 'passed', 'result', 'status'), tippingLines: lines, reactions })
  }
  angles.sort((a, b) => a.angleDeg - b.angleDeg)
  if (dropped) warnings.push(`Stabilita: ${dropped} položek bez úhlu natočení vynecháno.`)
  if (!angles.length) warnings.push('Stabilita: žádný platný úhel natočení.')
  const noPass = angles.filter((a) => a.pass == null).length
  if (noPass) warnings.push(`Stabilita: ${noPass} úhlů bez výsledku vyhovuje/nevyhovuje.`)
  if (angles.some((a) => a.factor == null)) warnings.push('Stabilita: u některých úhlů chybí součinitel stability.')
  if (angles.length && angles.every((a) => !a.tippingLines.length)) warnings.push('Stabilita: klopné hrany chybí.')
  if (angles.length && angles.every((a) => !a.reactions.length)) warnings.push('Stabilita: reakce na podpěrách chybí.')
  const rootPass = pickBool(root, 'pass', 'ok', 'passed')
  const anglePass = angles.some((a) => a.pass === false) || rootPass === false ? false : angles.length && angles.every((a) => a.pass === true) ? true : rootPass
  const pass = rootPass ?? anglePass
  const status = (pickStr(root, 'status') ?? '').toLowerCase()
  const verified = root.verified === true || root.verified_cranewin === true || (/^ověřeno/.test(status) && !/^neověř/.test(status))
  if (!verified) warnings.push('Stabilita z trw není ověřena proti CraneWIN.')
  const fs = angles.map((a) => a.factor).filter((f): f is number => f != null)
  const minFactor = pickNum(root, 'min_factor') ?? (fs.length ? Math.min(...fs) : null)
  return { angles, pass, verified, minFactor, requiredN: pickNum(root, 'required_n', 'required_factor') }
}

/** Entry with the angle nearest to `deg` (circular distance). */
export function nearestAngle(st: ExtStability | undefined, deg: number): ExtStabilityAngle | null {
  if (!st?.angles.length) return null
  const dist = (a: number) => {
    const d = Math.abs((((a - deg) % 360) + 360) % 360)
    return Math.min(d, 360 - d)
  }
  return st.angles.reduce((best, a) => (dist(a.angleDeg) < dist(best.angleDeg) ? a : best))
}

export function dedupeAccessories(list: ExtAccessory[]): ExtAccessory[] {
  const seen = new Set<string>()
  return list.filter((a) => {
    const k = `${a.kind ?? ''}|${a.name}|${a.x ?? ''}|${a.xFrom ?? ''}|${a.xTo ?? ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Bodies to draw (deduplicated x-range + type). */
export function extendedBodies(ext: TrwExtended): ExtBody[] {
  if (ext.bodies?.length) return ext.bodies
  return ext.body ? [ext.body] : []
}

function bodyKey(b: ExtBody) {
  return `${b.type}|${b.typeRaw ?? ''}|${b.xFrom ?? ''}|${b.xTo ?? ''}|${b.length ?? ''}`
}

function mergeBodies(list: ExtBody[]): ExtBody[] {
  const out: ExtBody[] = []
  const seen = new Set<string>()
  for (const b of list) {
    const k = bodyKey(b)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(b)
  }
  return out
}

const BODYDATA_KEYS = ['BODYDATA_A', 'BODYDATA_B', 'BODYDATA_B2', 'bodydata_a', 'bodydata_b', 'bodydata_b2'] as const

/** Parses the extended blocks of a trw export. Returns undefined when none of them is present. */
export function mapExtended(data: unknown, x0: number, warnings: string[] = []): TrwExtended | undefined {
  const t = obj(data)
  const ext: TrwExtended = {}
  const unknown: string[] = []
  const crane: ExtAccessory[] = []
  const bodyList: ExtBody[] = []
  try {
    if (Array.isArray(t.bodies)) {
      for (const item of t.bodies) {
        const b = parseConfigBody(item, x0, warnings, unknown)
        if (b) bodyList.push(b)
      }
    } else {
      const body = parseBody(t.body, x0, warnings, unknown)
      if (body) bodyList.push(body)
      for (const k of BODYDATA_KEYS) {
        if (t[k] != null) {
          const b = parseBody(t[k], x0, warnings, unknown)
          if (b) bodyList.push(b)
        }
      }
    }
    const merged = mergeBodies(bodyList)
    if (merged.length) {
      ext.body = merged[0]
      ext.bodies = merged
    }
  } catch {
    warnings.push('Blok nástavby (body) nelze přečíst.')
  }
  try {
    const accLegacy = parseAccessories(t.accessories, x0, warnings, unknown, crane) ?? []
    const accSchema = parseAccAccessories(t.acc_accessories, x0, warnings)
    const acc = dedupeAccessories([...accLegacy, ...accSchema])
    if (crane.length) ext.craneAccessories = crane
    if (acc.length) ext.accessories = acc
  } catch {
    warnings.push('Blok příslušenství nelze přečíst.')
  }
  try {
    const st = parseStability(t.stability, x0, warnings, crane)
    if (st) ext.stability = st
    else {
      const f = obj(t.stability_fields)
      const note = pickStr(f, 'evidence', 'note', 'reason') ?? pickStr(obj(t.stability), 'evidence')
      if (note) ext.stabilityNote = note
      else if (t.stability === null && t.stability_fields === null) ext.noCrane = true
    }
  } catch {
    warnings.push('Blok stability nelze přečíst.')
  }
  if (unknown.length) warnings.push(`trw uvádí, že .trw neobsahuje: ${[...new Set(unknown)].join(', ')} – použity výchozí hodnoty.`)
  return ext.body || ext.bodies || ext.accessories || ext.stability || ext.stabilityNote || ext.noCrane ? ext : undefined
}

const fmtK = (n: number) => n.toFixed(2).replace('.', ',')
/** e.g. "k_min 1,32 / požadováno 1,25 – vyhovuje" (parts omitted when unknown). */
export function stabilitySummary(st: ExtStability): string {
  const parts: string[] = []
  if (st.minFactor != null) parts.push(`k_min ${fmtK(st.minFactor)}`)
  if (st.requiredN != null) parts.push(`požadováno ${fmtK(st.requiredN)}`)
  let s = parts.join(' / ')
  if (st.pass != null) s += `${s ? ' – ' : ''}${st.pass ? 'vyhovuje' : 'nevyhovuje'}`
  return s
}
