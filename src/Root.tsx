import { useEffect, useState } from 'react'
import App from './App'
import { ConfiguratorPage } from './configurator/ConfiguratorPage'
import { StartScreen } from './StartScreen'

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Hash routes: "" start screen, #vykres drawing flow, #novy[/preset] configurator. */
export default function Root() {
  const hash = useHash()
  if (hash.startsWith('#novy')) return <ConfiguratorPage initialPreset={decodeURIComponent(hash.split('/')[1] ?? '')} />
  if (hash.startsWith('#vykres')) return <App />
  return <StartScreen />
}
