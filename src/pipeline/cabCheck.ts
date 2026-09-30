import * as THREE from 'three'
import { buildChassisGroup } from '../mesh/build'
import { initManifold } from '../mesh/manifold'
import { solidReport } from '../mesh/silhouette'
import { defaultParams, type ChassisModel } from '../model/types'
import { ringBounds } from './cabOutline'

/**
 * Builds the chassis and measures the cab shell: topology report, shell size, the size of the
 * traced drawing outlines it should match, and the detail parts. Shared by the sample tests.
 */
export async function measureCab(model: ChassisModel) {
  await initManifold()
  const group = buildChassisGroup(model, { ...defaultParams, holes: 'off', linerEnabled: false })
  const shell = group.getObjectByName('cab-shell') as THREE.Mesh | undefined
  if (!shell) throw new Error('no cab-shell')
  const report = solidReport(shell.geometry)
  shell.geometry.computeBoundingBox()
  const size = shell.geometry.boundingBox!.getSize(new THREE.Vector3())
  const sil = model.cab!.silhouettes!
  const side = ringBounds(sil.side!)
  const top = ringBounds(sil.top!)
  const drawing = { length: side.x1 - side.x0, height: side.y1 - side.y0, width: top.y1 - top.y0 }
  const parts = new Map<string, ReturnType<typeof solidReport>[]>()
  group.getObjectByName('cab')?.traverse((child) => {
    const mesh = child as THREE.Mesh
    const part = child.userData.part
    if (!mesh.isMesh || typeof part !== 'string' || !child.name.startsWith('cab-')) return
    parts.set(part, [...(parts.get(part) ?? []), solidReport(mesh.geometry)])
  })
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose()
  })
  return { report, size, drawing, parts }
}
