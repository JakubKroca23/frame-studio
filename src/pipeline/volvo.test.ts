import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeDrawing } from '../io/decodeDrawing'
import { buildChassisGroup } from '../mesh/build'
import { defaultParams, type ChassisModel } from '../model/types'
import { analyzeDxf } from './analyze'

let model: ChassisModel

beforeAll(() => {
  const gz = new Uint8Array(readFileSync('public/samples/volvo-vssb-25-277591.dxf.gz'))
  const text = decodeDrawing('volvo-vssb-25-277591.dxf.gz', gz)
  model = analyzeDxf(text)
}, 180000)

describe('archive decode', () => {
  it('reads a .dxf.gz that the browser already inflated', () => {
    const raw = new TextEncoder().encode('  0\nSECTION\n')
    expect(decodeDrawing('drawing.dxf.gz', raw)).toContain('SECTION')
  })
})

describe('Volvo BEP sample', () => {
  it('detects the Volvo profile and the order identity', () => {
    expect(model.profileId).toBe('volvo-bep')
    expect(model.header.orderNo).toBe('VSSB-25-277591')
    expect(model.header.cabType).toBe('FM')
    expect(model.header.chassisType).toMatch(/FM/)
    expect(model.units).toBe('mm')
    expect(model.warnings.join(' ')).not.toMatch(/nesedí na vzdálenost/)
  })

  it('reads the governing dimensions', () => {
    const value = (label: string) => model.dimensions.find((d) => d.label === label)?.value
    expect(value('L011')).toBe(5100)
    expect(value('L012.1')).toBe(1995)
    expect(value('L012.2')).toBe(3105)
    expect(value('L012.3')).toBe(1370)
    expect(value('L015')).toBe(4788)
    expect(value('L016')).toBe(1520)
    expect(value('L018')).toBe(1275)
    expect(value('L019')).toBe(1275)
    expect(value('W036')).toBe(852)
    expect(value('W035')).toBe(1080)
    expect(value('H032')).toBe(300)
    expect(value('W032')).toBe(90)
  })

  it('checks geometry against the dimension labels', () => {
    const verified = (label: string) => model.dimensions.find((d) => d.label === label)?.verified
    for (const label of ['L011', 'L012.1', 'L012.2', 'L012.3', 'L015', 'W036', 'W035', 'H032', 'W032', 'L019', 'L018']) {
      expect(verified(label)?.ok, label).toBe(true)
    }
  })

  it('finds four axles, twin rear tyres and the tapered frame', () => {
    const expectedX = [2982, 4976, 8082, 9452]
    model.axles.forEach((axle, index) => {
      expect(Math.abs(axle.x - expectedX[index]), `axle ${index}`).toBeLessThanOrEqual(1)
    })
    expect(model.axles.map((a) => a.dual)).toEqual([false, false, true, true])
    expect(model.axles[0].tireDiameter).toBeGreaterThanOrEqual(1070)
    expect(model.axles[0].tireDiameter).toBeLessThanOrEqual(1074)
    expect(model.axles[2].tireDiameter).toBeGreaterThanOrEqual(1074)
    expect(model.axles[2].tireDiameter).toBeLessThanOrEqual(1078)
    expect(model.axles[0].tireSpec).toMatch(/385\/65R22\.5/)
    expect(model.axles[2].tireSpec).toMatch(/315\/80R22\.5/)
    expect(model.axles[0].track).toBe(2109)
    expect(model.axles[2].track).toBe(1837)

    const frame = model.frame
    expect(frame).not.toBeNull()
    expect(frame!.outerWidthStraight).toBeGreaterThan(840)
    expect(frame!.outerWidthStraight).toBeLessThan(870)
    expect(frame!.frontOuterWidth).toBeGreaterThan(1040)
    expect(frame!.frontOuterWidth).toBeLessThan(1120)
    expect(frame!.topZ - frame!.bottomZ).toBeCloseTo(300, 0)
    expect(frame!.flangeWidth).toBeGreaterThan(80)
    expect(frame!.flangeWidth).toBeLessThan(100)
    expect(frame!.left[0].x).toBeLessThan(1800)
    expect(frame!.left[frame!.left.length - 1].x).toBeGreaterThan(10700)
    expect(frame!.liner).not.toBeNull()
    expect(frame!.liner!.x0).toBeGreaterThan(4290)
    expect(frame!.liner!.x0).toBeLessThan(4350)
    expect(frame!.liner!.x1).toBeGreaterThan(9930)
    expect(frame!.liner!.x1).toBeLessThan(9990)
  })

  it('reads the rolled C-section and places holes on the web', () => {
    const section = model.frame?.section
    expect(section).not.toBeNull()
    expect(section!.height).toBe(300)
    expect(section!.flangeWidth).toBe(90)
    expect(section!.webThickness).toBe(8)
    expect(section!.flangeThickness).toBe(8)
    expect(section!.outerRadius).toBe(13)
    expect(section!.innerRadius).toBe(5)
    expect(model.holes.length).toBeGreaterThan(200)
    const dia = model.holes.filter((h) => Math.abs(h.d - 15.5) < 0.3).length
    expect(dia).toBeGreaterThan(40)
    const frame = model.frame!
    const onWeb = model.holes.filter((h) => h.z >= frame.bottomZ - 2 && h.z <= frame.topZ + 2).length
    expect(onWeb).toBe(model.holes.length)
  })

  it('keeps the front view and does not swallow the rear PTO detail', () => {
    expect(model.views.front).not.toBeNull()
    expect(model.preview.segments.front.length).toBeGreaterThan(40)
    expect(model.views.side).not.toBeNull()
    expect(model.views.top).not.toBeNull()
    const front = model.views.front!
    const side = model.views.side!
    expect(front.x0).toBeGreaterThan(side.x1 - 500)
    expect(front.y1).toBeLessThan(18000)
    expect(model.cab).not.toBeNull()
    expect(model.components.length).toBeGreaterThan(5)
  })

  it('builds a frame about nine metres long with wheels on the ground', () => {
    const group = buildChassisGroup(model, {
      ...defaultParams,
      lod: 1,
      holes: 'off',
      linerEnabled: false,
      webThickness: 8,
      flangeThickness: 8,
      cornerRadius: 13,
    })
    const frame = group.getObjectByName('frame')
    expect(frame).toBeTruthy()
    const box = new THREE.Box3().setFromObject(frame!)
    const size = box.getSize(new THREE.Vector3())
    expect(Math.abs(size.y - 300)).toBeLessThan(16)
    expect(size.x).toBeGreaterThan(8800)
    expect(size.x).toBeLessThan(9800)
    const wheels = group.getObjectByName('axles')
    expect(wheels).toBeTruthy()
    const wheelBox = new THREE.Box3().setFromObject(wheels!)
    expect(wheelBox.min.y).toBeGreaterThan(-8)
    expect(wheelBox.min.y).toBeLessThan(12)
    const detailed = buildChassisGroup(model, {
      ...defaultParams,
      holes: 'off',
      linerEnabled: false,
      show: { ...defaultParams.show, drivetrain: true, suspension: true },
    })
    expect(detailed.getObjectByName('drivetrain')).toBeTruthy()
    expect(detailed.getObjectByName('equipment')!.children.length).toBeGreaterThan(4)
    let springs = 0
    detailed.getObjectByName('axles')?.traverse((obj) => {
      if (obj.userData.part === 'suspension') springs++
    })
    expect(springs).toBe(8)
    detailed.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
    expect(model.stats.parseMs).toBeLessThan(90000)
  })
})
