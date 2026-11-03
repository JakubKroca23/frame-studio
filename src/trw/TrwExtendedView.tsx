import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { bodyHookliftPlacement, hookliftPlacement, isHookliftAccessory } from './hooklift'
import { HookliftModel } from './HookliftModel'
import { AuxOutriggerModel, pickAuxStab } from './AuxOutriggerModel'
import { StabilitySectors } from './StabilitySectors'
import { LeaderLabel } from '../view/LeaderLabel'
import { useSceneFilters } from '../view/sceneFilters'
import { bodyLabel, boundsOf, parametricBodyBoxes } from './bodyGeometry'
import { dedupeAccessories, extendedBodies, nearestAngle, type ExtAccessory, type ExtBody, type ExtStability, type TrwExtended } from './trwExtended'

const EMPTY_STABILITY: ExtStability = { angles: [], pass: null, verified: false, minFactor: null, requiredN: null } as ExtStability

/** 3D view of the extended trw blocks (X rearward from axle 1, Y up, Z lateral = trw y). */
export function TrwExtendedView({ hideBody, ext, frameTop, slewDeg, frameRear, craneX, sectorRadius = 8000, showSectors = true, liveDoc }: { hideBody?: boolean; liveDoc?: { document?: unknown; document_id?: number | string } | null; ext: TrwExtended; frameTop: number; slewDeg: number; frameRear?: number; craneX?: number | null; sectorRadius?: number; showSectors?: boolean }) {
  const rear = frameRear ?? Math.max(ext.body?.xTo ?? 0, 8000)
  const bodies = extendedBodies(ext)
  const accessories = dedupeAccessories(ext.accessories ?? [])
  const showStab = useSceneFilters((s) => s.stability)
  return (
    <group name="trw-extended">
      {!hideBody ? bodies.map((b, i) => <Body key={`body-${i}-${b.typeRaw ?? b.type}`} body={b} frameTop={frameTop} frameRear={rear} />) : null}
      {accessories.map((a, i) =>
        a.isOutrigger ? (
          <ExtraOutrigger key={`${a.name}-${i}`} a={a} frameTop={frameTop} />
        ) : isHookliftAccessory(a) ? (
          <HookliftAccessory key={`${a.name}-${i}`} a={a} frameTop={frameTop} frameRear={rear} />
        ) : (
          <Accessory key={`${a.name}-${i}`} a={a} frameTop={frameTop} />
        ),
      )}
      {showStab && (ext.stability || (liveDoc && craneX != null)) ? (craneX != null && (ext.stability?.angles.length || liveDoc) ? <StabilitySectors st={ext.stability ?? EMPTY_STABILITY} craneX={craneX} radius={sectorRadius} showSectors={showSectors} slewDeg={slewDeg} liveDoc={liveDoc} />   : <Stability st={ext.stability!} slewDeg={slewDeg} frameTop={frameTop} />) : null}
    </group>
  )
}

function Box({ pos, size, color, opacity = 0.55 }: { pos: [number, number, number]; size: [number, number, number]; color: string; opacity?: number }) {
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

function HookliftAccessory({ a, frameTop, frameRear }: { a: ExtAccessory; frameTop: number; frameRear: number }) {
  const { xRear, params, spec, exact, mesh } = hookliftPlacement(a, frameRear)
  const xFront = xRear - params.lengthMm
  const fallback = <ParametricBody body={{ type: 'hooklift', typeRaw: a.name, xFrom: xFront, xTo: xRear, length: params.lengthMm, width: null, height: null, sideHeight: null, massKg: null, cog: { x: null, y: null, z: null } }} frameTop={frameTop} simple />
  return (
    <group name={`trw-accessory-${a.name}`}>
      <HookliftModel xRear={xRear} frameTop={frameTop} params={params} mesh={mesh} spec={spec} fallback={fallback} />
      <LeaderLabel position={[(xFront + xRear) / 2, frameTop + 250, 0]} text={`${a.name}${spec && !a.name.includes(spec.name) ? ` (${spec.name})` : ''}${spec && !exact ? ' – automaticky vybráno, trw udává jen řadu' : ''} · ${a.massKg != null ? `${Math.round(a.massKg)} kg` : spec ? `${spec.massKg} kg (katalog)` : '? kg'}`} bg="rgba(110,50,140,0.9)" />
    </group>
  )
}

function ParametricBody({ body, frameTop, simple }: { body: ExtBody; frameTop: number; simple?: boolean }) {
  const W = body.width ?? 2500
  const H = body.height ?? 1000
  const boxes = useMemo(
    () =>
      body.xFrom != null && body.xTo != null && body.xTo > body.xFrom
        ? parametricBodyBoxes({
            type: body.type,
            xFrom: body.xFrom,
            xTo: body.xTo,
            width: W,
            height: H,
            sideHeight: body.sideHeight,
            frameTop,
          })
        : [],
    [body.type, body.xFrom, body.xTo, W, H, body.sideHeight, frameTop],
  )
  if (body.xFrom == null || body.xTo == null || body.xTo <= body.xFrom) return null
  const cx = (body.xFrom + body.xTo) / 2
  const y0 = frameTop + 120
  const c = body.type === 'tipper' ? '#b07a2a' : '#7a8a99'
  const top =
    body.type === 'flatbed'
      ? y0 + 80 + (body.sideHeight ?? 400)
      : body.type === 'tipper'
        ? y0 + 60 + H
        : y0 + Math.max(H, body.type === 'hooklift' ? 1600 : 0)
  return (
    <group name="trw-body">
      {boxes.map((b, i) => (
        <Box key={i} pos={b.pos} size={b.size} color={c} opacity={body.type === 'other' ? 0.35 : 0.7} />
      ))}
      {body.cog.x != null ? (
        <mesh position={[body.cog.x, body.cog.z ?? y0 + H / 2, body.cog.y ?? 0]}>
          <sphereGeometry args={[80, 16, 12]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ) : null}
      {simple ? null : <LeaderLabel position={[cx, top, 0]} text={`${bodyLabel(body.type, body.typeRaw)}${body.massKg ? ` · ${Math.round(body.massKg)} kg` : ' · ? kg'}`} bg="rgba(70,85,100,0.9)" />}
    </group>
  )
}

function Body({ body, frameTop, frameRear, simple }: { body: ExtBody; frameTop: number; frameRear: number; simple?: boolean }) {
  if (body.type === 'hooklift' && !simple) {
    const { xRear, params, spec, exact, mesh } = bodyHookliftPlacement(body, frameRear)
    const xFront = xRear - params.lengthMm
    return (
      <group name="trw-body-hooklift">
        <HookliftModel xRear={xRear} frameTop={frameTop} params={params} mesh={mesh} spec={spec} fallback={<ParametricBody body={{ ...body, xFrom: xFront, xTo: xRear }} frameTop={frameTop} simple />} />
        <LeaderLabel position={[(xFront + xRear) / 2, frameTop + 250, 0]} text={`${bodyLabel(body.type, body.typeRaw)}${spec ? ` ${spec.name}` : ''}${spec && !exact ? ' – automaticky vybráno, trw udává jen řadu' : ''}${body.massKg ? ` · ${Math.round(body.massKg)} kg` : spec ? ` · ${spec.massKg} kg (katalog)` : ' · ? kg'}`} bg="rgba(70,85,100,0.9)" />
      </group>
    )
  }
  return <ParametricBody body={body} frameTop={frameTop} simple={simple} />
}

function Accessory({ a, frameTop }: { a: ExtAccessory; frameTop: number }) {
  if (a.x == null) return null
  const L = a.length ?? 400
  const cx = a.xFrom != null && a.xTo != null ? (a.xFrom + a.xTo) / 2 : a.x + (a.offsetX ?? 0)
  const H = a.height ?? 300
  const W = a.width ?? 400
  const y = a.cog.z ?? frameTop - H / 2 - 50
  const z = (a.y ?? a.cog.y ?? 0) + (a.offsetY ?? 0)
  const yaw = ((a.yawDeg ?? 0) * Math.PI) / 180
  return (
    <group name={`trw-accessory-${a.name}`} rotation={[0, yaw, 0]}>
      <Box pos={[cx, y, z]} size={[L, H, W]} color="#8e44ad" />
      <LeaderLabel position={[cx, Math.max(y, frameTop) + H / 2, z]} text={`${a.name} · ${a.massKg != null ? Math.round(a.massKg) : '?'} kg`} bg="rgba(110,50,140,0.9)" />
    </group>
  )
}

function ExtraOutrigger({ a, frameTop }: { a: ExtAccessory; frameTop: number }) {
  if (a.x == null) return null
  const legs: [string, number | null][] = [
    ['left', a.reachLeft],
    ['right', a.reachRight],
  ]
  const boxes = legs.map(([side, reach]) => {
    if (reach == null || reach <= 0) return null
    const z = (side === 'left' ? -1 : 1) * reach
    return (
      <group key={side}>
        <Box pos={[a.x!, frameTop - 60, z / 2]} size={[140, 120, Math.abs(z)]} color="#d35400" opacity={0.85} />
        <mesh position={[a.x!, frameTop / 2, z]}>
          <cylinderGeometry args={[55, 55, frameTop, 14]} />
          <meshStandardMaterial color="#d35400" />
        </mesh>
        <mesh position={[a.x!, 15, z]}>
          <cylinderGeometry args={[200, 200, 30, 20]} />
          <meshStandardMaterial color="#d35400" />
        </mesh>
      </group>
    )
  })
  return (
    <group name={`trw-extra-outrigger-${a.name}`}>
      <AuxOutriggerModel kind={pickAuxStab((a.reachLeft ?? 0) + (a.reachRight ?? 0) || null)} x={a.x} top={frameTop - 60} reachLeft={a.reachLeft} reachRight={a.reachRight} fallback={<>{boxes}</>} />
      <LeaderLabel position={[a.x, frameTop, 0]} text={`${a.name} · ${a.massKg != null ? Math.round(a.massKg) : '?'} kg`} bg="rgba(180,70,0,0.9)" />
    </group>
  )
}

function Stability({ st, slewDeg, frameTop }: { st: ExtStability; slewDeg: number; frameTop: number }) {
  const e = nearestAngle(st, slewDeg)
  if (!e) return null
  const forces = useSceneFilters((s) => s.forces)
  const color = e.pass === false ? '#d62828' : e.pass === true ? '#2a9d3a' : '#888'
  return (
    <group name="trw-stability">
      {e.tippingLines.map(([p, q], i) => (
        <Line key={i} points={[[p.x, 8, p.y], [q.x, 8, q.y]]} color={color} lineWidth={3} dashed dashSize={200} gapSize={100} />
      ))}
      {e.reactions.map((r, i) => {
        if (r.x == null) return null
        const z = r.y ?? (r.side === 'left' ? -1100 : r.side === 'right' ? 1100 : 0)
        const len = Math.min(1500, Math.max(200, Math.abs(r.kN ?? 0) * 8))
        const c = r.kN != null && r.kN <= 0 ? '#d62828' : r.kind === 'outrigger' ? '#1f6fd1' : '#555'
        return (
          <group key={i} position={[r.x, 0, z]} visible={forces}>
            <mesh position={[0, len / 2 + 120, 0]}>
              <cylinderGeometry args={[25, 25, len, 10]} />
              <meshStandardMaterial color={c} />
            </mesh>
            <mesh position={[0, 60, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[70, 120, 14]} />
              <meshStandardMaterial color={c} />
            </mesh>
            <Html position={[0, len + 220, 0]} center style={{ pointerEvents: 'none' }}>
              <div className="sf-force" style={{ background: 'rgba(255,255,255,0.9)', color: c, border: `1px solid ${c}`, font: '11px sans-serif', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                {r.kN != null ? `${r.kN.toFixed(1)} kN` : '? kN'}
              </div>
            </Html>
          </group>
        )
      })}
      <Html position={[0, frameTop + 2600, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="stab-label" style={{ background: color, color: '#fff', font: '12px sans-serif', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {e.angleDeg}° · k={e.factor != null ? e.factor.toFixed(2) : '?'} · {e.pass === true ? 'vyhovuje' : e.pass === false ? 'nevyhovuje' : '?'}
          {!st.verified ? <span style={{ marginLeft: 6, background: '#f4c430', color: '#222', padding: '0 4px', borderRadius: 3 }}>neověřeno proti CraneWIN</span> : null}
        </div>
      </Html>
    </group>
  )
}

export { boundsOf as bodySceneBounds }
