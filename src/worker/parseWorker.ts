import { analyzeDxf } from '../pipeline/analyze'
import { analyzeDxf3d } from '../dxf3d/analyze'
import { readCraneSheet } from '../craneTpl/sheet'
import { buildSolid } from '../dxf3d/build'
import { buildViewSet } from '../dxf3d/views'
import type { Dxf3dAnalysis, ViewAssignment, ViewSet } from '../dxf3d/types'
import type { ViewDeviation } from '../dxf3d/types'
import { initManifold, manifoldApi } from '../mesh/manifold'

export interface WorkerOk {
  ok: true
  model: ReturnType<typeof analyzeDxf>
}
export interface WorkerErr {
  ok: false
  error: string
}

export type Dxf3dWorkerResult =
  | {
      ok: true
      mode: 'dxf3d'
      analysis: Dxf3dAnalysis
      views: ViewSet | null
      mesh: { positions: Float32Array; indices: Uint32Array; volume: number; watertight: boolean; holesCut: number } | null
      deviations: ViewDeviation[]
    }
  | { ok: false; mode: 'dxf3d'; error: string }

self.onmessage = (event: MessageEvent<{ text?: string; dwg?: ArrayBuffer; mode?: string; analysis?: Dxf3dAnalysis; assignment?: ViewAssignment }>) => {
  void (async () => {
    try {
      if (event.data.mode === 'dxf3d-rebuild' && event.data.analysis && event.data.assignment) {
        self.postMessage({ progress: 'Sestavuji 3D…' })
        await initManifold()
        const views = buildViewSet(event.data.analysis, event.data.assignment)
        const built = buildSolid(manifoldApi()!, views)
        const mesh = built
          ? {
              positions: new Float32Array(built.geometry.getAttribute('position').array as Float32Array),
              indices: new Uint32Array(built.geometry.getIndex()!.array as Uint32Array),
              volume: built.volume,
              watertight: built.watertight,
              holesCut: built.holesCut,
            }
          : null
        built?.geometry.dispose()
        const result: Dxf3dWorkerResult = {
          ok: true,
          mode: 'dxf3d',
          analysis: event.data.analysis,
          views,
          mesh,
          deviations: built?.deviations ?? [],
        }
        self.postMessage(result)
        return
      }
      if (event.data.mode === 'dxf3d') {
        let text = event.data.text ?? ''
        if (event.data.dwg) {
          self.postMessage({ progress: 'Čtu DWG…' })
          const { dwgBytesToDxf } = await import('../io/dwg')
          text = await dwgBytesToDxf(new Uint8Array(event.data.dwg))
        }
        // HIAB crane sheet → template flow (articulated sample model adapted to the drawing), no silhouette envelope
        self.postMessage({ progress: 'Hledám výkres jeřábu…' })
        const crane = readCraneSheet(text)
        if (crane.isCrane) {
          self.postMessage({ ok: true, mode: 'dxf3d', crane, analysis: null, views: null, mesh: null, deviations: [] })
          return
        }
        const analysis = analyzeDxf3d(text, (stage) => self.postMessage({ progress: stage }))
        let views: ViewSet | null = null
        let mesh: { positions: Float32Array; indices: Uint32Array; volume: number; watertight: boolean; holesCut: number } | null = null
        let deviations: ViewDeviation[] = []
        if (analysis.assignment) {
          self.postMessage({ progress: 'Sestavuji 3D…' })
          await initManifold()
          views = buildViewSet(analysis, analysis.assignment)
          const built = buildSolid(manifoldApi()!, views)
          if (built) {
            mesh = {
              positions: new Float32Array(built.geometry.getAttribute('position').array as Float32Array),
              indices: new Uint32Array(built.geometry.getIndex()!.array as Uint32Array),
              volume: built.volume,
              watertight: built.watertight,
              holesCut: built.holesCut,
            }
            deviations = built.deviations
            built.geometry.dispose()
          }
        }
        const result: Dxf3dWorkerResult = { ok: true, mode: 'dxf3d', analysis, views, mesh, deviations }
        self.postMessage(result)
        return
      }

      let text = event.data.text ?? ''
      if (event.data.dwg) {
        self.postMessage({ progress: 'Čtu DWG…' })
        const { dwgBytesToDxf } = await import('../io/dwg')
        text = await dwgBytesToDxf(new Uint8Array(event.data.dwg))
      }
      const model = analyzeDxf(text, (stage) => {
        self.postMessage({ progress: stage })
      })
      self.postMessage({ ok: true, model } satisfies WorkerOk)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (event.data.mode === 'dxf3d' || event.data.mode === 'dxf3d-rebuild') {
        self.postMessage({ ok: false, mode: 'dxf3d', error: message } satisfies Dxf3dWorkerResult)
      } else {
        self.postMessage({ ok: false, error: message } satisfies WorkerErr)
      }
    }
  })()
}
