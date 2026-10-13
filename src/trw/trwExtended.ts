/**
 * Tolerant parsers for the upcoming trw/config@1 extensions: `body` (typ nástavby), `accessories[]`
 * and `stability` (per slew angle). The exact schema is not delivered yet, so several plausible field
 * spellings are accepted. Nothing here throws; missing key values produce Czech warnings.
 * All x values are converted to configurator coordinates (x - x0, x0 = first axle in trw coordinates).
 * y = lateral (trw y_mm → three.js Z), z/height = up.
 */

export type BodyType = 'flatbed' | 'tipper' | 'hooklift' | 'other'

export interface ExtBody {
  type: BodyType
  /** Raw type string from the export (null if missing). */
  typeRaw: string | null
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
  minFactor: number | null
}

export interface TrwExtended {
  body?: ExtBody
  accessories?: ExtAccessory[]
  stability?: ExtStability
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(',', '.')))) return Number(v.replace(',', '.'))
  return null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
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
    const v = o[k]
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
const sub = (v: number | null, x0: number) => (v == null ? null : v - x0)

export const BODY_TYPE_LABEL: Record<BodyType, string> = { flatbed: 'valník', tipper: 'sklápěč', hooklift: 'hákový nosič', other: 'nástavba' }

export function normalizeBodyType(raw: string | null): BodyType {
  const s = (raw ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  const all = { ...d, ...o }
  return {
    length: pickNum(all, 'length_mm', 'length', 'l_mm', 'L_mm'),
    width: pickNum(all, 'width_mm', 'width', 'w_mm', 'B_mm'),
    height: pickNum(all, 'height_mm', 'height', 'h_mm', 'H_mm'),
  }
}

export function parseBody(v: unknown, x0: number, warnings: string[] = []): ExtBody | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const o = v as Obj
  const typeRaw = pickStr(o, 'type', 'kind', 'body_type', 'category')
  const type = normalizeBodyType(typeRaw)
  const { from, to } = range(o)
  const d = dims(o)
  let xFrom = sub(from, x0)
  let xTo = sub(to, x0)
  if (xFrom != null && xTo != null && xTo < xFrom) [xFrom, xTo] = [xTo, xFrom]
  if (xFrom != null && xTo == null && d.length != null) xTo = xFrom + d.length
  if (xTo != null && xFrom == null && d.length != null) xFrom = xTo - d.length
  const length = d.length ?? (xFrom != null && xTo != null ? xTo - xFrom : null)
  const so = obj(o.side_walls ?? o.sides ?? o.bocnice)
  const sideHeight = pickNum(o, 'side_height_mm', 'side_wall_height_mm', 'sidewall_height_mm', 'side_height', 'bocnice_mm', 'bocnice') ?? pickNum(so, 'height_mm', 'height')
  const massKg = pickNum(o, 'mass_kg', 'mass', 'weight_kg')
  const b: ExtBody = { type, typeRaw, xFrom, xTo, length, width: d.width, height: d.height, sideHeight, massKg, cog: parseCog(o, x0) }
  if (!typeRaw) warnings.push('Typ nástavby chybí – zobrazen obecný kvádr.')
  else if (type === 'other') warnings.push(`Typ nástavby „${typeRaw}“ není rozpoznán – zobrazen obecný kvádr.`)
  if (xFrom == null || xTo == null) warnings.push('Poloha nástavby (x od/do) chybí – nástavba nezobrazena.')
  if (d.width == null) warnings.push('Šířka nástavby chybí – použito 2500 mm.')
  if (type === 'flatbed' && sideHeight == null) warnings.push('Výška bočnic valníku chybí – použito 400 mm.')
  if (massKg == null || massKg <= 0) warnings.push('Hmotnost nástavby chybí.')
  if (b.cog.x == null) warnings.push('Těžiště nástavby chybí.')
  return b
}

const OUTRIGGER_RE = /outrigger|podper|stabiliz|support.?leg/i

export function parseAccessory(v: unknown, i: number, x0: number, warnings: string[] = []): ExtAccessory {
  const o = obj(v)
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
  }
  const miss = [a.x == null ? 'polohu' : null, a.massKg == null ? 'hmotnost' : null].filter(Boolean)
  if (miss.length) warnings.push(`Příslušenství „${name}“ nemá ${miss.join(' ani ')}${a.x == null ? ' – nezobrazeno' : ''}.`)
  if (isOutrigger && (a.reachLeft == null || a.reachRight == null)) warnings.push(`Podpěra „${name}“ nemá vyložení na ${a.reachLeft == null && a.reachRight == null ? 'obě strany' : a.reachLeft == null ? 'levou stranu' : 'pravou stranu'}.`)
  return a
}

export function parseAccessories(v: unknown, x0: number, warnings: string[] = []): ExtAccessory[] | undefined {
  if (v == null) return undefined
  if (!Array.isArray(v)) {
    warnings.push('Blok příslušenství (accessories) není seznam – ignorován.')
    return undefined
  }
  return v.map((a, i) => parseAccessory(a, i, x0, warnings))
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

export function parseStability(v: unknown, x0: number, warnings: string[] = []): ExtStability | undefined {
  if (v == null) return undefined
  let list: unknown = v
  let root: Obj = {}
  if (!Array.isArray(v)) {
    root = obj(v)
    list = root.angles ?? root.by_angle ?? root.slew ?? root.cases ?? root.results
  }
  if (!Array.isArray(list)) {
    warnings.push('Stabilita: chybí seznam úhlů natočení (angles / by_angle).')
    return { angles: [], pass: null, verified: false, minFactor: null }
  }
  const angles: ExtStabilityAngle[] = []
  let dropped = 0
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
    const reactions = (Array.isArray(o.reactions) ? o.reactions : []).map((r, i) => parseReaction(r, i, x0))
    angles.push({ angleDeg, factor, pass: pickBool(o, 'pass', 'ok', 'passed', 'result', 'status'), tippingLines: lines, reactions })
  }
  angles.sort((a, b) => a.angleDeg - b.angleDeg)
  if (dropped) warnings.push(`Stabilita: ${dropped} položek bez úhlu natočení vynecháno.`)
  if (!angles.length) warnings.push('Stabilita: žádný platný úhel natočení.')
  const noPass = angles.filter((a) => a.pass == null).length
  if (noPass) warnings.push(`Stabilita: ${noPass} úhlů bez výsledku vyhovuje/nevyhovuje.`)
  if (angles.some((a) => a.factor == null)) warnings.push('Stabilita: u některých úhlů chybí součinitel stability.')
  if (angles.length && angles.every((a) => !a.tippingLines.length)) warnings.push('Stabilita: klopné hrany chybí.')
  if (angles.length && angles.every((a) => !a.reactions.length)) warnings.push('Stabilita: reakce na podpěrách a kolech chybí.')
  const rootPass = pickBool(root, 'pass', 'ok', 'passed')
  const pass = angles.some((a) => a.pass === false) || rootPass === false ? false : angles.length && angles.every((a) => a.pass === true) ? true : rootPass
  const verified = root.verified === true || root.verified_cranewin === true
  if (!verified) warnings.push('Stabilita z trw není ověřena proti CraneWIN.')
  const fs = angles.map((a) => a.factor).filter((f): f is number => f != null)
  return { angles, pass, verified, minFactor: fs.length ? Math.min(...fs) : null }
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

/** Parses the extended blocks of a trw export. Returns undefined when none of them is present. */
export function mapExtended(data: unknown, x0: number, warnings: string[] = []): TrwExtended | undefined {
  const t = obj(data)
  const ext: TrwExtended = {}
  try {
    const body = parseBody(t.body, x0, warnings)
    if (body) ext.body = body
  } catch {
    warnings.push('Blok nástavby (body) nelze přečíst.')
  }
  try {
    const acc = parseAccessories(t.accessories, x0, warnings)
    if (acc) ext.accessories = acc
  } catch {
    warnings.push('Blok příslušenství nelze přečíst.')
  }
  try {
    const st = parseStability(t.stability, x0, warnings)
    if (st) ext.stability = st
  } catch {
    warnings.push('Blok stability nelze přečíst.')
  }
  return ext.body || ext.accessories || ext.stability ? ext : undefined
}
