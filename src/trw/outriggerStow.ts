/**
 * Global "stowed" switch for outriggers (crane stabilisers, aux outriggers): while true every outrigger is driven to
 * fully retracted (arm in, leg up), e.g. while the home scene drives the vehicle out of the hall. Read in useFrame.
 */
export const outriggerStow = { current: false }

/**
 * One hydraulic outrigger step: the leg goes up before the arm moves, the arm reaches its target before the leg goes
 * down (sideways, then down). `k` = exponential approach factor for this frame, `tol` = "in place" tolerance.
 */
export function stepOutrigger(c: { e: number; d: number }, target: { e: number; d: number }, k: number, tol: number) {
  const t = outriggerStow.current ? { e: 0, d: 0 } : target
  if (Math.abs(t.e - c.e) > tol) {
    if (c.d > tol) c.d += (0 - c.d) * k
    else { c.d = Math.max(0, c.d); c.e += (t.e - c.e) * k }
  } else {
    c.e = t.e
    c.d += (t.d - c.d) * k
  }
}
