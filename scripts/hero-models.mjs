// Decimated single-mesh copies of the start-page exhibits (crane 142 folded, Multilift ULTIMA 21S).
// node scripts/hero-models.mjs → public/models/hero/*.glb
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { flatten, join, weld, simplify, dedup, prune, quantize } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import { meshopt } from '@gltf-transform/functions'
await Promise.all([MeshoptSimplifier.ready, MeshoptEncoder.ready, MeshoptDecoder.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
for (const [src, dst, ratio] of [['crane/hiab-x-hipro-142e4.glb', 'crane142.glb', 0.25], ['hooklift/ultima21s56.glb', 'multilift21s.glb', 0.2]]) {
  const doc = await io.read(`public/models/${src}`)
  let tris0 = 0
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris0 += (p.getIndices()?.getCount() ?? 0) / 3
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) for (const s of p.listSemantics()) if (s !== 'POSITION' && s !== 'NORMAL') p.setAttribute(s, null)
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld({ tolerance: 0.0005 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }), prune())

  let tris = 0
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await io.write(`public/models/hero/${dst}`, doc)
  console.log(dst, Math.round(tris0), '→', Math.round(tris), 'tris')
}
