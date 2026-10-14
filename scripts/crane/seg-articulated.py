import numpy as np, json, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
V=np.load('V.npy'); T=np.load('T.npy'); tr=np.load('trot.npy'); tl=np.load('tpiece.npy')
P=V[T]; n=tl.max()+1
mn=np.full((n,3),1e9); mx=np.full((n,3),-1e9); np.minimum.at(mn,tl,P.min(1)); np.maximum.at(mx,tl,P.max(1))
rot=np.zeros(n,bool); rot[tl[tr]]=True
c=(mn+mx)/2; L=mx-mn
grp=np.array(['base']*n,dtype=object)
# telescopic sections: long (>2 m in z), start behind knuckle area, x offset ~0.2-0.4
tele=[i for i in range(n) if rot[i] and L[i,2]>2000 and mn[i,2]>1600 and mn[i,0]>150 and L[i,0]>90]
tele.sort(key=lambda i: mx[i,2]); print('tele',[(i,mn[i,2],mx[i,2]) for i in tele])
for i in range(n):
  if not rot[i]: continue
  if mn[i,1]>1900 and mn[i,2]>1650: grp[i]='outer'
  elif mn[i,1]>1950 and mx[i,2]<=2200: grp[i]='main'
  elif mn[i,1]>2000 and mn[i,2]>300 and mx[i,2]<2400 and L[i,2]>700: grp[i]='main'   # outer-boom cylinder rides on main boom
  else: grp[i]='column'
# main lift cylinder pieces (vertical, between column foot and main boom): pieces near z 0..0.35, y 0.6..2.0
for i in range(n):
  if rot[i] and grp[i]=='column' and mn[i,2]>-50 and mx[i,2]<400 and mn[i,1]>550 and mx[i,1]<2050 and abs(c[i,0])<130: grp[i]='cyl1'
# extensions: the tele list = outer section + extensions (sorted by tip); tip parts (z>4.4) go with last
names=['outer']+[f'ext{k}' for k in range(1,len(tele))]
for k,i in enumerate(tele): grp[i]=names[k]
last=names[-1]
for i in range(n):
  if grp[i]=='outer' and mn[i,2]>4380 and i not in tele: grp[i]=last
from collections import Counter; tg=grp[tl]; print(Counter(tg))
cols={'base':'#888','column':'b','cyl1':'c','main':'g','outer':'r','ext1':'m','ext2':'y','ext3':'k','ext4':'orange'}
Q=P.mean(1); fig,ax=plt.subplots(2,1,figsize=(16,10))
for g,col in cols.items():
  s=tg==g; ax[0].scatter(Q[s,2],Q[s,1],s=0.1,c=col,label=g); ax[1].scatter(Q[s,2],Q[s,0],s=0.1,c=col)
ax[0].legend(markerscale=40); ax[0].set_aspect('equal'); ax[1].set_aspect('equal'); ax[0].grid(); plt.savefig('seg2.png',dpi=60)
np.save('tgrp.npy',tg.astype(str))
json.dump({'tele':[[int(i),float(mn[i,2]),float(mx[i,2]),float(mn[i,1]),float(mx[i,1])] for i in tele]},open('tele.json','w'))
