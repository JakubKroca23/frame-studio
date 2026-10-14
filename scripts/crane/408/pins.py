import numpy as np, json
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
names=json.load(open('names.json'))['names']
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(len(names)+1))
for k in range(len(names)):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t)<20: continue
    P=t.reshape(-1,3); lo=P.min(0); hi=P.max(0); e=hi-lo
    # pin: one extent long, the other two equal and small (round)
    for a in range(3):
        b,c=[i for i in range(3) if i!=a]
        if e[a]>0.15 and abs(e[b]-e[c])<0.01 and 0.04<e[b]<0.2 and e[a]>1.5*e[b]:
            print(f"{k:5d} {names[k][:22]:22s} axis={'xyz'[a]} len={e[a]:.3f} d={e[b]:.3f} centre={np.round((lo+hi)/2,3)}")
