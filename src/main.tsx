import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { initManifold } from './mesh/manifold'
import './index.css'

void initManifold()
  .catch((error: unknown) => {
    console.error('Manifold se nepodařilo načíst, kabina spadne na kvádr.', error)
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(<App />)
  })
