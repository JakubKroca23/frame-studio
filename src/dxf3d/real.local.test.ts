import { readFileSync, existsSync } from 'node:fs'
import { beforeAll, it } from 'vitest'
import { initManifold, manifoldApi } from '../mesh/manifold'
import { analyzeDxf3d } from './analyze'
import { buildViewSet } from './views'
import { buildSolid } from './build'

const FILES = (process.env.DXF3D_ONLY ? [process.env.DXF3D_ONLY] : null) ?? [
  '/workspace/crane/dr/iX. 142 HiPro GD-E-ES-1-3 464-0807.dxf',
  '/workspace/crane/dr/iX. 142 HiPro GD-E-ES-4-5 464-0808.dxf',
  '/workspace/volvo-analysis/VSSB-25-277591.dxf',
  '/workspace/dxf-analysis/input.dxf',
]

beforeAll(async () => {
  await initManifold()
})

for (const f of FILES) {
  it(f, () => {
    if (!existsSync(f)) return
    const text = new TextDecoder('windows-1252').decode(readFileSync(f))
    const t0 = Date.now()
    const a = analyzeDxf3d(text)
    const out: Record<string, unknown> = {
      file: f.split('/').pop(),
      ms: Date.now() - t0,
      units: a.fileUnits,
      scale: { label: a.scale.label, mmPerUnit: +a.scale.mmPerUnit.toFixed(4), src: a.scale.source, agree: `${a.scale.dimsAgreeing}/${a.scale.dimsTotal}`, title: a.scale.titleHint, conf: a.scale.confident },
      islands: a.islands.map((i) => `#${i.id} ${i.width.toFixed(0)}x${i.height.toFixed(0)} ${i.contourMethod} segs=${i.segments} circ=${i.circles.length} sc=${i.scaleSource} box=${i.box.x0.toFixed(0)},${i.box.y0.toFixed(0)}..${i.box.x1.toFixed(0)},${i.box.y1.toFixed(0)}`),
      candidates: a.candidates.slice(0, 4).map((c) => `F${c.front} T${c.top} S${c.side} ${c.projection} sideR=${c.sideRight} ${c.score.toFixed(2)}`),
      confident: a.confident,
      warnings: a.warnings,
      stats: a.stats,
    }
    if (a.assignment) {
      const vs = buildViewSet(a, a.assignment)
      out.size = vs.size
      out.checks = vs.checks.map((c) => `${c.axis} ${c.a.value?.toFixed(1)} / ${c.b.value?.toFixed(1)} Δ${c.delta?.toFixed(1)} ${c.ok ? 'ok' : 'BAD'} dim=${c.dim}`)
      out.holes = `${vs.holes.length} cut, ${vs.skippedHoles.length} skipped`
      const b = buildSolid(manifoldApi()!, vs)
      out.built = b ? { vol: +(b.volume / 1e9).toFixed(4) + ' m3', watertight: b.watertight, holes: b.holesCut, dev: b.deviations.map((d) => `${d.view} max ${d.max.toFixed(1)} mean ${d.mean.toFixed(1)} ${d.status}`) } : null
    }
    console.log(JSON.stringify(out, null, 1))
  }, 600000)
}
