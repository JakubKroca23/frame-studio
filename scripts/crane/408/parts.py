import numpy as np, json
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
names=json.load(open('names.json'))['names']
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(len(names)+1))
rows=[]
for k in range(len(names)):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t)==0: continue
    P=t.reshape(-1,3); lo=P.min(0); hi=P.max(0)
    c=P-P.mean(0); w,v=np.linalg.eigh(np.cov(c.T)); ax=v[:,-1]
    L=np.ptp(c@ax)
    rows.append((L,k,len(t),lo,hi,ax))
rows.sort(key=lambda r:-r[0])
np.save('partinfo.npy',np.array([(r[1],r[0],*r[3],*r[4],*r[5],r[2]) for r in rows]))
for L,k,n,lo,hi,ax in rows[:45]:
    print(f"{k:5d} {names[k][:22]:22s} n={n:6d} L={L:.3f} lo={np.round(lo,3)} hi={np.round(hi,3)} ax={np.round(ax,2)}")
