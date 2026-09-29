import type { Txt } from '../dxf/types'
import { parseDecimal } from '../lib/geom'
import type { Dimension } from '../model/types'
import type { Profile } from '../profile/types'

interface LabelTok {
  label: string
  inline: number | null
  x: number
  y: number
  vertical: boolean
}

interface NumTok {
  value: number
  x: number
  y: number
  used: boolean
}

export function pairDimensions(texts: Txt[], profile: Profile, dimensionLayers: (layer: string) => boolean): Dimension[] {
  const labels: LabelTok[] = []
  const numbers: NumTok[] = []
  let re: RegExp
  try {
    re = new RegExp(profile.dimensionLabels.pattern, 'gi')
  } catch {
    return []
  }
  const maxGap = profile.dimensionLabels.maxGap

  for (const t of texts) {
    if (!dimensionLayers(t.layer)) continue
    const raw = t.text.replace(/%%d/gi, '°').trim()
    if (!raw) continue
    re.lastIndex = 0
    const matches = [...raw.matchAll(re)]
    if (matches.length > 0) {
      const vertical = isVertical(t.rotation)
      matches.forEach((m, i) => {
        const inline = m[2] ? parseDecimal(m[2]) : null
        labels.push({
          label: m[1].toUpperCase(),
          inline,
          x: t.x + (vertical ? i * 12 : i * 40),
          y: t.y,
          vertical,
        })
      })
      continue
    }
    const value = parseDecimal(raw)
    if (value !== null && raw.length < 12) {
      numbers.push({ value, x: t.x, y: t.y, used: false })
    }
  }

  const dims: Dimension[] = []
  const pending: LabelTok[] = []
  for (const label of labels) {
    if (label.inline !== null) {
      dims.push({
        label: label.label,
        value: label.inline,
        x: label.x,
        y: label.y,
        confidence: 0.95,
        source: 'inline',
      })
    } else pending.push(label)
  }

  const candidates: { li: number; ni: number; d: number }[] = []
  pending.forEach((label, li) => {
    numbers.forEach((num, ni) => {
      const dx = num.x - label.x
      const dy = num.y - label.y
      if (label.vertical) {
        if (Math.abs(dx) > 90) return
        if (dy < 8 || dy > maxGap) return
        candidates.push({ li, ni, d: Math.hypot(dx, dy) })
      } else {
        if (Math.abs(dy) > 45) return
        if (dx < 8 || dx > maxGap) return
        candidates.push({ li, ni, d: Math.hypot(dx, dy) })
      }
    })
  })
  candidates.sort((a, b) => a.d - b.d)
  const usedL = new Set<number>()
  const assigned = new Map<number, NumTok>()
  for (const c of candidates) {
    if (usedL.has(c.li) || numbers[c.ni].used) continue
    usedL.add(c.li)
    numbers[c.ni].used = true
    assigned.set(c.li, numbers[c.ni])
  }
  pending.forEach((label, li) => {
    const num = assigned.get(li)
    dims.push({
      label: label.label,
      value: num ? num.value : null,
      x: label.x,
      y: label.y,
      confidence: num ? (Math.hypot(num.x - label.x, num.y - label.y) < 250 ? 0.9 : 0.72) : 0.25,
      source: num ? 'paired' : 'missing',
    })
  })

  dims.sort((a, b) => a.label.localeCompare(b.label, 'en'))
  return dims
}

export function dimensionMap(dims: Dimension[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of dims) {
    if (d.value === null) continue
    if (!map.has(d.label) || d.confidence > 0.5) map.set(d.label, d.value)
  }
  return map
}

function isVertical(rotation: number): boolean {
  const a = Math.abs(rotation % 180)
  return a > 45 && a < 135
}
