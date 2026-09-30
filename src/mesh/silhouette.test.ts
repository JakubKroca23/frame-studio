import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildCab, type World } from './detail'
import { initManifold } from './manifold'
import { ringBounds } from '../pipeline/cabOutline'
import { cabFeatures, cabSolid, cabSolidGeometry, cabViews, envelope, solidReport } from './silhouette'

describe('cab envelope fallback', () => {
  it('builds an envelope around the outer points', () => {
    const points = []
    for (let i = 0; i <= 20; i++) {
      const x = i * 100
      points.push({ x, y: 1000 + Math.sin(i / 4) * 80 })
      points.push({ x, y: 2800 - (i < 4 ? i * 80 : 0) })
      points.push({ x, y: 1800 })
    }
    const ring = envelope(points, 12)
    expect(ring).not.toBeNull()
    const ys = ring!.map((point) => point.y)
    expect(Math.max(...ys)).toBeGreaterThan(2700)
    expect(Math.min(...ys)).toBeLessThan(1100)
  })

  it('drops window lines and a stray spike from the outer envelope', () => {
    const points = []
    for (let i = 0; i <= 30; i++) {
      const x = i * 80
      points.push({ x, y: 1000 }, { x, y: 2200 }, { x, y: 1600 })
    }
    points.push({ x: 1200, y: 4000 })
    const ring = envelope(points, 24)
    expect(ring).not.toBeNull()
    const ys = ring!.map((point) => point.y)
    expect(Math.max(...ys)).toBeGreaterThan(2100)
    expect(Math.max(...ys)).toBeLessThan(2500)
    expect(Math.min(...ys)).toBeLessThan(1100)
  })
})

describe('closed cab solid', () => {
  beforeAll(async () => {
    await initManifold()
  })

  // Side: sloped windscreen, flat roof, wheel arch. Plan: tapered nose. Front: rounded roof corners.
  const side = [
    { x: 0, y: 1000 },
    { x: 700, y: 1000 },
    { x: 800, y: 1300 },
    { x: 1300, y: 1300 },
    { x: 1400, y: 1000 },
    { x: 2200, y: 1000 },
    { x: 2200, y: 2400 },
    { x: 520, y: 2400 },
    { x: 0, y: 1500 },
  ]
  const top = [
    { x: 0, y: -1100 },
    { x: 2200, y: -1250 },
    { x: 2200, y: 1250 },
    { x: 0, y: 1100 },
  ]
  const front = [
    { x: -1250, y: 1000 },
    { x: 1250, y: 1000 },
    { x: 1250, y: 2100 },
    { x: 950, y: 2400 },
    { x: -950, y: 2400 },
    { x: -1250, y: 2100 },
  ]

  it('is one closed, consistently outward shell that matches the outlines within a few millimetres', () => {
    const geometry = cabSolidGeometry(side, top, front)
    expect(geometry).not.toBeNull()
    const report = solidReport(geometry!)
    expect(report.boundary).toBe(0)
    expect(report.nonManifold).toBe(0)
    expect(report.misoriented).toBe(0)
    expect(report.shells).toBe(1)
    expect(report.volume).toBeGreaterThan(0)
    geometry!.computeBoundingBox()
    const bb = geometry!.boundingBox!
    expect(Math.abs(bb.min.x - 0)).toBeLessThan(3)
    expect(Math.abs(bb.max.x - 2200)).toBeLessThan(3)
    expect(Math.abs(bb.min.y - 1000)).toBeLessThan(3)
    expect(Math.abs(bb.max.y - 2400)).toBeLessThan(3)
    expect(Math.abs(bb.min.z + 1250)).toBeLessThan(3)
    expect(Math.abs(bb.max.z - 1250)).toBeLessThan(3)
    // The front view rounds the roof corners: no vertex sits at the roof edge corner.
    const position = geometry!.getAttribute('position')
    let cornerHits = 0
    for (let index = 0; index < position.count; index++) {
      if (position.getY(index) > 2390 && Math.abs(position.getZ(index)) > 1200) cornerHits++
    }
    expect(cornerHits).toBe(0)
    geometry!.dispose()
  })

  it('works without a front view', () => {
    const geometry = cabSolidGeometry(side, top, null)
    expect(geometry).not.toBeNull()
    const report = solidReport(geometry!)
    expect(report.boundary).toBe(0)
    expect(report.misoriented).toBe(0)
    expect(report.volume).toBeGreaterThan(0)
  })

  it('cuts glass, grille and lamps as closed skins on the body', () => {
    const result = cabSolid({ side, top, front }, cabFeatures('volvo-bep'))
    expect(result).not.toBeNull()
    const parts = new Set(result!.parts.map((part) => part.part))
    expect(parts.has('glass')).toBe(true)
    expect(parts.has('grille')).toBe(true)
    expect(parts.has('lamp')).toBe(true)
    for (const part of result!.parts) {
      const report = solidReport(part.geometry)
      expect(report.boundary).toBe(0)
      expect(report.misoriented).toBe(0)
      expect(report.volume).toBeGreaterThan(0)
    }
  })

  it('mounts the details on the closed shell', () => {
    const cab = {
      side: { x0: 0, y0: 1000, x1: 2200, y1: 2400 },
      top: { x0: 0, y0: -1250, x1: 2200, y1: 1250 },
      samples: [],
      silhouettes: { side, top, front },
    }
    const group = buildCab(cab, {
      model: { profileId: 'volvo-bep' },
      originX: 100,
      ground: 200,
      centerY: 10,
      lift: () => 40,
    } as World)
    const parts = new Set<string>()
    let shell: THREE.Mesh | null = null
    group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.name === 'cab-shell') shell = mesh
      if (typeof mesh.userData.part === 'string') parts.add(mesh.userData.part)
    })
    expect(shell).not.toBeNull()
    const report = solidReport(shell!.geometry as THREE.BufferGeometry)
    expect(report.boundary).toBe(0)
    expect(report.nonManifold).toBe(0)
    expect(report.misoriented).toBe(0)
    expect(report.volume).toBeGreaterThan(0)
    expect(parts.has('glass')).toBe(true)
    expect(parts.has('grille')).toBe(true)
    expect(parts.has('lamp')).toBe(true)
  })

  it('follows a cab box that was edited in the review', () => {
    const sideBox = { x0: 0, y0: 1000, x1: 2200, y1: 2400 }
    const topBox = { x0: 0, y0: -1250, x1: 2200, y1: 1250 }
    const cab = { side: sideBox, top: topBox, samples: [], silhouettes: { side, top, front, frame: { side: sideBox, top: topBox } } }
    const same = cabViews(cab)!
    expect(ringBounds(same.side).x1).toBeCloseTo(2200, 3)
    const edited = cabViews({ ...cab, side: { ...sideBox, x1: 2500, y1: 2600 }, top: { ...topBox, x1: 2500 } })!
    expect(ringBounds(edited.side).x1).toBeCloseTo(2500, 3)
    expect(ringBounds(edited.side).y1).toBeCloseTo(2600, 3)
    expect(ringBounds(edited.top).x1).toBeCloseTo(2500, 3)
  })

  it('falls back to a simple cab when the outlines cannot make a solid', () => {
    const cab = {
      side: { x0: 0, y0: 1000, x1: 2200, y1: 2400 },
      top: { x0: 0, y0: -1250, x1: 2200, y1: 1250 },
      samples: [],
      silhouettes: {
        side: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 3, y: 0 },
        ],
        top,
      },
    }
    const world = { model: { profileId: 'scania-icd' }, originX: 0, ground: 0, centerY: 0, lift: () => 0 } as unknown as World
    const group = buildCab(cab, world)
    expect(group.getObjectByName('cab-shell')).toBeUndefined()
    let meshes = 0
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes++
    })
    expect(meshes).toBeGreaterThan(3)
  })
})
