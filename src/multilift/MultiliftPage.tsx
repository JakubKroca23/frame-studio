import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls } from '@react-three/drei'
import { TopBar } from '../components/TopBar'
import { HOOKLIFT_CATALOG, type HookliftSpec } from '../trw/hookliftCatalog'
import { HookliftModel } from '../trw/HookliftModel'
import { hookliftPlacement } from '../trw/hooklift'

const fmt = (v: number | null) => (v == null ? '—' : v.toLocaleString('cs-CZ'))

/** #multilift[/name] — the Hiab MULTILIFT datasheet catalogue (parametric hooklift model), open one in the configurator. */
export function MultiliftPage() {
  const initial = decodeURIComponent(window.location.hash.split('/')[1] ?? '')
  const [name, setName] = useState(HOOKLIFT_CATALOG.some((s) => s.name === initial) ? initial : HOOKLIFT_CATALOG[0].name)
  const spec = HOOKLIFT_CATALOG.find((s) => s.name === name)!
  const series = useMemo(() => [...new Set(HOOKLIFT_CATALOG.map((s) => s.series))], [])
  const pick = (s: HookliftSpec) => { setName(s.name); window.history.replaceState(null, '', `#multilift/${encodeURIComponent(s.name)}`) }
  const { params, mesh } = hookliftPlacement({ name: spec.name, xFrom: null, xTo: null, length: null, height: null }, spec.subframeLengthMm)
  return (
    <div className="app">
      <TopBar page="multilift" />
      <aside className="app-side">
        <section className="block">
          <h2>Nástavby Multilift ({HOOKLIFT_CATALOG.length} modelů)</h2>
          <p className="muted">Hákové nosiče Hiab MULTILIFT ULTIMA podle katalogových listů (DIN). Parametrický 3D model se přizpůsobí délce rámu, výšce háku a instalační výšce.</p>
          <div className="ml-detail" data-testid="ml-detail">
            <strong>{spec.name}</strong>
            <dl>
              <dt>Nosnost</dt><dd>{spec.capacityT} t</dd>
              <dt>Vozidlo</dt><dd>{spec.vehicleGvwT} t, {spec.axles} nápravy</dd>
              <dt>Délka rámu SL</dt><dd>{fmt(spec.subframeLengthMm)} mm</dd>
              <dt>Délka G</dt><dd>{fmt(spec.gLengthMm)} mm</dd>
              <dt>Výška háku HH</dt><dd>{fmt(spec.hookHeightMm)} mm</dd>
              <dt>Kontejner LR</dt><dd>{fmt(spec.bodyLengthMinMm)}–{fmt(spec.bodyLengthMaxMm)} mm</dd>
              <dt>Hmotnost</dt><dd>{fmt(spec.massKg)} kg</dd>
              <dt>Sklápění</dt><dd>{spec.tippingAngleDeg}°</dd>
            </dl>
            <a className="cta-primary ml-open" href={`#novy?hooklift=${encodeURIComponent(spec.name)}`} data-testid="ml-open">Otevřít v konfigurátoru</a>
            <p className="muted">Zdroj: {spec.source}</p>
          </div>
        </section>
        {series.map((se) => (
          <section className="block" key={se}>
            <h2>{se}</h2>
            <table className="dxf3d-table ml-table">
              <thead><tr><th>Model</th><th>t</th><th>SL</th><th>HH</th><th>kg</th></tr></thead>
              <tbody>
                {HOOKLIFT_CATALOG.filter((s) => s.series === se).map((s) => (
                  <tr key={s.name} className={s.name === name ? 'is-sel' : ''} onClick={() => pick(s)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') pick(s) }} aria-selected={s.name === name}>
                    <td>{s.name.replace(/^ULTIMA\s*/, '')}</td><td>{s.capacityT}</td><td>{fmt(s.subframeLengthMm)}</td><td>{fmt(s.hookHeightMm)}</td><td>{fmt(s.massKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </aside>
      <main className="app-main" style={{ position: 'relative', minHeight: 380 }}>
        <Canvas shadows camera={{ position: [-3500, 3500, 8000], fov: 40, near: 10, far: 100000 }} gl={{ preserveDrawingBuffer: true }}>
          <color attach="background" args={['#1a2230']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[6000, 9000, 5000]} intensity={1.3} />
          <Environment preset="city" />
          <gridHelper args={[16000, 16, '#3a4659', '#253043']} />
          <group position={[-spec.subframeLengthMm / 2, 0, 0]}>
            <HookliftModel key={spec.name} xRear={spec.subframeLengthMm} frameTop={0} params={params} mesh={mesh} fallback={null} />
          </group>
          <OrbitControls makeDefault target={[0, 900, 0]} />
        </Canvas>
      </main>
    </div>
  )
}
