import { NodeIO, getBounds } from '@gltf-transform/core'; import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'; import draco3d from 'draco3dgltf';
import { dedup, weld, simplify, prune, join, flatten, meshopt, quantize } from '@gltf-transform/functions'; import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'meshopt.encoder':MeshoptEncoder});
const doc=await io.read('in.glb'); const scene=doc.getRoot().getDefaultScene();
await doc.transform(dedup(), flatten());
{ let pid=0; for(const n of scene.listChildren()){ const m=n.getMesh(); if(!m) continue; const id=pid++; for(const p of m.listPrimitives()){ const c=p.getAttribute('POSITION').getCount(); const a=new Float32Array(c).fill(id); p.setAttribute('_PIECE', doc.createAccessor().setType('SCALAR').setArray(a).setBuffer(doc.getRoot().listBuffers()[0])) } } }
const g={}; for(const k of ['rear','rails','front','arm']){g[k]=doc.createNode(k); scene.addChild(g[k]);}
for(const n of scene.listChildren()){ if(g[n.getName()]===n) continue; const b=getBounds(n); const cz=(b.min[2]+b.max[2])/2;
 const k = cz<0.6?'rear': cz<5.2?'rails': b.min[1]>0.45?'arm':'front'; scene.removeChild(n); g[k].addChild(n); }
for(const [k,n] of Object.entries(g)) { const b=getBounds(n); console.log(k,n.listChildren().length,b.min.map(v=>v.toFixed(3)),b.max.map(v=>v.toFixed(3))); }
await doc.transform(join({keepNamed:false}), weld(), simplify({simplifier:MeshoptSimplifier, ratio:0.12, error:0.0004}), prune({keepLeaves:false}),
  meshopt({encoder:MeshoptEncoder, level:'medium'}));
for(const n of scene.listChildren()) console.log('final',n.getName(),n.listChildren().length,!!n.getMesh());
let t=0; for(const m of doc.getRoot().listMeshes()) for(const p of m.listPrimitives()) t+=(p.getIndices()?.getCount()??0)/3; console.log('tris',t);
for(const e of doc.getRoot().listExtensionsUsed()) if(e.extensionName==='KHR_draco_mesh_compression'||e.extensionName==='PTC_onshape_metadata') e.dispose();
await io.write('ult18z59.glb',doc);
