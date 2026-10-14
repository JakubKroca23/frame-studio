import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { liveCrane } from './liveCrane'
import { classify, factorAt, mergeSectors, sectorFan, STATUS_COLOR, STATUS_LABEL, utilisation } from './stabilitySectors'
import { liveLevel, StabilityLive, type LiveDoc, type LiveResponse } from './stabilityLive'
import type { Sector, SectorStatus } from './stabilitySectors'
import type { ExtPoint, ExtReaction, ExtStability } from './trwExtended'

const rad = Math.PI / 180
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0)
const cone = new THREE.ConeGeometry(70, 120, 14).rotateX(Math.PI).translate(0, 60, 0)
const mat = (color: string) => new THREE.MeshBasicMaterial({ color })
const UP = new THREE.Vector3(0, 1, 0)
const MAX_LINES = 4

let client: StabilityLive | null = null
let clientDoc: LiveDoc | null = null
/** One live client per trw document; feature-detected once, silent fallback to local angles. */
function liveClient(doc: LiveDoc) {
  if (!client || clientDoc !== doc) {
    client?.close()
    client = new StabilityLive()
    clientDoc = doc
    void client.connect(doc)
  }
  return client
}
const LEVEL_STATUS: Record<string, SectorStatus> = { ok: 'ok', warn: 'warn', fail: 'fail' }

/** Live sectors → local Sector list (wrap through 0°: to_deg < from_deg). */
function liveSectors(r: LiveResponse): Sector[] | null {
  if (!r.sectors?.length) return null
  return r.sectors.map((x) => {
    const level = x.level ?? (x.status === 'red' ? 'fail' : x.status === 'orange' ? 'warn' : 'ok')
    return { fromDeg: x.from_deg, toDeg: x.to_deg < x.from_deg ? x.to_deg + 360 : x.to_deg, status: LEVEL_STATUS[level] ?? 'unknown', minFactor: x.factor }
  })
}

export interface StabilitySectorsProps {
  st: ExtStability
  craneX: number
  radius: number
  showSectors: boolean
  /** slew from React state (sliders); the live value from the crane drag overrides it between renders */
  slewDeg: number
  /** trw document from the import; without it the live API is not used */
  liveDoc?: LiveDoc | null
}

/**
 * Stability fan around the crane column + live highlight of the current slew: label (k, utilisation, pass),
 * bold tipping line and outrigger reaction arrows. Per-move updates are imperative (useFrame + refs).
 */
export function StabilitySectors({ st, craneX, radius, showSectors, slewDeg, liveDoc }: StabilitySectorsProps) {
  const live = !!liveDoc
  const invalidate = useThree((s) => s.invalidate)
  const [srvSectors, setSrvSectors] = useState<Sector[] | null>(null)
  const sectors = useMemo(() => srvSectors ?? mergeSectors(st, 1), [st, srvSectors])
  const fan = useMemo(() => {
    const { positions, colors } = sectorFan(sectors, radius, 600)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeBoundingSphere()
    return g
  }, [sectors, radius])
  useEffect(() => () => fan.dispose(), [fan])
  const fanMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [])
  const hiGeo = useMemo(() => {
    const { positions } = sectorFan([{ fromDeg: -1.5, toDeg: 1.5, status: 'unknown', minFactor: null }], radius * 1.04, 600, 2)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [radius])
  const hiMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), [])
  const lineMats = useMemo(() => ({ ok: mat(STATUS_COLOR.ok), warn: mat(STATUS_COLOR.warn), fail: mat(STATUS_COLOR.fail), unknown: mat(STATUS_COLOR.unknown) }), [])
  const arrowMats = useMemo(() => ({ push: mat('#1f6fd1'), lift: mat('#d62828') }), [])
  const nReact = useMemo(() => Math.max(0, ...st.angles.map((a) => a.reactions.length)), [st])

  const hi = useRef<THREE.Mesh>(null)
  const labelAnchor = useRef<THREE.Group>(null)
  const labelEl = useRef<HTMLDivElement>(null)
  const lines = useRef<(THREE.Mesh | null)[]>([])
  const arrows = useRef<(THREE.Group | null)[]>([])
  const arrowLabels = useRef<(HTMLDivElement | null)[]>([])
  const liveRes = useRef<LiveResponse | null>(null)
  const last = useRef('')

  useEffect(() => {
    if (!liveDoc) return
    const c = liveClient(liveDoc)
    let sig = ''
    return c.onResult((r) => {
      liveRes.current = r
      const ls = liveSectors(r)
      const k = ls ? JSON.stringify(ls) : ''
      if (ls && k !== sig) { sig = k; setSrvSectors(ls) } // re-render only when the server fan changes
      invalidate()
    }) as () => void
  }, [liveDoc, invalidate])

  useFrame(() => {
    const slew = liveCrane.version ? liveCrane.slewDeg : slewDeg
    const lr = liveRes.current
    const key = `${slew.toFixed(2)}|${lr ? JSON.stringify(lr).length + ':' + lr.factor : ''}|${showSectors}`
    if (key === last.current) return
    last.current = key
    if (live && client?.available) client.send({ slew_deg: slew, outreach_mm: liveCrane.outreachMm != null ? Math.round(liveCrane.outreachMm) : null, load_kg: liveCrane.loadKg != null ? Math.round(liveCrane.loadKg) : null })

    // local data, overridden by the live answer if it matches this slew
    const loc = factorAt(st, slew)
    const useLive = !!lr && (lr.slew_deg == null || Math.abs(lr.slew_deg - slew) < 2)
    const factor = useLive ? lr!.factor : loc.factor
    const pass = useLive ? lr!.pass : loc.pass
    // live: server level (null factor = cannot tip at this angle → safe); local: own classification
    const status: SectorStatus = useLive ? LEVEL_STATUS[liveLevel(lr!)] : classify(factor, st.requiredN, pass)
    const reqN = (useLive ? lr!.required_n : null) ?? st.requiredN
    const tl: [ExtPoint, ExtPoint][] = useLive && lr!.tipping_lines ? lr!.tipping_lines.map((l) => [{ x: l.from.x_mm, y: l.from.y_mm }, { x: l.to.x_mm, y: l.to.y_mm }]) : loc.nearest?.tippingLines ?? []
    const re: ExtReaction[] = useLive && lr!.reactions ? lr!.reactions.map((r) => ({ kind: 'outrigger', id: r.id, x: r.x_mm ?? null, y: r.y_mm ?? null, side: r.side ?? null, kN: r.kN })) : loc.nearest?.reactions ?? []

    if (hi.current) { hi.current.rotation.y = slew * rad; hi.current.visible = showSectors }
    if (labelAnchor.current) {
      const t = slew * rad, r = radius * 0.62
      labelAnchor.current.position.set(craneX - Math.cos(t) * r, 120, Math.sin(t) * r)
    }
    if (labelEl.current) {
      const u = utilisation(factor, reqN)
      labelEl.current.style.background = STATUS_COLOR[status]
      labelEl.current.textContent = `${Math.round((((slew % 360) + 360) % 360))}° · ${factor != null ? `k=${factor.toFixed(2)}` : useLive ? 'nepřeklopí se' : 'k=?'}${reqN ? ` / ${reqN}` : ''}${u != null ? ` · využití ${Math.round(u * 100)} %` : ''} · ${STATUS_LABEL[status]}${useLive ? ' · live' : ''}`
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3()
    lines.current.forEach((m, i) => {
      if (!m) return
      const l = tl[i]
      m.visible = !!l
      if (!l) return
      a.set(l[0].x, 10, l[0].y); b.set(l[1].x, 10, l[1].y)
      const d = b.clone().sub(a)
      m.position.copy(a)
      m.quaternion.setFromUnitVectors(UP, d.clone().normalize())
      m.scale.set(70, Math.max(d.length(), 1), 70)
      m.material = lineMats[status]
    })
    arrows.current.forEach((g, i) => {
      if (!g) return
      const r = re[i]
      g.visible = !!r && r.x != null
      if (!r || r.x == null) return
      const z = r.y ?? (r.side === 'left' ? -1100 : r.side === 'right' ? 1100 : 0)
      const len = Math.min(1500, Math.max(200, Math.abs(r.kN ?? 0) * 8))
      g.position.set(r.x, 0, z)
      const shaft = g.children[0] as THREE.Mesh, head = g.children[1] as THREE.Mesh
      shaft.position.y = 120; shaft.scale.set(25, len, 25)
      const m = r.kN != null && r.kN <= 0 ? arrowMats.lift : arrowMats.push
      shaft.material = m; head.material = m
      const lab = g.children[2]
      if (lab) lab.position.y = len + 260
      const el = arrowLabels.current[i]
      if (el) { el.textContent = r.kN != null ? `${r.kN.toFixed(1)} kN` : '? kN'; el.style.color = m.color.getStyle(); el.style.borderColor = m.color.getStyle() }
    })
  })

  return (
    <group name="trw-stability-live">
      {showSectors ? <mesh name="stability-sectors" geometry={fan} material={fanMat} position={[craneX, 6, 0]} raycast={() => null} renderOrder={1} /> : null}
      <mesh ref={hi} name="stability-sector-current" geometry={hiGeo} material={hiMat} position={[craneX, 7, 0]} raycast={() => null} renderOrder={2} />
      {Array.from({ length: MAX_LINES }, (_, i) => (
        <mesh key={i} ref={(m) => { lines.current[i] = m }} name={`stability-tipping-${i}`} geometry={unitBox} material={lineMats.unknown} visible={false} raycast={() => null} />
      ))}
      {Array.from({ length: nReact }, (_, i) => (
        <group key={i} ref={(g) => { arrows.current[i] = g }} name={`stability-reaction-${i}`} visible={false}>
          <mesh geometry={unitCyl} material={arrowMats.push} />
          <mesh geometry={cone} material={arrowMats.push} />
          <group>
            <Html center pointerEvents="none" style={{ pointerEvents: 'none' }}>
              <div ref={(el) => { arrowLabels.current[i] = el }} className="stab-reaction-label" />
            </Html>
          </group>
        </group>
      ))}
      <group ref={labelAnchor}>
        <Html center pointerEvents="none" style={{ pointerEvents: 'none' }}>
          <div ref={labelEl} className="stab-label" />
        </Html>
      </group>
    </group>
  )
}
