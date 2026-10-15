import numpy as np, collections, scipy.sparse as sp, sys
from scipy.sparse.csgraph import connected_components
lab=np.load('lab.npy'); N=lab.max()+1
nf=np.bincount(lab,minlength=N)
cls=np.load(sys.argv[1] if len(sys.argv)>1 else 'cls.npy',allow_pickle=True); pairs=np.load('contacts.npy')
def islands(cls,verbose=False):
  same=cls[pairs[:,0]]==cls[pairs[:,1]]; p=pairs[same]
  G=sp.coo_matrix((np.ones(len(p)),(p[:,0],p[:,1])),shape=(N,N))
  n,cc=connected_components(G,directed=False)
  out=[]
  for g in np.unique(cls):
    idx=np.flatnonzero(cls==g); w=collections.Counter(); 
    for c,f in zip(cc[idx],nf[idx]): w[c]+=f
    core=w.most_common(1)[0][0]
    for c,f in w.items():
      if c!=core: out.append((g,c,f))
  return cc,out
if __name__=='__main__':
  cc,out=islands(cls)
  print('islands',len(out),'faces',sum(o[2] for o in out))
  for g in np.unique(cls):
    o=[x for x in out if x[0]==g]; print(g,len(o),sum(x[2] for x in o))
