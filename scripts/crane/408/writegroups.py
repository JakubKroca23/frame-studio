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
# --- 2 missing telescopes (approved): clone + scale neighbour profiles in the boom cross-section frame ---
U=np.array([0,0.535,0.845]);U/=np.linalg.norm(U); W=np.array([0,0.845,-0.535]);W/=np.linalg.norm(W)
CX,CW=-0.926,-0.705
g=g.astype(object)
g[g=='ext6']='ext7'; g[g=='ext5']='ext6'
def frame(t): return t@U, t[...,0], t@W
def unframe(u,v,w): return u[...,None]*U+w[...,None]*W+v[...,None]*np.array([1.,0,0])
def core(nm):
    m=(g==nm)&keep; c=T.mean(1); u,v,w=frame(c)
    return m&(np.abs(v-CX)<0.13)&(np.abs(w-CW)<0.25)
def clone(src,sv,sw,du):
    t=T[core(src)]; u,v,w=frame(t)
    return unframe(u+du,CX+(v-CX)*sv,CW+(w-CW)*sw)
new5=clone('ext4',166/188,345/377,-0.09)
new8=clone('ext7',101/123,249/281,-0.09)
# hook / tip head: parts of the old innermost section reaching beyond its profile end → last section
o2=np.argsort(pid); ps2=pid[o2]
tipm=np.zeros(len(T),bool)
for k in set(pid[(g=='ext7')&keep].tolist()):
    sel=pid==k
    if (T[sel]@U).min()<-1.81: tipm|=sel
tipT=T[tipm]+(-0.09)*U; g[tipm]='tip'
extra={'ext5':new5,'ext8':np.concatenate([new8,tipT])}
print('clone tris',len(new5),len(new8),'tip',tipm.sum())
names=[]
for nm in ['base','column','main','outer']+[f'ext{i}' for i in range(1,9)]:
    m=(g==nm)&keep; t=T[m]
    if nm in extra: t=np.concatenate([t,extra[nm]])
    x,y,z=t[...,0],t[...,1],t[...,2]
    if nm=='base': P=np.stack([z+0.107,0.419-y,x+0.485],-1)
    else: P=np.stack([-(x+0.485),0.419-y,z+0.107],-1)
    P=P.reshape(-1,3).astype(np.float32)
    P.tofile(f'g_{nm}.pos'); np.arange(len(P),dtype=np.uint32).tofile(f'g_{nm}.idx'); np.zeros(len(P),np.float32).tofile(f'g_{nm}.pie')
    names.append(nm); print(nm,len(t))
json.dump(names,open('groups.json','w'))
print('dropped small parts',len(small))
