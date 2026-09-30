import { PRESET_INPUTS } from './chassisPresets'
import type { ChassisConfig, ChassisPreset, ChassisPresetInput, Make } from './types'

export type { ChassisConfig, ChassisPreset, Make } from './types'

export const MAKES: { id: Make; name: string }[] = [
  { id: 'volvo', name: 'Volvo Trucks' },
  { id: 'scania', name: 'Scania' },
  { id: 'man', name: 'MAN' },
  { id: 'daf', name: 'DAF' },
]

/** Unwraps a(…) markers and records the dotted path of every estimated value. */
export function resolvePreset(input: ChassisPresetInput): ChassisPreset {
  const approx: string[] = []
  const walk = (value: unknown, path: string): unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>
      if (record.approx === true && 'value' in record) {
        approx.push(path)
        return record.value
      }
      const out: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(record)) out[key] = walk(item, path ? `${path}.${key}` : key)
      return out
    }
    if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}.${index}`))
    return value
  }
  const config = walk(input.config, '') as ChassisConfig
  return { ...input, config, approx }
}

export const PRESETS: ChassisPreset[] = PRESET_INPUTS.map(resolvePreset)

export function presetById(id: string): ChassisPreset | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

export function seriesOf(make: Make): string[] {
  return [...new Set(PRESETS.filter((preset) => preset.make === make).map((preset) => preset.series))]
}

export function presetsOf(make: Make, series: string): ChassisPreset[] {
  return PRESETS.filter((preset) => preset.make === make && preset.series === series)
}

export function cloneConfig(config: ChassisConfig): ChassisConfig {
  return structuredClone(config)
}

/** Index of the first axle behind the steered front group (the first rear axle). */
export function firstRearIndex(config: ChassisConfig): number {
  const index = config.axles.findIndex((axle, i) => i > 0 && !(axle.steered && axle.position < 2600))
  return index < 0 ? config.axles.length - 1 : index
}

/** Wheelbase in the manufacturer's convention. */
export function wheelbase(config: ChassisConfig, ref: ChassisPreset['wheelbaseRef'] = 'firstRear'): number {
  const rear = config.axles.slice(firstRearIndex(config))
  const first = rear[0]?.position ?? 0
  if (ref === 'rearCentre') return (first + (rear[rear.length - 1]?.position ?? first)) / 2
  if (ref === 'secondFrontToFirstRear') return first - (config.axles[firstRearIndex(config) - 1]?.position ?? 0)
  return first
}

/** Moves the rear axle group so the wheelbase (in the given convention) becomes `value`. */
export function withWheelbase(config: ChassisConfig, value: number, ref: ChassisPreset['wheelbaseRef'] = 'firstRear'): ChassisConfig {
  const shift = value - wheelbase(config, ref)
  const start = firstRearIndex(config)
  const next = cloneConfig(config)
  next.axles = next.axles.map((axle, index) => (index >= start ? { ...axle, position: Math.round(axle.position + shift) } : axle))
  return next
}
