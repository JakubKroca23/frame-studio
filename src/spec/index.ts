/** Manufacturer specification PDF text → brand parser. */
import { isManSpecText, parseManSpec } from './manSpec'
import { isDafSpecText, parseDafSpec } from './dafSpec'
import { isVolvoSpecText, parseVolvoSpec } from './volvoSpec'
import type { SpecData } from './specModel'

export function detectSpecBrand(text: string): 'man' | 'volvo' | 'daf' | null {
  if (isManSpecText(text)) return 'man'
  if (isVolvoSpecText(text)) return 'volvo'
  if (isDafSpecText(text)) return 'daf'
  return null
}

export function parseSpec(text: string): SpecData {
  const brand = detectSpecBrand(text)
  if (brand === 'man') return parseManSpec(text)
  if (brand === 'volvo') return parseVolvoSpec(text)
  if (brand === 'daf') return parseDafSpec(text)
  throw new Error('nerozpoznaná specifikace – podporované formáty: MAN (TDxxx), Volvo (Technická specifikace), DAF (Specifikace XF/XG/XD/CF…).')
}
export { specToConfig, type SpecImport } from './specModel'
