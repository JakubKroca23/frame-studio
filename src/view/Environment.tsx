import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Lightweight procedural surroundings: concrete yard + assembly hall (montážní hala) behind the truck
 * (−Z side, so the default three-quarter camera at +Z looks past the truck towards the hall).
 * Units mm, X rearward from axle 1, Y up. A handful of shared materials, merged box geometry, no shadows cast.
 */
const HALL = { x0: -9000, x1: 21000, z0: -32000, z1: -11000, wall: 8000, ridge: 10500 }

const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: '#666c71', roughness: 0.92, metalness: 0.04, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
  clad: new THREE.MeshStandardMaterial({ color: '#8a949b', roughness: 0.6, metalness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: '#3d5a80', roughness: 0.5, metalness: 0.5 }),
  roof: new THREE.MeshStandardMaterial({ color: '#6e7a84', roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }),
  cladBoth: new THREE.MeshStandardMaterial({ color: '#8a949b', roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }),
  door: new THREE.MeshStandardMaterial({ color: '#c4c9cc', roughness: 0.5, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2f363c', roughness: 0.8 }),
}

type BoxSpec = [cx: number, cy: number, cz: number, sx: number, sy: number, sz: number]

function boxes(list: BoxSpec[]): THREE.BufferGeometry {
  const geos = list.map(([cx, cy, cz, sx, sy, sz]) => new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz))
  const merged = mergeBoxes(geos)
  geos.forEach((g) => g.dispose())
  return merged
}

/** Minimal merge of non-indexed copies (avoids pulling BufferGeometryUtils into this chunk). */
function mergeBoxes(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => g.toNonIndexed())
  const n = parts.reduce((a, g) => a + g.getAttribute('position').count, 0)
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3)
  let o = 0
  for (const g of parts) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3)
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3)
    o += g.getAttribute('position').count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.computeBoundingSphere()
  return out
}

export function buildHall() {
  const { x0, x1, z0, z1, wall, ridge } = HALL
  const L = x1 - x0, W = z1 - z0, cz = (z0 + z1) / 2, t = 150
  const doorW = 6000, doorH = 6000, doorX = 6000
  // cladding walls; the front (+Z) wall has a door opening
  const clad: BoxSpec[] = [
    [(x0 + x1) / 2, wall / 2, z0, L, wall, t],
    [x0, wall / 2, cz, t, wall, W],
    [x1, wall / 2, cz, t, wall, W],
    [(x0 + doorX - doorW / 2) / 2, wall / 2, z1, doorX - doorW / 2 - x0, wall, t],
    [(doorX + doorW / 2 + x1) / 2, wall / 2, z1, x1 - doorX - doorW / 2, wall, t],
    [doorX, (doorH + wall) / 2, z1, doorW, wall - doorH, t],
  ]
  // corrugation ribs on the front wall (cheap vertical strips)
  const steel: BoxSpec[] = []
  for (let x = x0; x <= x1; x += 6000) {
    steel.push([x, wall / 2, z1 + 200, 300, wall, 300], [x, wall / 2, z0 - 200, 300, wall, 300]) // portal columns
  }
  steel.push([(x0 + x1) / 2, wall + 150, z1 + 200, L + 300, 300, 300])
  steel.push([doorX - doorW / 2 - 150, doorH / 2, z1 + 120, 200, doorH, 200], [doorX + doorW / 2 + 150, doorH / 2, z1 + 120, 200, doorH, 200], [doorX, doorH + 100, z1 + 120, doorW + 500, 200, 200])
  const ribs: BoxSpec[] = []
  for (let x = x0 + 500; x < x1; x += 1000) if (Math.abs(x - doorX) > doorW / 2 + 300) ribs.push([x, wall / 2, z1 + 90, 60, wall - 200, 40])
  // sectional door: closed, with panel joints
  const door: BoxSpec[] = [[doorX, doorH / 2, z1 + 20, doorW, doorH, 60]]
  const dark: BoxSpec[] = []
  for (let y = 600; y < doorH; y += 600) dark.push([doorX, y, z1 + 55, doorW - 40, 30, 20])
  dark.push([doorX - doorW / 2 - 1200, 1100, z1 + 80, 1000, 2200, 40]) // personnel door
  // gable roof (two slopes) + gable ends
  const roof = new THREE.BufferGeometry()
  const ov = 400
  const v = [
    [x0 - ov, wall, z1 + ov], [x1 + ov, wall, z1 + ov], [x1 + ov, ridge, cz], [x0 - ov, ridge, cz],
    [x0 - ov, wall, z0 - ov], [x1 + ov, wall, z0 - ov], [x1 + ov, ridge, cz], [x0 - ov, ridge, cz],
  ]
  const tri = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]
  roof.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((i) => v[i]), 3))
  roof.computeVertexNormals()
  const gable = new THREE.BufferGeometry()
  const g = [[x0, wall, z0], [x0, wall, z1], [x0, ridge, cz], [x1, wall, z1], [x1, wall, z0], [x1, ridge, cz]]
  gable.setAttribute('position', new THREE.Float32BufferAttribute(g.flat(), 3))
  gable.computeVertexNormals()
  return { clad: boxes([...clad, ...ribs]), steel: boxes(steel), door: boxes(door), dark: boxes(dark), roof, gable }
}

export function Surroundings() {
  const hall = useMemo(buildHall, [])
  return (
    <group name="env">
      {/* single ground plane (concrete yard), slightly below 0 with polygon offset → no z-fighting with the grid / tyres */}
      <mesh name="env-ground" rotation={[-Math.PI / 2, 0, 0]} position={[4000, -2, -8000]} material={mats.concrete} receiveShadow>
        <planeGeometry args={[80000, 60000]} />
      </mesh>
      <group name="env-hall">
        <mesh geometry={hall.clad} material={mats.clad} />
        <mesh geometry={hall.steel} material={mats.steel} />
        <mesh geometry={hall.door} material={mats.door} />
        <mesh geometry={hall.dark} material={mats.dark} />
        <mesh geometry={hall.roof} material={mats.roof} />
        <mesh geometry={hall.gable} material={mats.cladBoth} />
      </group>
    </group>
  )
}
