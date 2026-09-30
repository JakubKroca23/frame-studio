import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildChassisGroup } from '../mesh/build'
import { defaultParams } from '../model/types'
import { analyzeDxf } from './analyze'
import { applyReview, buildReview, reshapeElement, sceneModel } from './review'

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
})
