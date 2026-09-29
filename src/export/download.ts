import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

function visibleCopy(group: THREE.Object3D): THREE.Object3D {
  const root = new THREE.Group()
  root.name = group.name
  root.userData = { ...group.userData }
  group.children.forEach((child) => {
    if (child.visible) root.add(child.clone(true))
  })
  return root
}

/** GLB is Y-up, millimetres, origin at the front axle on the ground. */
export function exportGlb(group: THREE.Object3D): Promise<Blob> {
  const exporter = new GLTFExporter()
  const source = visibleCopy(group)
  return new Promise((resolve, reject) => {
    exporter.parse(
      source,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(new Blob([result], { type: 'model/gltf-binary' }))
        else reject(new Error('Export GLB nevrátil binární data.'))
      },
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true },
    )
  })
}

/** STL in the same Y-up millimetre coordinates as the on-screen model. */
export function exportStl(group: THREE.Object3D): Blob {
  const exporter = new STLExporter()
  const data = exporter.parse(visibleCopy(group), { binary: true })
  if (data instanceof DataView) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return new Blob([bytes], { type: 'model/stl' })
  }
  return new Blob([data], { type: 'model/stl' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
