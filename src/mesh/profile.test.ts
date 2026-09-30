import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { extrudeProfile, profileShape, profileStations, revolveProfile } from './profile'

const peaked = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 40 },
  { x: 50, y: 80 },
  { x: 0, y: 40 },
]

describe('precise profiles', () => {
  it('chooses revolution for tanks and extrusion for boxes', () => {
    expect(profileShape('fuel')).toBe('revolve')
    expect(profileShape('adblue')).toBe('revolve')
    expect(profileShape('case')).toBe('extrude')
    expect(profileShape('crane')).toBe('typed')
  })

  it('reads the side silhouette instead of the bounding box', () => {
    const stations = profileStations(peaked, 4)
    const mid = stations.reduce((best, station) => (Math.abs(station.x - 50) < Math.abs(best.x - 50) ? station : best))
    expect(mid.z1 - mid.z0).toBeGreaterThan(70)
    const end = stations.find((station) => station.x < 5)
    expect(end && end.z1 - end.z0).toBeLessThan(50)
  })

  it('builds a revolved tank and an extruded outline', () => {
    const mat = new THREE.MeshStandardMaterial()
    const spun = revolveProfile(peaked, 0, 0, 0, 1, mat)
    const prism = extrudeProfile(peaked, 0, 0, -40, 40, 0, mat)
    expect(spun?.userData.profile).toBe('revolve')
    expect(prism?.userData.profile).toBe('extrude')
    expect(spun?.geometry.getAttribute('position').count).toBeGreaterThan(30)
    expect(prism?.geometry.getAttribute('position').count).toBeGreaterThan(8)
    spun?.geometry.dispose()
    prism?.geometry.dispose()
    mat.dispose()
  })
})
