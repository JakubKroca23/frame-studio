/** Leader-label layout: all labels in a band above the model, stacked in tiers so their (estimated) widths never overlap along X. */
export interface LeaderItem { id: string; x: number; y: number; text: string }
export interface LeaderSlot { x: number; y: number; tier: number }

/** Estimated label width in mm (11 px font at a typical configurator zoom ≈ 75 mm per character + padding). */
export const labelWidthMm = (text: string) => 420 + text.length * 75

export function layoutLeaders(items: LeaderItem[], gapMm = 1300, tierMm = 650): Map<string, LeaderSlot> {
  const out = new Map<string, LeaderSlot>()
  if (!items.length) return out
  const base = Math.max(...items.map((i) => i.y)) + gapMm
  const tiers: [number, number][][] = []
  for (const it of [...items].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))) {
    const half = labelWidthMm(it.text) / 2, lo = it.x - half, hi = it.x + half
    let t = 0
    while (tiers[t]?.some(([a, b]) => lo < b + 150 && hi > a - 150)) t++
    ;(tiers[t] ??= []).push([lo, hi])
    out.set(it.id, { x: it.x, y: base + t * tierMm, tier: t })
  }
  return out
}
