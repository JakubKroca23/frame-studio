import table from './trwFormatCodes.json'
import type { BodyType } from './trwExtended'

type CodeTable = {
  body_type: Record<string, BodyType>
  body_skip_codes?: string[]
  acc_code: Record<string, string>
}

const codes = table as CodeTable

/** First word of TrailerWIN TYPE value; remainder is catalog / variant name for labels. */
export function bodydataTypeCode(raw: string | null | undefined): { code: string; catalogName: string | null } {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { code: '', catalogName: null }
  const space = trimmed.search(/\s/)
  if (space < 0) return { code: trimmed.toLowerCase(), catalogName: null }
  return { code: trimmed.slice(0, space).toLowerCase(), catalogName: trimmed.slice(space + 1).trim() || null }
}

/** True when TYPE code is `empty` (no body superstructure). */
export function isSkippedBodyType(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return false
  const { code } = bodydataTypeCode(raw)
  return (codes.body_skip_codes ?? []).includes(code)
}

/** Map BODYDATA type code (first token only). */
export function bodyTypeFromTrwCode(raw: string | null | undefined): BodyType | null {
  const { code } = bodydataTypeCode(raw)
  if (!code || isSkippedBodyType(raw)) return null
  const t = codes.body_type[code]
  if (t === 'flatbed' || t === 'tipper' || t === 'hooklift' || t === 'cabinet' || t === 'container' || t === 'spec' || t === 'other') return t
  return null
}

export function accKindFromCode(code: string | null | undefined): string | null {
  if (!code) return null
  const key = code.trim().toLowerCase()
  return codes.acc_code[key] ?? code
}
