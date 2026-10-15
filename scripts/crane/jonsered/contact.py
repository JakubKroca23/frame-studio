import numpy as np, trimesh, collections, scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
m=trimesh.load('all.glb',force='mesh'); lab=np.load('lab.npy'); F=m.faces; V=m.vertices
N=lab.max()+1
# vertex -> component (faces connected => each vertex in one comp)
A=m.area_faces; print('area',A.sum())
n=int(A.sum()/0.006**2); pts,fi=trimesh.sample.sample_surface_even(m,n) if False else trimesh.sample.sample_surface(m,n)
Vq=np.r_[pts,V[F.ravel()]]; cq=np.r_[lab[fi],np.repeat(lab,3)]
E_=0.010
pairs=set()
for off in np.array(np.meshgrid([0,1],[0,1],[0,1])).T.reshape(-1,3)*0.5:
  key=np.floor(Vq/E_+off).astype(np.int64); h=(key[:,0]*73856093)^(key[:,1]*19349663)^(key[:,2]*83492791)
  o=np.lexsort((cq,h)); hs=h[o]; cs=cq[o]
  # unique (cell,comp)
  u=np.r_[True,(hs[1:]!=hs[:-1])|(cs[1:]!=cs[:-1])]; hs,cs=hs[u],cs[u]
  st=np.flatnonzero(np.r_[True,hs[1:]!=hs[:-1]]); en=np.r_[st[1:],len(hs)]
  multi=np.flatnonzero(en-st>1)
  for a,b in zip(st[multi],en[multi]):
    c=cs[a:b]
    for i in range(len(c)):
      for j in range(i+1,len(c)): pairs.add((c[i],c[j]))
pairs=np.array(sorted(pairs)); print('contacts',len(pairs))
np.save('contacts.npy',pairs)
