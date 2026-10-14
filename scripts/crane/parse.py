import numpy as np, json
L=open('hp-142e4_folded.dxf',errors='ignore').read().splitlines()
faces=[]; lay=[]
i=0; n=len(L)
while i<n-1:
  if L[i].strip()=='0' and L[i+1].strip()=='3DFACE':
    i+=2; d={}
    while not (L[i].strip()=='0'):
      d[L[i].strip()]=L[i+1].strip(); i+=2
    p=[[float(d.get(f'1{k}',0)),float(d.get(f'2{k}',0)),float(d.get(f'3{k}',0))] for k in range(4)]
    faces.append(p); lay.append(d.get('8','0'))
  else: i+=2 if L[i].strip()!='0' else 2
F=np.array(faces,dtype=np.float64); print(F.shape, F.reshape(-1,3).min(0), F.reshape(-1,3).max(0))
ul=sorted(set(lay)); li=np.array([ul.index(x) for x in lay]); print('layers used',len(ul))
np.save('F.npy',F); np.save('L.npy',li); json.dump(ul,open('layers.json','w'))
