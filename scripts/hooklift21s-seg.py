import numpy as np, scipy.sparse as sp
from scipy.sparse.csgraph import connected_components
v=np.load('u21_v.npy')/1000.0; t=np.load('u21_t.npy').astype(np.int64)
n=len(v)
# weld exact-duplicate vertices so components join
_,inv=np.unique(np.round(v,5),axis=0,return_inverse=True); inv=inv.ravel()
tw=inv[t]; m=tw.max()+1
e=np.concatenate([tw[:,[0,1]],tw[:,[1,2]]])
g=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(m,m))
nc,lab=connected_components(g,directed=False)
tl=lab[tw[:,0]]
print('components',nc)
P=v[t]  # (T,3,3)
cmin=np.full((nc,3),9e9); cmax=np.full((nc,3),-9e9)
np.minimum.at(cmin,tl,P.min(1)); np.maximum.at(cmax,tl,P.max(1))
cz=(cmin[:,2]+cmax[:,2])/2
grp=np.where(cz<0.6,0,np.where(cz<5.2,1,np.where(cmin[:,1]>0.45,3,2)))
tg=grp[tl]
names=['rear','rails','front','arm']
for i,nm in enumerate(names):
  sel=t[tg==i]; print(nm,len(sel), P[tg==i].reshape(-1,3).min(0).round(3), P[tg==i].reshape(-1,3).max(0).round(3))
  np.save(f'u21_{nm}.npy',sel.astype(np.uint32))
np.save('u21_vm.npy',v.astype(np.float32))
# profile: max y per 0.25m z-bin
zb=np.floor(v[:,2]/0.25).astype(int); 
for b in range(zb.min(),zb.max()+1): 
  s=zb==b; print(b*0.25, v[s,1].max().round(3) if s.any() else None, end=' | ')
