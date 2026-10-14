import fs from 'node:fs'
import { Document, NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, meshopt } from '@gltf-transform/functions'; import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder})
const doc=new Document(); const buf=doc.createBuffer(); const scene=doc.createScene('Root'); doc.getRoot().setDefaultScene(scene)
const mat=doc.createMaterial('hiab').setBaseColorFactor([0.85,0.12,0.1,1]).setDoubleSided(true)
const f32=(f)=>{const b=fs.readFileSync(f); return new Float32Array(b.buffer,b.byteOffset,b.length/4).slice()}
const u32=(f)=>{const b=fs.readFileSync(f); return new Uint32Array(b.buffer,b.byteOffset,b.length/4).slice()}
for (const nm of ['base','slew']) {
  const prim=doc.createPrimitive().setMaterial(mat).setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(f32(`${nm}.pos`)).setBuffer(buf))
    .setAttribute('_PIECE',doc.createAccessor().setType('SCALAR').setArray(f32(`${nm}.pie`)).setBuffer(buf)).setIndices(doc.createAccessor().setType('SCALAR').setArray(u32(`${nm}.idx`)).setBuffer(buf))
  const g=doc.createNode(nm); g.addChild(doc.createNode(nm+'_mesh').setMesh(doc.createMesh(nm).addPrimitive(prim))); scene.addChild(g)
}
await doc.transform(weld(), simplify({simplifier:MeshoptSimplifier, ratio:0.5, error:0.0003}), prune(), meshopt({encoder:MeshoptEncoder, level:'medium'}))
let t=0; for(const m of doc.getRoot().listMeshes()) for(const p of m.listPrimitives()) t+=p.getIndices().getCount()/3; console.log('tris',t)
await io.write('hiab-x-hipro-142e4.glb',doc)
