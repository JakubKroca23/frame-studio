import table from './trwFormatCodes.json'
import type { BodyType } from './trwExtended'

type CodeTable = { body_type: Record<string, BodyType>; acc_code: Record<string, string> }

const codes = table as CodeTable

/** Map TrailerWIN / trw `bodies[].type` code using docs/trw-format.md (empty until synced from trw repo). */
export function bodyTypeFromTrwCode(raw: string | null | undefined): BodyType | null {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  const t = codes.body_type[key]
  return t === 'flatbed' || t === 'tipper' || t === 'hooklift' || t === 'other' ? t : null
}

export function accKindFromCode(code: string | null | undefined): string | null {
  if (!code) return null
  const key = code.trim().toLowerCase()
  return codes.acc_code[key] ?? code
}
