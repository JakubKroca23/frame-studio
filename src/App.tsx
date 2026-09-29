import { useRef, useState, type DragEvent } from 'react'
import * as THREE from 'three'
import { Button } from './components/ui/button'
import { Label } from './components/ui/label'
import { Slider } from './components/ui/slider'
import { Switch } from './components/ui/switch'
import { downloadBlob, exportGlb, exportStl } from './export/download'
import type { ChassisModel } from './model/types'
import { useApp } from './state'
import { DrawingPreview } from './view/DrawingPreview'
import { Viewport } from './view/Viewport'

const KEY_DIMS: [string, string][] = [
  ['L011', 'Rozvor'],
  ['L015', 'Teoretický rozvor'],
  ['L012.1', 'Rozteč náprav 1'],
  ['L012.2', 'Rozteč náprav 2'],
  ['L012.3', 'Rozteč náprav 3'],
  ['L016', 'Přední převis'],
  ['L018', 'Rám před 1. nápravou'],
  ['L019', 'Zadní převis'],
  ['W036', 'Šířka rámu'],
  ['W035', 'Šířka rámu vpředu'],
  ['W032.1', 'Pásnice'],
  ['W032', 'Pásnice'],
  ['H032.1', 'Výška rámu'],
  ['H032', 'Výška rámu'],
  ['H036', 'Výška předu, zatížený'],
  ['H038', 'Výška zadu, zatížený'],
  ['W013.1', 'Rozchod 1'],
  ['W013.2', 'Rozchod 2'],
  ['W013.3', 'Rozchod 3'],
  ['L022.1', 'Průměr pneu 1'],
  ['L022.2', 'Průměr pneu 2'],
  ['L022.3', 'Průměr pneu 3'],
]

export default function App() {
  const groupRef = useRef<THREE.Group | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const { status, message, error, fileName, model, params, setParams, setShow, setTrack, loadFile, loadSample } = useApp()

  async function takeFile(file: File) {
    await loadFile(file)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void takeFile(file)
  }

  async function save(kind: 'glb' | 'stl') {
    const group = groupRef.current
    if (!group) return
    setExportError(null)
    setExporting(kind)
    try {
      const base = (model?.header.chassisType || fileName || 'podvozek').replace(/[^\w.+-]+/g, '_')
      if (kind === 'glb') downloadBlob(await exportGlb(group), `${base}.glb`)
      else downloadBlob(exportStl(group), `${base}.stl`)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Podvozek</h1>
          <span>z 2D výkresu do 3D rámu</span>
        </div>
        <span className="muted">{fileName ?? 'žádný výkres'}</span>
      </header>

      <aside className="app-side">
        <div
          className={over ? 'drop over' : 'drop'}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <div className="stack">
            <p style={{ margin: 0, fontSize: 14 }}>
              Přetáhněte sem DXF, nebo archiv .dxf.gz, .tgz či .zip. Texty se čtou jako Windows-1252.
            </p>
            <div className="row">
              <Button onClick={() => fileRef.current?.click()}>Nahrát výkres</Button>
              <Button variant="outline" onClick={() => void loadSample('scania')} disabled={status === 'loading'}>
                Vzor Scania
              </Button>
              <Button variant="outline" onClick={() => void loadSample('volvo')} disabled={status === 'loading'}>
                Vzor Volvo
              </Button>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".dxf,.gz,.tgz,.zip,application/dxf,application/gzip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void takeFile(file)
                event.target.value = ''
              }}
            />
          </div>
        </div>

        {status === 'loading' ? <p className="status">{message || 'Zpracovávám výkres…'}</p> : null}
        {status === 'error' ? <p className="status error">{error}</p> : null}

        {model ? <Detection model={model} /> : null}

        <section className="block">
          <h2>Parametry</h2>
          <NumField
            label="Tloušťka stojiny"
            unit="mm"
            min={4}
            max={16}
            step={0.5}
            value={params.webThickness}
            onChange={(webThickness) => setParams({ webThickness })}
          />
          <NumField
            label="Tloušťka pásnice"
            unit="mm"
            min={4}
            max={20}
            step={0.5}
            value={params.flangeThickness}
            onChange={(flangeThickness) => setParams({ flangeThickness })}
          />
          <NumField
            label="Poloměr ohybu"
            unit="mm"
            min={0}
            max={30}
            step={1}
            value={params.cornerRadius}
            onChange={(cornerRadius) => setParams({ cornerRadius })}
          />
          <Toggle label="Vnitřní výztuha" checked={params.linerEnabled} onChange={(linerEnabled) => setParams({ linerEnabled })} />
          <NumField
            label="Tloušťka výztuhy"
            unit="mm"
            min={3}
            max={12}
            step={0.5}
            value={params.linerThickness}
            onChange={(linerThickness) => setParams({ linerThickness })}
          />

          <Label>Zatížení</Label>
          <div className="seg" style={{ margin: '6px 0 12px' }}>
            <Button size="sm" variant={params.loadState === 'laden' ? 'rust' : 'outline'} onClick={() => setParams({ loadState: 'laden' })}>
              Zatížený
            </Button>
            <Button size="sm" variant={params.loadState === 'unladen' ? 'rust' : 'outline'} onClick={() => setParams({ loadState: 'unladen' })}>
              Nezatížený
            </Button>
          </div>

          <div className="field">
            <Label htmlFor="tire">Pneumatika</Label>
            <input
              id="tire"
              className="text-input"
              value={params.tireSpec}
              onChange={(event) => setParams({ tireSpec: event.target.value })}
            />
          </div>
          <Toggle label="Průměr z výkresu" checked={params.useDrawingTires} onChange={(useDrawingTires) => setParams({ useDrawingTires })} />
          <NumField label="Šířka pneu" unit="mm" min={200} max={420} step={5} value={params.tireWidth} onChange={(tireWidth) => setParams({ tireWidth })} />
          <Toggle label="Dvojmontáž podle výkresu" checked={params.dualDrive} onChange={(dualDrive) => setParams({ dualDrive })} />

          {trackNames(model?.axles.length ?? params.tracks.length).map((name, index) => (
            <div className="field" key={`${name}-${index}`}>
              <Label htmlFor={`track-${index}`}>Rozchod {name}</Label>
              <input
                id={`track-${index}`}
                className="text-input"
                type="number"
                min={0}
                step={1}
                value={params.tracks[index] ?? 0}
                onChange={(event) => setTrack(index, Number(event.target.value))}
              />
            </div>
          ))}

          <Label>Úroveň detailu</Label>
          <div className="seg" style={{ margin: '6px 0 12px' }}>
            {(
              [
                [0, 'Rám'],
                [1, 'Kvádry'],
                [2, 'Siluety'],
              ] as const
            ).map(([lod, name]) => (
              <Button key={lod} size="sm" variant={params.lod === lod ? 'rust' : 'outline'} onClick={() => setParams({ lod })}>
                {name}
              </Button>
            ))}
          </div>

          <Label>Otvory rámu</Label>
          <div className="seg" style={{ marginTop: 6 }}>
            {(
              [
                ['off', 'Vypnout'],
                ['markers', 'Značky'],
                ['geometry', 'Geometrie'],
              ] as const
            ).map(([holes, name]) => (
              <Button key={holes} size="sm" variant={params.holes === holes ? 'rust' : 'outline'} onClick={() => setParams({ holes })}>
                {name}
              </Button>
            ))}
          </div>
        </section>

        <section className="block">
          <h2>Vrstvy</h2>
          {(
            [
              ['frame', 'Rám'],
              ['liner', 'Výztuha'],
              ['crossmembers', 'Příčky'],
              ['axles', 'Nápravy a kola'],
              ['cab', 'Kabina'],
              ['components', 'Komponenty'],
              ['holes', 'Otvory'],
            ] as const
          ).map(([key, name]) => (
            <Toggle key={key} label={name} checked={params.show[key]} onChange={(value) => setShow(key, value)} />
          ))}
        </section>

        <section className="block">
          <h2>Export</h2>
          <div className="row">
            <Button variant="rust" disabled={!model || !!exporting} onClick={() => void save('glb')}>
              {exporting === 'glb' ? 'Exportuji…' : 'Export GLB'}
            </Button>
            <Button variant="outline" disabled={!model || !!exporting} onClick={() => void save('stl')}>
              {exporting === 'stl' ? 'Exportuji…' : 'Export STL'}
            </Button>
          </div>
          {exportError ? <p className="status error">{exportError}</p> : null}
          <p className="status">GLB i STL jsou v milimetrech, Y nahoru, počátek na přední nápravě.</p>
        </section>
      </aside>

      <Viewport model={model} params={params} groupRef={groupRef} />
      <DrawingPreview model={model} />
    </div>
  )
}

function trackNames(count: number): string[] {
  if (count === 3) return ['přední', 'prostřední', 'zadní']
  return Array.from({ length: Math.max(count, 1) }, (_, index) => `náprava ${index + 1}`)
}

function Detection({ model }: { model: ChassisModel }) {
  const byLabel = new Map(model.dimensions.map((item) => [item.label, item]))
  return (
    <section className="block">
      <h2>Detekce</h2>
      <table className="kv">
        <tbody>
          <tr>
            <th>Profil</th>
            <td>{model.profileName}</td>
          </tr>
          <tr>
            <th>Podvozek</th>
            <td>{model.header.chassisType ?? '—'}</td>
          </tr>
          {model.header.orderNo ? (
            <tr>
              <th>Objednávka</th>
              <td>{model.header.orderNo}</td>
            </tr>
          ) : (
            <tr>
              <th>ICD</th>
              <td>{model.header.icdNo ?? '—'}</td>
            </tr>
          )}
          {model.header.cabType ? (
            <tr>
              <th>Kabina</th>
              <td>{model.header.cabType}</td>
            </tr>
          ) : null}
          {model.frame?.section ? (
            <tr>
              <th>Profil C</th>
              <td>
                {Math.round(model.frame.section.height)}×{Math.round(model.frame.section.flangeWidth)}×
                {model.frame.section.webThickness} mm, R{model.frame.section.outerRadius}/R{model.frame.section.innerRadius}
              </td>
            </tr>
          ) : null}
          <tr>
            <th>Hmotnost</th>
            <td>
              {[model.header.totalWeight, model.header.frontWeight, model.header.rearWeight].filter(Boolean).join(' / ') || '—'}
            </td>
          </tr>
          <tr>
            <th>Nápravy</th>
            <td>{model.axles.map((axle) => Math.round(axle.x)).join(' · ') || '—'}</td>
          </tr>
          <tr>
            <th>Otvory</th>
            <td>{model.stats.holeCount}</td>
          </tr>
          <tr>
            <th>Zpracování</th>
            <td>{Math.round(model.stats.parseMs)} ms</td>
          </tr>
          {KEY_DIMS.filter(([label]) => byLabel.has(label)).map(([label, title]) => {
            const item = byLabel.get(label)
            return (
              <tr key={label}>
                <th>
                  {label} {title}
                </th>
                <td>
                  {item?.value ?? '—'}
                  {item?.verified ? (
                    <span className={item.verified.ok ? 'ok' : 'warn'}>
                      {' '}
                      {item.verified.ok ? 'sedí' : `Δ ${item.verified.delta.toFixed(0)}`}
                    </span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {model.warnings.length ? (
        <ul className="status warn">
          {model.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function NumField({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="field" style={{ marginBottom: 4 }}>
        <Label>{label}</Label>
        <span className="muted">
          {value} {unit}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(next) => onChange(next[0] ?? value)} />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
