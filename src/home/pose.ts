import { DOORS, H } from '../view/Environment'

/** Vehicle centre stops this far in front of the hall facade (drives straight out, perpendicular to the hall). */
export const STOP_Z = H.z1 + 25000
/** Home-scene spot of door `i`: centre x = door centre, heading +Z (cab towards the yard). */
export const spotForDoor = (i: number) => ({ x: DOORS[i], z: STOP_Z })
/** Heading of a parked vehicle: local −X (cab) → world +Z. */
export const HEADING = Math.PI / 2

/**
 * World pose of the vehicle origin (first axle) after the last home drive-out. The configurator places the hall
 * relative to the vehicle with the inverse of this pose, so its view matches where the truck stopped.
 */
export let parkedPose: { x: number; z: number; rotY: number } | null = null
export function setParkedPose(p: typeof parkedPose) { parkedPose = p }
