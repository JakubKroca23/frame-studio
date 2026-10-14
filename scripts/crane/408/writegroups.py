import numpy as np, json
T=np.fromfile('tris.f32',dtype=np.float32).reshape(-1,3,3).astype(np.float64)
pid=np.fromfile('pid.i32',dtype=np.int32).reshape(-1,2)[:,0]
G={int(k):v for k,v in json.load(open('groups_assign.json')).items()}
g=np.array([G.get(int(p),'dup') for p in pid])
# drop tiny parts (fasteners < 25 mm)
o=np.argsort(pid); ps=pid[o]; cuts=np.searchsorted(ps,np.arange(pid.max()+2))
small=set()
for k in range(pid.max()+1):
    t=T[o[cuts[k]:cuts[k+1]]]
    if len(t) and np.ptp(t.reshape(-1,3),0).max()<0.025: small.add(k)
keep=np.array([int(p) not in small for p in pid])
names=[]
for nm in ['base','column','main','outer','ext1','ext2','ext3','ext4','ext5','ext6']:
    m=(g==nm)&keep; t=T[m]
    x,y,z=t[...,0],t[...,1],t[...,2]
    if nm=='base': P=np.stack([z+0.107,0.419-y,x+0.485],-1)
    else: P=np.stack([-(x+0.485),0.419-y,z+0.107],-1)
    P=P.reshape(-1,3).astype(np.float32)
    P.tofile(f'g_{nm}.pos'); np.arange(len(P),dtype=np.uint32).tofile(f'g_{nm}.idx'); np.zeros(len(P),np.float32).tofile(f'g_{nm}.pie')
    names.append(nm); print(nm,len(t))
json.dump(names,open('groups.json','w'))
print('dropped small parts',len(small))
