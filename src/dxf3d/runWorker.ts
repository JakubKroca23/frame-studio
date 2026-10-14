import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { CraneSheet } from '../craneTpl/sheet'
import type { Dxf3dAnalysis, ViewAssignment, ViewDeviation, ViewSet } from './types'

export interface Dxf3dResult {
  analysis: Dxf3dAnalysis
  views: ViewSet | null
  geometry: THREE.BufferGeometry | null
  volume: number
  watertight: boolean
  holesCut: number
  deviations: ViewDeviation[]
  /** HIAB crane sheet: the template flow replaces the silhouette solid (analysis is then empty) */
  crane?: CraneSheet
}

type Progress = (message: string) => void

function openWorker(): Worker {
  return new Worker(new URL('../worker/parseWorker.ts', import.meta.url), { type: 'module' })
}

function runWorker<T>(payload: unknown, transfer: Transferable[], onProgress: Progress | undefined, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = openWorker()
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Worker se nepodařilo spustit.'))
      return
    }
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Zpracování DXF → 3D trvalo příliš dlouho.'))
    }, timeoutMs)
    worker.onmessage = (event: MessageEvent) => {
      if (event.data?.progress) {
        onProgress?.(event.data.progress)
        return
      }
      window.clearTimeout(timer)
      worker.terminate()
      resolve(event.data as T)
    }
    worker.onerror = () => {
      window.clearTimeout(timer)
      worker.terminate()
      reject(new Error('Zpracování ve workeru selhalo.'))
    }
    worker.postMessage(payload, transfer)
  })
}

export function geometryFrom(mesh: { positions: Float32Array; indices: Uint32Array } | null): THREE.BufferGeometry | null {
  if (!mesh) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
  // CAD edges stay sharp: split normals at creases over 30°.
  const creased = toCreasedNormals(g, Math.PI / 6)
  g.dispose()
  creased.computeBoundingBox()
  creased.computeBoundingSphere()
  return creased
}

export async function runDxf3d(text: string, onProgress?: Progress, timeoutMs = 180000): Promise<Dxf3dResult> {
  const raw = await runWorker<{
    ok: boolean
    error?: string
    analysis?: Dxf3dAnalysis
    views?: ViewSet | null
    mesh?: { positions: Float32Array; indices: Uint32Array; volume: number; watertight: boolean; holesCut: number } | null
    deviations?: ViewDeviation[]
    crane?: CraneSheet
  }>({ mode: 'dxf3d', text }, [], onProgress, timeoutMs)
  if (raw.ok && raw.crane) return { analysis: null as unknown as Dxf3dAnalysis, views: null, geometry: null, volume: 0, watertight: false, holesCut: 0, deviations: [], crane: raw.crane }
  if (!raw.ok || !raw.analysis) throw new Error(raw.error || 'DXF → 3D selhalo.')
  return {
    analysis: raw.analysis,
    views: raw.views ?? null,
    geometry: geometryFrom(raw.mesh ?? null),
    volume: raw.mesh?.volume ?? 0,
    watertight: raw.mesh?.watertight ?? false,
    holesCut: raw.mesh?.holesCut ?? 0,
    deviations: raw.deviations ?? [],
  }
}

export async function rebuildDxf3d(analysis: Dxf3dAnalysis, assignment: ViewAssignment, onProgress?: Progress): Promise<Dxf3dResult> {
  const raw = await runWorker<{
    ok: boolean
    error?: string
    analysis?: Dxf3dAnalysis
    views?: ViewSet | null
    mesh?: { positions: Float32Array; indices: Uint32Array; volume: number; watertight: boolean; holesCut: number } | null
    deviations?: ViewDeviation[]
  }>({ mode: 'dxf3d-rebuild', analysis, assignment }, [], onProgress, 120000)
  if (!raw.ok || !raw.analysis) throw new Error(raw.error || 'Přestavba 3D selhala.')
  return {
    analysis: raw.analysis,
    views: raw.views ?? null,
    geometry: geometryFrom(raw.mesh ?? null),
    volume: raw.mesh?.volume ?? 0,
    watertight: raw.mesh?.watertight ?? false,
    holesCut: raw.mesh?.holesCut ?? 0,
    deviations: raw.deviations ?? [],
  }
}
