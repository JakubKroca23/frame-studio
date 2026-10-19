import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Tree } from '../components/Tree'
import { CraneCategory } from '../craneTpl/CraneCatalogPage'
import { MultiliftCategory } from '../multilift/MultiliftPage'
import { AuxCategory } from '../outrigger/AuxStabPage'
import { ChassisCategory } from './ChassisCategory'

export type DbCat = 'jeraby' | 'multilift' | 'podpery' | 'podvozky'
const CATS: DbCat[] = ['jeraby', 'multilift', 'podpery', 'podvozky']

/** #databaze[/cat[/key]] (and the old #jeraby[/key], #multilift[/name], #podpery[/key] links) → selection.
 *  No key → nothing selected (the tree starts collapsed and the viewer stays empty). */
export type DbSel = { cat: DbCat; key: string | null }
export function parseDbHash(hash: string): DbSel {
  const parts = hash.replace(/^#/, '').split('/').map((x) => decodeURIComponent(x))
  const [a, b, c] = parts
  if (a === 'databaze') {
    const cat = CATS.includes(b as DbCat) ? (b as DbCat) : 'jeraby'
    return { cat, key: c || null }
  }
  const cat = CATS.includes(a as DbCat) ? (a as DbCat) : 'jeraby'
  return { cat, key: b || null }
}

/** One model browser for every model database in the app: a category tree on the left (collapsed; a deep link opens only its path; counts,
 *  selection in the company blue) and the selected model's own 3D viewer (portalled from its tree node). */
export function DatabasePage() {
  const [sel, setSel] = useState(() => parseDbHash(window.location.hash))
  const [stage, setStage] = useState<HTMLElement | null>(null)
  const [nav, setNav] = useState(0) // bumps on a hash link: the tree re-mounts with only the linked model's path open
  const pick = (cat: DbCat) => (key: string) => {
    setSel({ cat, key })
    window.history.replaceState(null, '', `#databaze/${cat}/${encodeURIComponent(key)}`)
  }
  // canonical URL; links / back-forward inside the page (same-document hash changes) re-select
  useEffect(() => {
    const canon = (x: DbSel) => window.history.replaceState(null, '', x.key ? `#databaze/${x.cat}/${encodeURIComponent(x.key)}` : '#databaze')
    canon(sel)
    const onHash = () => { if (/^#(databaze|jeraby|multilift|podpery)(\/|$)/.test(window.location.hash)) { const x = parseDbHash(window.location.hash); setSel(x); setNav((n) => n + 1); canon(x) } }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const k = (c: DbCat) => (sel.cat === c ? sel.key : null)
  return (
    <div className="app dxf3d">
      <TopBar page="databaze" />
      <aside className="app-side">
        <Tree key={nav} label="Databáze modelů">
          <CraneCategory selKey={k('jeraby')} pick={pick('jeraby')} stage={stage} />
          <MultiliftCategory selKey={k('multilift')} pick={pick('multilift')} stage={stage} />
          <AuxCategory selKey={k('podpery')} pick={pick('podpery')} stage={stage} />
          <ChassisCategory selKey={k('podvozky')} pick={pick('podvozky')} stage={stage} />
        </Tree>
      </aside>
      <main className="app-main db-stage" ref={setStage} style={{ position: 'relative', minHeight: 420 }} data-testid="db-stage">
        {sel.key ? null : <p className="db-empty" data-testid="db-empty">Vyberte model ve stromu vlevo.</p>}
      </main>
    </div>
  )
}
