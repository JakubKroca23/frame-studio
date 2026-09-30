import Module from 'manifold-3d/manifold'
import type { ManifoldToplevel } from 'manifold-3d/manifold'

let api: ManifoldToplevel | null = null
let pending: Promise<ManifoldToplevel> | null = null

/** Load the manifold WASM once. Safe to call more than once. */
export function initManifold(): Promise<ManifoldToplevel> {
  if (api) return Promise.resolve(api)
  if (!pending) {
    pending = Module()
      .then((mod) => {
        mod.setup()
        api = mod
        return mod
      })
      .catch((error: unknown) => {
        pending = null
        throw error
      })
  }
  return pending
}

export function manifoldApi(): ManifoldToplevel | null {
  return api
}
