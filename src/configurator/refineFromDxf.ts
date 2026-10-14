import type { ChassisModel } from '../model/types'
import type { ChassisConfig } from '../presets/types'

export interface RefineResult {
  cfg: ChassisConfig
  /** What was taken from the drawing (Czech, for the status panel). */
  applied: string[]
  /** What stays from trw / the preset and why. */
  kept: string[]
}

const r = (v: number) => Math.round(v)

/**
 * Merge a side-view drawing (chassis, or chassis + crane assembly) into a configuration that came from trw or a preset.
 * Only values the drawing actually measures replace the config; everything else (widths, weights, crane from the
 * catalogue, stability) stays. Nothing is invented: a value that cannot be read is left untouched and reported.
 */
export function refineConfigFromDxf(base: ChassisConfig, m: ChassisModel): RefineResult {
  const cfg: ChassisConfig = structuredClone(base)
  const applied: string[] = [], kept: string[] = []
  const f = m.frame
  // drawing direction: +1 when drawing x grows towards the rear
  let dir = 1
  if (f && f.left.length >= 2) dir = Math.sign(f.left[f.left.length - 1].x - f.left[0].x) || 1
  else if (m.cab && m.axles.length) dir = Math.sign(m.axles[0].x - (m.cab.side.x0 + m.cab.side.x1) / 2) || 1
  const axles = [...m.axles].sort((a, b) => (a.x - b.x) * dir)
  if (!axles.length) {
    kept.push('Nápravy: ve výkresu nenalezeny – rozvor a převisy zůstávají z trw.')
    return { cfg, applied, kept }
  }
  const x0 = axles[0].x
  const along = (x: number) => (x - x0) * dir
  const pos = axles.map((a) => r(along(a.x)))
  if (axles.length === cfg.axles.length) {
    cfg.axles.forEach((a, i) => { a.position = pos[i] })
    applied.push(`Polohy náprav z výkresu: ${pos.join(' / ')} mm (rozvor 1.–2. ${pos[1] ?? 0} mm).`)
    axles.forEach((a, i) => {
      if (a.track != null && a.track > 1000) { cfg.axles[i].track = r(a.track); applied.push(`Rozchod nápravy ${i + 1}: ${r(a.track)} mm.`) }
    })
  } else kept.push(`Počet náprav ve výkresu (${axles.length}) neodpovídá trw (${cfg.axles.length}) – polohy náprav ponechány z trw.`)
  const last = cfg.axles.reduce((mx, a) => Math.max(mx, a.position), 0)
  const ground = m.groundZ ?? Math.min(...axles.map((a) => a.z - a.tireDiameter / 2))
  if (f) {
    const xs = [...f.left, ...f.right].map((p) => along(p.x))
    if (xs.length) {
      const front = Math.min(...xs), rear = Math.max(...xs)
      if (rear > last) { cfg.rearOverhang = r(rear - last); applied.push(`Zadní převis rámu: ${cfg.rearOverhang} mm.`) }
      if (front < 0) { cfg.frame.frontEnd = r(-front); applied.push(`Přední konec rámu před 1. nápravou: ${cfg.frame.frontEnd} mm.`) }
    }
    if (Number.isFinite(ground) && f.topZ > ground) { cfg.frame.topHeight = r(f.topZ - ground); applied.push(`Výška horní hrany rámu: ${cfg.frame.topHeight} mm.`) }
    if (f.sources?.height === 'measured' && f.topZ > f.bottomZ) { cfg.frame.sectionHeight = r(f.topZ - f.bottomZ); applied.push(`Výška profilu rámu: ${cfg.frame.sectionHeight} mm.`) }
    if (f.sources?.width !== 'measured') kept.push('Šířka rámu: z bokorysu neměřitelná – zůstává z trw.')
    else if (f.outerWidthStraight > 0) { cfg.frame.widthRear = r(f.outerWidthStraight); applied.push(`Šířka rámu: ${cfg.frame.widthRear} mm.`) }
  } else kept.push('Rám: ve výkresu nenalezen – převisy a výška rámu zůstávají z trw.')
  if (m.cab && m.cab.source !== 'estimated') {
    const a = along(m.cab.side.x0), b = along(m.cab.side.x1)
    const front = Math.min(a, b), back = Math.max(a, b)
    if (front < 0) { cfg.frontOverhang = r(-front); applied.push(`Přední převis (čelo kabiny): ${cfg.frontOverhang} mm.`) }
    if (back > 0) { cfg.cab.backFromAxle = r(back); applied.push(`Zadní stěna kabiny za 1. nápravou: ${cfg.cab.backFromAxle} mm.`) }
    const h = m.cab.side.y1 - ground
    if (h > 1500 && h < 4500) { cfg.cab.height = r(h); applied.push(`Výška kabiny: ${cfg.cab.height} mm.`) }
  } else kept.push('Kabina: ve výkresu nezměřena – rozměry kabiny zůstávají z trw.')
  kept.push('Hmotnosti, pneumatiky, jeřáb z katalogu a stabilita zůstávají z trw.')
  kept.push('Poloha a obrys jeřábu z bokorysu sestavy zatím nejsou převzaty (jeřáb zůstává z trw).')
  return { cfg, applied, kept }
}
