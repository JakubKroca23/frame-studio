import { useEffect, useState } from 'react'
import { liveClientFor, liveStatusText, type LiveDoc } from './stabilityLive'

/** Live-connection status for the panel; starts the shared client when a document exists. */
export function useLiveStatus(doc: LiveDoc | null | undefined) {
  const [, tick] = useState(0)
  const c = doc ? liveClientFor(doc) : null
  useEffect(() => (c ? (c.onStatus(() => tick((n) => n + 1)) as () => void) : undefined), [c])
  return liveStatusText(c)
}
