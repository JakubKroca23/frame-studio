import type { ChassisConfig } from '../presets/types'

type Obj = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** TrailerWIN zeros → null in config@1 exports. */
export const posNum = (v: unknown): number | null => {
  const n = num(v)
  return n == null || n === 0 ? null : n
}

export interface ChassisMeasured {
  track_mm?: number[] | number | null
  tyres?: (string | null)[] | null
  cab?: {
    WIDC?: number | null
    CabRear?: number | null
    FOH?: number | null
    HFRA?: number | null
    widc?: number | null
    cab_rear?: number | null
    foh?: number | null
    hfra?: number | null
  } | null
}

export function parseChassisMeasured(v: unknown): ChassisMeasured | null {
  if (v == null) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  return v as ChassisMeasured
}

/** Apply `chassis_measured` over preset values; updates `measured` paths and returns whether any track came from trw. */
export function applyChassisMeasured(
  raw: ChassisMeasured | null,
  cfg: ChassisConfig,
  measured: Set<string>,
): { trackFromTrw: boolean; tyreFromTrw: boolean } {
  let trackFromTrw = false
  let tyreFromTrw = false
  if (!raw) return { trackFromTrw, tyreFromTrw }

  const tracks = raw.track_mm
  if (Array.isArray(tracks)) {
    tracks.forEach((t, i) => {
      const v = posNum(t)
      if (v != null && cfg.axles[i]) {
        cfg.axles[i].track = v
        measured.add(`axles.${i}.track`)
        trackFromTrw = true
      }
    })
  } else {
    const v = posNum(tracks)
    if (v != null) {
      cfg.axles.forEach((a, i) => {
        a.track = v
        measured.add(`axles.${i}.track`)
      })
      trackFromTrw = true
    }
  }

  if (Array.isArray(raw.tyres)) {
    raw.tyres.forEach((t, i) => {
      if (typeof t === 'string' && t.trim() && cfg.axles[i]) {
        cfg.axles[i].tyre = t.trim()
        measured.add(`axles.${i}.tyre`)
        tyreFromTrw = true
      }
    })
  }

  const cab = (raw.cab && typeof raw.cab === 'object' ? raw.cab : {}) as Obj
  const widc = posNum(cab.WIDC ?? cab.widc)
  const cabRear = posNum(cab.CabRear ?? cab.cab_rear)
  const foh = posNum(cab.FOH ?? cab.foh)
  const hfra = posNum(cab.HFRA ?? cab.hfra)
  if (widc != null) {
    cfg.cab.width = widc
    measured.add('cab.width')
  }
  if (cabRear != null) {
    cfg.cab.backFromAxle = cabRear
    measured.add('cab.backFromAxle')
  }
  if (foh != null) {
    cfg.frontOverhang = foh
    measured.add('frontOverhang')
  }
  if (hfra != null) {
    cfg.frame.topHeight = hfra
    measured.add('frame.topHeight')
  }

  return { trackFromTrw, tyreFromTrw }
}
