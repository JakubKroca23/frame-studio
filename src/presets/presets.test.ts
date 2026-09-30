import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildChassisGroup } from '../mesh/build'
import { initManifold } from '../mesh/manifold'
import { solidReport } from '../mesh/silhouette'
import { tireDiameterMm } from '../lib/geom'
import { configToModel, paramsForConfig } from './configModel'
import { MAKES, PRESETS, presetById, resolvePreset, wheelbase, withWheelbase } from './index'
import { validateConfig } from './validate'
import { a } from './chassisPresets'

function numbers(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => numbers(item, path ? `${path}.${key}` : key))
  return []
}

describe('chassis presets data', () => {
  it('covers all four makes with several configurations', () => {
    for (const make of MAKES) expect(PRESETS.filter((preset) => preset.make === make.id).length).toBeGreaterThanOrEqual(3)
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length)
    const layouts = new Set(PRESETS.map((preset) => `${preset.config.axles.length}:${preset.config.kind}`))
    expect(layouts.size).toBeGreaterThanOrEqual(5)
  })

  it('cites a source and resolves every approximate marker', () => {
    for (const preset of PRESETS) {
      expect(preset.source.length, preset.id).toBeGreaterThan(10)
      expect(JSON.stringify(preset.config)).not.toContain('"approx"')
      for (const path of preset.approx) {
        const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], preset.config)
        expect(value, `${preset.id} ${path}`).not.toBeUndefined()
      }
    }
    const resolved = resolvePreset({ ...PRESETS[0], config: { ...PRESETS[0].config, rearOverhang: a(999) } })
    expect(resolved.config.rearOverhang).toBe(999)
    expect(resolved.approx).toContain('rearOverhang')
  })

  it('has positive sizes, recognised tyres and sensible loads', () => {
    for (const preset of PRESETS) {
      const cfg = preset.config
      for (const [path, value] of numbers(cfg)) {
        if (path === 'gcw' || path.startsWith('fifthWheel') || path.endsWith('position') || path === 'axles.0.position') continue
        if (path.endsWith('liters') && value === 0) continue
        if (path === 'cab.color') continue
        expect(value, `${preset.id} ${path}`).toBeGreaterThan(0)
      }
      expect(cfg.axles[0].position).toBe(0)
      cfg.axles.forEach((axle, i) => {
        expect(tireDiameterMm(axle.tyre), `${preset.id} tyre ${axle.tyre}`).toBeGreaterThan(900)
        if (i > 0) expect(axle.position - cfg.axles[i - 1].position, preset.id).toBeGreaterThan(1200)
      })
      const sum = cfg.axles.reduce((total, axle) => total + axle.maxLoad, 0)
      expect(sum, preset.id).toBeGreaterThanOrEqual(cfg.gvw)
      expect(sum, preset.id).toBeLessThanOrEqual(cfg.gvw * 1.35)
      expect(cfg.frame.widthRear).toBeGreaterThan(700)
      expect(cfg.frame.widthRear).toBeLessThan(900)
      expect(cfg.cab.width).toBeLessThanOrEqual(2550)
      expect(cfg.cab.height).toBeLessThanOrEqual(4000)
      expect(cfg.axles.some((axle) => axle.driven)).toBe(true)
      expect(preset.wheelbases).toContain(Math.round(wheelbase(cfg, preset.wheelbaseRef)))
      expect(validateConfig(cfg).filter((hint) => hint.level === 'warn'), preset.id).toEqual([])
    }
  })

  it('moves the rear axle group when the wheelbase changes', () => {
    const preset = presetById('man-tgs-8x4-tipper')!
    expect(wheelbase(preset.config, preset.wheelbaseRef)).toBe(3205)
    const longer = withWheelbase(preset.config, 3505, preset.wheelbaseRef)
    expect(longer.axles.map((axle) => axle.position)).toEqual([0, 1795, 5300, 6700])
    const daf = presetById('daf-xd-8x4-twinsteer')!
    expect(wheelbase(daf.config, daf.wheelbaseRef)).toBe(5300)
  })
})

describe('configurator model', () => {
  beforeAll(async () => {
    await initManifold()
  })

  it('turns every preset into a complete chassis model and 3D group', () => {
    for (const preset of PRESETS) {
      const cfg = preset.config
      const model = configToModel(cfg, preset.id)
      expect(model.frame, preset.id).not.toBeNull()
      const frame = model.frame!
      const last = Math.max(...cfg.axles.map((axle) => axle.position))
      expect(frame.left[frame.left.length - 1].x).toBe(last + cfg.rearOverhang)
      expect(frame.topZ - frame.bottomZ).toBe(cfg.frame.sectionHeight)
      expect(model.axles).toHaveLength(cfg.axles.length)
      expect(model.axles.every((axle) => Math.abs(axle.z - axle.tireDiameter / 2) < 1)).toBe(true)
      expect(model.holes.length).toBeGreaterThan(20)
      expect(model.holes.length).toBeLessThanOrEqual(800)
      expect(model.crossmembers.length).toBeGreaterThanOrEqual(4)
      expect(model.cab?.silhouettes?.side?.length).toBeGreaterThan(20)
      expect(model.cab!.side.y1).toBe(cfg.cab.height)
      expect(model.cab!.side.x0).toBe(-cfg.frontOverhang)
      expect(model.components.some((part) => part.kind === 'fuel')).toBe(cfg.fuel.enabled)
      expect(model.components.some((part) => part.kind === 'fifth')).toBe(cfg.kind === 'tractor' && cfg.fifthWheel.enabled)
      expect(model.warnings, preset.id).toEqual([])

      const group = buildChassisGroup(model, paramsForConfig(cfg))
      const shell = group.getObjectByName('cab-shell') as THREE.Mesh | undefined
      expect(shell, `${preset.id} cab solid`).toBeTruthy()
      const report = solidReport(shell!.geometry)
      expect(report.boundary, preset.id).toBe(0)
      expect(report.nonManifold, preset.id).toBe(0)
      expect(report.volume, preset.id).toBeGreaterThan(0)
      const cabBox = new THREE.Box3().setFromObject(shell!)
      expect(cabBox.max.y).toBeGreaterThan(cfg.cab.height - 60)
      expect(cabBox.max.y).toBeLessThan(cfg.cab.height + 30)
      expect(cabBox.max.z - cabBox.min.z).toBeGreaterThan(cfg.cab.width - 40)
      const parts = new Set<string>()
      shell!.parent!.traverse((obj) => obj.userData.part && parts.add(obj.userData.part as string))
      expect([...parts], preset.id).toEqual(expect.arrayContaining(['glass', 'grille', 'bumper']))

      const whole = new THREE.Box3().setFromObject(group)
      expect(whole.min.y).toBeGreaterThan(-5)
      expect(whole.max.x).toBeGreaterThan(last + cfg.rearOverhang - 100)
      let meshes = 0
      group.getObjectByName('axles')?.traverse((obj) => (meshes += (obj as THREE.Mesh).isMesh ? 1 : 0))
      expect(meshes).toBeGreaterThan(cfg.axles.length * 8)
    }
  })

  it('honours explicit axle roles and equipment switches', () => {
    const cfg = structuredClone(presetById('volvo-fh-4x2-tractor')!.config)
    cfg.axles[1].twin = false
    cfg.fuel.enabled = false
    cfg.sideGuards = false
    cfg.rearUnderrun = true
    cfg.exhaust.kind = 'vertical'
    const model = configToModel(cfg)
    expect(model.axles[1].driven).toBe(true)
    expect(model.axles[1].dual).toBe(false)
    expect(model.components.some((part) => part.kind === 'fuel')).toBe(false)
    expect(model.components.some((part) => part.kind === 'shield')).toBe(false)
    expect(model.components.some((part) => part.kind === 'stack')).toBe(true)
    expect(model.rearBar).toBe(true)
  })

  it('reports soft warnings in Czech', () => {
    const cfg = structuredClone(presetById('daf-xf-4x2-tractor')!.config)
    cfg.axles[1].maxLoad = 5000
    cfg.fifthWheel.lead = 2000
    const hints = validateConfig(cfg)
    expect(hints.some((hint) => hint.text.includes('Součet zatížení'))).toBe(true)
    expect(hints.some((hint) => hint.text.includes('točnice'))).toBe(true)
  })
})
