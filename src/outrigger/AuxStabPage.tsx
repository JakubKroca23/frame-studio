import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { TopBar } from '../components/TopBar'
import { Button } from '../components/ui/button'
import { ConcreteFloor } from '../view/ConcreteFloor'
import { AuxOutriggerModel, type AuxStabKind } from '../trw/AuxOutriggerModel'
import CATALOG from '../trw/outriggerCatalog.json'

type Entry = (typeof CATALOG.entries)[number]
const KIND: Record<string, AuxStabKind> = { 'hiab-aux-5m': '5m', 'hiab-aux-6m': '6m' }
const fmt = (v: number | null | undefined, u = 'mm') => (v == null ? '—' : `${v.toLocaleString('cs-CZ')} ${u}`)
/** Housing top above ground in the preview: chosen so the full leg stroke (450 mm) just reaches the ground (illustrative). */
const TOP = 1300

/** #podpery[/key] — catalogue of the HIAB auxiliary outriggers (přídavné podpěry), values only from outriggerCatalog.json. */
export function AuxStabPage() {
  const initial = decodeURIComponent(window.location.hash.split('/')[1] ?? '')
  const [key, setKey] = useState(CATALOG.entries.some((e) => e.key === initial) ? initial : CATALOG.entries[0].key)
  const [extended, setExtended] = useState(true)
  const e = CATALOG.entries.find((x) => x.key === key)! as Entry & { modelDeviations?: Record<string, string> }
  const pick = (k: string) => { setKey(k); window.history.replaceState(null, '', `#podpery/${encodeURIComponent(k)}`) }
  const reach = extended ? e.extendedMm / 2 : null
  return (
    <div className="app">
      <TopBar page="podpery" />
      <aside className="app-side">
        <section className="block">
          <h2>Přídavné podpěry ({CATALOG.entries.length} modely)</h2>
          <p className="muted">HIAB přídavné podpěry (aux. stabilizers). Kóty jen z výkresů; „—“ = výkres hodnotu neuvádí.</p>
          <table className="dxf3d-table ml-table">
            <thead><tr><th>Model</th><th>zasunuto</th><th>vysunuto</th><th>Fmax</th></tr></thead>
            <tbody>
              {CATALOG.entries.map((x) => (
                <tr key={x.key} className={x.key === key ? 'is-sel' : ''} onClick={() => pick(x.key)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter') pick(x.key) }} aria-selected={x.key === key} data-testid={`aux-row-${x.key}`}>
                  <td>{x.name.replace(/^HIAB přídavné podpěry\s*/, '')}</td><td>{fmt(x.retractedMm)}</td><td>{fmt(x.extendedMm)}</td><td>{fmt(x.fmaxInnerKg, 'kg')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="block">
          <div className="ml-detail" data-testid="aux-detail">
            <strong>{e.name}</strong>
            <dl>
              <dt>Výkres</dt><dd>{e.drawing}</dd>
              <dt>Šířka zasunuto</dt><dd>{fmt(e.retractedMm)}</dd>
              <dt>Šířka vysunuto</dt><dd>{fmt(e.extendedMm)}</dd>
              <dt>Rozteč sloupů</dt><dd>{fmt(e.columnSpacingMm)}</dd>
              <dt>Šířka nosníku</dt><dd>{fmt(e.widthMm)}</dd>
              <dt>Výška nosníku</dt><dd>{fmt(e.beamHeightMm)}</dd>
              <dt>Výsuv ramene / strana</dt><dd>{fmt(e.armStrokeMm)}</dd>
              <dt>Zdvih nohy</dt><dd>{fmt(e.legStrokeMm)}</dd>
              <dt>Fmax vnitřní / vnější</dt><dd>{fmt(e.fmaxInnerKg, 'kg')} / {fmt(e.fmaxOuterKg, 'kg')}</dd>
            </dl>
            <div className="seg" role="group" aria-label="Poloha ramen">
              <Button size="sm" variant={extended ? 'rust' : 'outline'} onClick={() => setExtended(true)}>Vysunuté</Button>
              <Button size="sm" variant={!extended ? 'rust' : 'outline'} onClick={() => setExtended(false)}>Zasunuté</Button>
            </div>
            <p className="muted">Zdroj: {e.source}{e.modelDeviations ? ` · ${Object.values(e.modelDeviations).join('; ')}` : ''}</p>
          </div>
        </section>
      </aside>
      <main className="app-main" style={{ position: 'relative', minHeight: 380 }}>
        <Canvas shadows camera={{ position: [4200, 3400, 6200], fov: 40, near: 10, far: 100000 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#1a2230']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[6000, 9000, 5000]} intensity={1.3} />
          <Environment preset="city" />
          <ConcreteFloor size={40000} />
          <AuxOutriggerModel key={key} kind={KIND[key] ?? '5m'} x={0} top={TOP} reachLeft={reach} reachRight={reach} />
          <OrbitControls makeDefault target={[0, 600, 0]} />
        </Canvas>
      </main>
    </div>
  )
}
