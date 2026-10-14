/**
 * Mutable live crane state shared between the crane articulation (writer, every pointer move) and the
 * stability layer (reader in useFrame). Not React state on purpose: no re-render per move.
 */
export const liveCrane = {
  slewDeg: 0,
  outreachMm: null as number | null,
  hookHeightMm: null as number | null,
  loadKg: null as number | null,
  variant: null as string | null,
  /** bumped on every change */
  version: 0,
}

export function setLiveCrane(p: Partial<Omit<typeof liveCrane, 'version'>>) {
  Object.assign(liveCrane, p)
  liveCrane.version++
}
