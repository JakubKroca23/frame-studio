import type { ChassisConfig } from './types'
import { tireDiameterMm } from '../lib/geom'

export interface Hint {
  level: 'info' | 'warn'
  text: string
}

const t = (value: number) => (value / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })

/** Soft plausibility checks shown under the configurator form. Nothing here blocks the model. */
export function validateConfig(cfg: ChassisConfig): Hint[] {
  const hints: Hint[] = []
  const axles = cfg.axles
  const sum = axles.reduce((total, axle) => total + axle.maxLoad, 0)
  if (sum < cfg.gvw) hints.push({ level: 'warn', text: `Součet zatížení náprav ${t(sum)} t je menší než celková hmotnost ${t(cfg.gvw)} t – vozidlo nelze plně naložit.` })
  else if (sum > cfg.gvw * 1.35) hints.push({ level: 'info', text: `Součet zatížení náprav ${t(sum)} t výrazně převyšuje celkovou hmotnost ${t(cfg.gvw)} t.` })
  const limits: Record<number, number> = { 2: 18000, 3: 26000, 4: 32000 }
  const twinDrive = axles.some((axle) => axle.driven && axle.twin)
  const legal = axles.length === 2 && twinDrive ? 19000 : limits[axles.length]
  if (legal && cfg.gvw > legal) hints.push({ level: 'warn', text: `Celková hmotnost ${t(cfg.gvw)} t překračuje limit EU pro ${axles.length} nápravy (${t(legal)} t, směrnice 96/53/ES).` })
  axles.forEach((axle, i) => {
    if (axle.driven && !axle.twin && axle.maxLoad > 11500) hints.push({ level: 'warn', text: `Náprava ${i + 1}: hnací náprava bez dvojmontáže s zatížením nad 11,5 t.` })
    if (axle.driven && axle.maxLoad > 11500) hints.push({ level: 'info', text: `Náprava ${i + 1}: ${t(axle.maxLoad)} t je nad limitem EU 11,5 t pro hnací nápravu (technická hodnota).` })
    if (!axle.driven && !axle.steered && axle.maxLoad > 10000) hints.push({ level: 'warn', text: `Náprava ${i + 1}: neřízená náprava s ${t(axle.maxLoad)} t je nezvyklá.` })
    if (!tireDiameterMm(axle.tyre)) hints.push({ level: 'warn', text: `Náprava ${i + 1}: rozměr pneumatiky „${axle.tyre}“ nerozpoznán (formát 315/80R22.5).` })
    if (i > 0) {
      const gap = axle.position - axles[i - 1].position
      const d = Math.max(tireDiameterMm(axle.tyre) ?? 1050, tireDiameterMm(axles[i - 1].tyre) ?? 1050)
      if (gap < d + 60) hints.push({ level: 'warn', text: `Nápravy ${i} a ${i + 1} jsou jen ${gap} mm od sebe – kola se překrývají.` })
    }
  })
  const rear = axles.filter((axle, i) => i > 0 && !(axle.steered && axle.position < 2600))
  const wb = rear.length ? (rear[0].position + rear[rear.length - 1].position) / 2 : 0
  if (wb > 0) {
    const ratio = cfg.rearOverhang / wb
    if (cfg.kind === 'rigid' && ratio > 0.6) hints.push({ level: 'warn', text: `Zadní převis je ${Math.round(ratio * 100)} % teoretického rozvoru; běžně nejvýše 50–60 %.` })
    if (cfg.frontOverhang > 1700) hints.push({ level: 'info', text: 'Přední převis nad 1,7 m je u kabiny nad motorem neobvyklý.' })
  }
  const length = cfg.frontOverhang + Math.max(...axles.map((axle) => axle.position)) + cfg.rearOverhang
  if (cfg.kind === 'rigid' && length > 12000) hints.push({ level: 'warn', text: `Celková délka ${t(length)} m překračuje 12 m pro nákladní automobil.` })
  if (cfg.cab.height > 4000) hints.push({ level: 'warn', text: 'Výška kabiny přesahuje 4 m (limit výšky vozidla v EU).' })
  if (cfg.cab.width > 2550) hints.push({ level: 'warn', text: 'Šířka kabiny přesahuje 2,55 m.' })
  if (cfg.cab.backFromAxle > (rear[0]?.position ?? 1e9) - 600) hints.push({ level: 'warn', text: 'Kabina zasahuje nad zadní nápravu.' })
  if (cfg.kind === 'tractor' && cfg.fifthWheel.enabled) {
    if (cfg.fifthWheel.height < cfg.frame.topHeight + 120) hints.push({ level: 'warn', text: 'Točnice je níže, než dovoluje výška rámu a montážní deska.' })
    const lead = cfg.fifthWheel.lead
    if (lead < -300 || lead > 1200) hints.push({ level: 'warn', text: `Předsunutí točnice ${lead} mm je mimo běžný rozsah (0–900 mm před zadní nápravou).` })
    if (cfg.gcw && cfg.gcw < cfg.gvw) hints.push({ level: 'warn', text: 'Hmotnost jízdní soupravy je menší než hmotnost tahače.' })
  }
  if (cfg.kind === 'rigid' && cfg.fifthWheel.enabled) hints.push({ level: 'info', text: 'Točnice je zapnutá u podvozku (nástavbový vůz) – kreslí se jen u tahače.' })
  if (cfg.frame.widthRear > cfg.frame.widthFront + 1) hints.push({ level: 'info', text: 'Rám je vzadu širší než vpředu.' })
  if (!axles.some((axle) => axle.driven)) hints.push({ level: 'warn', text: 'Žádná náprava není hnací.' })
  if (!axles.some((axle) => axle.steered)) hints.push({ level: 'warn', text: 'Žádná náprava není řízená.' })
  return hints
}
