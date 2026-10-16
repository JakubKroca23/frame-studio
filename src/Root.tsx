import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useProgress } from '@react-three/drei'
import { handoff, useHandoff } from './home/handoff'
import App from './App'
import { ConfiguratorPage } from './configurator/ConfiguratorPage'
import { StartScreen } from './StartScreen'
import { Dxf3dPage } from './dxf3d/Dxf3dPage'
import { CraneCatalogPage } from './craneTpl/CraneCatalogPage'
import { parseLinkParams } from './trw/links'
import { MultiliftPage } from './multilift/MultiliftPage'
import { AuxStabPage } from './outrigger/AuxStabPage'

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Hash routes: "" start screen, #vykres drawing flow, #dxf3d DXF→3D, #jeraby[/key] crane catalog, #multilift[/name] hooklift catalogue, #podpery[/key] aux outrigger catalogue, #novy?hooklift=<name> #novy[/preset] configurator. */
function pageFor(hash: string): ReactNode {
  if (hash.startsWith('#novy')) {
    const [path, query] = hash.split('?')
    const hooklift = new URLSearchParams(query ?? '').get('hooklift')
    return <ConfiguratorPage key={hooklift ?? ''} initialPreset={decodeURIComponent(path.split('/')[1] ?? '') || (hooklift ? 'scania-r-6x2-rigid' : '')} hooklift={hooklift} />
  }
  if (hash.startsWith('#multilift')) return <MultiliftPage />
  if (hash.startsWith('#podpery')) return <AuxStabPage />
  if (hash.startsWith('#dxf3d')) return <Dxf3dPage />
  if (hash.startsWith('#jeraby')) return <CraneCatalogPage />
  if (hash.startsWith('#vykres')) return <App />
  return null
}

/** Fade the start overlay out once the page under it has settled: ≥2 frames, no loader activity for QUIET ms. */
const QUIET = 400, MAX_WAIT = 8000, FADE = 450
function useHandoffFade(on: boolean) {
  const [fading, setFading] = useState(false)
  useEffect(() => {
    if (!on) { setFading(false); return }
    const t0 = performance.now()
    let quiet: number | null = null, frames = 0, raf = 0, tm = 0
    const tick = () => {
      const now = performance.now(); frames++
      if (useProgress.getState().active) quiet = null
      else if (quiet === null) quiet = now
      if ((frames > 2 && quiet !== null && now - quiet > QUIET) || now - t0 > MAX_WAIT) {
        setFading(true); tm = window.setTimeout(() => handoff.end(), FADE); return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); clearTimeout(tm) }
  }, [on])
  return fading
}

export default function Root() {
  const hash = useHash()
  // ?trw=<url> / ?from=cssim open the configurator directly (read once at start).
  const [link] = useState(() => parseLinkParams(window.location.search))
  const inHandoff = useHandoff()
  // memoised element: Root re-renders for the hand-off fade must not re-render the (heavy) page under it
  const page = useMemo(() => (link ? null : pageFor(hash)), [link, hash])
  const overlay = !!page && inHandoff
  const fading = useHandoffFade(overlay)
  const start = useMemo(() => <StartScreen />, [])
  if (link) return <ConfiguratorPage link={link} />
  // the start screen keeps one stable slot (same element type/position) so it survives the route change as an overlay
  return (
    <>
      {page}
      <div className={overlay ? (fading ? 'handoff-overlay is-fading' : 'handoff-overlay') : 'start-slot'}>
        {!page || overlay ? start : null}
      </div>
    </>
  )
}
