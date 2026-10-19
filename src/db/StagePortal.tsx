import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Renders a tree node's viewer into the model browser's main area, inside its own slot element (one per model),
 *  so a viewer and its HTML overlays (drei <Html>) are mounted / removed as one block. */
export function StagePortal({ stage, children }: { stage: HTMLElement | null; children: ReactNode }) {
  return stage ? createPortal(<div className="db-stage-slot">{children}</div>, stage) : null
}
