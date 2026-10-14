import numpy as np, scipy.sparse as sp, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from scipy.sparse.csgraph import connected_components
F=np.load('F.npy'); L=np.load('L.npy')
# 3DFACE quad -> 2 tris (drop degenerate when v3==v4)
V=F.reshape(-1,3); T=[]
for f in range(len(F)):
  b=f*4; T.append((b,b+1,b+2))
  if not np.allclose(F[f,2],F[f,3]): T.append((b,b+2,b+3))
T=np.array(T)
_,inv=np.unique(np.round(V,2),axis=0,return_inverse=True); inv=inv.ravel(); tw=inv[T]; m=inv.max()+1
e=np.concatenate([tw[:,[0,1]],tw[:,[1,2]]]); g=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(m,m))
nc,lab=connected_components(g,directed=False); tl=lab[tw[:,0]]; print('tris',len(T),'components',nc)
P=V[T]; cmin=np.full((nc,3),1e9); cmax=np.full((nc,3),-1e9); np.minimum.at(cmin,tl,P.min(1)); np.maximum.at(cmax,tl,P.max(1))
c=(cmin+cmax)/2; r=np.hypot(c[:,0],c[:,2])
rot=(c[:,1]>650)|((r<250)&(cmax[:,1]>500)&(cmin[:,1]>150))
tr=rot[tl]; print('rot tris',tr.sum(),'base',(~tr).sum())
np.save('V.npy',V.astype(np.float32)); np.save('T.npy',T.astype(np.uint32)); np.save('trot.npy',tr); np.save('tpiece.npy',tl)
Q=P.mean(1)
fig,ax=plt.subplots(1,3,figsize=(18,6))
for a,(i,j) in zip(ax,[(0,1),(2,1),(0,2)]):
  a.scatter(Q[~tr,i][::2],Q[~tr,j][::2],s=0.05,c='b'); a.scatter(Q[tr,i][::2],Q[tr,j][::2],s=0.05,c='r'); a.set_aspect('equal'); a.grid(True)
plt.savefig('seg.png',dpi=70)
