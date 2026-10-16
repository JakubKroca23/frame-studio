import { DOORS, H } from '../view/Environment'

/** Vehicle centre stops this far in front of the hall facade (along the door axis, before the turn offset). */
export const STOP_Z = H.z1 + 17500
/** Home-scene spot of door `i`: centre x = door centre, heading +Z (cab towards the yard). */
export const spotForDoor = (i: number) => ({ x: DOORS[i], z: STOP_Z })
/** Heading of a parked vehicle: local −X (cab) → world +Z. */
export const HEADING = Math.PI / 2
/** Yaw while driving out: the cab turns LEFT (−X), ending 45° to the facade. Stop is 17.5 m out, so even from
 *  the left door the vehicle (≈ 5 m sideways shift) stays ≥ 14 m in front of the exhibits beside the left gable. */
export const TURN = Math.PI / 4

/**
 * Drive-out path for a vehicle of length `len` from door `door`: straight through the door until the rear clears
 * the facade, then a circular left-hand arc of TURN that ends at z = STOP_Z. `at(s)` gives the centre pose after
 * driving distance s (0 … length).
 */
export function drivePath(door: number, len: number) {
  const x0 = DOORS[door], zFrom = H.z1 - 400 - len / 2
  const zA = Math.min(STOP_Z - 2000, H.z1 + len / 2 + 600)
  const R = (STOP_Z - zA) / Math.sin(TURN)
  const L1 = zA - zFrom, length = L1 + R * TURN
  const at = (s: number) => {
    if (s <= L1) return { x: x0, z: zFrom + Math.max(0, s), rotY: HEADING }
    const a = Math.min(TURN, (s - L1) / R)
    return { x: x0 - R * (1 - Math.cos(a)), z: zA + R * Math.sin(a), rotY: HEADING - a }
  }
  return { length, at, end: at(length) }
}

/** Model origin in world for a root pose (x, z, rotY) when the model is offset by (−cx, −cz) inside the root. */
export function originPose(p: { x: number; z: number; rotY: number }, cx: number, cz: number) {
  const c = Math.cos(p.rotY), s = Math.sin(p.rotY)
  return { x: p.x + (-cx * c + -cz * s), z: p.z + (cx * s + -cz * c), rotY: p.rotY }
}

/**
 * World pose of the vehicle origin (first axle) after the last home drive-out. The configurator places the hall
 * relative to the vehicle with the inverse of this pose, so its view matches where the truck stopped.
 */
export let parkedPose: { x: number; z: number; rotY: number } | null = null
export function setParkedPose(p: typeof parkedPose) { parkedPose = p }

/** Drive-out requested by a home door import; consumed once by the configurator, which plays it in its own scene. */
let pendingDrive: { door: number } | null = null
export function setPendingDrive(d: typeof pendingDrive) { pendingDrive = d }
export function takePendingDrive() { const d = pendingDrive; pendingDrive = null; return d }
