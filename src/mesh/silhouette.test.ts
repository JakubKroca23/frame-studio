import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { buildCab, type World } from './detail'
import { initManifold } from './manifold'
import { cabSections, cabSolidGeometry, envelope, solidReport } from './silhouette'

describe('cab silhouettes', () => {
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

  it('clips the front silhouette with the side and top envelopes', () => {
    const side = [
      { x: 0, y: 1000 },
      { x: 400, y: 2200 },
      { x: 1800, y: 2400 },
      { x: 1800, y: 1000 },
    ]
    const top = [
      { x: 0, y: -800 },
      { x: 1800, y: -1100 },
      { x: 1800, y: 1100 },
      { x: 0, y: 800 },
    ]
    const front = [
      { x: 0, y: 0 },
      { x: 100, y: 80 },
      { x: 200, y: 0 },
      { x: 100, y: -20 },
    ]
    const sections = cabSections(side, top, front, 8)
    expect(sections.length).toBeGreaterThan(4)
    const mid = sections[Math.floor(sections.length / 2)]
    const lateral = mid.loop.map((point) => point.x)
    const height = mid.loop.map((point) => point.y)
    expect(Math.max(...height) - Math.min(...height)).toBeGreaterThan(800)
    expect(Math.max(...lateral) - Math.min(...lateral)).toBeGreaterThan(1000)
    expect(Math.max(...lateral)).toBeLessThanOrEqual(1100.1)
    expect(Math.min(...height)).toBeGreaterThanOrEqual(999)
  })
})

describe('closed cab solid', () => {
  beforeAll(async () => {
    await initManifold()
  })

  const side = [
    { x: 0, y: 1000 },
    { x: 520, y: 2400 },
    { x: 2200, y: 2400 },
    { x: 2200, y: 1000 },
  ]
  const top = [
    { x: 0, y: -800 },
    { x: 2200, y: -1100 },
    { x: 2200, y: 1400 },
    { x: 0, y: 900 },
  ]
  const front = [
    { x: 10, y: 20 },
    { x: 90, y: 20 },
    { x: 90, y: 80 },
    { x: 10, y: 80 },
  ]

  it('is a single closed shell and matches the drawing box within a few millimetres', () => {
    const geometry = cabSolidGeometry(side, top, front)
    expect(geometry).not.toBeNull()
    const report = solidReport(geometry!)
    expect(report.boundary).toBe(0)
    expect(report.nonManifold).toBe(0)
    expect(report.shells).toBe(1)
    expect(report.volume).toBeGreaterThan(0)
    geometry!.computeBoundingBox()
    const size = geometry!.boundingBox!.getSize(new THREE.Vector3())
    expect(Math.abs(size.x - 2200)).toBeLessThan(6)
    expect(Math.abs(size.y - 1400)).toBeLessThan(6)
    expect(Math.abs(size.z - 2500)).toBeLessThan(6)
    const position = geometry!.getAttribute('position')
    let noseLow = Infinity
    let noseHigh = Infinity
    let zMin = Infinity
    let zMax = -Infinity
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index)
      const y = position.getY(index)
      const z = position.getZ(index)
      if (y < 1150) noseLow = Math.min(noseLow, x)
      if (y > 2200) noseHigh = Math.min(noseHigh, x)
      zMin = Math.min(zMin, z)
      zMax = Math.max(zMax, z)
    }
    expect(noseHigh - noseLow).toBeGreaterThan(250)
    expect(zMax).toBeGreaterThan(1300)
    expect(zMin).toBeLessThan(-1000)
    expect(zMax + zMin).toBeGreaterThan(0)
    geometry!.dispose()
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

  it('mounts glass, grille and lamps on the closed shell', () => {
    const cab = {
      side: { x0: 0, y0: 1000, x1: 2200, y1: 2400 },
      top: { x0: 0, y0: -1100, x1: 2200, y1: 1400 },
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
    expect(report.volume).toBeGreaterThan(0)
    expect(parts.has('glass')).toBe(true)
    expect(parts.has('grille')).toBe(true)
    expect(parts.has('lamp')).toBe(true)
    group.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
    })
  })
})
