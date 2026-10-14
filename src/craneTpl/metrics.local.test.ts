import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { CRANE_DEFS, forwardKinematics, meshAngles, variantBoom } from '../trw/craneKinematics'
it('metrics', () => {
  if (!process.env.OUT) return
  const out: Record<string, { dh: number; reachDev: [number, number]; ext: string }> = {}
  for (const d of CRANE_DEFS) {
    const devs = d.variants.map((v) => forwardKinematics({ slew: 0, a1: 0, rel: -meshAngles(d).delta, ext: variantBoom(v).stroke }, v).tip.r * 1000 - v.hydMaxMm)
    out[d.key] = { dh: Math.round((d.adapt?.dh ?? 0) * 1000), reachDev: [Math.round(Math.min(...devs)), Math.round(Math.max(...devs))], ext: d.variants.map((v) => `${v.id}:${v.extensions}`).join(' ') }
  }
  writeFileSync(process.env.OUT ?? '/tmp/metrics.json', JSON.stringify(out, null, 1))
})
