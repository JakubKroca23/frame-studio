import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { utilColor, utilizationAt, type CsSimResult } from './csSimResult'

function coloredBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, rgb: [number, number, number]) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, Math.abs(z1 - z0))
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  const colors = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) colors.set(rgb, i)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

/**
 * CS Sim result in the viewport (X rearward from axle 1, Y up, Z lateral): the subframe as a U
 * section on top of the rails coloured by utilization along x, rail colour strips, and markers.
 * Rendered outside the chassis group, so it is not part of the GLB export.
 */
export function CsSimOverlay({ result, frameTop, frameHalfWidth, railHeight }: { result: CsSimResult; frameTop: number; frameHalfWidth: number; railHeight: number }) {
  const { subframe: sf } = result
  const geometry = useMemo(() => {
    const { H, B, t } = sf.dims
    const parts: THREE.BufferGeometry[] = []
    const step = 100
    const chPct = Math.max(0, ...result.utilization.filter((u) => u.role === 'ch').map((u) => u.pct)) || null
    for (const sign of [-1, 1]) {
      const zo = sign * frameHalfWidth
      const zi = sign * (frameHalfWidth - t)
      const zf = sign * (frameHalfWidth - B)
      for (let x = sf.from; x < sf.to; x += step) {
        const x1 = Math.min(sf.to, x + step)
        const rgb = utilColor(utilizationAt(sf.curve, sf.uniformPct, (x + x1) / 2))
        parts.push(coloredBox(x, x1, frameTop, frameTop + H, zo, zi, rgb))
        parts.push(coloredBox(x, x1, frameTop, frameTop + t, zi, zf, rgb))
        parts.push(coloredBox(x, x1, frameTop + H - t, frameTop + H, zi, zf, rgb))
      }
      // Thin strip on the outer face of the chassis rail, coloured by the chassis rail utilization.
      if (chPct !== null) {
        const xa = -result.x0
        const xb = result.frameLength !== null ? result.frameLength - result.x0 : sf.to
        parts.push(coloredBox(xa, xb, frameTop - railHeight + 15, frameTop - 15, sign * (frameHalfWidth + 1), sign * (frameHalfWidth + 6), utilColor(chPct)))
      }
    }
    return parts.length ? mergeGeometries(parts) : null
  }, [sf, result, frameTop, frameHalfWidth, railHeight])
  useEffect(() => () => geometry?.dispose(), [geometry])

  const gx = result.governing?.x ?? result.maxMoment?.x ?? null
  const mx = result.maxMoment?.x ?? null
  const top = frameTop + sf.dims.H
  return (
    <group name="cs-sim-overlay">
      {geometry ? (
        <mesh geometry={geometry}>
          <meshStandardMaterial vertexColors transparent={sf.estimated} opacity={sf.estimated ? 0.7 : 1} roughness={0.6} />
        </mesh>
      ) : null}
      {gx !== null ? (
        <mesh position={[gx, top + 350, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[140, 400, 20]} />
          <meshStandardMaterial color="#d6261e" emissive="#5a0d0a" />
        </mesh>
      ) : null}
      {mx !== null && mx !== gx ? (
        <mesh position={[mx, top + 300, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[100, 300, 16]} />
          <meshStandardMaterial color="#3a6fd8" />
        </mesh>
      ) : null}
    </group>
  )
}
