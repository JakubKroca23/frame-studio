import trimesh, numpy as np, json
sc=trimesh.load('jonsered-iz18r-articulated.glb'); G={}
for n in sc.graph.nodes_geometry:
  T,g=sc.graph[n]; nm=n[:-2]; G[nm]=sc.geometry[g].copy(); G[nm].apply_transform(T)
info=json.load(open('jonsered-parts.json')); pins=info['pins']
P=lambda k:np.array([0,pins[k]['h'],pins[k]['r']])
joints={'column>base':('column','base',np.array([0,0.35,0])),'main>column':('main','column',P('p1')),'outer>main':('outer','main',P('p2')),
 'liftCyl>column':('liftCyl','column',P('liftA')),'liftRod>main':('liftRod','main',P('liftB'))}
out={}
rng=np.random.default_rng(0)
for k,(c,p,pin) in joints.items():
  d={}
  for g in (c,p):
    pts,_=trimesh.sample.sample_surface(G[g],400000)
    near=pts[np.linalg.norm(pts-pin,axis=1)<0.3]
    if len(near)>1000: near=near[rng.choice(len(near),1000,replace=False)]
    d[g]=np.round(near*1000).astype(int).ravel().tolist()
  # CAD-pose min distance (sanity)
  A=np.array(d[c]).reshape(-1,3); B=np.array(d[p]).reshape(-1,3)
  from scipy.spatial import cKDTree
  print(k,len(A),len(B),'cad min mm',cKDTree(B).query(A)[0].min().round(1))
  out[k]={'child':c,'parent':p,'pinMm':(pin*1000).round(1).tolist(),'childMm':d[c],'parentMm':d[p]}
# slides: extent along the extension axis (mesh frame, from P2) of outer / ext1 / ext2, barrel / rod along A→B
U=np.array([0,0.912,-0.409]); U/=np.linalg.norm(U); p2=P('p2')
sl={}
for g in ('outer','ext1','ext2'):
  t=(G[g].vertices-p2)@U; sl[g]=[round(float(np.percentile(t,0.5)),4),round(float(np.percentile(t,99.5)),4)]
ab=P('liftB')-P('liftA'); L=np.linalg.norm(ab); u=ab/L
for g in ('liftCyl','liftRod'):
  t=(G[g].vertices-P('liftA'))@u; sl[g]=[round(float(t.min()),4),round(float(t.max()),4)]
print(sl)
json.dump({'pins':pins,'report':info['report'],'joints':out,'slides':sl},open('/workspace/fs-podpery/src/trw/jonsered-parts.fixture.json','w'))
# --- pin bores: centres of concentric ring components (cylindrical faces around the lateral axis) near each pin ---
from rot import R
mm=trimesh.load('all.glb',force='mesh'); lab=np.load('lab.npy'); FF=mm.faces; VRR=R(mm.vertices); cls=np.load('cls4.npy',allow_pickle=True)
order=np.argsort(lab,kind='stable'); ls=lab[order]; cuts=np.flatnonzero(np.diff(ls))+1; groups=np.split(order,cuts)
AX=(0.0101,0.0007); MOUNT=pins['mount']
def rings(pin_rh,grp,rmin,rmax):
  x=AX[0]-pin_rh['r']; y=pin_rh['h']+MOUNT; cs=[]
  for i,g in enumerate(groups):
    if cls[i] not in grp.split('|') or len(g)<40: continue
    Q=VRR[np.unique(FF[g].ravel())]; c=(Q.min(0)+Q.max(0))/2
    if np.hypot(c[0]-x,c[1]-y)>0.12 or np.ptp(Q[:,0])>0.4: continue
    M=np.c_[2*Q[:,0],2*Q[:,1],np.ones(len(Q))]; b=Q[:,0]**2+Q[:,1]**2; s=np.linalg.lstsq(M,b,rcond=None)[0]; r=np.sqrt(max(s[2]+s[0]**2+s[1]**2,0))
    if rmin<r<rmax and np.median(np.abs(np.hypot(Q[:,0]-s[0],Q[:,1]-s[1])-r))<0.002: cs.append((AX[0]-s[0],s[1]-MOUNT,r))
  cs=np.array(cs).reshape(-1,3)
  if not len(cs): return {'group':grp,'n':0}
  return {'group':grp,'n':len(cs),'rMm':round(float(np.median(cs[:,0]))*1000,1),'hMm':round(float(np.median(cs[:,1]))*1000,1),'radiiMm':sorted(set((cs[:,2]*1000).round(0).tolist()))}
pr={'p1':rings(pins['p1'],'main',0.035,0.05),'p2':rings(pins['p2'],'main|outer',0.035,0.07),'liftA':rings(pins['liftA'],'column|liftCyl',0.03,0.07),'liftB':rings(pins['liftB'],'liftRod',0.06,0.08)}
print(pr)
d=json.load(open('/workspace/fs-podpery/src/trw/jonsered-parts.fixture.json')); d['pinRings']=pr
json.dump(d,open('/workspace/fs-podpery/src/trw/jonsered-parts.fixture.json','w'))
