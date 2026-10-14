import { useEffect, useState } from 'react'
import App from './App'
import { ConfiguratorPage } from './configurator/ConfiguratorPage'
import { StartScreen } from './StartScreen'
import { Dxf3dPage } from './dxf3d/Dxf3dPage'
import { CraneCatalogPage } from './craneTpl/CraneCatalogPage'
import { parseLinkParams } from './trw/links'
import { MultiliftPage } from './multilift/MultiliftPage'

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Hash routes: "" start screen, #vykres drawing flow, #dxf3d DXF→3D, #jeraby[/key] crane catalog, #multilift[/name] hooklift catalogue, #novy?hooklift=<name> #novy[/preset] configurator. */
export default function Root() {
  const hash = useHash()
  // ?trw=<url> / ?from=cssim open the configurator directly (read once at start).
  const [link] = useState(() => parseLinkParams(window.location.search))
  if (link) return <ConfiguratorPage link={link} />
  if (hash.startsWith('#novy')) {
    const [path, query] = hash.split('?')
    const hooklift = new URLSearchParams(query ?? '').get('hooklift')
    return <ConfiguratorPage key={hooklift ?? ''} initialPreset={decodeURIComponent(path.split('/')[1] ?? '') || (hooklift ? 'scania-r-6x2-rigid' : '')} hooklift={hooklift} />
  }
  if (hash.startsWith('#multilift')) return <MultiliftPage />
  if (hash.startsWith('#dxf3d')) return <Dxf3dPage />
  if (hash.startsWith('#jeraby')) return <CraneCatalogPage />
  if (hash.startsWith('#vykres')) return <App />
  return <StartScreen />
}
