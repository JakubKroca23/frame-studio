import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Lightweight procedural surroundings: concrete yard + assembly hall (montážní hala) behind the truck
 * (−Z side, so the default three-quarter camera at +Z looks past the truck towards the hall).
 * Units mm, X rearward from axle 1, Y up. A handful of shared materials, merged box geometry, no shadows cast.
 */
const mats = {
  concrete: new THREE.MeshStandardMaterial({ color: '#9a9d9e', roughness: 0.92, metalness: 0.04, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
}

/** Hall (Contsystem style): ridge along Z, gable end with 3 sectional doors facing the yard (+Z). */
const H = { x0: -9000, x1: 21000, z0: -48000, z1: -12000, wall: 8500, ridge: 11000 }
const DOORS = [-1500, 6000, 13500], DW = 6000, DH = 6200

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
/** Vertical trapezoidal corrugation as a normal map (one 200 mm rib per tile). */
const corrNormal = () => canvasTex(64, 4, (c) => {
  for (let x = 0; x < 64; x++) {
    const u = x / 64, nx = u < 0.15 ? -0.8 : u < 0.35 ? 0 : u < 0.5 ? 0.8 : 0
    c.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},128,${Math.round(Math.sqrt(1 - nx * nx * 0.5) * 255)})`
    c.fillRect(x, 0, 1, 4)
  }
}, true)
const doorTex = () => canvasTex(16, 128, (c) => {
  c.fillStyle = '#6f767b'; c.fillRect(0, 0, 16, 128)
  for (let i = 0; i < 128; i += 16) { c.fillStyle = '#4f5458'; c.fillRect(0, i, 16, 2); c.fillStyle = '#868c90'; c.fillRect(0, i + 2, 16, 1) }
  c.fillStyle = '#62686c'; for (let i = 8; i < 128; i += 16) c.fillRect(0, i, 16, 1)
}, true)
const stripeTex = () => canvasTex(64, 64, (c) => {
  c.fillStyle = '#f2c200'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#151515'
  for (let k = -64; k < 128; k += 32) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 16, 0); c.lineTo(k + 16 + 64, 64); c.lineTo(k + 64, 64); c.fill() }
}, true)
/** ContSystem wordmark redrawn (bold sans), 3 diagonal stripes above the S, SIMPLE HANDLING + brand line. */
const logoTex = () => canvasTex(1024, 384, (c) => {
  const col = '#3a3f45'
  c.fillStyle = col; c.textBaseline = 'alphabetic'
  c.font = '700 150px "Arial Black", Arial, Helvetica, sans-serif'
  const a = 'Cont', b = 'System', wa = c.measureText(a).width, wb = c.measureText(b).width
  const x = (1024 - wa - wb) / 2, y = 230
  c.fillText(a, x, y); c.fillText(b, x + wa, y)
  for (let i = 0; i < 3; i++) { const yy = 30 + i * 26, xx = x + wa - 8; c.beginPath(); c.moveTo(xx, yy + 16); c.lineTo(xx + 90, yy); c.lineTo(xx + 90, yy + 12); c.lineTo(xx, yy + 28); c.fill() }
  c.font = '500 52px Arial, Helvetica, sans-serif'; c.textAlign = 'right'; c.fillText('SIMPLE HANDLING', x + wa + wb, y + 64)
  c.font = '600 30px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.fillText('HIAB · MULTILIFT · LOGLIFT · JONSERED · STEELBRO', 512, y + 128)
})

/** Plane facing +n with UVs in metres (u along width). */
function panel(w: number, h: number, uScale = 1 / 200, vScale = 1 / 1000) {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * uScale, uv.getY(i) * h * vScale)
  return g
}

export function buildHall() {
  const { x0, x1, z0, z1, wall, ridge } = H
  const W = x1 - x0, L = z1 - z0, cx = (x0 + x1) / 2
  const geo: { g: THREE.BufferGeometry; m: string }[] = []
  const add = (g: THREE.BufferGeometry, m: string) => geo.push({ g, m })
  // gable front: shape with door holes, corrugation u along X
  const s = new THREE.Shape([new THREE.Vector2(x0, 0), new THREE.Vector2(x1, 0), new THREE.Vector2(x1, wall), new THREE.Vector2(cx, ridge), new THREE.Vector2(x0, wall)])
  for (const d of DOORS) s.holes.push(new THREE.Path([new THREE.Vector2(d - DW / 2, 0), new THREE.Vector2(d - DW / 2, DH), new THREE.Vector2(d + DW / 2, DH), new THREE.Vector2(d + DW / 2, 0)].reverse()))
  const front = new THREE.ShapeGeometry(s)
  const fu = front.getAttribute('position'), fuv = front.getAttribute('uv')
  for (let i = 0; i < fu.count; i++) fuv.setXY(i, fu.getX(i) / 200, fu.getY(i) / 1000)
  add(front.translate(0, 0, z1), 'clad')
  const back = new THREE.ShapeGeometry(new THREE.Shape(s.getPoints())); back.rotateY(Math.PI); back.translate(0, 0, z0)
  const bu = back.getAttribute('position'), buv = back.getAttribute('uv')
  for (let i = 0; i < bu.count; i++) buv.setXY(i, bu.getX(i) / 200, bu.getY(i) / 1000)
  add(back, 'clad')
  add(panel(L, wall).rotateY(-Math.PI / 2).translate(x0, wall / 2, (z0 + z1) / 2), 'clad')
  add(panel(L, wall).rotateY(Math.PI / 2).translate(x1, wall / 2, (z0 + z1) / 2), 'clad')
  // roof slopes
  const slope = Math.hypot(W / 2 + 300, ridge - wall), ang = Math.atan2(ridge - wall, W / 2)
  for (const sgn of [-1, 1]) add(new THREE.PlaneGeometry(slope, L + 600).rotateX(-Math.PI / 2).rotateZ(-sgn * ang).translate(cx + sgn * (W / 4 + 75), (wall + ridge) / 2, (z0 + z1) / 2), 'roof')
  // doors, pilasters, lintel, personnel door, lamps
  const B = (x: number, y: number, z: number, sx: number, sy: number, sz: number, m: string) => add(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), m)
  for (const d of DOORS) {
    add(panel(DW, DH, 1 / DW, 1 / DH).translate(d, DH / 2, z1 - 250), 'door')
    B(d, DH + 200, z1 + 120, DW + 1400, 400, 240, 'pil')
    B(d, DH + 1300, z1 + 260, 450, 160, 520, 'lamp')
    add(panel(DW, 300, 1 / 600, 1 / 300).rotateX(-Math.PI / 2).translate(d, 4, z1 + 600), 'stripe')
    for (const sx of [-1, 1]) {
      const bx = d + sx * (DW / 2 + 450)
      add(new THREE.CylinderGeometry(110, 110, 1100, 10).translate(bx, 550, z1 + 600), 'bollard')
    }
  }
  for (const x of [x0, ...DOORS.slice(1).map((d) => d - DW / 2 - 350), DOORS[0] - DW / 2 - 350, DOORS[2] + DW / 2 + 350, x1]) B(x, DH / 2 + 200, z1 + 120, 700, DH + 400, 240, 'pil')
  B(x1 - 1100, 1100, z1 + 30, 1000, 2200, 60, 'door')
  // logo above the middle door
  add(panel(9000, 3375, 1 / 9000, 1 / 3375).translate(cx, DH + 2700, z1 + 15), 'logo')
  return geo
}

const hallMats = () => {
  const n = corrNormal(), st = stripeTex()
  return {
    clad: new THREE.MeshStandardMaterial({ color: '#9aa1a7', envMapIntensity: 0.35, roughness: 0.5, metalness: 0.5, normalMap: n, normalScale: new THREE.Vector2(0.9, 0.9), side: THREE.DoubleSide }),
    roof: new THREE.MeshStandardMaterial({ color: '#8d959b', envMapIntensity: 0.35, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ map: doorTex(), envMapIntensity: 0.35, roughness: 0.55, metalness: 0.3 }),
    pil: new THREE.MeshStandardMaterial({ color: '#6e767c', envMapIntensity: 0.35, roughness: 0.55, metalness: 0.35 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#4a4f54', emissive: '#fff4d6', emissiveIntensity: 0.25, envMapIntensity: 0.35, roughness: 0.5 }),
    stripe: new THREE.MeshStandardMaterial({ map: st, envMapIntensity: 0.35, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    bollard: new THREE.MeshStandardMaterial({ map: st, envMapIntensity: 0.35, roughness: 0.6 }),
    logo: new THREE.MeshBasicMaterial({ map: logoTex(), transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  } as Record<string, THREE.Material>
}

export function Surroundings() {
  const hall = useMemo(buildHall, [])
  const hm = useMemo(hallMats, [])
  return (
    <group name="env">
      {/* single ground plane (concrete yard), slightly below 0 with polygon offset → no z-fighting with the grid / tyres */}
      <mesh name="env-ground" rotation={[-Math.PI / 2, 0, 0]} position={[4000, -2, -8000]} material={mats.concrete} receiveShadow>
        <planeGeometry args={[80000, 80000]} />
      </mesh>
      <group name="env-hall">
        {hall.map((p, i) => <mesh key={i} geometry={p.g} material={hm[p.m]} />)}
      </group>
    </group>
  )
}
