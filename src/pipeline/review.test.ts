import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildChassisGroup } from '../mesh/build'
import { defaultParams } from '../model/types'
import { analyzeDxf } from './analyze'
import { applyOutline, applyReview, buildReview, newEquipmentFromOutline, reshapeElement, sceneModel } from './review'

describe('detection review', () => {
  const model = analyzeDxf(readFileSync('fixtures/mini-chassis.dxf', 'utf8'))

  it('lists the frame, axles, cab and equipment before any 3D is built', () => {
    const review = buildReview(model)
    expect(review.some((item) => item.role === 'frame' && item.side)).toBe(true)
    expect(review.filter((item) => item.role === 'axle')).toHaveLength(model.axles.length)
    expect(review.some((item) => item.role === 'mudguard')).toBe(true)
    expect(review.some((item) => item.role === 'equipment')).toBe(true)
    expect(review.find((item) => item.role === 'frame')?.fields.some((field) => field.key === 'height')).toBe(true)
  })

  it('sends a corrected type and size into the 3D model', () => {
    const review = buildReview(model)
    const part = review.find((item) => item.role === 'equipment' && item.kind !== 'skip')
    expect(part).toBeTruthy()
    if (!part) return
    part.source = 'user'
    part.confidence = 1
    part.kind = 'battery'
    const kind = part.fields.find((field) => field.key === 'kind')
    if (kind) kind.value = 'battery'
    const length = part.fields.find((field) => field.key === 'length')
    if (length) length.value = 880
    const applied = applyReview(model, review)
    const stored = applied.components.find((item) => item.id === part.id)
    expect(stored?.kind).toBe('battery')
    expect(stored?.source).toBe('user')
    expect(stored?.side && stored.side.x1 - stored.side.x0).toBe(880)
    const group = buildChassisGroup(applied, {
      ...defaultParams,
      show: { ...defaultParams.show, equipment: true, suspension: false, drivetrain: false },
    })
    const tagged = group.getObjectByName('equipment')?.children.find((child) => child.userData.kind === 'battery')
    expect(tagged).toBeTruthy()
    group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
  })

  it('drops a deleted mudguard and keeps the edit when the review is applied again', () => {
    const review = buildReview(model)
    const mud = review.find((item) => item.id === 'mud-0')
    expect(mud).toBeTruthy()
    if (mud) mud.deleted = true
    const applied = applyReview(model, review)
    expect(applied.skipMudguards).toContain(0)
    const again = applyReview(applied, review)
    expect(again.skipMudguards).toContain(0)
  })

  it('reshapes a box into user fields at full confidence', () => {
    const review = buildReview(model)
    const part = review.find((item) => item.role === 'equipment' && item.side && item.kind !== 'skip')
    expect(part?.side).toBeTruthy()
    if (!part?.side) return
    const next = reshapeElement(part, 'side', { x0: part.side.x0, y0: part.side.y0, x1: part.side.x0 + 2400, y1: part.side.y0 + 900 })
    expect(next.confidence).toBe(1)
    expect(next.source).toBe('user')
    expect(next.fields.find((field) => field.key === 'length')?.value).toBe(2400)
    expect(next.fields.find((field) => field.key === 'height')?.value).toBe(900)
    expect(next.fields.find((field) => field.key === 'length')?.estimated).toBe(false)
  })

  it('builds a 3D scene from only the marked elements and keeps the drawing origin', () => {
    const review = buildReview(model)
    const frame = review.find((item) => item.role === 'frame')
    const part = review.find((item) => item.role === 'equipment' && item.kind !== 'skip')
    expect(frame && part).toBeTruthy()
    if (!frame || !part) return
    frame.in3d = true
    const onlyFrame = sceneModel(model, review)
    expect(onlyFrame.omitFrame).toBeFalsy()
    expect(onlyFrame.axles).toHaveLength(0)
    expect(onlyFrame.cab).toBeNull()
    expect(onlyFrame.components).toHaveLength(0)
    expect(onlyFrame.anchorX).toBe(model.axles[0]?.x)
    part.in3d = true
    const withPart = sceneModel(model, review)
    expect(withPart.components.some((item) => item.kind === part.kind)).toBe(true)
    expect(withPart.axles).toHaveLength(0)
    expect(withPart.anchorX).toBe(onlyFrame.anchorX)
    expect(withPart.groundZ).toBe(onlyFrame.groundZ)
  })

  it('keeps a drawn outline and revolves or extrudes it in 3D', () => {
    const review = buildReview(model)
    const part = review.find((item) => item.role === 'equipment' && item.side && item.kind !== 'skip')
    const mud = review.find((item) => item.id === 'mud-0' && item.side)
    const axle = review.find((item) => item.id === 'axle-0')
    expect(part?.side && mud?.side && axle).toBeTruthy()
    if (!part?.side || !mud?.side || !axle) return
    const x = part.side.x0
    const z = part.side.y0
    const ring = [
      { x, y: z },
      { x: x + 100, y: z },
      { x: x + 100, y: z + 40 },
      { x: x + 50, y: z + 80 },
      { x, y: z + 40 },
    ]
    const shaped = applyOutline(part, 'side', ring)
    shaped.kind = 'fuel'
    const kind = shaped.fields.find((field) => field.key === 'kind')
    if (kind) kind.value = 'fuel'
    expect(shaped.confidence).toBe(1)
    expect(shaped.source).toBe('user')
    expect(shaped.outline?.points.length).toBe(5)
    const arch = [
      { x: mud.side.x0, y: mud.side.y0 },
      { x: mud.side.x1, y: mud.side.y0 },
      { x: mud.side.x1, y: mud.side.y1 },
      { x: mud.side.x0, y: mud.side.y1 },
    ]
    const mudOutline = applyOutline(mud, 'side', arch)
    mudOutline.in3d = true
    axle.in3d = true
    shaped.in3d = true
    const next = review.map((item) => (item.id === part.id ? shaped : item.id === mud.id ? mudOutline : item))
    const applied = applyReview(model, next)
    expect(applied.components.find((item) => item.kind === 'fuel')?.profile?.length).toBe(5)
    expect(applied.mudProfiles?.[0]?.points).toHaveLength(4)
    const group = buildChassisGroup(applied, {
      ...defaultParams,
      show: { ...defaultParams.show, equipment: true, axles: true, suspension: false, drivetrain: false },
    })
    let revolved = false
    let extruded = false
    group.traverse((child) => {
      if (child.userData.profile === 'revolve') revolved = true
      if (child.userData.profile === 'extrude') extruded = true
    })
    expect(revolved).toBe(true)
    expect(extruded).toBe(true)
    const withCab = structuredClone(model)
    withCab.cab = {
      side: { x0: x, y0: z, x1: x + 800, y1: z + 600 },
      top: { x0: x, y0: -800, x1: x + 800, y1: 800 },
      samples: [],
      source: 'measured',
    }
    const cabReview = buildReview(withCab)
    const cab = cabReview.find((item) => item.role === 'cab')
    expect(cab).toBeTruthy()
    if (!cab) return
    const cabOutline = applyOutline(cab, 'side', [
      { x, y: z },
      { x: x + 200, y: z + 400 },
      { x: x + 700, y: z + 500 },
      { x: x + 800, y: z + 40 },
      { x, y: z + 40 },
    ])
    const cabModel = applyReview(withCab, cabReview.map((item) => (item.id === cab.id ? cabOutline : item)))
    expect(cabModel.cab?.profile?.length).toBeGreaterThanOrEqual(4)
    const cabGroup = buildChassisGroup(cabModel, defaultParams)
    let cabShell = false
    cabGroup.getObjectByName('cab')?.traverse((child) => {
      if (child.userData.profile === 'extrude') cabShell = true
    })
    expect(cabShell).toBe(true)
    group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
    cabGroup.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
  })

  it('creates equipment from a polygon instead of a plain box', () => {
    const element = newEquipmentFromOutline(
      [
        { x: 1000, y: 700 },
        { x: 1600, y: 700 },
        { x: 1600, y: 1100 },
        { x: 1200, y: 1400 },
      ],
      'side',
      model.frame,
    )
    expect(element.outline?.points).toHaveLength(4)
    expect(element.side && element.side.x1 - element.side.x0).toBe(600)
    expect(element.confidence).toBe(1)
    const scaled = reshapeElement(element, 'side', { x0: 1000, y0: 700, x1: 2200, y1: 1700 })
    expect(scaled.outline?.points).toHaveLength(4)
    expect(polygonSpan(scaled.outline?.points ?? [])).toBeGreaterThan(1000)
  })
})

function polygonSpan(points: { x: number; y: number }[]) {
  const xs = points.map((point) => point.x)
  return Math.max(...xs) - Math.min(...xs)
}
