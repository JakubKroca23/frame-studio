import { create } from 'zustand'
import { decodeDrawing } from './io/decodeDrawing'
import { dwgBytesToDxf } from './io/dwg'
import type { ChassisModel, ChassisParams } from './model/types'
import { defaultParams } from './model/types'
import { analyzeDxf } from './pipeline/analyze'
import { EQUIP_LABELS, type EquipKind } from './pipeline/kinds'
import { buildReview, newEquipment, paramsFromReview, sceneModel, syncEquipment, type ReviewElement } from './pipeline/review'
import type { BBox } from './lib/geom'

interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  phase: 'review' | 'scene'
  message: string
  error: string | null
  fileName: string | null
  /** Raw detection. The review edits this document, not the mesh. */
  source: ChassisModel | null
  /** Model the 3D view builds, after the user confirms the review. */
  model: ChassisModel | null
  review: ReviewElement[]
  params: ChassisParams
  setParams: (patch: Partial<ChassisParams>) => void
  setShow: (key: keyof ChassisParams['show'], value: boolean) => void
  setTrack: (index: number, value: number) => void
  setPhase: (phase: 'review' | 'scene') => void
  updateReview: (id: string, patch: Partial<ReviewElement>) => void
  setReviewField: (id: string, key: string, value: number | string | boolean) => void
  deleteReview: (id: string) => void
  restoreReview: (element: ReviewElement) => void
  addReviewBox: (box: BBox, view: 'side' | 'top') => void
  resetReview: () => void
  confirmReview: () => void
  includeInScene: (ids: string[]) => void
  excludeFromScene: (ids: string[]) => void
  commitElement: (element: ReviewElement) => void
  deleteReviewIds: (ids: string[]) => void
  loadText: (name: string, text: string) => Promise<void>
  loadFile: (file: File) => Promise<void>
  loadSample: (which?: 'scania' | 'volvo') => Promise<void>
}

export const useApp = create<AppState>((set, get) => {
  function publishScene(review: ReviewElement[]) {
    const source = get().source
    if (!source) return
    const any = review.some((item) => item.in3d && !item.deleted)
    if (!any) {
      set({ review, model: null, phase: 'review' })
      return
    }
    set({
      review,
      phase: 'scene',
      model: sceneModel(source, review),
      params: { ...get().params, ...paramsFromReview(review) },
    })
  }
  return ({
  status: 'idle',
  phase: 'review',
  message: '',
  error: null,
  fileName: null,
  source: null,
  model: null,
  review: [],
  params: defaultParams,
  setParams: (patch) => set({ params: { ...get().params, ...patch } }),
  setShow: (key, value) => set({ params: { ...get().params, show: { ...get().params.show, [key]: value } } }),
  setTrack: (index, value) => {
    const tracks = [...get().params.tracks]
    while (tracks.length <= index) tracks.push(0)
    tracks[index] = value
    set({ params: { ...get().params, tracks } })
  },
  setPhase: (phase) => set({ phase }),
  updateReview: (id, patch) =>
    set({
      review: get().review.map((item) => (item.id === id ? { ...item, ...patch, source: 'user', confidence: 1 } : item)),
    }),
  setReviewField: (id, key, value) =>
    set({
      review: get().review.map((item) => {
        if (item.id !== id) return item
        const fields = item.fields.map((field) => (field.key === key ? { ...field, value, estimated: false } : field))
        const next = { ...item, fields, source: 'user' as const, confidence: 1 }
        if (key === 'kind') {
          next.kind = String(value)
          const label = EQUIP_LABELS[String(value) as EquipKind]
          const num = item.title.match(/\d{6,}/)?.[0]
          if (label) next.title = num ? `${label} ${num}` : label
        }
        syncEquipment(next)
        return next
      }),
    }),
  deleteReview: (id) => get().deleteReviewIds([id]),
  deleteReviewIds: (ids) => {
    const drop = new Set(ids)
    const review = get().review.map((item) =>
      drop.has(item.id) && item.role !== 'frame' ? { ...item, deleted: true, in3d: false, source: 'user' as const, confidence: 1 } : item,
    )
    const touchedScene = get().review.some((item) => drop.has(item.id) && item.in3d && item.role !== 'frame')
    if (touchedScene && get().model) publishScene(review)
    else set({ review })
  },
  restoreReview: (element) =>
    set({
      review: get().review.some((item) => item.id === element.id)
        ? get().review.map((item) => (item.id === element.id ? element : item))
        : [...get().review, element],
    }),
  addReviewBox: (box, view) => {
    const element = newEquipment(box, view, get().source?.frame ?? null)
    set({ review: [...get().review, element] })
  },
  resetReview: () => {
    const source = get().source
    if (source) set({ review: buildReview(source), model: null, phase: 'review' })
  },
  confirmReview: () => {
    const review = get().review.map((item) => (item.deleted ? item : { ...item, in3d: true }))
    publishScene(review)
  },
  includeInScene: (ids) => {
    const pick = new Set(ids)
    const review = get().review.map((item) => (pick.has(item.id) && !item.deleted ? { ...item, in3d: true } : item))
    publishScene(review)
  },
  excludeFromScene: (ids) => {
    const pick = new Set(ids)
    const review = get().review.map((item) => (pick.has(item.id) ? { ...item, in3d: false } : item))
    publishScene(review)
  },
  commitElement: (element) =>
    set({
      review: get().review.map((item) => (item.id === element.id ? element : item)),
    }),
  loadText: async (name, text) => {
    set({ status: 'loading', message: 'Zpracovávám výkres…', error: null, fileName: name })
    try {
      const model = await parseDrawing(text, (message) => set({ message }))
      const tracks = model.axles.map((axle) => axle.track ?? 0)
      const section = model.frame?.section
      const tireSpec = model.axles.find((axle) => axle.tireSpec)?.tireSpec
      set({
        status: 'ready',
        phase: 'review',
        source: model,
        model: null,
        review: buildReview(model),
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
          holes: model.holes.length > 800 ? 'markers' : get().params.holes,
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
    const dwg = file.name.toLowerCase().endsWith('.dwg')
    set({ status: 'loading', message: dwg ? 'Čtu DWG…' : 'Rozbaluji soubor…', error: null, fileName: file.name })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (dwg) {
        const model = await parseDrawing('', (message) => set({ message }), bytes)
        const tracks = model.axles.map((axle) => axle.track ?? 0)
        const section = model.frame?.section
        const tireSpec = model.axles.find((axle) => axle.tireSpec)?.tireSpec
        set({
          status: 'ready',
          phase: 'review',
          source: model,
          model: null,
          review: buildReview(model),
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
          holes: model.holes.length > 800 ? 'markers' : get().params.holes,
        },
      })
      return
    }
      const text = decodeDrawing(file.name, bytes)
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
}) })

function parseDrawing(text: string, onProgress?: (message: string) => void, dwg?: Uint8Array): Promise<ChassisModel> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./worker/parseWorker.ts', import.meta.url), { type: 'module' })
    } catch {
      if (dwg) {
        void dwgBytesToDxf(dwg)
          .then((dxf) => resolve(analyzeDxf(dxf)))
          .catch(reject)
        return
      }
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
    }, dwg ? 180000 : 120000)
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
      if (dwg) {
        reject(new Error('Zpracování ve workeru selhalo.'))
        return
      }
      try {
        resolve(analyzeDxf(text))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Zpracování ve workeru selhalo.'))
      }
    }
    if (dwg) worker.postMessage({ dwg: dwg.buffer }, [dwg.buffer])
    else worker.postMessage({ text })
  })
}
