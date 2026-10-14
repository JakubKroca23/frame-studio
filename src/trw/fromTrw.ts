/** TrailerWIN .trw project → trw/config@1 via trw `POST /api/config/from-trw`, plus routing of dropped files. */
import { CS_SIM_SCHEMA } from './csSimResult'
import { TRW_SCHEMA, TRW_URL, TrwAuthError, liveDocOf, mapTrwExport, type TrwImport } from './trwConfig'

export const TRW_FROM_TRW_URL = `${TRW_URL}/api/config/from-trw`

type Rec = Record<string, unknown>
const obj = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null)

/** Unwraps `config`/`data` if present; otherwise the body itself is the config. */
export function unwrapConfig(body: unknown): unknown {
  const b = obj(body)
  if (!b || b.schema === TRW_SCHEMA) return body
  for (const key of ['config', 'data', 'export', 'result']) {
    const inner = obj(b[key])
    if (inner && (inner.schema === TRW_SCHEMA || inner.chassis)) return inner
  }
  return body
}

function itemText(item: unknown): string | null {
  if (typeof item === 'string') return item
  const o = obj(item)
  if (!o) return null
  const field = o.field ?? o.key ?? o.name ?? o.path
  const msg = o.message ?? o.note ?? o.reason ?? o.status ?? o.detail
  const parts = [field, msg].filter((v) => typeof v === 'string' || typeof v === 'number')
  return parts.length ? parts.join(': ') : JSON.stringify(o)
}

/** Report-like fields (report/mapping/fields/missing/warnings…) flattened into readable lines. */
export function reportLines(body: unknown): string[] {
  const b = obj(body)
  if (!b) return []
  const out: string[] = []
  const r = obj(b.report)
  if (r && (Array.isArray(r.mapped) || Array.isArray(r.unmapped))) {
    const label = (i: Rec) => String(i.label ?? i.target ?? '?')
    for (const it of (r.unmapped as unknown[]) ?? []) {
      const i = obj(it)
      if (i) out.push(`nepřevzato: ${label(i)}${i.reason ? ` (${i.reason})` : ''}`)
    }
    for (const it of (r.mapped as unknown[]) ?? []) {
      const i = obj(it)
      if (i && i.status === 'předpoklad') out.push(`předpoklad: ${label(i)}${i.value != null ? ` = ${typeof i.value === 'object' ? JSON.stringify(i.value) : i.value}` : ''}`)
    }
    for (const n of (r.notes as unknown[]) ?? []) { const t = itemText(n); if (t) out.push(`poznámka: ${t}`) }
    return [...new Set(out)]
  }
  const walk = (value: unknown, label: string, depth: number) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      for (const item of value) {
        const t = itemText(item)
        if (t) out.push(label ? `${label}: ${t}` : t)
      }
    } else if (typeof value === 'string') out.push(label ? `${label}: ${value}` : value)
    else if (obj(value) && depth < 2) {
      for (const [k, v] of Object.entries(value as Rec)) {
        if (typeof v === 'boolean') out.push(`${k}: ${v ? 'převzato' : 'nepřevzato'}`)
        else if (typeof v === 'string' || typeof v === 'number') out.push(`${k}: ${v}`)
        else walk(v, labelOf(k), depth + 1)
      }
    }
  }
  for (const key of ['report', 'mapping', 'fields', 'missing', 'warnings', 'not_taken', 'taken']) walk(b[key], key === 'missing' || key === 'not_taken' ? 'nepřevzato' : key === 'taken' ? 'převzato' : '', 0)
  return [...new Set(out)]
}
function labelOf(k: string) {
  if (/missing|not_?taken|skipped|ignored/i.test(k)) return 'nepřevzato'
  if (/unmapped/i.test(k)) return 'nepřevzato'
  if (/taken|mapped|ok/i.test(k)) return 'převzato'
  return k
}

const ERRORS: Record<number, string> = {
  400: 'trw soubor .trw nepřijal (neplatný nebo nepodporovaný projekt TrailerWIN).',
  401: 'Nejste přihlášeni v trw.',
  413: 'Soubor .trw je pro trw příliš velký.',
  404: 'trw zatím převod .trw nepodporuje (endpoint /api/config/from-trw neexistuje).',
}

export interface FromTrwImport extends TrwImport {
  report: string[]
}

/** Uploads a .trw file (multipart field `file`) and maps the returned config. */
export async function convertTrwFile(file: Blob & { name?: string }, fetcher: typeof fetch = fetch): Promise<FromTrwImport> {
  const form = new FormData()
  form.append('file', file, file.name ?? 'projekt.trw')
  let res: Response
  try {
    res = await fetcher(TRW_FROM_TRW_URL, { method: 'POST', credentials: 'include', body: form })
  } catch {
    throw new Error('trw není dostupný (síť nebo CORS).')
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    const e = obj(body)
    const detail = [e?.error, e?.detail].filter((v) => typeof v === 'string').join(' – ')
    const text = (ERRORS[res.status] ?? `trw vrátil chybu ${res.status}.`) + (detail ? ` (${detail})` : '')
    if (res.status === 401) throw new TrwAuthError(text)
    throw new Error(text)
  }
  if (body === null) throw new Error('trw nevrátil JSON.')
  const result = mapTrwExport(unwrapConfig(body))
  const report = reportLines(body)
  return { ...result, liveDoc: result.liveDoc ?? liveDocOf(body), report, warnings: [...report.map((r) => `TrailerWIN: ${r}`), ...result.warnings] }
}

export type DroppedKind = 'trw-project' | 'trw-config' | 'cs-sim' | 'unknown'

/** Routes a dropped file by extension and content (`schema`/`format`/`type`). */
export function classifyFile(name: string, text: string | null): DroppedKind {
  if (/\.trw$/i.test(name)) return 'trw-project'
  if (text === null) return 'unknown'
  let data: Rec | null
  try {
    data = obj(JSON.parse(text))
  } catch {
    return 'unknown'
  }
  const tag = [data?.schema, data?.format, data?.type].find((v) => typeof v === 'string')
  if (tag === CS_SIM_SCHEMA) return 'cs-sim'
  if (tag === TRW_SCHEMA || obj(unwrapConfig(data))?.schema === TRW_SCHEMA) return 'trw-config'
  return 'unknown'
}

/** Reason shown in the live status line when the trw import failed (no document → no live request). */
export function importBlockReason(err: unknown): string {
  if (err instanceof TrwAuthError) return 'trw import vyžaduje přihlášení'
  return `import z trw selhal (${err instanceof Error ? err.message : String(err)})`
}

