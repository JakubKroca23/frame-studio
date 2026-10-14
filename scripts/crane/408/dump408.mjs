import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import fs from 'fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const doc = await io.read('/workspace/crane408/in.glb')
const asm = doc.getRoot().listNodes().find(n => n.getName() === '408E8_ASM_1__ASM.stp-1')
const pos = [], pid = [], names = [], mats = []
const mul = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]
asm.listChildren().forEach((top, k) => {
  names.push(top.getName())
  top.traverse((n) => {
    const m = n.getMesh(); if (!m) return
    const W = n.getWorldMatrix()
    for (const p of m.listPrimitives()) {
      const P = p.getAttribute('POSITION'), I = p.getIndices()
      const cnt = I ? I.getCount() : P.getCount()
      const mat = p.getMaterial()
      const col = mat ? mat.getBaseColorFactor().slice(0,3).map(v=>Math.round(v*255)).join(',') : 'none'
      let ci = mats.indexOf(col); if (ci < 0) { mats.push(col); ci = mats.length - 1 }
      const v = [0,0,0]
      for (let i = 0; i < cnt; i++) { const idx = I ? I.getScalar(i) : i; P.getElement(idx, v); const w = mul(W, v); pos.push(w[0], w[1], w[2]); if (i % 3 === 0) pid.push(k, ci) }
    }
  })
})
fs.writeFileSync('/workspace/crane408/tris.f32', Buffer.from(new Float32Array(pos).buffer))
fs.writeFileSync('/workspace/crane408/pid.i32', Buffer.from(new Int32Array(pid).buffer))
fs.writeFileSync('/workspace/crane408/names.json', JSON.stringify({ names, mats }))
console.log('tris', pos.length / 9, 'mats', mats)
