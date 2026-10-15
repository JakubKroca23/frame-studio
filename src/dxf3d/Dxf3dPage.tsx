import { TopBar } from '../components/TopBar'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bounds, Center, Environment, OrbitControls } from '@react-three/drei'
import { ConcreteFloor } from '../view/ConcreteFloor'
import * as THREE from 'three'
import { Button } from '../components/ui/button'
import { downloadBlob, exportGlb } from '../export/download'
import { decodeDrawing } from '../io/decodeDrawing'
import { manualAssignment } from './classify'
import { ROLE_LABEL, fmt } from './views'
import { geometryFrom, rebuildDxf3d, runDxf3d, type Dxf3dResult } from './runWorker'
import type { Projection, ViewAssignment } from './types'
import { fixtureDxf, FIXTURES } from './fixtures'
import { CraneTplView } from '../craneTpl/CraneTplView'
import type { CraneSheet } from '../craneTpl/sheet'

type RolePick = 'front' | 'top' | 'side' | null

export function Dxf3dPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<Dxf3dResult | null>(null)
  const [assignment, setAssignment] = useState<ViewAssignment | null>(null)
  const [pickRole, setPickRole] = useState<RolePick>(null)
  const [manual, setManual] = useState<{ front: number | null; top: number | null; side: number | null; projection: Projection }>({
    front: null,
    top: null,
    side: null,
    projection: 'first',
  })

  async function ingest(name: string, text: string) {
    setBusy(true)
    setError(null)
    setProgress('Spouštím worker…')
    setFileName(name)
    setResult(null)
    setAssignment(null)
    setPickRole(null)
    try {
      const next = await runDxf3d(text, setProgress)
      setResult(next)
      if (next.crane) return
      setAssignment(next.analysis.assignment)
      if (next.analysis.assignment) {
        setManual({
          front: next.analysis.assignment.front,
          top: next.analysis.assignment.top,
          side: next.analysis.assignment.side,
          projection: next.analysis.assignment.projection,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  async function takeFile(file: File) {
    setBusy(true)
    setError(null)
    setProgress('Načítám soubor…')
    setFileName(file.name)
    setResult(null)
    setAssignment(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.dwg')) {
        setProgress('Čtu DWG…')
        const worker = new Worker(new URL('../worker/parseWorker.ts', import.meta.url), { type: 'module' })
        const dwg = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const raw = await new Promise<{
          ok: boolean
          error?: string
          analysis?: Dxf3dResult['analysis']
          views?: Dxf3dResult['views']
          mesh?: { positions: Float32Array; indices: Uint32Array; volume: number; watertight: boolean; holesCut: number } | null
          deviations?: Dxf3dResult['deviations']
          crane?: CraneSheet
        }>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            worker.terminate()
            reject(new Error('Zpracování DWG trvalo příliš dlouho.'))
          }, 180000)
          worker.onmessage = (event: MessageEvent) => {
            if (event.data?.progress) {
              setProgress(event.data.progress)
              return
            }
            window.clearTimeout(timer)
            worker.terminate()
            resolve(event.data)
          }
          worker.onerror = () => {
            window.clearTimeout(timer)
            worker.terminate()
            reject(new Error('Worker selhal.'))
          }
          worker.postMessage({ mode: 'dxf3d', dwg }, [dwg])
        })
        if (raw.ok && raw.crane) {
          setResult({ analysis: null as unknown as Dxf3dResult['analysis'], views: null, geometry: null, volume: 0, watertight: false, holesCut: 0, deviations: [], crane: raw.crane })
          return
        }
        if (!raw.ok || !raw.analysis) throw new Error(raw.error || 'DWG → 3D selhalo.')
        const g = geometryFrom(raw.mesh ?? null)
        setResult({
          analysis: raw.analysis,
          views: raw.views ?? null,
          geometry: g,
          volume: raw.mesh?.volume ?? 0,
          watertight: raw.mesh?.watertight ?? false,
          holesCut: raw.mesh?.holesCut ?? 0,
          deviations: raw.deviations ?? [],
        })
        setAssignment(raw.analysis.assignment)
        if (raw.analysis.assignment) {
          setManual({
            front: raw.analysis.assignment.front,
            top: raw.analysis.assignment.top,
            side: raw.analysis.assignment.side,
            projection: raw.analysis.assignment.projection,
          })
        }
      } else {
        const text = decodeDrawing(file.name, bytes)
        await ingest(file.name, text)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  async function applyAssignment(next: ViewAssignment) {
    if (!result) return
    setBusy(true)
    setProgress('Přestavuji 3D…')
    setError(null)
    try {
      const rebuilt = await rebuildDxf3d(result.analysis, next, setProgress)
      result.geometry?.dispose()
      setResult(rebuilt)
      setAssignment(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  function onIslandClick(id: number) {
    if (!pickRole || !result) return
    const next = { ...manual, [pickRole]: id }
    setManual(next)
    setPickRole(null)
    if (next.front !== null) {
      const a = manualAssignment(next.front, next.top, next.side, result.analysis.islands, next.projection)
      void applyAssignment(a)
    }
  }

  async function saveGlb() {
    if (!result?.geometry) return
    const group = new THREE.Group()
    group.add(new THREE.Mesh(result.geometry.clone()))
    const blob = await exportGlb(group)
    downloadBlob(blob, `${(fileName || 'soucast').replace(/[^\w.+-]+/g, '_')}-3d.glb`)
  }

  useEffect(() => () => result?.geometry?.dispose(), [result])

  const analysis = result?.analysis
  const views = result?.views
  if (result?.crane) return <CraneTplView sheet={result.crane} fileName={fileName} />

  return (
    <div className="app dxf3d">
      <TopBar page="dxf3d" />

      <aside className="app-side">
        <div
          className={over ? 'drop over' : 'drop'}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void takeFile(f)
          }}
        >
          <div className="stack">
            <p style={{ margin: 0, fontSize: 14 }}>
              Importujte DXF (nebo DWG). Najdou se tři pohledy, ověří se měřítko z kót a těleso vznikne průnikem siluet.
            </p>
            <div className="row">
              <Button onClick={() => fileRef.current?.click()} disabled={busy}>
                Importovat DXF → 3D
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void ingest('vzor-kvadr.dxf', fixtureDxf(FIXTURES[0], 'third', 1, true))}
              >
                Vzor kvádr
              </Button>
            </div>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".dxf,.dwg,.gz,.tgz,.zip,application/dxf,application/acad,application/gzip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void takeFile(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {busy ? <p className="status">{progress || 'Zpracovávám…'}</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {analysis ? (
          <>
            <section className="block">
              <h2>Měřítko</h2>
              <p style={{ margin: 0 }}>
                <strong>{analysis.scale.label}</strong> · {fmt(analysis.scale.mmPerUnit, 3)} mm/jedn. · {analysis.scale.unitsName}
              </p>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {analysis.scale.note}
                {analysis.scale.titleHint ? ` Razítko: ${analysis.scale.titleHint}.` : ''}
              </p>
            </section>

            <section className="block">
              <h2>Pohledy</h2>
              {!analysis.confident ? (
                <p className="status warn" style={{ marginTop: 0 }}>
                  Přiřazení není jisté — klikněte na roli a potom na ostrov.
                </p>
              ) : null}
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {(['front', 'top', 'side'] as const).map((role) => (
                  <Button key={role} size="sm" variant={pickRole === role ? 'rust' : 'outline'} onClick={() => setPickRole(pickRole === role ? null : role)}>
                    {ROLE_LABEL[role]}
                    {assignment?.[role] != null ? ` #${assignment[role]}` : ' —'}
                  </Button>
                ))}
              </div>
              <label className="muted" style={{ display: 'block', marginTop: 8 }}>
                Projekce:{' '}
                <select
                  value={manual.projection}
                  onChange={(e) => {
                    const projection = e.target.value as Projection
                    setManual((m) => ({ ...m, projection }))
                    if (manual.front !== null) {
                      void applyAssignment(manualAssignment(manual.front, manual.top, manual.side, analysis.islands, projection))
                    }
                  }}
                >
                  <option value="first">1. kvadrant (ISO-E)</option>
                  <option value="third">3. kvadrant (ISO-A)</option>
                </select>
              </label>
              {analysis.candidates.length > 1 ? (
                <div style={{ marginTop: 8 }}>
                  <p className="muted" style={{ margin: '0 0 4px' }}>
                    Alternativy:
                  </p>
                  {analysis.candidates.slice(0, 5).map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      className="dxf3d-cand"
                      onClick={() => {
                        setManual({ front: c.front, top: c.top, side: c.side, projection: c.projection })
                        void applyAssignment(c)
                      }}
                    >
                      č#{c.front} / p#{c.top ?? '—'} / b#{c.side ?? '—'} · {c.projection === 'first' ? 'ISO-E' : 'ISO-A'} · {(c.score * 100).toFixed(0)} %
                    </button>
                  ))}
                </div>
              ) : null}
              <IslandList
                islands={analysis.islands}
                assignment={assignment}
                pickRole={pickRole}
                onPick={onIslandClick}
              />
            </section>

            {views ? (
              <section className="block">
                <h2>Rozměry</h2>
                <table className="dxf3d-table">
                  <thead>
                    <tr>
                      <th>Osa</th>
                      <th>Pohled A</th>
                      <th>Pohled B</th>
                      <th>Hodnota</th>
                      <th>Δ</th>
                      <th>Kóta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {views.checks.map((c) => (
                      <tr key={c.axis} className={c.ok ? '' : 'is-bad'} title={c.source === 'computed' ? 'Dopočítáno' : 'Změřeno'}>
                        <td>
                          {c.label}
                          {c.source === 'computed' ? ' *' : ''}
                        </td>
                        <td>
                          {c.a.view}: {fmt(c.a.value)}
                        </td>
                        <td>
                          {c.b.view}: {fmt(c.b.value)}
                        </td>
                        <td>{fmt(c.value)} mm</td>
                        <td>{fmt(c.delta)}</td>
                        <td>{fmt(c.dim)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted">* = dopočítáno (není přímo ve výkresu).</p>
              </section>
            ) : null}

            {result?.deviations.length ? (
              <section className="block">
                <h2>Odchylky reprojekce</h2>
                <ul className="dxf3d-devs">
                  {result.deviations.map((d) => (
                    <li key={d.view} className={`is-${d.status}`}>
                      <strong>{ROLE_LABEL[d.view]}</strong>: max {fmt(d.max)} mm · průměr {fmt(d.mean)} mm
                      {d.holesExpected ? ` · díry ${d.holesFound}/${d.holesExpected}` : ''}
                      {d.note ? ` · ${d.note}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysis.warnings.length || views?.warnings.length ? (
              <section className="block">
                <h2>Upozornění</h2>
                <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                  {[...analysis.warnings, ...(views?.warnings ?? [])].map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="block">
              <h2>Export</h2>
              <div className="row">
                <Button variant="rust" disabled={!result?.geometry || busy} onClick={() => void saveGlb()}>
                  Stáhnout GLB
                </Button>
              </div>
              {result?.geometry ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  Objem {fmt(result.volume, 0)} mm³ · díry {result.holesCut} · {result.watertight ? 'vodotěsné' : 'nevodotěsné'}
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </aside>

      <main className="app-main">
        <div className="dxf3d-stage">
          <div className="dxf3d-viewport">
            {result?.geometry ? <SolidView geometry={result.geometry} /> : <Empty hint={busy ? progress : 'Nahrajte DXF se třemi pohledy.'} />}
          </div>
          {analysis ? (
            <div className="dxf3d-sheet">
              <SheetPreview
                islands={analysis.islands}
                assignment={assignment}
                pickRole={pickRole}
                onPick={onIslandClick}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="empty">
      <p className="empty-kicker">3D model</p>
      <p>{hint}</p>
    </div>
  )
}

function SolidView({ geometry }: { geometry: THREE.BufferGeometry }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#c4ced8',
        metalness: 0.35,
        roughness: 0.45,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <Canvas camera={{ position: [2, 1.4, 2.4], fov: 40 }} dpr={[1, 1.75]}>
      <color attach="background" args={['#0e1116']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 2]} intensity={1.1} />
      <Environment preset="city" />
      <Bounds fit clip observe margin={1.25}>
        <Center top>
          <mesh geometry={geometry} material={mat} />
        </Center>
      </Bounds>
      <ConcreteFloor size={60} />
      <OrbitControls makeDefault />
    </Canvas>
  )
}

function IslandList({
  islands,
  assignment,
  pickRole,
  onPick,
}: {
  islands: Dxf3dResult['analysis']['islands']
  assignment: ViewAssignment | null
  pickRole: RolePick
  onPick: (id: number) => void
}) {
  const roleOf = (id: number) => {
    if (assignment?.front === id) return ROLE_LABEL.front
    if (assignment?.top === id) return ROLE_LABEL.top
    if (assignment?.side === id) return ROLE_LABEL.side
    return null
  }
  return (
    <ul className="dxf3d-islands">
      {islands.map((isl) => {
        const role = roleOf(isl.id)
        return (
          <li key={isl.id}>
            <button type="button" className={pickRole ? 'is-pick' : role ? 'is-role' : ''} onClick={() => onPick(isl.id)}>
              #{isl.id} · {fmt(isl.width, 0)} × {fmt(isl.height, 0)} mm · {isl.contourMethod}
              {role ? ` · ${role}` : ''}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function SheetPreview({
  islands,
  assignment,
  pickRole,
  onPick,
}: {
  islands: Dxf3dResult['analysis']['islands']
  assignment: ViewAssignment | null
  pickRole: RolePick
  onPick: (id: number) => void
}) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const i of islands) {
    x0 = Math.min(x0, i.box.x0)
    y0 = Math.min(y0, i.box.y0)
    x1 = Math.max(x1, i.box.x1)
    y1 = Math.max(y1, i.box.y1)
  }
  const w = Math.max(1e-6, x1 - x0)
  const h = Math.max(1e-6, y1 - y0)
  const pad = Math.max(w, h) * 0.04
  const font = Math.max(w, h) * 0.022
  const roleOf = (id: number) => {
    if (assignment?.front === id) return 'front'
    if (assignment?.top === id) return 'top'
    if (assignment?.side === id) return 'side'
    return null
  }
  return (
    <svg viewBox={`${x0 - pad} ${-(y1 + pad)} ${w + pad * 2} ${h + pad * 2}`} className="dxf3d-svg">
      {islands.map((isl) => {
        const role = roleOf(isl.id)
        const pts = isl.contour.map((p) => `${isl.box.x0 + p.x / isl.mmPerUnit},${-(isl.box.y0 + p.y / isl.mmPerUnit)}`).join(' ')
        return (
          <g key={isl.id} onClick={() => onPick(isl.id)} style={{ cursor: pickRole ? 'pointer' : 'default' }}>
            <rect
              x={isl.box.x0}
              y={-isl.box.y1}
              width={isl.box.x1 - isl.box.x0}
              height={isl.box.y1 - isl.box.y0}
              className={`dxf3d-box${role ? ` is-${role}` : ''}${pickRole ? ' is-pickable' : ''}`}
            />
            <polygon points={pts} className={`dxf3d-poly${role ? ` is-${role}` : ''}`} />
            <text x={(isl.box.x0 + isl.box.x1) / 2} y={-((isl.box.y0 + isl.box.y1) / 2)} className="dxf3d-label" style={{ fontSize: font }}>
              #{isl.id}
              {role ? ` ${ROLE_LABEL[role]}` : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
