# Telescope sections of the extended 408 E-8 GLB (straight, all out). Run after dump408x.mjs in /workspace/crane408x.
# Boom along +x; slewing axis x = -0.485, z = -0.107 (same assembly frame as the folded GLB, r = x + 0.485).
import numpy as np, json
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
names=json.load(open('names.json'))['names']
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(len(names)+1))
rows=[]
for k in range(len(names)):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t)<8: continue
    P=t.reshape(-1,3); lo=P.min(0); hi=P.max(0); e=hi-lo
    if e[0]>2.3 and e[1]>0.1 and e[2]>0.1 and lo[1]>-2.25 and hi[1]<-1.65: rows.append((round(e[2],3),round(lo[0]+0.485,3),round(hi[0]+0.485,3),names[k]))
for r in sorted(set(rows),key=lambda r:r[1]): print(r)
