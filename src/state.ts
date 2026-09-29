import { create } from 'zustand'
import type { ChassisModel, ChassisParams } from './model/types'
import { defaultParams } from './model/types'
import { analyzeDxf } from './pipeline/analyze'

interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  message: string
  error: string | null
  fileName: string | null
  model: ChassisModel | null
  params: ChassisParams
  setParams: (patch: Partial<ChassisParams>) => void
  setShow: (key: keyof ChassisParams['show'], value: boolean) => void
  setTrack: (index: 0 | 1 | 2, value: number) => void
  loadText: (name: string, text: string) => Promise<void>
  loadSample: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  status: 'idle',
  message: '',
  error: null,
  fileName: null,
  model: null,
  params: defaultParams,
  setParams: (patch) => set({ params: { ...get().params, ...patch } }),
  setShow: (key, value) => set({ params: { ...get().params, show: { ...get().params.show, [key]: value } } }),
  setTrack: (index, value) => {
    const tracks = [...get().params.tracks] as [number, number, number]
    tracks[index] = value
    set({ params: { ...get().params, tracks } })
  },
  loadText: async (name, text) => {
    set({ status: 'loading', message: 'Zpracovávám výkres…', error: null, fileName: name })
    try {
      const model = await parseDrawing(text)
      const tracks: [number, number, number] = [0, 0, 0]
      model.axles.forEach((axle, i) => {
        if (i < 3 && axle.track) tracks[i] = axle.track
      })
      set({
        status: 'ready',
        model,
        message: '',
        params: { ...get().params, tracks, useDrawingTires: true, loadState: 'laden' },
      })
    } catch (error) {
      set({
        status: 'error',
        model: null,
        message: '',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
  loadSample: async () => {
    set({ status: 'loading', message: 'Načítám vzorový výkres Scania…', error: null, fileName: 'scania-icd-sample.dxf' })
    const response = await fetch('/samples/scania-icd-sample.dxf')
    if (!response.ok) {
      set({ status: 'error', error: 'Vzorový výkres se nepodařilo načíst.', message: '' })
      return
    }
    const buffer = await response.arrayBuffer()
    const text = new TextDecoder('windows-1252').decode(buffer)
    await get().loadText('scania-icd-sample.dxf', text)
  },
}))

function parseDrawing(text: string): Promise<ChassisModel> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./worker/parseWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      try {
        resolve(analyzeDxf(text))
      } catch (fallback) {
        reject(fallback)
      }
      return
    }
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Zpracování výkresu trvalo příliš dlouho.'))
    }, 120000)
    worker.onmessage = (event: MessageEvent<{ ok: boolean; model?: ChassisModel; error?: string }>) => {
      window.clearTimeout(timer)
      worker.terminate()
      if (event.data.ok && event.data.model) resolve(event.data.model)
      else reject(new Error(event.data.error || 'Výkres se nepodařilo zpracovat.'))
    }
    worker.onerror = () => {
      window.clearTimeout(timer)
      worker.terminate()
      try {
        resolve(analyzeDxf(text))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Zpracování ve workeru selhalo.'))
      }
    }
    worker.postMessage({ text })
  })
}
