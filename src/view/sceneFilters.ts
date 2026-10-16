import { useEffect } from 'react'
import { create } from 'zustand'

/** What the 3D scene shows on top of the model. Persisted in localStorage; HTML overlays also follow root classes `sf-no-<key>`. */
export type SceneFilterKey = 'labels' | 'dims' | 'controls' | 'controlLabels' | 'forces' | 'stability'
export const SCENE_FILTERS: { key: SceneFilterKey; label: string; title: string }[] = [
  { key: 'labels', label: 'Popisky', title: 'Popisky nástavby a hmotností' },
  { key: 'dims', label: 'Kóty', title: 'Kóty výšky a dosahu jeřábu' },
  { key: 'controls', label: 'Ovládání', title: 'Ovládací šipky, úhloměry a stupnice výsuvů (funkční)' },
  { key: 'controlLabels', label: 'Popisky ovládání', title: 'Texty úhlů a výsuvů u ovládacích šipek (ovládání zůstává)' },
  { key: 'forces', label: 'Síly kN', title: 'Reakce v podpěrách a nápravách (kN)' },
  { key: 'stability', label: 'Stabilita', title: 'Diagram nosnosti a stability kolem vozidla' },
]
const KEY = 'frame-studio.scene-filters.v1'
type State = Record<SceneFilterKey, boolean> & { toggle: (k: SceneFilterKey) => void; importDefaults: () => void }
/** After an import: a clean model with only the working crane controls (arrows, protractors, scales); no texts. */
export const IMPORT_FILTERS: Record<SceneFilterKey, boolean> = { labels: false, dims: false, controls: true, controlLabels: false, forces: false, stability: false }
const defaults: Record<SceneFilterKey, boolean> = { labels: true, dims: true, controls: true, controlLabels: true, forces: true, stability: true }

export function loadFilters(raw: string | null): Record<SceneFilterKey, boolean> {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<Record<SceneFilterKey, unknown>>) : {}
    return Object.fromEntries(Object.keys(defaults).map((k) => [k, typeof o[k as SceneFilterKey] === 'boolean' ? o[k as SceneFilterKey] : true])) as Record<SceneFilterKey, boolean>
  } catch {
    return { ...defaults }
  }
}
const read = () => (typeof localStorage === 'undefined' ? { ...defaults } : loadFilters(localStorage.getItem(KEY)))

const save = (s: Record<SceneFilterKey, boolean>) => {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(SCENE_FILTERS.map((f) => [f.key, s[f.key]])))) } catch { /* private mode */ }
}

export const useSceneFilters = create<State>((set, get) => ({
  ...read(),
  toggle: (k) => {
    set({ [k]: !get()[k] } as Partial<State>)
    save(get())
  },
  importDefaults: () => {
    set({ ...IMPORT_FILTERS })
    save(get())
  },
}))

/** Mirror the filters as root classes so imperative HTML overlays (drei Html) can be hidden by CSS. */
export function useSceneFilterClasses() {
  const s = useSceneFilters()
  useEffect(() => {
    const root = document.documentElement
    for (const f of SCENE_FILTERS) root.classList.toggle(`sf-no-${f.key}`, !s[f.key])
  }, [s])
}
