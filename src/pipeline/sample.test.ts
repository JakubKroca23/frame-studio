import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildChassisGroup } from '../mesh/build'
import { measureCab } from './cabCheck'
import { defaultParams, type ChassisModel } from '../model/types'
import { tireDiameterMm } from '../lib/geom'
import { analyzeDxf } from './analyze'
import { initManifold } from '../mesh/manifold'

let model: ChassisModel

beforeAll(() => {
  const text = readFileSync('public/samples/scania-icd-sample.dxf', 'latin1')
  model = analyzeDxf(text)
})

describe('Scania ICD sample', () => {
  it('detects the Scania profile and the chassis identity', () => {
    expect(model.profileId).toBe('scania-icd')
    expect(model.header.chassisType).toMatch(/G 360E/)
    expect(model.header.icdNo).toBe('2492101765219')
    expect(model.units).toBe('mm')
  })

  it('reads the governing dimensions', () => {
    const value = (label: string) => model.dimensions.find((d) => d.label === label)?.value
    expect(value('L011')).toBe(4950)
    expect(value('L012.2')).toBe(1350)
    expect(value('L016')).toBe(1450)
    expect(value('L019')).toBe(1960)
    expect(value('W036')).toBe(768)
    expect(value('W032.1')).toBe(90)
    expect(value('H032.1')).toBe(270)
    expect(value('H036')).toBe(973)
    expect(value('H035')).toBe(994)
    expect(value('W013.1')).toBe(2117)
    expect(value('W013.2')).toBe(1830)
    expect(value('W013.3')).toBe(2091)
    expect(value('L022.2')).toBe(1076)
  })

  it('verifies wheelbase, frame section and rear overhang against the geometry', () => {
    const verified = (label: string) => model.dimensions.find((d) => d.label === label)?.verified
    expect(verified('L011')?.ok).toBe(true)
    expect(verified('L012.2')?.ok).toBe(true)
    expect(verified('W036')?.ok).toBe(true)
    expect(verified('H032.1')?.ok).toBe(true)
    expect(verified('L019')?.ok).toBe(true)
    expect(Math.abs(verified('W036')?.delta ?? 99)).toBeLessThanOrEqual(3)
    expect(Math.abs(verified('H032.1')?.delta ?? 99)).toBeLessThanOrEqual(3)
  })

  it('finds three axles, a flared frame and the main hole pattern', () => {
    expect(model.axles.map((a) => a.x)).toEqual([1950, 6900, 8250])
    expect(model.axles.map((a) => a.tireDiameter)).toEqual([1072, 1076, 1072])
    const frame = model.frame
    expect(frame).not.toBeNull()
    expect(frame!.outerWidthStraight).toBeGreaterThan(760)
    expect(frame!.outerWidthStraight).toBeLessThan(776)
    expect(frame!.frontOuterWidth).toBeGreaterThan(1000)
    expect(frame!.frontOuterWidth).toBeLessThan(1150)
    expect(frame!.topZ - frame!.bottomZ).toBeCloseTo(270, 0)
    expect(frame!.left[0].x).toBeLessThan(1100)
    expect(frame!.left[frame!.left.length - 1].x).toBeGreaterThan(10000)
    // Identical circles (same side, centre and diameter) are collapsed.
    expect(model.holes.length).toBeGreaterThan(700)
    const dia148 = model.holes.filter((h) => Math.abs(h.d - 14.8) < 0.2).length
    expect(dia148).toBeGreaterThan(400)
    expect(model.cab).not.toBeNull()
    expect(model.components.length).toBeGreaterThan(8)
    expect(model.crossmembers.length).toBeGreaterThanOrEqual(4)
  })

  it('builds a watertight cab whose size matches the drawing outlines', async () => {
    const { report, size, drawing, parts } = await measureCab(model)
    expect(report.boundary).toBe(0)
    expect(report.nonManifold).toBe(0)
    expect(report.misoriented).toBe(0)
    expect(report.shells).toBe(1)
    expect(report.volume).toBeGreaterThan(0)
    expect(Math.abs(size.x - drawing.length)).toBeLessThan(4)
    expect(Math.abs(size.y - drawing.height)).toBeLessThan(4)
    expect(Math.abs(size.z - drawing.width)).toBeLessThan(4)
    // Body without mirrors, antenna and roof lamps, measured off the drawing (mm).
    expect(Math.abs(size.x - 2083)).toBeLessThan(15)
    expect(Math.abs(size.y - 2761)).toBeLessThan(15)
    expect(Math.abs(size.z - 2562)).toBeLessThan(15)
    const cab = model.cab!
    expect(size.x).toBeLessThanOrEqual(cab.side.x1 - cab.side.x0 + 2)
    expect(size.y).toBeLessThanOrEqual(cab.side.y1 - cab.side.y0 + 2)
    expect(size.z).toBeLessThanOrEqual(Math.abs(cab.top.y1 - cab.top.y0) + 2)
    for (const part of ['glass', 'grille', 'lamp']) {
      expect(parts.get(part)?.length ?? 0).toBeGreaterThan(0)
      for (const skin of parts.get(part) ?? []) {
        expect(skin.boundary).toBe(0)
        expect(skin.misoriented).toBe(0)
      }
    }
  })

  it('keeps cab accessories out of the chassis equipment', async () => {
    // Block 2488852 sits on the cab layer at windscreen height; it used to become a grey box
    // floating in front of the windscreen.
    expect(model.components.some((part) => part.partNumber === '2488852')).toBe(false)
    await initManifold()
    const group = buildChassisGroup(model, { ...defaultParams, lod: 2 })
    group.updateMatrixWorld(true)
    const shell = group.getObjectByName('cab-shell')!
    const cabBox = new THREE.Box3().setFromObject(shell)
    const frameTop = model.frame!.topZ - (group.userData.ground as number)
    expect(Number.isFinite(frameTop)).toBe(true)
    for (const name of ['components', 'equipment']) {
      group.getObjectByName(name)?.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return
        const box = new THREE.Box3().setFromObject(object)
        const atCab = box.max.x > cabBox.min.x - 400 && box.min.x < cabBox.max.x
        expect(atCab && box.min.y > frameTop + 700, `${name}/${object.parent?.name}`).toBe(false)
      })
    }
  })

  it('builds a frame whose bounding box matches the drawing', () => {
    const group = buildChassisGroup(model, { ...defaultParams, lod: 0, holes: 'off', linerEnabled: false })
    const frame = group.getObjectByName('frame')
    expect(frame).toBeTruthy()
    const box = new THREE.Box3().setFromObject(frame!)
    const size = box.getSize(new THREE.Vector3())
    expect(Math.abs(size.y - 270)).toBeLessThan(12)
    expect(size.x).toBeGreaterThan(9000)
    expect(size.x).toBeLessThan(9800)
    expect(size.z).toBeGreaterThan(1000)
    expect(size.z).toBeLessThan(1250)
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  })

  it('cuts the web hole pattern without producing invalid vertices', () => {
    const t0 = performance.now()
    const group = buildChassisGroup(model, { ...defaultParams, lod: 2, holes: 'geometry' })
    const ms = performance.now() - t0
    let tris = 0
    let invalid = 0
    group.traverse((obj) => {
      const geo = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      if (!geo) return
      const pos = geo.getAttribute('position')
      if (!pos) return
      tris += (geo.getIndex()?.count ?? pos.count) / 3
      for (let i = 0; i < pos.count; i++) {
        if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) invalid++
      }
    })
    expect(invalid).toBe(0)
    expect(tris).toBeGreaterThan(5000)
    expect(ms).toBeLessThan(8000)
    const box = new THREE.Box3().setFromObject(group)
    expect(box.min.y).toBeLessThan(5)
    expect(box.max.y).toBeGreaterThan(2500)
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  })

  it('builds suspension, a driveline and running equipment around the axles', () => {
    const group = buildChassisGroup(model, {
      ...defaultParams,
      show: { ...defaultParams.show, drivetrain: true, suspension: true },
    })
    expect(group.getObjectByName('drivetrain')).toBeTruthy()
    expect(group.getObjectByName('equipment')).toBeTruthy()
    let springs = 0
    group.getObjectByName('axles')?.traverse((obj) => {
      if (obj.userData.part === 'suspension') springs++
    })
    expect(springs).toBe(6)
    const box = new THREE.Box3().setFromObject(group.getObjectByName('axles')!)
    expect(Math.abs(box.min.y)).toBeLessThan(8)
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
  })

  it('places wheels on the ground one wheelbase apart', () => {
    const group = buildChassisGroup(model, { ...defaultParams, lod: 1, holes: 'markers' })
    const axles = group.getObjectByName('axles')
    expect(axles).toBeTruthy()
    const xs = axles!.children.map((child) => child.userData.drawingX as number).sort((a, b) => a - b)
    expect(xs[1] - xs[0]).toBe(4950)
    expect(xs[2] - xs[1]).toBe(1350)
    const box = new THREE.Box3().setFromObject(axles!)
    expect(Math.abs(box.min.y)).toBeLessThan(8)
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
    })
  })
})

describe('tire size', () => {
  it('converts 315/80 R22.5 to about 1076 mm', () => {
    const d = tireDiameterMm('315/80 R22.5')
    expect(d).not.toBeNull()
    expect(Math.abs((d ?? 0) - 1076)).toBeLessThan(2)
  })
})
