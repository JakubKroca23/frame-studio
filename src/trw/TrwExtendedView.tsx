import { Html, Line } from '@react-three/drei'
import type { ReactNode } from 'react'
import { bodyHookliftPlacement, hookliftPlacement, isHookliftAccessory } from './hooklift'
import { HookliftModel } from './HookliftModel'
import { BODY_TYPE_LABEL, nearestAngle, type ExtAccessory, type ExtBody, type ExtStability, type TrwExtended } from './trwExtended'

/** 3D view of the extended trw blocks (X rearward from axle 1, Y up, Z lateral = trw y). */
export function TrwExtendedView({ ext, frameTop, slewDeg, frameRear }: { ext: TrwExtended; frameTop: number; slewDeg: number; frameRear?: number }) {
  const rear = frameRear ?? Math.max(ext.body?.xTo ?? 0, 8000)
  return (
    <group name="trw-extended">
      {ext.body ? <Body body={ext.body} frameTop={frameTop} frameRear={rear} /> : null}
      {(ext.accessories ?? []).map((a, i) => (a.isOutrigger ? <ExtraOutrigger key={i} a={a} frameTop={frameTop} /> : isHookliftAccessory(a) ? <HookliftAccessory key={i} a={a} frameTop={frameTop} frameRear={rear} /> : <Accessory key={i} a={a} frameTop={frameTop} />))}
      {ext.stability ? <Stability st={ext.stability} slewDeg={slewDeg} frameTop={frameTop} /> : null}
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
  const { xRear, params } = hookliftPlacement(a, frameRear)
  const xFront = xRear - params.lengthMm
  const fallback = <Body body={{ type: 'hooklift', typeRaw: a.name, xFrom: xFront, xTo: xRear, length: params.lengthMm, width: null, height: null, sideHeight: null, massKg: null, cog: { x: null, y: null, z: null } }} frameTop={frameTop} frameRear={frameRear} simple />
  return (
    <group name={`trw-accessory-${a.name}`}>
      <HookliftModel xRear={xRear} frameTop={frameTop} params={params} fallback={fallback} />
      <Label position={[(xFront + xRear) / 2, frameTop + params.hookHeightMm + 900, 0]} text={`${a.name} · ${a.massKg != null ? Math.round(a.massKg) : '?'} kg`} bg="rgba(110,50,140,0.9)" />
    </group>
  )
}

function Body({ body, frameTop, frameRear, simple }: { body: ExtBody; frameTop: number; frameRear: number; simple?: boolean }) {
  if (body.type === 'hooklift' && !simple) {
    const { xRear, params } = bodyHookliftPlacement(body, frameRear)
    const xFront = xRear - params.lengthMm
    return (
      <group name="trw-body">
        <HookliftModel xRear={xRear} frameTop={frameTop} params={params} fallback={<Body body={{ ...body, xFrom: xFront, xTo: xRear }} frameTop={frameTop} frameRear={frameRear} simple />} />
        <Label position={[(xFront + xRear) / 2, frameTop + params.hookHeightMm + 900, 0]} text={`${BODY_TYPE_LABEL.hooklift}${body.massKg ? ` · ${Math.round(body.massKg)} kg` : ' · ? kg'}`} bg="rgba(70,85,100,0.9)" />
      </group>
    )
  }
  if (body.xFrom == null || body.xTo == null || body.xTo <= body.xFrom) return null
  const L = body.xTo - body.xFrom
  const cx = (body.xFrom + body.xTo) / 2
  const W = body.width ?? 2500
  const H = body.height ?? 1000
  const y0 = frameTop + 120 // longitudinals / floor beams
  const parts: ReactNode[] = []
  const c = '#7a8a99'
  if (body.type === 'flatbed') {
    const sh = body.sideHeight ?? 400
    parts.push(<Box key="floor" pos={[cx, y0 + 40, 0]} size={[L, 80, W]} color={c} opacity={0.7} />)
    for (const s of [-1, 1]) parts.push(<Box key={`s${s}`} pos={[cx, y0 + 80 + sh / 2, (s * (W - 40)) / 2]} size={[L, sh, 40]} color={c} />)
    parts.push(<Box key="front" pos={[body.xFrom + 20, y0 + 80 + sh / 2, 0]} size={[40, sh, W]} color={c} />)
    parts.push(<Box key="rear" pos={[body.xTo - 20, y0 + 80 + sh / 2, 0]} size={[40, sh, W]} color={c} />)
  } else if (body.type === 'tipper') {
    const t = 60
    parts.push(<Box key="floor" pos={[cx, y0 + t / 2, 0]} size={[L, t, W]} color="#b07a2a" opacity={0.7} />)
    for (const s of [-1, 1]) parts.push(<Box key={`s${s}`} pos={[cx, y0 + H / 2, (s * (W - t)) / 2]} size={[L, H, t]} color="#b07a2a" />)
    parts.push(<Box key="front" pos={[body.xFrom + t / 2, y0 + H / 2, 0]} size={[t, H * 1.15, W]} color="#b07a2a" />)
    parts.push(<Box key="rear" pos={[body.xTo - t / 2, y0 + H / 2, 0]} size={[t, H, W]} color="#b07a2a" />)
  } else if (body.type === 'hooklift') {
    const fw = Math.min(W, 1100)
    for (const s of [-1, 1]) parts.push(<Box key={`r${s}`} pos={[cx, y0 + 100, (s * fw) / 2]} size={[L, 200, 120]} color="#4f6d3a" opacity={0.8} />)
    const armH = Math.max(H, 1400)
    parts.push(<Box key="arm-v" pos={[body.xFrom + 250, y0 + 200 + armH / 2, 0]} size={[250, armH, 300]} color="#4f6d3a" opacity={0.85} />)
    parts.push(<Box key="arm-h" pos={[body.xFrom + 250 - 250, y0 + 200 + armH, 0]} size={[600, 200, 250]} color="#4f6d3a" opacity={0.85} />)
    parts.push(<Box key="hook" pos={[body.xFrom - 50, y0 + 200 + armH - 200, 0]} size={[80, 300, 80]} color="#2d3f20" opacity={0.9} />)
  } else parts.push(<Box key="box" pos={[cx, y0 + H / 2, 0]} size={[L, H, W]} color={c} opacity={0.35} />)
  const top = body.type === 'flatbed' ? y0 + 80 + (body.sideHeight ?? 400) : y0 + Math.max(H, body.type === 'hooklift' ? 1600 : 0)
  return (
    <group name="trw-body">
      {parts}
      {body.cog.x != null ? (
        <mesh position={[body.cog.x, body.cog.z ?? y0 + H / 2, body.cog.y ?? 0]}>
          <sphereGeometry args={[80, 16, 12]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      ) : null}
      {simple ? null : <Label position={[cx, top + 250, 0]} text={`${BODY_TYPE_LABEL[body.type]}${body.massKg ? ` · ${Math.round(body.massKg)} kg` : ' · ? kg'}`} bg="rgba(70,85,100,0.9)" />}
    </group>
  )
}

function Accessory({ a, frameTop }: { a: ExtAccessory; frameTop: number }) {
  if (a.x == null) return null
  const L = a.length ?? 400
  const cx = a.xFrom != null && a.xTo != null ? (a.xFrom + a.xTo) / 2 : a.x
  const H = a.height ?? 300
  const W = a.width ?? 400
  const y = a.cog.z ?? frameTop - H / 2 - 50
  return (
    <group name={`trw-accessory-${a.name}`}>
      <Box pos={[cx, y, a.y ?? a.cog.y ?? 0]} size={[L, H, W]} color="#8e44ad" />
      <Label position={[cx, Math.max(y, frameTop) + H / 2 + 300, a.y ?? 0]} text={`${a.name} · ${a.massKg != null ? Math.round(a.massKg) : '?'} kg`} bg="rgba(110,50,140,0.9)" />
    </group>
  )
}

function ExtraOutrigger({ a, frameTop }: { a: ExtAccessory; frameTop: number }) {
  if (a.x == null) return null
  const legs: [string, number | null][] = [
    ['left', a.reachLeft],
    ['right', a.reachRight],
  ]
  return (
    <group name={`trw-extra-outrigger-${a.name}`}>
      {legs.map(([side, reach]) => {
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
      })}
      <Label position={[a.x, frameTop + 350, 0]} text={`${a.name} · ${a.massKg != null ? Math.round(a.massKg) : '?'} kg`} bg="rgba(180,70,0,0.9)" />
    </group>
  )
}

function Stability({ st, slewDeg, frameTop }: { st: ExtStability; slewDeg: number; frameTop: number }) {
  const e = nearestAngle(st, slewDeg)
  if (!e) return null
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
          <group key={i} position={[r.x, 0, z]}>
            <mesh position={[0, len / 2 + 120, 0]}>
              <cylinderGeometry args={[25, 25, len, 10]} />
              <meshStandardMaterial color={c} />
            </mesh>
            <mesh position={[0, 60, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[70, 120, 14]} />
              <meshStandardMaterial color={c} />
            </mesh>
            <Html position={[0, len + 220, 0]} center style={{ pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(255,255,255,0.9)', color: c, border: `1px solid ${c}`, font: '11px sans-serif', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                {r.kN != null ? `${r.kN.toFixed(1)} kN` : '? kN'}
              </div>
            </Html>
          </group>
        )
      })}
      <Html position={[0, frameTop + 2600, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={{ background: color, color: '#fff', font: '12px sans-serif', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {e.angleDeg}° · k={e.factor != null ? e.factor.toFixed(2) : '?'} · {e.pass === true ? 'vyhovuje' : e.pass === false ? 'nevyhovuje' : '?'}
          {!st.verified ? <span style={{ marginLeft: 6, background: '#f4c430', color: '#222', padding: '0 4px', borderRadius: 3 }}>neověřeno proti CraneWIN</span> : null}
        </div>
      </Html>
    </group>
  )
}

function Label({ position, text, bg }: { position: [number, number, number]; text: string; bg: string }) {
  return (
    <Html position={position} center style={{ pointerEvents: 'none' }}>
      <div style={{ background: bg, color: '#fff', font: '11px sans-serif', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>{text}</div>
    </Html>
  )
}
