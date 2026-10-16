import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Button } from '../components/ui/button'
import { runDxf3d } from '../dxf3d/runWorker'
import { isDwgMagic } from '../state'
import { decodeDrawing } from '../io/decodeDrawing'
import { ROLE_LABEL, ROLES, autoPlace, autoScale, orient, roleFromName, type Datums, type DxfLayer, type LayerRole } from './dxfLayers'

const COLORS: Record<LayerRole, string> = { assembly: '#64748b', container: '#f59e0b', body: '#22c55e', chassis: '#3b82f6' }
/** Geometries live outside React state (not cloneable / big). */
const geoms = new Map<number, THREE.BufferGeometry>()
let nextId = 1

async function drawingText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (/\.dwg$/i.test(file.name) || isDwgMagic(bytes)) {
    const { dwgBytesToDxf } = await import('../io/dwg')
    return dwgBytesToDxf(bytes)
  }
  return decodeDrawing(file.name.replace(/\.dwg$/i, '.dxf'), bytes)
}

/** Layer list state + adding a drawing (DXF→3D in the worker). `onChassis` merges measured chassis values. */
export function useDxfLayers(onChassis: (file: File) => void) {
  const [layers, setLayers] = useState<DxfLayer[]>([])
  const update = (id: number, p: Partial<DxfLayer>) => setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)))
  async function add(file: File) {
    const id = nextId++
    const role = roleFromName(file.name)
    setLayers((ls) => [...ls, { id, file: file.name, role, visible: true, replace: false, flip: false, swap: false, kw: 1, kh: 1, scale: 1, offset: { x: 0, y: 0, z: 0 }, status: 'loading', message: 'Převádím výkres na 3D…' }])
    try {
      const text = await drawingText(file)
      const res = await runDxf3d(text, (m) => update(id, { message: m }))
      if (!res.geometry || !res.views) throw new Error('Z výkresu se nepodařilo sestavit 3D (chybí pohledy).')
      res.geometry.computeBoundingBox()
      const b = res.geometry.boundingBox!
      const size = { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z }
      geoms.set(id, res.geometry)
      const o = orient(size, 'auto')
      const sc = autoScale(o.length, file.name, o.width, o.height)
      update(id, { status: 'ok', size, swap: o.swapped, scale: sc.k, kw: sc.kw, kh: sc.kh, message: `${Math.round(o.length * sc.k)} × ${Math.round(o.width * sc.k * sc.kw)} × ${Math.round(o.height * sc.k * sc.kh)} mm (d × š × v)${o.swapped ? ' · výška/šířka prohozeny' : ''} · ${sc.note}${res.analysis?.confident === false ? ' · pohledy nejisté' : ''}` })
      if (role === 'assembly' || role === 'chassis') onChassis(file)
    } catch (err) {
      update(id, { status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }
  const remove = (id: number) => { geoms.get(id)?.dispose(); geoms.delete(id); setLayers((ls) => ls.filter((l) => l.id !== id)) }
  if (typeof window !== 'undefined') (window as unknown as { __dxfLayers?: unknown }).__dxfLayers = { layers, update }
  return { layers, add, update, remove }
}

const num = (v: string) => (Number.isFinite(+v) ? +v : 0)
export function DxfLayersPanel({ layers, add, update, remove, datums }: ReturnType<typeof useDxfLayers> & { datums: Datums }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <details className="status" data-testid="cfg-layers" open>
      <summary>Vrstvy z výkresů ({layers.length})</summary>
      <p className="muted">Přidejte postupně další DXF/DWG – každý dostane roli a jeho 3D se zarovná podle vztažných bodů (čelo vozidla, konec rámu, nosič kontejnerů). Posun lze doladit ručně.</p>
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()} data-testid="cfg-layer-add">+ Přidat výkres</Button>
      <input ref={ref} type="file" multiple accept=".dxf,.dwg,.gz,.zip" style={{ display: 'none' }} data-testid="cfg-layer-input"
        onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; fs.forEach((f) => void add(f)) }} />
      {layers.map((l) => {
        const o = l.size ? orient(l.size, l.swap) : null
        const p = o ? autoPlace(l.role, o.length * l.scale, datums) : null
        return (
          <div key={l.id} className="layer" data-testid="cfg-layer" style={{ borderLeft: `4px solid ${COLORS[l.role]}`, padding: '4px 8px', margin: '6px 0' }}>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={l.visible} title="Zobrazit" onChange={(e) => update(l.id, { visible: e.target.checked })} />
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }} title={l.file}>{l.file}</strong>
              <button type="button" className="head-link" title="Odebrat" onClick={() => remove(l.id)} data-testid="cfg-layer-del">✕</button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <select value={l.role} onChange={(e) => update(l.id, { role: e.target.value as LayerRole })} data-testid="cfg-layer-role">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              {l.role === 'container' || l.role === 'body' ? <label><input type="checkbox" checked={l.replace} onChange={(e) => update(l.id, { replace: e.target.checked })} /> nahradit z trw</label> : null}
              <label title="Pohledy přiřazeny s prohozenou výškou a šířkou"><input type="checkbox" checked={l.swap} onChange={(e) => update(l.id, { swap: e.target.checked })} /> výška↔šířka</label>
              <label><input type="checkbox" checked={l.flip} onChange={(e) => update(l.id, { flip: e.target.checked })} /> otočit</label>
            </div>
            <div className={l.status === 'error' ? 'warn' : 'muted'} style={{ fontSize: 12 }}>{l.message}{p ? ` · ${p.note}` : ''}</div>
            {l.status === 'ok' ? (
              <div className="row" style={{ gap: 4, fontSize: 12 }}>
                {(['x', 'y', 'z'] as const).map((k) => (
                  <label key={k}>{k === 'x' ? 'podél' : k === 'y' ? 'výška' : 'příčně'} <input type="number" step={50} style={{ width: 64 }} value={l.offset[k]} data-testid={`cfg-layer-${k}`} onChange={(e) => update(l.id, { offset: { ...l.offset, [k]: num(e.target.value) } })} /></label>
                ))}
                <label>měřítko <input type="number" step={0.01} style={{ width: 60 }} value={+l.scale.toFixed(3)} onChange={(e) => update(l.id, { scale: num(e.target.value) || 1 })} /></label>
              </div>
            ) : null}
          </div>
        )
      })}
    </details>
  )
}

/** Scene part: each layer's DXF→3D solid, oriented along the vehicle and placed on its datum + offset. */
export function DxfLayerMeshes({ layers, datums }: { layers: DxfLayer[]; datums: Datums }) {
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [layers, datums, invalidate])
  return <>{layers.map((l) => (l.status === 'ok' && l.visible && geoms.has(l.id) ? <LayerMesh key={l.id} l={l} datums={datums} /> : null))}</>
}

function LayerMesh({ l, datums }: { l: DxfLayer; datums: Datums }) {
  const src = geoms.get(l.id)!
  const g = useMemo(() => {
    // model (X width, Y depth, Z height) → scene (x along, y up, z across); bbox min at the origin, centred across
    const o = orient(l.size!, l.swap)
    const row = (a: 'x' | 'y' | 'z') => [a === 'x' ? 1 : 0, a === 'y' ? 1 : 0, a === 'z' ? 1 : 0]
    const [r0, r1, r2] = [row(o.lengthAxis), row(o.heightAxis), row(o.widthAxis)]
    const m = new THREE.Matrix4().set(r0[0], r0[1], r0[2], 0, r1[0], r1[1], r1[2], 0, r2[0], r2[1], r2[2], 0, 0, 0, 0, 1)
    const c = src.clone().applyMatrix4(m)
    c.computeBoundingBox()
    const b = c.boundingBox!
    c.translate(-b.min.x, -b.min.y, -(b.min.z + b.max.z) / 2)
    return c
  }, [src, l.size, l.swap])
  useEffect(() => () => g.dispose(), [g])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS[l.role], transparent: true, opacity: l.role === 'assembly' ? 0.35 : 0.8, roughness: 0.6, side: THREE.DoubleSide, depthWrite: l.role !== 'assembly' }), [l.role])
  const len = orient(l.size!, l.swap).length * l.scale
  const p = autoPlace(l.role, len, datums)
  return (
    <group name={`dxf-layer-${l.id}`} position={[p.x0 + l.offset.x + (l.flip ? len : 0), p.y0 + l.offset.y, l.offset.z]} scale={[l.flip ? -l.scale : l.scale, l.scale * l.kh, l.scale * l.kw]}>
      <mesh geometry={g} material={mat} />
    </group>
  )
}
