import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Tree } from '../components/Tree'
import { CraneCategory, listedCranes } from '../craneTpl/CraneCatalogPage'
import { MultiliftCategory } from '../multilift/MultiliftPage'
import { AuxCategory } from '../outrigger/AuxStabPage'
import { ChassisCategory } from './ChassisCategory'
import { HOOKLIFT_CATALOG } from '../trw/hookliftCatalog'
import { PRESETS } from '../presets'
import CATALOG from '../trw/outriggerCatalog.json'

export type DbCat = 'jeraby' | 'multilift' | 'podpery' | 'podvozky'
const CATS: DbCat[] = ['jeraby', 'multilift', 'podpery', 'podvozky']
const first: Record<DbCat, () => string> = {
  jeraby: () => listedCranes()[0]?.key ?? '142',
  multilift: () => HOOKLIFT_CATALOG[0].name,
  podpery: () => CATALOG.entries[0].key,
  podvozky: () => PRESETS[0].id,
}

/** #databaze[/cat[/key]] (and the old #jeraby[/key], #multilift[/name], #podpery[/key] links) → selection. */
export function parseDbHash(hash: string): { cat: DbCat; key: string } {
  const parts = hash.replace(/^#/, '').split('/').map((x) => decodeURIComponent(x))
  const [a, b, c] = parts
  if (a === 'databaze') {
    const cat = CATS.includes(b as DbCat) ? (b as DbCat) : 'jeraby'
    return { cat, key: c || first[cat]() }
  }
  const cat = CATS.includes(a as DbCat) ? (a as DbCat) : 'jeraby'
  return { cat, key: b || first[cat]() }
}

/** One model browser for every model database in the app: a category tree on the left (selected path expanded, counts,
 *  selection in the company blue) and the selected model's own 3D viewer + controls (portalled from its tree node). */
export function DatabasePage() {
  const [sel, setSel] = useState(() => parseDbHash(window.location.hash))
  const [stage, setStage] = useState<HTMLElement | null>(null)
  const pick = (cat: DbCat) => (key: string) => {
    setSel({ cat, key })
    window.history.replaceState(null, '', `#databaze/${cat}/${encodeURIComponent(key)}`)
  }
  // canonical URL; links / back-forward inside the page (same-document hash changes) re-select
  useEffect(() => {
    const canon = (x: { cat: DbCat; key: string }) => window.history.replaceState(null, '', `#databaze/${x.cat}/${encodeURIComponent(x.key)}`)
    canon(sel)
    const onHash = () => { if (/^#(databaze|jeraby|multilift|podpery)(\/|$)/.test(window.location.hash)) { const x = parseDbHash(window.location.hash); setSel(x); canon(x) } }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const k = (c: DbCat) => (sel.cat === c ? sel.key : null)
  return (
    <div className="app dxf3d">
      <TopBar page="databaze" />
      <aside className="app-side">
        <Tree label="Databáze modelů">
          <CraneCategory selKey={k('jeraby')} pick={pick('jeraby')} stage={stage} />
          <MultiliftCategory selKey={k('multilift')} pick={pick('multilift')} stage={stage} />
          <AuxCategory selKey={k('podpery')} pick={pick('podpery')} stage={stage} />
          <ChassisCategory selKey={k('podvozky')} pick={pick('podvozky')} stage={stage} />
        </Tree>
      </aside>
      <main className="app-main" ref={setStage} style={{ position: 'relative', minHeight: 420 }} data-testid="db-stage" />
    </div>
  )
}
