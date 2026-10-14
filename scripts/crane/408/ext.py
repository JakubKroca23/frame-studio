import numpy as np, json
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
names=json.load(open('names.json'))['names']
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(len(names)+1))
u=np.array([0,0.535,0.845]);u/=np.linalg.norm(u); v=np.array([1.,0,0]); w=np.cross(u,v)
for axname,uu in [('outer',u),('main',np.array([0,0.78,0.62])/np.linalg.norm([0,0.78,0.62]))]:
  ww=np.cross(uu,v); print('==',axname)
  out=[]
  for k in range(len(names)):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t)<20: continue
    P=t.reshape(-1,3); a=P@uu
    if np.ptp(a)<1.0: continue
    c=P-P.mean(0); wv,vv=np.linalg.eigh(np.cov(c.T))
    if abs(vv[:,-1]@uu)<0.99: continue
    out.append((np.ptp(P@v),np.ptp(P@ww),a.min(),a.max(),k,len(t),(P@v).mean(),(P@ww).mean()))
  out.sort(key=lambda r:-r[0]*r[1])
  for r in out[:40]: print(f"{r[4]:5d} {names[r[4]][:20]:20s} n={r[5]:5d} wx={r[0]:.3f} ww={r[1]:.3f} u={r[2]:.3f}..{r[3]:.3f} cx={r[6]:.3f} cw={r[7]:.3f}")
