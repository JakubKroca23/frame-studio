import { create } from 'zustand'
import { decodeDrawing } from './io/decodeDrawing'
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
  setTrack: (index: number, value: number) => void
  loadText: (name: string, text: string) => Promise<void>
  loadFile: (file: File) => Promise<void>
  loadSample: (which?: 'scania' | 'volvo') => Promise<void>
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
    const tracks = [...get().params.tracks]
    while (tracks.length <= index) tracks.push(0)
    tracks[index] = value
    set({ params: { ...get().params, tracks } })
  },
  loadText: async (name, text) => {
    set({ status: 'loading', message: 'Zpracovávám výkres…', error: null, fileName: name })
    try {
      const model = await parseDrawing(text, (message) => set({ message }))
      const tracks = model.axles.map((axle) => axle.track ?? 0)
      const section = model.frame?.section
      const tireSpec = model.axles.find((axle) => axle.tireSpec)?.tireSpec
      set({
        status: 'ready',
        model,
        message: '',
        params: {
          ...get().params,
          tracks: tracks.length ? tracks : get().params.tracks,
          useDrawingTires: true,
          loadState: 'laden',
          webThickness: section?.webThickness ?? defaultParams.webThickness,
          flangeThickness: section?.flangeThickness ?? defaultParams.flangeThickness,
          cornerRadius: section?.outerRadius ?? defaultParams.cornerRadius,
          tireSpec: tireSpec ?? defaultParams.tireSpec,
        },
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
  loadFile: async (file) => {
    set({ status: 'loading', message: 'Rozbaluji soubor…', error: null, fileName: file.name })
    try {
      const text = decodeDrawing(file.name, new Uint8Array(await file.arrayBuffer()))
      await get().loadText(file.name, text)
    } catch (error) {
      set({
        status: 'error',
        message: '',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
  loadSample: async (which = 'scania') => {
    const volvo = which === 'volvo'
    const fileName = volvo ? 'volvo-vssb-25-277591.dxf.gz' : 'scania-icd-sample.dxf'
    set({
      status: 'loading',
      message: volvo ? 'Načítám vzorový výkres Volvo…' : 'Načítám vzorový výkres Scania…',
      error: null,
      fileName,
    })
    try {
      const response = await fetch(`/samples/${fileName}`)
      if (!response.ok) {
        set({ status: 'error', error: 'Vzorový výkres se nepodařilo načíst.', message: '' })
        return
      }
      const bytes = new Uint8Array(await response.arrayBuffer())
      const text = decodeDrawing(fileName, bytes)
      await get().loadText(fileName, text)
    } catch (error) {
      set({
        status: 'error',
        message: '',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
}))

function parseDrawing(text: string, onProgress?: (message: string) => void): Promise<ChassisModel> {
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
    worker.onmessage = (event: MessageEvent<{ ok?: boolean; model?: ChassisModel; error?: string; progress?: string }>) => {
      if (event.data.progress) {
        onProgress?.(event.data.progress)
        return
      }
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
