import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { CabBrand, ParametricCabSpec } from '../model/types'
import { BUMPER_PROUD, cabLayout, cabStyle } from '../presets/cabLayout'
import { configToModel, paramsForConfig } from '../presets/configModel'
import { PRESETS } from '../presets'
import { buildChassisGroup } from './build'
import { initManifold } from './manifold'
import { parametricCab, parametricCabBody } from './cabParametric'
import { solidReport } from './silhouette'

const base = (brand: CabBrand, variant: string, over: Partial<ParametricCabSpec> = {}): ParametricCabSpec => ({
  brand,
  variant,
  kind: 'sleeper',
  roof: 'normal',
  tractor: true,
  xFront: -1400,
  xRear: 900,
  height: 3500,
  width: 2500,
  frameTop: 1050,
  axleZ: 530,
  wheelRadius: 536,
  frontTrack: 2050,
  tyreWidth: 315,
  ...over,
})

const CASES: [CabBrand, string][] = [
  ['volvo', 'FH'],
  ['volvo', 'FM'],
  ['volvo', 'FMX'],
  ['scania', 'R'],
  ['scania', 'S'],
  ['scania', 'G'],
  ['scania', 'P'],
  ['man', 'TGX'],
  ['man', 'TGS'],
  ['man', 'TGM'],
  ['daf', 'XF'],
  ['daf', 'XG'],
  ['daf', 'XD'],
  ['mercedes', 'Actros'],
  ['mercedes', 'Arocs'],
]

describe('parametric cab body', () => {
  it.each(CASES)('%s %s is a single watertight solid with the requested envelope', (brand, variant) => {
    for (const over of [{}, { roof: 'high' as const, height: 3950 }, { kind: 'day' as const, xRear: 450, height: 3100, tractor: false }]) {
      const spec = base(brand, variant, over)
      const { geometry, layout } = parametricCabBody(spec)
      const report = solidReport(geometry)
      expect(report.boundary).toBe(0)
      expect(report.nonManifold).toBe(0)
      expect(report.misoriented).toBe(0)
      expect(report.shells).toBe(1)
      expect(report.volume).toBeGreaterThan(0)
      geometry.computeBoundingBox()
      const box = geometry.boundingBox!
      expect(box.max.y).toBeCloseTo(spec.height, 0)
      expect(box.min.y).toBeCloseTo(layout.zLow, 0)
      expect(box.max.z - box.min.z).toBeCloseTo(spec.width, 0)
      expect(box.min.x).toBeGreaterThan(spec.xFront + BUMPER_PROUD - 30)
      expect(box.min.x).toBeLessThan(spec.xFront + BUMPER_PROUD + 30)
      expect(box.max.x).toBeCloseTo(spec.xRear, 0)
      // Glass band sits between the floor and the roof, windscreen raked backwards.
      expect(layout.zScreenLow).toBeGreaterThan(layout.zFloor)
      expect(layout.zScreenTop).toBeLessThan(spec.height)
      expect(layout.plan(layout.zScreenTop).xf).toBeGreaterThan(layout.plan(layout.zScreenLow).xf)
    }
  })

  it('gives every brand its own proportions', () => {
    const rake = (brand: CabBrand, variant: string) => cabStyle(brand, variant).rake
    expect(rake('scania', 'R')).toBeLessThan(rake('man', 'TGX'))
    expect(rake('man', 'TGX')).toBeLessThan(rake('volvo', 'FH'))
    expect(rake('volvo', 'FH')).toBeLessThan(rake('daf', 'XF'))
    // DAF XG has the longer, rounder nose; the Scania front is the squarest.
    expect(cabStyle('daf', 'XG').noseDepth).toBeGreaterThan(cabStyle('daf', 'XF').noseDepth)
    expect(cabStyle('scania', 'R').noseN).toBeGreaterThan(cabStyle('daf', 'XF').noseN)
    // A high roof is a taller cap above the same windscreen.
    const normal = cabLayout(base('scania', 'R'))
    const high = cabLayout(base('scania', 'R', { roof: 'high', height: 3950 }))
    expect(high.zScreenTop).toBeCloseTo(normal.zScreenTop, 0)
    expect(high.height - high.zScreenTop).toBeGreaterThan(normal.height - normal.zScreenTop + 400)
  })
})

describe('parametric cab details', () => {
  const names = (brand: CabBrand, variant: string) => {
    const result = parametricCab(base(brand, variant))
    return { result, names: new Set(result.parts.map((part) => part.name)), parts: new Set(result.parts.map((part) => part.part)) }
  }

  it.each(CASES)('%s %s has glass, grille, lamps, bumper, visor and closed detail plates', (brand, variant) => {
    const { result, parts } = names(brand, variant)
    for (const part of ['glass', 'grille', 'lamp', 'bumper', 'visor', 'seam', 'step', 'fender'] as const) expect(parts.has(part), part).toBe(true)
    expect(result.objects.some((object) => object.userData.part === 'mirror')).toBe(true)
    let triangles = 0
    for (const part of result.parts) {
      const report = solidReport(part.geometry)
      expect(report.boundary, part.name).toBe(0)
      expect(report.volume, part.name).toBeGreaterThan(0)
      triangles += (part.geometry.index?.count ?? 0) / 3
    }
    triangles += (result.body.index?.count ?? 0) / 3
    expect(triangles).toBeLessThan(160000)
  })

  it('draws the brand marks', () => {
    const volvo = names('volvo', 'FH').names
    expect(volvo.has('iron-mark-band') && volvo.has('iron-mark-arrow')).toBe(true)
    const scania = names('scania', 'R')
    expect(scania.result.parts.filter((part) => part.name === 'letter')).toHaveLength(6)
    expect(scania.result.objects.filter((object) => object.userData.part === 'badge').length).toBeGreaterThanOrEqual(3)
    const man = names('man', 'TGX').names
    expect(man.has('wing-bar') && man.has('lion')).toBe(true)
    const daf = names('daf', 'XF')
    expect(daf.names.has('top-bar')).toBe(true)
    expect(daf.result.parts.filter((part) => part.name === 'letter')).toHaveLength(3)
    expect(names('mercedes', 'Actros').result.parts.filter((part) => part.name === 'star')).toHaveLength(3)
    expect(names('volvo', 'FMX').names.has('skid-plate')).toBe(true)
    // Roof deflector only on low/normal-roof tractors.
    expect(parametricCab(base('daf', 'XF', { roof: 'high', height: 3990 })).parts.some((part) => part.name === 'roof-deflector')).toBe(false)
    expect(parametricCab(base('daf', 'XF')).parts.some((part) => part.name === 'roof-deflector')).toBe(true)
    expect(parametricCab(base('daf', 'XF', { tractor: false })).parts.some((part) => part.name === 'roof-deflector')).toBe(false)
  })
})

describe('configurator cabs from the presets', () => {
  beforeAll(async () => {
    await initManifold()
  })

  it('builds each preset cab at its catalogue size with every detail on the cab', () => {
    for (const preset of PRESETS) {
      const cfg = preset.config
      const model = configToModel(cfg, preset.id)
      const spec = model.cab!.parametric!
      expect(spec.brand).toBe(cfg.cab.style)
      expect(spec.variant).toBe(cfg.series)
      const group = buildChassisGroup(model, paramsForConfig(cfg))
      const shell = group.getObjectByName('cab-shell') as THREE.Mesh
      const box = new THREE.Box3().setFromObject(shell)
      expect(box.max.y, preset.id).toBeCloseTo(cfg.cab.height, 0)
      expect(box.max.z - box.min.z, preset.id).toBeCloseTo(cfg.cab.width, 0)
      expect(box.min.x, preset.id).toBeCloseTo(-cfg.frontOverhang + BUMPER_PROUD, -2)
      expect(box.max.x, preset.id).toBeCloseTo(cfg.cab.backFromAxle, 0)
      // Nothing the cab carries may float away from it (mirrors and deflectors stick out a little).
      const cab = shell.parent!
      cab.updateMatrixWorld(true)
      cab.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh || mesh === shell) return
        const part = new THREE.Box3().setFromObject(mesh)
        expect(part.min.x, `${preset.id} ${mesh.name}`).toBeGreaterThan(box.min.x - 80)
        expect(part.max.x, `${preset.id} ${mesh.name}`).toBeLessThan(box.max.x + 300)
        expect(part.max.y, `${preset.id} ${mesh.name}`).toBeLessThan(4001)
        expect(Math.max(-part.min.z, part.max.z), `${preset.id} ${mesh.name}`).toBeLessThan(cfg.cab.width / 2 + 500)
      })
    }
  })

  it('exports the cab to GLB', async () => {
    // Node has Blob but no FileReader; the exporter only needs readAsArrayBuffer/readAsDataURL.
    class NodeFileReader {
      result: ArrayBuffer | string | null = null
      onloadend: (() => void) | null = null
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = buffer
          this.onloadend?.()
        })
      }
      readAsDataURL(blob: Blob) {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`
          this.onloadend?.()
        })
      }
    }
    const scope = globalThis as unknown as { FileReader?: unknown }
    const previous = scope.FileReader
    scope.FileReader = NodeFileReader
    try {
      const cfg = PRESETS.find((preset) => preset.make === 'scania')!.config
      const group = buildChassisGroup(configToModel(cfg), paramsForConfig(cfg))
      const cab = group.getObjectByName('cab')!
      const glb = await new Promise<ArrayBuffer>((resolve, reject) =>
        new GLTFExporter().parse(cab, (out) => resolve(out as ArrayBuffer), reject, { binary: true }),
      )
      expect(new TextDecoder().decode(new Uint8Array(glb, 0, 4))).toBe('glTF')
      expect(glb.byteLength).toBeGreaterThan(200_000)
    } finally {
      scope.FileReader = previous
    }
  })
})
