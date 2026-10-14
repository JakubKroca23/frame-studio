import fs from 'node:fs'
import { Document, NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, meshopt, normals } from '@gltf-transform/functions'; import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder})
const doc=new Document(); const buf=doc.createBuffer(); const scene=doc.createScene('Root'); doc.getRoot().setDefaultScene(scene)
const mat=doc.createMaterial('steel').setBaseColorFactor([0.8,0.82,0.94,1]).setDoubleSided(true)
for (const nm of ['rear','rails','front','arm']) {
  const p=new Float32Array(fs.readFileSync(`u21_${nm}.pos`).buffer.slice(0)); const i=new Uint32Array(fs.readFileSync(`u21_${nm}.idx`).buffer.slice(0))
  const prim=doc.createPrimitive().setMaterial(mat).setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(p).setBuffer(buf)).setIndices(doc.createAccessor().setType('SCALAR').setArray(i).setBuffer(buf))
  const g=doc.createNode(nm); g.addChild(doc.createNode(nm+'_mesh').setMesh(doc.createMesh(nm).addPrimitive(prim))); scene.addChild(g)
}
const c=(l)=>{for(const m of doc.getRoot().listMeshes()) for(const p of m.listPrimitives()) console.log(l,m.getName(),p.getAttribute('POSITION')?.getCount(),p.getIndices()?.getCount())}; c('in'); await doc.transform(weld()); c('weld'); await doc.transform(simplify({simplifier:MeshoptSimplifier, ratio:0.07, error:0.0004}), prune(), meshopt({encoder:MeshoptEncoder, level:'medium'}))
let t=0; for(const m of doc.getRoot().listMeshes()) for(const p of m.listPrimitives()) t+=p.getIndices().getCount()/3; console.log('tris',t)
await io.write('ultima21s56.glb',doc)
