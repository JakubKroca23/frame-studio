import { useSyncExternalStore } from 'react'

/**
 * Start → target page hand-off. While active, Root keeps the start screen (with its live WebGL canvas and the
 * parked vehicle) mounted as an overlay on top of the freshly mounted target page, and fades it out only once the
 * target page has finished its first heavy render (new GL context, shader compile, model loads). The heavy work
 * then happens behind a still frame instead of as a visible hitch.
 */
let active = false
const subs = new Set<() => void>()
export const handoff = {
  start() { active = true; subs.forEach((f) => f()) },
  end() { active = false; subs.forEach((f) => f()) },
}
export function useHandoff() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => active)
}
