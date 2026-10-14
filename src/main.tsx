import { createRoot } from 'react-dom/client'
import Root from './Root.tsx'
import { Gate } from './auth/Gate'
import { initManifold } from './mesh/manifold'
import './index.css'
import { captureTrwToken } from './trw/trwToken'

// before the router reads the hash
captureTrwToken()

void initManifold()
  .catch((error: unknown) => {
    console.error('Manifold se nepodařilo načíst, kabina spadne na kvádr.', error)
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<Gate><Root /></Gate>)
  })
