import { useEffect, useState } from 'react'
import App from './App'
import { ConfiguratorPage } from './configurator/ConfiguratorPage'
import { StartScreen } from './StartScreen'
import { Dxf3dPage } from './dxf3d/Dxf3dPage'
import { parseLinkParams } from './trw/links'

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Hash routes: "" start screen, #vykres drawing flow, #dxf3d DXF→3D, #novy[/preset] configurator. */
export default function Root() {
  const hash = useHash()
  // ?trw=<url> / ?from=cssim open the configurator directly (read once at start).
  const [link] = useState(() => parseLinkParams(window.location.search))
  if (link) return <ConfiguratorPage link={link} />
  if (hash.startsWith('#novy')) return <ConfiguratorPage initialPreset={decodeURIComponent(hash.split('/')[1] ?? '')} />
  if (hash.startsWith('#dxf3d')) return <Dxf3dPage />
  if (hash.startsWith('#vykres')) return <App />
  return <StartScreen />
}
